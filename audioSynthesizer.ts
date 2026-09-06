import { MusicTheme, VoiceNameType } from '../types';

class ProceduralAudioEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private musicGain: GainNode | null = null;
  private voiceGain: GainNode | null = null;
  private isPlaying: boolean = false;
  private loopInterval: any = null;
  private currentTheme: MusicTheme = 'ambient';
  private mediaDest: MediaStreamAudioDestinationNode | null = null;

  private currentVoiceSource: AudioBufferSourceNode | null = null;
  private scheduledSources: AudioBufferSourceNode[] = [];

  public getCurrentTime(): number {
    this.initContext();
    return this.ctx!.currentTime;
  }

  public async resumeContext() {
    this.initContext();
    await this.ctx!.resume();
  }

  public scheduleAudioBuffer(buffer: AudioBuffer, when: number) {
    this.initContext();
    const source = this.ctx!.createBufferSource();
    source.buffer = buffer;
    source.connect(this.voiceGain!);
    source.onended = () => {
      source.disconnect();
      this.scheduledSources = this.scheduledSources.filter(item => item !== source);
    };
    this.scheduledSources.push(source);
    source.start(when);
  }
  private audioBufferCache = new Map<string, AudioBuffer>();
  private audioLoadingPromises = new Map<string, Promise<AudioBuffer | null>>();

  public initContext() {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      this.ctx = new AudioCtx();
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.setValueAtTime(0.85, this.ctx.currentTime);

      this.musicGain = this.ctx.createGain();
      this.musicGain.gain.setValueAtTime(0.35, this.ctx.currentTime);
      this.musicGain.connect(this.masterGain);

      this.voiceGain = this.ctx.createGain();
      this.voiceGain.gain.setValueAtTime(1.0, this.ctx.currentTime);
      this.voiceGain.connect(this.masterGain);

      this.masterGain.connect(this.ctx.destination);

      try {
        this.mediaDest = this.ctx.createMediaStreamDestination();
        this.masterGain.connect(this.mediaDest);
      } catch (e) {
        console.warn('MediaStreamDestination not supported', e);
      }
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  public getAudioDestinationStream(): MediaStream | null {
    this.initContext();
    return this.mediaDest ? this.mediaDest.stream : null;
  }

  public setVolume(volume: number) {
    this.setMusicVolume(volume);
  }

  public setMusicVolume(volume: number) {
    if (this.musicGain && this.ctx) {
      const clamped = Math.max(0, Math.min(1, volume));
      this.musicGain.gain.setTargetAtTime(clamped, this.ctx.currentTime, 0.05);
    }
  }

  public setVoiceVolume(volume: number) {
    if (this.voiceGain && this.ctx) {
      const clamped = Math.max(0, Math.min(1, volume));
      this.voiceGain.gain.setTargetAtTime(clamped, this.ctx.currentTime, 0.05);
    }
  }

  // Preload and decode voice audio for a text script using Gemini TTS
  public async preloadNarrationAudio(text: string, voiceName: VoiceNameType | string = 'Aoede'): Promise<AudioBuffer | null> {
    if (!text || text.trim().length === 0) return null;
    const cleanText = text.trim();
    const cacheKey = `${voiceName}:${cleanText}`;

    if (this.audioBufferCache.has(cacheKey)) {
      return this.audioBufferCache.get(cacheKey)!;
    }

    if (this.audioLoadingPromises.has(cacheKey)) {
      return this.audioLoadingPromises.get(cacheKey)!;
    }

    const loadPromise = (async () => {
      this.initContext();
      try {
        const res = await fetch('/api/ai/tts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: cleanText, voiceName }),
        });

        if (!res.ok) {
          throw new Error(`TTS server responded with ${res.status}`);
        }

        const arrayBuffer = await res.arrayBuffer();
        if (!this.ctx) return null;

        const audioBuffer = await this.ctx.decodeAudioData(arrayBuffer);
        this.audioBufferCache.set(cacheKey, audioBuffer);
        return audioBuffer;
      } catch (err) {
        console.warn('Could not fetch Gemini TTS audio:', err);
        return null;
      } finally {
        this.audioLoadingPromises.delete(cacheKey);
      }
    })();

    this.audioLoadingPromises.set(cacheKey, loadPromise);
    return loadPromise;
  }

  public getPreloadedAudio(text: string, voiceName: VoiceNameType | string = 'Aoede'): AudioBuffer | null {
    if (!text) return null;
    const cacheKey = `${voiceName}:${text.trim()}`;
    return this.audioBufferCache.get(cacheKey) || null;
  }

  // Play an AudioBuffer through the voice gain node (which connects to video recording stream)
  public playAudioBuffer(buffer: AudioBuffer, onEnd?: () => void): AudioBufferSourceNode | null {
    this.stopNarration();
    this.initContext();
    if (!this.ctx || !this.voiceGain) return null;

    try {
      const source = this.ctx.createBufferSource();
      source.buffer = buffer;
      source.connect(this.voiceGain);

      source.onended = () => {
        if (this.currentVoiceSource === source) {
          this.currentVoiceSource = null;
        }
        if (onEnd) onEnd();
      };

      source.start(0);
      this.currentVoiceSource = source;
      return source;
    } catch (err) {
      console.error('Error playing voice buffer:', err);
      if (onEnd) onEnd();
      return null;
    }
  }

  // Stop any playing voice audio
  public stopNarration() {
    for (const source of this.scheduledSources) {
      source.onended = null;
      try { source.stop(); source.disconnect(); } catch { /* already ended */ }
    }
    this.scheduledSources = [];
    if (this.currentVoiceSource) {
      try {
        this.currentVoiceSource.onended = null;
        this.currentVoiceSource.stop();
        this.currentVoiceSource.disconnect();
      } catch (e) {
        // Ignore already stopped
      }
      this.currentVoiceSource = null;
    }
  }

  // Play narration text via AudioBuffer with graceful instant speech synthesis fallback
  public async playNarration(
    text: string,
    voiceName: VoiceNameType | string = 'Aoede',
    onEnd?: () => void
  ): Promise<boolean> {
    this.stopNarration();
    if (!text || text.trim() === '') {
      if (onEnd) onEnd();
      return true;
    }

    // Check if preloaded decoded AudioBuffer exists in cache
    const buffer = this.getPreloadedAudio(text, voiceName);
    if (buffer) {
      this.playAudioBuffer(buffer, onEnd);
      return true;
    }

    // Immediately speak using high-quality browser speech synthesis to avoid delay or quota blocks
    speechEngine.speak(text, 1.0, 1.0, onEnd);

    // Optionally try background preloading without blocking the active playback
    this.preloadNarrationAudio(text, voiceName).catch(() => {});
    return true;
  }

  public startMusic(theme: MusicTheme = 'ambient', volume: number = 0.35) {
    if (theme === 'none') {
      this.stopMusic();
      return;
    }
    this.initContext();
    this.currentTheme = theme;
    this.setMusicVolume(volume);

    if (this.isPlaying) {
      return;
    }
    this.isPlaying = true;

    // Trigger chords
    this.playChordProgression();
    this.loopInterval = setInterval(() => {
      if (this.isPlaying) {
        this.playChordProgression();
      }
    }, 4000);
  }

  private playChordProgression() {
    if (!this.ctx || !this.musicGain || !this.isPlaying) return;

    const chords: Record<MusicTheme, number[][]> = {
      ambient: [
        [261.63, 329.63, 392.0, 493.88], // Cmaj7
        [220.0, 261.63, 329.63, 392.0],  // Am7
        [174.61, 220.0, 261.63, 329.63], // Fmaj7
        [196.0, 246.94, 293.66, 392.0],  // G7
      ],
      tech: [
        [130.81, 196.0, 293.66, 392.0],  // C sus2
        [110.0, 164.81, 246.94, 329.63], // A sus2
        [146.83, 220.0, 293.66, 440.0],  // D sus2
        [174.61, 261.63, 329.63, 392.0], // F
      ],
      cinematic: [
        [130.81, 164.81, 196.0, 246.94], // C
        [98.0, 146.83, 196.0, 293.66],   // G/B
        [110.0, 130.81, 164.81, 220.0],  // Am
        [87.31, 130.81, 174.61, 261.63], // F
      ],
      acoustic: [
        [261.63, 329.63, 392.0],         // C
        [196.0, 246.94, 293.66],         // G
        [220.0, 261.63, 329.63],         // Am
        [174.61, 220.0, 261.63],         // F
      ],
      none: [],
    };

    const themeChords = chords[this.currentTheme] || chords.ambient;
    const chordIndex = Math.floor((this.ctx.currentTime / 4) % themeChords.length);
    const selectedChord = themeChords[chordIndex];

    const now = this.ctx.currentTime;

    selectedChord.forEach((freq, idx) => {
      if (!this.ctx || !this.musicGain) return;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      const filter = this.ctx.createBiquadFilter();

      osc.type = this.currentTheme === 'tech' ? 'triangle' : this.currentTheme === 'cinematic' ? 'sawtooth' : 'sine';
      osc.frequency.setValueAtTime(freq, now);

      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(this.currentTheme === 'tech' ? 1200 : 800, now);
      filter.frequency.exponentialRampToValueAtTime(300, now + 3.8);

      const baseGain = 0.08 / selectedChord.length;
      gain.gain.setValueAtTime(0.001, now);
      gain.gain.exponentialRampToValueAtTime(baseGain, now + 0.8 + idx * 0.1);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 3.9);

      osc.connect(filter);
      filter.connect(gain);
      gain.connect(this.musicGain);

      osc.start(now + idx * 0.05);
      osc.stop(now + 4.0);
    });
  }

  public stopMusic() {
    this.isPlaying = false;
    if (this.loopInterval) {
      clearInterval(this.loopInterval);
      this.loopInterval = null;
    }
    if (this.musicGain && this.ctx) {
      this.musicGain.gain.setTargetAtTime(0.0001, this.ctx.currentTime, 0.1);
    }
  }
}

export const audioEngine = new ProceduralAudioEngine();

// Speech Synthesis Helper
class SpeechEngine {
  private synth: SpeechSynthesis | null = null;
  private currentUtterance: SpeechSynthesisUtterance | null = null;
  private spanishVoice: SpeechSynthesisVoice | null = null;
  private speakTimeout: any = null;
  private keepAliveInterval: any = null;

  constructor() {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      this.synth = window.speechSynthesis;
      this.loadVoices();
      if (this.synth.onvoiceschanged !== undefined) {
        this.synth.onvoiceschanged = () => this.loadVoices();
      }
    }
  }

  private loadVoices(): SpeechSynthesisVoice[] {
    if (!this.synth) return [];
    const voices = this.synth.getVoices();
    // Look for Spanish voices first, or fallback to default
    const esVoice =
      voices.find((v) => v.lang.toLowerCase().startsWith('es')) ||
      voices.find((v) => v.lang.toLowerCase().startsWith('en')) ||
      voices[0];
    if (esVoice) {
      this.spanishVoice = esVoice;
    }
    return voices;
  }

  public speak(text: string, rate: number = 1.0, pitch: number = 1.0, onEnd?: () => void) {
    if (!this.synth) {
      if (onEnd) onEnd();
      return;
    }

    // Cancel previous speech immediately
    this.cancel();

    if (!text || text.trim() === '') {
      if (onEnd) onEnd();
      return;
    }

    // Chrome bug workaround: Calling synth.speak() synchronously right after synth.cancel()
    // causes Chrome's speech synthesis dispatcher to silently drop the new utterance.
    // Scheduling with 75ms delay ensures the cancellation is fully processed by the browser.
    this.speakTimeout = setTimeout(() => {
      this.speakTimeout = null;
      try {
        if (!this.synth) {
          if (onEnd) onEnd();
          return;
        }

        if (this.synth.paused) {
          this.synth.resume();
        }

        const utterance = new SpeechSynthesisUtterance(text);
        // Bind to window to prevent V8 garbage collection while speaking
        (window as any)._activeSpeechUtterance = utterance;

        const voices = this.loadVoices();
        const selectedVoice =
          this.spanishVoice ||
          voices.find((v) => v.lang.toLowerCase().startsWith('es')) ||
          voices.find((v) => v.lang.toLowerCase().startsWith('en')) ||
          voices[0];

        if (selectedVoice) {
          utterance.voice = selectedVoice;
          utterance.lang = selectedVoice.lang;
        } else {
          utterance.lang = 'es-ES';
        }

        utterance.rate = Math.max(0.8, Math.min(1.4, rate));
        utterance.pitch = Math.max(0.8, Math.min(1.2, pitch));

        utterance.onend = () => {
          this.currentUtterance = null;
          (window as any)._activeSpeechUtterance = null;
          if (this.keepAliveInterval) {
            clearInterval(this.keepAliveInterval);
            this.keepAliveInterval = null;
          }
          if (onEnd) onEnd();
        };

        utterance.onerror = (e) => {
          if (e.error !== 'canceled' && e.error !== 'interrupted') {
            console.warn('Speech synthesis utterance error:', e);
          }
          this.currentUtterance = null;
          (window as any)._activeSpeechUtterance = null;
          if (this.keepAliveInterval) {
            clearInterval(this.keepAliveInterval);
            this.keepAliveInterval = null;
          }
          if (onEnd) onEnd();
        };

        this.currentUtterance = utterance;
        this.synth.speak(utterance);

        // Chrome keep-alive watchdog: Chrome pauses speechSynthesis after 14s of continuous speaking
        if (this.keepAliveInterval) clearInterval(this.keepAliveInterval);
        this.keepAliveInterval = setInterval(() => {
          if (!this.synth || !this.synth.speaking) {
            clearInterval(this.keepAliveInterval);
            this.keepAliveInterval = null;
            return;
          }
          if (this.synth.paused) {
            this.synth.resume();
          }
        }, 5000);
      } catch (err) {
        console.warn('Failed to speak with SpeechSynthesis:', err);
        if (onEnd) onEnd();
      }
    }, 75);
  }

  public pause() {
    if (this.synth && this.synth.speaking) {
      this.synth.pause();
    }
  }

  public resume() {
    if (this.synth && this.synth.paused) {
      this.synth.resume();
    }
  }

  public cancel() {
    if (this.speakTimeout) {
      clearTimeout(this.speakTimeout);
      this.speakTimeout = null;
    }
    if (this.keepAliveInterval) {
      clearInterval(this.keepAliveInterval);
      this.keepAliveInterval = null;
    }
    if (this.synth) {
      this.synth.cancel();
      this.currentUtterance = null;
      (window as any)._activeSpeechUtterance = null;
    }
  }
}

export const speechEngine = new SpeechEngine();
