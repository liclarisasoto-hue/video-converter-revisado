import React, { useState, useEffect, useRef, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Play,
  Pause,
  RotateCcw,
  SkipBack,
  SkipForward,
  Volume2,
  VolumeX,
  Maximize2,
  Minimize2,
  Tv,
  Smartphone,
  Sparkles,
} from 'lucide-react';
import { PresentationData, SlideData, SlideElement, VideoConfig } from '../types';
import { speechEngine, audioEngine } from '../services/audioSynthesizer';
import { isLightBg } from '../services/googleSlides';
import { loadPresentationFonts } from '../services/fontLoader';
import { parseTextIntoUnits } from '../utils/textParser';

interface VideoPlayerProps {
  presentation: PresentationData;
  suspended?: boolean;
  config: VideoConfig;
  onUpdateConfig: (newConfig: Partial<VideoConfig>) => void;
  onSlideChange?: (index: number) => void;
  activeSlideIndex: number;
  setActiveSlideIndex: (index: number) => void;
}

export const VideoPlayer: React.FC<VideoPlayerProps> = ({
  presentation,
  suspended = false,
  config,
  onUpdateConfig,
  onSlideChange,
  activeSlideIndex,
  setActiveSlideIndex,
}) => {
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
  const [isMuted, setIsMuted] = useState<boolean>(false);
  const [volume, setVolume] = useState<number>(config.musicVolume);

  const containerRef = useRef<HTMLDivElement>(null);
  const animationFrameRef = useRef<number | null>(null);
  const lastTimestampRef = useRef<number | null>(null);

  useEffect(() => { if (suspended) setIsPlaying(false); }, [suspended]);

  // Compute slide time ranges
  const slideRanges = useMemo(() => {
    let accTime = 0;
    return presentation.slides.map((s) => {
      const start = accTime;
      const duration = s.duration * (1 / config.autoPacingMultiplier);
      const end = start + duration;
      accTime = end;
      return { start, end, duration, slide: s };
    });
  }, [presentation.slides, config.autoPacingMultiplier]);

  const totalDuration = useMemo(() => {
    if (slideRanges.length === 0) return 0;
    return slideRanges[slideRanges.length - 1].end;
  }, [slideRanges]);

  // Determine current active slide based on currentTime
  const currentSlideInfo = useMemo(() => {
    const found = slideRanges.find((r) => currentTime >= r.start && currentTime < r.end);
    return found || slideRanges[slideRanges.length - 1] || { start: 0, end: 1, duration: 1, slide: presentation.slides[0] };
  }, [slideRanges, currentTime]);

  const activeSlide = currentSlideInfo.slide;
  const slideProgress = Math.max(0, Math.min(1, (currentTime - currentSlideInfo.start) / (currentSlideInfo.duration || 1)));

  // Load presentation custom fonts
  useEffect(() => {
    if (presentation) {
      loadPresentationFonts(presentation);
    }
  }, [presentation]);

  // Handle external activeSlideIndex change (e.g. user clicks slide in timeline)
  const isExternalSlideChange = useRef<boolean>(false);

  useEffect(() => {
    const targetRange = slideRanges[activeSlideIndex];
    if (targetRange && (currentTime < targetRange.start || currentTime >= targetRange.end)) {
      isExternalSlideChange.current = true;
      setCurrentTime(targetRange.start);
      lastTimestampRef.current = null;
    }
  }, [activeSlideIndex, slideRanges]);

  // Sync activeSlideIndex with currentTime during playback
  useEffect(() => {
    if (isExternalSlideChange.current) {
      isExternalSlideChange.current = false;
      return;
    }
    if (activeSlide && activeSlide.index !== activeSlideIndex) {
      setActiveSlideIndex(activeSlide.index);
      if (onSlideChange) onSlideChange(activeSlide.index);
    }
  }, [activeSlide.index, activeSlideIndex, setActiveSlideIndex, onSlideChange]);

  // Preload narration audio in background for immediate playback
  useEffect(() => {
    if (config.voiceoverEnabled && presentation) {
      presentation.slides.forEach((s) => {
        if (s.narrationScript) {
          audioEngine.preloadNarrationAudio(s.narrationScript, config.voiceName || 'Aoede').catch(() => {});
        }
      });
    }
  }, [presentation, config.voiceoverEnabled, config.voiceName]);

  // Audio & Speech management on slide entry
  useEffect(() => {
    if (!isPlaying) {
      audioEngine.stopNarration();
      speechEngine.cancel();
      audioEngine.stopMusic();
      return;
    }

    // Configure volumes
    if (isMuted) {
      audioEngine.setMusicVolume(0);
      audioEngine.setVoiceVolume(0);
    } else {
      audioEngine.setMusicVolume(config.musicVolume !== undefined ? config.musicVolume * volume : 0.35 * volume);
      audioEngine.setVoiceVolume(config.voiceVolume !== undefined ? config.voiceVolume * volume : 1.0 * volume);
    }

    // Start background music if enabled
    if (!isMuted && config.musicTheme !== 'none') {
      audioEngine.startMusic(config.musicTheme, config.musicVolume !== undefined ? config.musicVolume * volume : 0.35 * volume);
    } else {
      audioEngine.stopMusic();
    }

    // Trigger voiceover narration
    const scriptToRead =
      activeSlide.narrationScript ||
      activeSlide.title ||
      activeSlide.elements
        .map((e) => e.content)
        .filter(Boolean)
        .join('. ');

    if (config.voiceoverEnabled && scriptToRead && !isMuted) {
      audioEngine.playNarration(
        scriptToRead,
        config.voiceName || 'Aoede'
      );
    } else {
      audioEngine.stopNarration();
      speechEngine.cancel();
    }

    return () => {
      audioEngine.stopNarration();
      speechEngine.cancel();
    };
  }, [
    activeSlide.index,
    isPlaying,
    config.voiceoverEnabled,
    config.voiceName,
    config.voiceVolume,
    config.musicTheme,
    config.musicVolume,
    isMuted,
    volume,
    activeSlide.narrationScript,
  ]);

  // Handle Play/Pause timer loop
  useEffect(() => {
    if (!isPlaying) {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
      lastTimestampRef.current = null;
      return;
    }

    const step = (now: number) => {
      if (lastTimestampRef.current === null) {
        lastTimestampRef.current = now;
      }
      const delta = (now - lastTimestampRef.current) / 1000;
      lastTimestampRef.current = now;

      setCurrentTime((prev) => {
        const nextTime = prev + delta;
        if (nextTime >= totalDuration) {
          setIsPlaying(false);
          speechEngine.cancel();
          audioEngine.stopMusic();
          return totalDuration;
        }
        return nextTime;
      });

      animationFrameRef.current = requestAnimationFrame(step);
    };

    animationFrameRef.current = requestAnimationFrame(step);

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [isPlaying, totalDuration]);

  // Keyboard shortcut for Space -> play/pause
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!suspended && e.code === 'Space' && (e.target as HTMLElement).tagName !== 'INPUT') {
        e.preventDefault();
        togglePlayPause();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isPlaying, currentTime, totalDuration, suspended]);

  const togglePlayPause = () => {
    if (currentTime >= totalDuration) {
      setCurrentTime(0);
      setIsPlaying(true);
    } else {
      setIsPlaying((prev) => !prev);
    }
  };

  const handleRestart = () => {
    setCurrentTime(0);
    setIsPlaying(true);
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const time = parseFloat(e.target.value);
    setCurrentTime(time);
    lastTimestampRef.current = null;
  };

  const handlePrevSlide = () => {
    const prevIdx = Math.max(0, activeSlideIndex - 1);
    const targetRange = slideRanges[prevIdx];
    if (targetRange) {
      setCurrentTime(targetRange.start);
      lastTimestampRef.current = null;
    }
  };

  const handleNextSlide = () => {
    const nextIdx = Math.min(presentation.slides.length - 1, activeSlideIndex + 1);
    const targetRange = slideRanges[nextIdx];
    if (targetRange) {
      setCurrentTime(targetRange.start);
      lastTimestampRef.current = null;
    }
  };

  const toggleFullscreen = () => {
    if (!containerRef.current) return;
    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen().then(() => setIsFullscreen(true)).catch(() => {});
    } else {
      document.exitFullscreen().then(() => setIsFullscreen(false)).catch(() => {});
    }
  };

  const toggleMute = () => {
    setIsMuted((prev) => {
      const next = !prev;
      if (next) {
        audioEngine.stopMusic();
        speechEngine.cancel();
      } else {
        if (isPlaying && config.musicTheme !== 'none') {
          audioEngine.startMusic(config.musicTheme, volume);
        }
      }
      return next;
    });
  };

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  return (
    <div
      ref={containerRef}
      id="video-player-root"
      className="w-full flex flex-col items-center bg-[#0F0F0F] rounded-sm border border-white/10 shadow-2xl overflow-hidden"
    >
      {/* Aspect Ratio & Camera Mode Header Pill */}
      <div className="w-full px-4 sm:px-6 py-3 bg-[#111111] border-b border-white/10 flex items-center justify-between text-xs text-white/60">
        <div className="flex items-center gap-3">
          <span className="inline-block transform -rotate-1 bg-[#A855F7] text-black text-[9px] uppercase font-black tracking-widest px-2.5 py-0.5 shadow-sm">
            Slide {activeSlideIndex + 1} / {presentation.slides.length}
          </span>
          <span className="font-serif italic text-white/90 text-sm hidden sm:inline truncate max-w-xs md:max-w-md">
            {activeSlide?.title}
          </span>
        </div>

        <div className="flex items-center gap-3">
          {/* Aspect Ratio Switch */}
          <div className="flex items-center bg-[#1A1A1A] p-0.5 border border-white/10">
            <button
              onClick={() => onUpdateConfig({ aspectRatio: '16:9' })}
              className={`flex items-center gap-1 px-2.5 py-1 text-[10px] uppercase tracking-wider font-bold transition-colors cursor-pointer ${
                config.aspectRatio === '16:9'
                  ? 'bg-[#A855F7] text-black'
                  : 'text-white/50 hover:text-white'
              }`}
              title="Formato Horizontal 16:9"
            >
              <Tv className="w-3 h-3" />
              <span>16:9</span>
            </button>
            <button
              onClick={() => onUpdateConfig({ aspectRatio: '9:16' })}
              className={`flex items-center gap-1 px-2.5 py-1 text-[10px] uppercase tracking-wider font-bold transition-colors cursor-pointer ${
                config.aspectRatio === '9:16'
                  ? 'bg-[#A855F7] text-black'
                  : 'text-white/50 hover:text-white'
              }`}
              title="Formato Vertical 9:16 (Reels/TikTok)"
            >
              <Smartphone className="w-3 h-3" />
              <span>9:16</span>
            </button>
          </div>

          <div className="hidden md:flex items-center gap-1 px-2.5 py-1 bg-[#1A1A1A] border border-white/10 text-[9px] font-mono uppercase tracking-widest text-[#A855F7]">
            <Sparkles className="w-3 h-3" />
            <span>Preset: {activeSlide?.directorCue?.cameraMove || 'Ken Burns'}</span>
          </div>
        </div>
      </div>

      {/* Main Video Viewport Canvas / Stage */}
      <div className="w-full flex items-center justify-center p-4 sm:p-8 bg-[#050505] relative min-h-[380px] md:min-h-[480px] overflow-hidden">
        {/* Artistic Dot Grid pattern overlay */}
        <div className="absolute inset-0 artistic-dot-grid opacity-15 pointer-events-none" />

        <div
          id="animated-video-canvas"
          className={`relative overflow-hidden border shadow-2xl transition-all duration-300 ${
            activeSlide && isLightBg(activeSlide.backgroundColor || '#FFFFFF')
              ? 'border-black/15 shadow-black/10'
              : 'border-white/20 shadow-black/60'
          } ${
            config.aspectRatio === '16:9'
              ? 'w-full max-w-4xl aspect-video'
              : 'w-full max-w-sm aspect-[9/16]'
          }`}
          style={{
            backgroundColor: activeSlide?.backgroundColor || '#FFFFFF',
            containerType: 'inline-size',
          }}
        >
          {/* Active Slide Animation Layer */}
          <AnimatePresence mode="wait">
            {activeSlide && (
              <motion.div
                key={activeSlide.id}
                initial={false}
                animate={{ opacity: 1 }}
                exit={{ opacity: 1 }}
                transition={{ duration: 0.45, ease: 'easeInOut' }}
                className="absolute inset-0 w-full h-full overflow-hidden"
                style={{
                  backgroundColor: activeSlide.backgroundColor || '#FFFFFF',
                }}
              >
                {/* Background Image (if slide has one) */}
                {activeSlide.backgroundImageUrl && (
                  <motion.div
                    className="absolute inset-0 w-full h-full"
                    animate={{
                      scale: [1.0, 1.04],
                    }}
                    transition={{
                      duration: activeSlide.duration * (1 / config.autoPacingMultiplier),
                      ease: 'linear',
                    }}
                  >
                    <img
                      src={activeSlide.backgroundImageUrl}
                      alt="Background"
                      className="w-full h-full object-cover opacity-90"
                    />
                  </motion.div>
                )}

                {/* Elements Canvas */}
                <div className="absolute inset-0 w-full h-full overflow-hidden">
                  {/* Standalone Shapes / Frames / Recuadros */}
                  {activeSlide.elements
                    .filter((e) => e.type === 'SHAPE')
                    .map((el) => {
                      return (
                        <div
                          key={el.id}
                          className="absolute pointer-events-none"
                          style={{
                            left: `${el.position.x}%`,
                            top: `${el.position.y}%`,
                            width: `${el.position.width}%`,
                            height: `${el.position.height}%`,
                            zIndex: el.position.zIndex || 3,
                            backgroundColor: el.style?.backgroundColor || 'transparent',
                            borderWidth: el.style?.borderWidth ? `${el.style.borderWidth}px` : undefined,
                            borderColor: el.style?.borderColor || 'transparent',
                            borderStyle: (el.style?.borderStyle as any) || (el.style?.borderWidth ? 'solid' : undefined),
                            borderRadius: el.style?.borderRadius ? `${el.style.borderRadius}px` : undefined,
                          }}
                        />
                      );
                    })}

                  {/* Render Images with independent imageAnimation configuration */}
                  {activeSlide.elements
                    .filter((e) => e.type === 'IMAGE')
                    .map((el) => {
                      let animInitial: any = { opacity: 0, scale: 0.98 };
                      let animAnimate: any = { opacity: 1, scale: 1 };

                      if (config.imageAnimation === 'pan-horizontal') {
                        animInitial = { opacity: 0, x: -16 };
                        animAnimate = { opacity: 1, x: 0 };
                      } else if (config.imageAnimation === 'fade-in') {
                        animInitial = { opacity: 0, scale: 1 };
                        animAnimate = { opacity: 1, scale: 1 };
                      } else if (config.imageAnimation === 'zoom-in') {
                        animInitial = { opacity: 0, scale: 0.88 };
                        animAnimate = { opacity: 1, scale: 1 };
                      } else if (config.imageAnimation === 'slide-up') {
                        animInitial = { opacity: 0, y: 24 };
                        animAnimate = { opacity: 1, y: 0 };
                      } else if (config.imageAnimation === 'none') {
                        animInitial = { opacity: 1, scale: 1, x: 0, y: 0 };
                        animAnimate = { opacity: 1, scale: 1, x: 0, y: 0 };
                      }

                      // Stable Ken Burns or pan tied directly to slide progress
                      let transformStyle = 'scale(1)';
                      if (config.imageAnimation === 'ken-burns') {
                        transformStyle = `scale(${1.0 + slideProgress * 0.08})`;
                      } else if (config.imageAnimation === 'pan-horizontal') {
                        transformStyle = `translateX(${(slideProgress - 0.5) * 16}px) scale(1.02)`;
                      }

                      return (
                        <motion.div
                          key={el.id}
                          className="absolute overflow-hidden"
                          style={{
                            left: `${el.position.x}%`,
                            top: `${el.position.y}%`,
                            width: `${el.position.width}%`,
                            height: `${el.position.height}%`,
                            zIndex: el.position.zIndex || 5,
                          }}
                          initial={animInitial}
                          animate={animAnimate}
                          transition={{
                            duration: config.imageAnimation === 'none' ? 0.01 : 0.6,
                            delay: config.imageAnimation === 'none' ? 0 : (el.animation?.delay || 0.1),
                            ease: [0.16, 1, 0.3, 1],
                          }}
                        >
                          <img
                            src={el.imageUrl}
                            alt="Slide visual"
                            referrerPolicy="no-referrer"
                            onError={(e) => {
                              const img = e.currentTarget;
                              if (!img.dataset.proxied && el.imageUrl) {
                                img.dataset.proxied = 'true';
                                img.src = `/api/proxy/image?url=${encodeURIComponent(el.imageUrl)}`;
                              }
                            }}
                            className="w-full h-full object-contain will-change-transform select-none"
                            style={{
                              transform: transformStyle,
                              transition: 'transform 100ms linear',
                            }}
                          />
                        </motion.div>
                      );
                    })}

                  {/* Render Texts with independent textAnimation configuration, original font & recuadros */}
                  <div className="absolute inset-0 w-full h-full pointer-events-none">
                    {(() => {
                      const slideTime = Math.max(0, currentTime - currentSlideInfo.start);
                      const slideDur = currentSlideInfo.duration || 6;

                      return activeSlide.elements
                        .filter((e) => e.type !== 'IMAGE' && e.type !== 'SHAPE')
                        .map((el, elIdx) => {
                          const isTitle = el.type === 'TITLE';
                          const delay = 0;
                          const fontSizeInCqw = el.style?.fontSize
                            ? Math.max(1.4, Math.min(8.0, el.style.fontSize * 0.14))
                            : isTitle
                            ? 4.2
                            : 2.2;
                          const isSlideLight = isLightBg(activeSlide.backgroundColor || '#FFFFFF');
                          const defaultColor = isSlideLight ? '#111827' : '#FFFFFF';

                          // Authentic font matching
                          const fontFamily = el.style?.fontFamily
                            ? `"${el.style.fontFamily}", system-ui, sans-serif`
                            : (isTitle ? 'Playfair Display, serif' : 'Plus Jakarta Sans, sans-serif');

                          const fontStyle = el.style?.fontStyle || 'normal';
                          const fontWeight = el.style?.fontWeight || (isTitle ? 700 : 400);

                          // Has recuadro or background fill
                          const hasBoxBg = !!el.style?.backgroundColor;
                          const hasBoxBorder = !!el.style?.borderColor && (el.style?.borderWidth || 0) > 0;

                          // Parse text into sentences and paragraphs
                          const units = parseTextIntoUnits(el.content || '');
                          const availableTime = Math.max(1.2, slideDur * 0.7 - delay);
                          const stepTime = units.length > 1 ? Math.min(2.5, Math.max(0.6, availableTime / units.length)) : 0;

                          return (
                            <motion.div
                              key={el.id}
                              className="absolute flex flex-col justify-start"
                              style={{
                                left: `${el.position.x}%`,
                                top: `${el.position.y}%`,
                                width: `${el.position.width}%`,
                                height: `${el.position.height}%`,
                                zIndex: el.position.zIndex || 10,
                                backgroundColor: el.style?.backgroundColor || 'transparent',
                                borderWidth: el.style?.borderWidth ? `${el.style.borderWidth}px` : undefined,
                                borderColor: el.style?.borderColor || 'transparent',
                                borderStyle: (el.style?.borderStyle as any) || (hasBoxBorder ? 'solid' : undefined),
                                borderRadius: el.style?.borderRadius ? `${el.style.borderRadius}px` : undefined,
                                padding: (hasBoxBg || hasBoxBorder) ? (el.style?.padding || 8) : 0,
                                boxSizing: 'border-box',
                                textAlign: el.style?.textAlign || 'left',
                              }}
                              initial={{ opacity: 0 }}
                              animate={{ opacity: 1 }}
                              transition={{ duration: 0.3 }}
                            >
                              <div
                                className={`leading-relaxed break-words whitespace-pre-line ${
                                  isSlideLight || hasBoxBg ? 'drop-shadow-none' : 'drop-shadow-[0_2px_8px_rgba(0,0,0,0.8)]'
                                }`}
                                style={{
                                  color: el.style?.color || defaultColor,
                                  fontWeight: fontWeight,
                                  fontSize: `${fontSizeInCqw}cqw`,
                                  fontFamily: fontFamily,
                                  fontStyle: fontStyle,
                                  textAlign: el.style?.textAlign || 'left',
                                }}
                              >
                                {units.length <= 1 ? (
                                  <motion.span
                                    initial={false}
                                    animate={
                                      config.textAnimation === 'none' || slideTime >= delay
                                        ? { opacity: 1, y: 0 }
                                        : { opacity: 0, y: 10 }
                                    }
                                    transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
                                    className="block"
                                  >
                                    {el.content}
                                  </motion.span>
                                ) : (
                                  units.map((u, uIdx) => {
                                    const unitDelay = delay + uIdx * stepTime;
                                    const isUnitVisible = true;

                                    return (
                                      <motion.span
                                        key={u.id}
                                        className={`${u.isNewParagraph ? 'block' : 'inline'} ${
                                          u.hasEmptyLineBefore ? 'mt-2.5 sm:mt-3.5' : ''
                                        }`}
                                        initial={false}
                                        animate={{
                                          opacity: isUnitVisible ? 1 : 0,
                                          y: isUnitVisible ? 0 : 8,
                                        }}
                                        transition={{
                                          duration: 0.38,
                                          ease: [0.16, 1, 0.3, 1],
                                        }}
                                      >
                                        {u.text}{' '}
                                      </motion.span>
                                    );
                                  })
                                )}
                              </div>
                            </motion.div>
                          );
                        });
                    })()}
                  </div>
                </div>

                {/* Subtitles / Narration Bar (Only if explicitly enabled with distinct speaker notes) */}
                {config.showCaptions && activeSlide.notes && activeSlide.notes.trim() !== '' && (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="absolute bottom-6 left-6 right-6 z-30 flex justify-center pointer-events-none"
                  >
                    <div className="bg-black/90 backdrop-blur-md px-5 py-2.5 border border-white/20 max-w-xl text-center shadow-2xl">
                      <p className="text-xs sm:text-sm font-serif italic text-white/90 leading-relaxed">
                        "{activeSlide.notes.trim()}"
                      </p>
                    </div>
                  </motion.div>
                )}
              </motion.div>
            )}
          </AnimatePresence>

          {/* Glowing Purple Progress Bar on top of canvas */}
          <div className="absolute bottom-0 left-0 right-0 h-1 bg-white/10 z-40">
            <div
              className="h-full bg-[#A855F7] shadow-[0_0_15px_#A855F7] transition-all duration-75"
              style={{ width: `${(currentTime / (totalDuration || 1)) * 100}%` }}
            />
          </div>

          {/* Time Badge in top right corner */}
          <div className="absolute top-3 right-3 text-[9px] font-mono text-[#A855F7] bg-black/80 px-2.5 py-1 border border-white/15 z-40">
            {formatTime(currentTime)} / {formatTime(totalDuration)}
          </div>
        </div>
      </div>

      {/* Telemetry Indicator Strip */}
      <div className="w-full bg-[#0F0F0F] border-t border-white/10 py-3 px-6 grid grid-cols-3 gap-4 text-center">
        <div>
          <div className="text-xl sm:text-2xl font-black text-white">
            {Math.round(((activeSlideIndex + 1) / presentation.slides.length) * 100)}%
          </div>
          <div className="text-[9px] uppercase tracking-[0.2em] text-white/40">Motion Sequence</div>
        </div>
        <div>
          <div className="text-xl sm:text-2xl font-black text-white">
            {presentation.slides.reduce((acc, s) => acc + s.elements.length, 0)}
          </div>
          <div className="text-[9px] uppercase tracking-[0.2em] text-white/40">Active Nodes</div>
        </div>
        <div>
          <div className="text-xl sm:text-2xl font-black text-[#A855F7]">
            {isPlaying ? 'ACTIVE' : 'READY'}
          </div>
          <div className="text-[9px] uppercase tracking-[0.2em] text-white/40">Preview Engine</div>
        </div>
      </div>

      {/* Transport & Control Bar */}
      <div className="w-full p-4 sm:p-5 bg-[#111111] border-t border-white/10 flex flex-col gap-3.5">
        {/* Timeline Slider with visual progress track and slide division markers */}
        <div className="relative w-full h-5 flex items-center group cursor-pointer">
          {/* Background track */}
          <div className="absolute inset-x-0 h-2 bg-[#222222] border border-white/10 rounded-sm overflow-hidden">
            {/* Filled Progress Bar */}
            <div
              className="h-full bg-gradient-to-r from-[#9333EA] to-[#A855F7] shadow-[0_0_12px_rgba(168,85,247,0.6)]"
              style={{ width: `${Math.min(100, (currentTime / (totalDuration || 1)) * 100)}%` }}
            />
          </div>

          {/* Slide Division Markers */}
          {slideRanges.map((range, rIdx) => {
            if (rIdx === 0) return null;
            const pct = (range.start / (totalDuration || 1)) * 100;
            return (
              <div
                key={rIdx}
                className="absolute top-1/2 -translate-y-1/2 w-0.5 h-3.5 bg-white/40 z-10 pointer-events-none"
                style={{ left: `${pct}%` }}
                title={`Diapositiva ${rIdx + 1}`}
              />
            );
          })}

          {/* Floating Scrubber Thumb Handle */}
          <div
            className="absolute top-1/2 -translate-y-1/2 w-3.5 h-3.5 bg-white border-2 border-[#A855F7] shadow-[0_0_10px_#A855F7] pointer-events-none z-20 transition-transform group-hover:scale-125"
            style={{
              left: `calc(${Math.min(100, (currentTime / (totalDuration || 1)) * 100)}% - 7px)`,
            }}
          />

          {/* Transparent full-width range input for effortless scrubbing */}
          <input
            id="video-timeline-scrubber"
            type="range"
            min="0"
            max={totalDuration || 1}
            step="0.05"
            value={currentTime}
            onChange={handleSeek}
            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-30"
          />
        </div>

        {/* Buttons and Time */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          {/* Left Playback Controls */}
          <div className="flex items-center gap-2">
            <button
              id="btn-restart"
              onClick={handleRestart}
              className="p-2 text-white/50 hover:text-white hover:bg-[#1A1A1A] border border-transparent hover:border-white/10 transition-colors cursor-pointer"
              title="Reiniciar video desde el inicio"
            >
              <RotateCcw className="w-4 h-4" />
            </button>

            <button
              id="btn-prev-slide"
              onClick={handlePrevSlide}
              disabled={activeSlideIndex === 0}
              className="p-2 text-white/50 hover:text-white hover:bg-[#1A1A1A] border border-transparent hover:border-white/10 disabled:opacity-20 transition-colors cursor-pointer"
              title="Diapositiva anterior"
            >
              <SkipBack className="w-4 h-4" />
            </button>

            <button
              id="btn-play-pause"
              onClick={togglePlayPause}
              className="w-10 h-10 bg-[#A855F7] hover:bg-[#9333EA] text-black flex items-center justify-center font-black shadow-[0_0_15px_rgba(168,85,247,0.35)] hover:scale-105 active:scale-95 transition-all cursor-pointer"
              title={isPlaying ? 'Pausar (Espacio)' : 'Reproducir video (Espacio)'}
            >
              {isPlaying ? <Pause className="w-5 h-5 fill-current" /> : <Play className="w-5 h-5 fill-current translate-x-0.5" />}
            </button>

            <button
              id="btn-next-slide"
              onClick={handleNextSlide}
              disabled={activeSlideIndex === presentation.slides.length - 1}
              className="p-2 text-white/50 hover:text-white hover:bg-[#1A1A1A] border border-transparent hover:border-white/10 disabled:opacity-20 transition-colors cursor-pointer"
              title="Siguiente diapositiva"
            >
              <SkipForward className="w-4 h-4" />
            </button>

            {/* Time Display */}
            <div className="text-[10px] font-mono text-white/50 ml-2">
              <span className="text-white font-bold">{formatTime(currentTime)}</span> / {formatTime(totalDuration)}
            </div>
          </div>

          {/* Right Controls: Audio, Speed, Fullscreen */}
          <div className="flex items-center gap-3">
            {/* Speed Multiplier Pill */}
            <div className="flex items-center bg-[#1A1A1A] p-0.5 border border-white/10 text-xs">
              {[0.8, 1.0, 1.25].map((speed) => (
                <button
                  key={speed}
                  onClick={() => onUpdateConfig({ autoPacingMultiplier: speed })}
                  className={`px-2.5 py-1 text-[10px] font-mono font-bold transition-colors cursor-pointer ${
                    config.autoPacingMultiplier === speed
                      ? 'bg-[#A855F7] text-black'
                      : 'text-white/40 hover:text-white'
                  }`}
                >
                  {speed}x
                </button>
              ))}
            </div>

            {/* Volume / Mute */}
            <div className="flex items-center gap-1.5">
              <button
                id="btn-toggle-sound"
                onClick={toggleMute}
                className="p-2 text-white/50 hover:text-white hover:bg-[#1A1A1A] border border-transparent hover:border-white/10 transition-colors cursor-pointer"
                title={isMuted ? 'Activar sonido' : 'Silenciar'}
              >
                {isMuted ? <VolumeX className="w-4 h-4 text-rose-400" /> : <Volume2 className="w-4 h-4" />}
              </button>
              <input
                type="range"
                min="0"
                max="1"
                step="0.05"
                value={isMuted ? 0 : volume}
                onChange={(e) => {
                  const val = parseFloat(e.target.value);
                  setVolume(val);
                  setIsMuted(false);
                  audioEngine.setVolume(val);
                  onUpdateConfig({ musicVolume: val });
                }}
                className="w-16 h-1 bg-[#222222] rounded-none appearance-none cursor-pointer accent-[#A855F7] hidden sm:block"
              />
            </div>

            {/* Fullscreen Button */}
            <button
              id="btn-toggle-fullscreen"
              onClick={toggleFullscreen}
              className="p-2 text-white/50 hover:text-white hover:bg-[#1A1A1A] border border-transparent hover:border-white/10 transition-colors cursor-pointer"
              title={isFullscreen ? 'Salir de pantalla completa' : 'Pantalla completa'}
            >
              {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
