import React, { useState } from 'react';
import {
  Sparkles,
  Wand2,
  Volume2,
  Music,
  Clock,
  Subtitles,
  Loader2,
  CheckCircle2,
  Sliders,
  Type,
  Image as ImageIcon,
  Square,
  Sparkle,
  Mic,
} from 'lucide-react';
import {
  VideoConfig,
  DirectorStyle,
  MusicTheme,
  PresentationData,
  TextAnimationType,
  ImageAnimationType,
  VoiceNameType,
} from '../types';

interface DirectorControlsProps {
  config: VideoConfig;
  onUpdateConfig: (newConfig: Partial<VideoConfig>) => void;
  presentation: PresentationData;
  onAiEnhancePresentation: (enhancedData: any) => void;
  isAiAnalyzing: boolean;
  setIsAiAnalyzing: (analyzing: boolean) => void;
}

export const DirectorControls: React.FC<DirectorControlsProps> = ({
  config,
  onUpdateConfig,
  presentation,
  onAiEnhancePresentation,
  isAiAnalyzing,
  setIsAiAnalyzing,
}) => {
  const [aiSuccessMessage, setAiSuccessMessage] = useState<string | null>(null);
  const [aiErrorMessage, setAiErrorMessage] = useState<string | null>(null);

  const textAnimations: Array<{ id: TextAnimationType; label: string; desc: string; icon: string }> = [
    { id: 'slide-up', label: 'Deslizar Arriba', desc: 'Entrada fluida y suave desde abajo', icon: '⬆️' },
    { id: 'fade-in', label: 'Desvanecimiento', desc: 'Aparición suave en su sitio', icon: '✨' },
    { id: 'zoom-in', label: 'Zoom Suave', desc: 'Aparición con escala y foco sutil', icon: '🔍' },
    { id: 'slide-left', label: 'Deslizar Lateral', desc: 'Entrada desde el margen lateral', icon: '⬅️' },
    { id: 'none', label: 'Fijo / Sin Animación', desc: 'Texto estático y permanente', icon: '⏹️' },
  ];

  const imageAnimations: Array<{ id: ImageAnimationType; label: string; desc: string; icon: string }> = [
    { id: 'ken-burns', label: 'Ken Burns Zoom', desc: 'Zoom continuo y cinematográfico', icon: '🎥' },
    { id: 'pan-horizontal', label: 'Paneo Lateral', desc: 'Desplazamiento horizontal dinámico', icon: '↔️' },
    { id: 'fade-in', label: 'Desvanecer', desc: 'Aparición suave sin movimiento', icon: '✨' },
    { id: 'zoom-in', label: 'Pop / Zoom Entrada', desc: 'Entrada con zoom sutil de bienvenida', icon: '🔎' },
    { id: 'slide-up', label: 'Deslizar Arriba', desc: 'Entrada desde la parte inferior', icon: '⬆️' },
    { id: 'none', label: 'Fija / Estática', desc: 'Imagen fija en encuadre 1:1', icon: '🖼️' },
  ];

  const directorStyles: Array<{ id: DirectorStyle; label: string; desc: string; icon: string }> = [
    {
      id: 'cinematic',
      label: 'Cinemático',
      desc: 'Zooms suaves Ken Burns, transiciones cinematográficas y ritmo elegante.',
      icon: '🎬',
    },
    {
      id: 'dynamic',
      label: 'Dinámico',
      desc: 'Movimientos enérgicos, tipografía cinética rápida y alto impacto.',
      icon: '⚡',
    },
    {
      id: 'minimal',
      label: 'Minimalista',
      desc: 'Paneos sutiles, enfoque limpio y transiciones invisibles.',
      icon: '✨',
    },
    {
      id: 'storyteller',
      label: 'Storyteller',
      desc: 'Pacing pausado, énfasis en detalles visuales y narrativa profunda.',
      icon: '📖',
    },
  ];

  const musicThemes: Array<{ id: MusicTheme; label: string }> = [
    { id: 'ambient', label: 'Ambient Chill' },
    { id: 'tech', label: 'Tech Pulse' },
    { id: 'cinematic', label: 'Cinematic Strings' },
    { id: 'acoustic', label: 'Acoustic Gentle' },
    { id: 'none', label: 'Sin Música' },
  ];

  const handleRunAiDirector = async () => {
    setIsAiAnalyzing(true);
    setAiSuccessMessage(null);
    setAiErrorMessage(null);

    try {
      const res = await fetch('/api/ai/director', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          presentationTitle: presentation.title,
          slides: presentation.slides,
          style: config.directorStyle,
        }),
      });

      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || 'Error al procesar la dirección IA');
      }

      onAiEnhancePresentation(json.data);
      if (json.data.recommendedMusicTheme) {
        onUpdateConfig({ musicTheme: json.data.recommendedMusicTheme });
      }

      setAiSuccessMessage('¡El Director IA optimizó las animaciones, guiones y ritmos de las diapositivas!');
      setTimeout(() => setAiSuccessMessage(null), 5000);
    } catch (err: any) {
      console.error('AI Director error:', err);
      setAiErrorMessage(err.message || 'No se pudo completar la optimización');
    } finally {
      setIsAiAnalyzing(false);
    }
  };

  return (
    <div
      id="director-controls-panel"
      className="w-full bg-[#0F0F0F] border border-white/10 rounded-sm p-5 sm:p-7 space-y-6 shadow-2xl"
    >
      {/* Title & AI Smart Director Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-5 border-b border-white/10">
        <div>
          <div className="flex items-center gap-2.5">
            <Sliders className="w-4 h-4 text-[#A855F7]" />
            <h2 className="text-lg font-serif italic text-white">Autonomous AI Director</h2>
          </div>
          <p className="text-xs text-white/50 mt-1">
            Configuración autónoma de cámaras, tipografía cinética, ritmo y síntesis de voz.
          </p>
        </div>

        {/* 1-Click AI Director Button */}
        <button
          id="btn-run-ai-director"
          onClick={handleRunAiDirector}
          disabled={isAiAnalyzing}
          className="inline-flex items-center justify-center gap-2 px-5 py-2.5 bg-[#A855F7] hover:bg-[#9333EA] disabled:opacity-50 text-black font-black text-[10px] uppercase tracking-[0.2em] shadow-[0_0_15px_rgba(168,85,247,0.35)] transition-all active:scale-95 cursor-pointer shrink-0"
        >
          {isAiAnalyzing ? (
            <>
              <Loader2 className="w-3.5 h-3.5 animate-spin text-black" />
              <span>Analizando con Gemini...</span>
            </>
          ) : (
            <>
              <Wand2 className="w-3.5 h-3.5 text-black" />
              <span>Optimizar Diapositivas</span>
            </>
          )}
        </button>
      </div>

      {aiSuccessMessage && (
        <div className="p-3 bg-[#A855F7]/10 border border-[#A855F7]/30 text-[#A855F7] text-xs flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-[#A855F7] shrink-0" />
          <span>{aiSuccessMessage}</span>
        </div>
      )}

      {aiErrorMessage && (
        <div className="p-3 bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs">
          {aiErrorMessage}
        </div>
      )}

      {/* SECCIÓN PRINCIPAL: ANIMACIONES INDEPENDIENTES DE TEXTO E IMÁGENES */}
      <div className="bg-[#141414] border border-[#A855F7]/30 p-5 space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-white/10">
          <div>
            <div className="flex items-center gap-2">
              <Sparkle className="w-4 h-4 text-[#A855F7]" />
              <h3 className="text-sm font-bold text-white uppercase tracking-wider">
                Animación Diferenciada: Letras vs Imágenes
              </h3>
            </div>
            <p className="text-xs text-white/50 mt-0.5">
              Elige una animación para los textos y otra completamente distinta para las imágenes.
            </p>
          </div>

          <div className="flex items-center gap-2 bg-[#1A1A1A] px-3 py-1.5 border border-white/10 shrink-0">
            <Square className="w-3.5 h-3.5 text-[#A855F7]" />
            <span className="text-[11px] font-bold text-white">Formato y Recuadros Originales</span>
            <span className="w-2 h-2 rounded-full bg-emerald-400 inline-block ml-1 animate-pulse" />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {/* Card 1: Animación de Textos / Letras */}
          <div className="space-y-2.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-white flex items-center gap-1.5">
                <Type className="w-3.5 h-3.5 text-[#A855F7]" />
                <span>Animación de Letras / Textos</span>
              </label>
              <span className="text-[10px] font-mono uppercase text-[#A855F7] font-bold">
                {textAnimations.find((t) => t.id === config.textAnimation)?.label || config.textAnimation}
              </span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
              {textAnimations.map((anim) => (
                <button
                  key={anim.id}
                  onClick={() => onUpdateConfig({ textAnimation: anim.id })}
                  className={`p-2.5 border text-left transition-all cursor-pointer flex flex-col justify-between ${
                    config.textAnimation === anim.id
                      ? 'bg-[#1F1F1F] border-l-4 border-l-[#A855F7] border-white/40 text-[#A855F7] shadow-sm'
                      : 'bg-[#111111] border-white/10 text-white/60 hover:text-white hover:bg-[#161616]'
                  }`}
                >
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm">{anim.icon}</span>
                    <span className="text-xs font-bold text-white">{anim.label}</span>
                  </div>
                  <p className="text-[10px] text-white/40 mt-1 line-clamp-1">{anim.desc}</p>
                </button>
              ))}
            </div>
          </div>

          {/* Card 2: Animación de Imágenes */}
          <div className="space-y-2.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-white flex items-center gap-1.5">
                <ImageIcon className="w-3.5 h-3.5 text-[#A855F7]" />
                <span>Animación de Imágenes</span>
              </label>
              <span className="text-[10px] font-mono uppercase text-[#A855F7] font-bold">
                {imageAnimations.find((im) => im.id === config.imageAnimation)?.label || config.imageAnimation}
              </span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
              {imageAnimations.map((anim) => (
                <button
                  key={anim.id}
                  onClick={() => onUpdateConfig({ imageAnimation: anim.id })}
                  className={`p-2.5 border text-left transition-all cursor-pointer flex flex-col justify-between ${
                    config.imageAnimation === anim.id
                      ? 'bg-[#1F1F1F] border-l-4 border-l-[#A855F7] border-white/40 text-[#A855F7] shadow-sm'
                      : 'bg-[#111111] border-white/10 text-white/60 hover:text-white hover:bg-[#161616]'
                  }`}
                >
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm">{anim.icon}</span>
                    <span className="text-xs font-bold text-white">{anim.label}</span>
                  </div>
                  <p className="text-[10px] text-white/40 mt-1 line-clamp-1">{anim.desc}</p>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Grid of Settings */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {/* Style Selection */}
        <div className="space-y-3">
          <label className="text-[10px] font-bold text-white/40 uppercase tracking-[0.2em] flex items-center gap-1.5">
            <span>Estilo de Animación</span>
          </label>
          <div className="grid grid-cols-2 gap-2">
            {directorStyles.map((style) => (
              <button
                key={style.id}
                onClick={() => onUpdateConfig({ directorStyle: style.id })}
                className={`p-3 border text-left transition-all cursor-pointer flex flex-col justify-between ${
                  config.directorStyle === style.id
                    ? 'bg-[#1A1A1A] border-l-4 border-l-[#A855F7] border-white/30 text-[#A855F7] shadow-sm'
                    : 'bg-[#111111] border-white/10 text-white/50 hover:text-white hover:bg-[#161616]'
                }`}
              >
                <div className="flex items-center gap-2">
                  <span className="text-base">{style.icon}</span>
                  <span className="text-xs font-bold text-white">{style.label}</span>
                </div>
                <p className="text-[10px] text-white/40 mt-1 line-clamp-2">{style.desc}</p>
              </button>
            ))}
          </div>
        </div>

        {/* Voiceover & Narration */}
        <div className="space-y-3">
          <label className="text-[10px] font-bold text-white/40 uppercase tracking-[0.2em] flex items-center gap-1.5">
            <Volume2 className="w-3.5 h-3.5 text-[#A855F7]" />
            <span>Voz en Off & Subtítulos</span>
          </label>

          <div className="bg-[#111111] p-4 border border-white/10 space-y-3">
            {/* Toggle Voiceover */}
            <div className="flex items-center justify-between">
              <div>
                <span className="text-xs font-bold text-white">Narrador Automático</span>
                <p className="text-[11px] text-white/40">Locución con IA grabada en el video</p>
              </div>
              <input
                type="checkbox"
                checked={config.voiceoverEnabled}
                onChange={(e) => onUpdateConfig({ voiceoverEnabled: e.target.checked })}
                className="w-4 h-4 rounded-none accent-[#A855F7] cursor-pointer"
              />
            </div>

            {config.voiceoverEnabled && (
              <>
                <div className="bg-[#A855F7]/10 border border-[#A855F7]/30 p-2.5 flex items-start gap-2">
                  <CheckCircle2 className="w-4 h-4 text-[#A855F7] shrink-0 mt-0.5" />
                  <div className="text-[11px] text-white/90 leading-tight">
                    <span className="font-bold text-white">Grabación en video activa:</span> La narración se grabará directamente en el archivo de video descargable.
                  </div>
                </div>

                {/* Voice Selection */}
                <div className="pt-2 border-t border-white/10 space-y-1.5">
                  <label className="text-[10px] font-mono text-white/40 block">Voz del Narrador</label>
                  <div className="grid grid-cols-2 gap-1.5">
                    {[
                      { id: 'Aoede', label: 'Aoede', desc: 'Femenina Cálida' },
                      { id: 'Fenrir', label: 'Fenrir', desc: 'Masculina Firme' },
                      { id: 'Kore', label: 'Kore', desc: 'Femenina Clara' },
                      { id: 'Puck', label: 'Puck', desc: 'Joven / Dinámica' },
                      { id: 'Charon', label: 'Charon', desc: 'Masculina Grave' },
                    ].map((v) => (
                      <button
                        key={v.id}
                        type="button"
                        onClick={() => onUpdateConfig({ voiceName: v.id as VoiceNameType })}
                        className={`p-2 text-left border transition-all cursor-pointer ${
                          (config.voiceName || 'Aoede') === v.id
                            ? 'bg-[#A855F7]/20 border-[#A855F7] text-white'
                            : 'bg-[#161616] border-white/5 text-white/60 hover:border-white/20'
                        }`}
                      >
                        <div className="text-xs font-bold text-white">{v.label}</div>
                        <div className="text-[10px] text-white/40">{v.desc}</div>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Voice Volume */}
                <div className="pt-2 border-t border-white/10">
                  <div className="flex justify-between text-[10px] font-mono text-white/40 mb-1">
                    <span>Volumen de locución</span>
                    <span className="text-[#A855F7] font-bold">
                      {Math.round((config.voiceVolume ?? 1.0) * 100)}%
                    </span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.05"
                    value={config.voiceVolume ?? 1.0}
                    onChange={(e) => onUpdateConfig({ voiceVolume: parseFloat(e.target.value) })}
                    className="w-full h-1 bg-[#222222] appearance-none cursor-pointer accent-[#A855F7]"
                  />
                </div>

                {/* Voice Speed */}
                <div className="pt-2 border-t border-white/10">
                  <div className="flex justify-between text-[10px] font-mono text-white/40 mb-1">
                    <span>Velocidad de locución</span>
                    <span className="text-[#A855F7] font-bold">{config.voiceSpeed}x</span>
                  </div>
                  <input
                    type="range"
                    min="0.8"
                    max="1.3"
                    step="0.05"
                    value={config.voiceSpeed}
                    onChange={(e) => onUpdateConfig({ voiceSpeed: parseFloat(e.target.value) })}
                    className="w-full h-1 bg-[#222222] appearance-none cursor-pointer accent-[#A855F7]"
                  />
                </div>
              </>
            )}

            {/* Toggle Subtitles */}
            <div className="flex items-center justify-between pt-2 border-t border-white/10">
              <div className="flex items-center gap-1.5">
                <Subtitles className="w-3.5 h-3.5 text-[#A855F7]" />
                <span className="text-xs font-bold text-white">Mostrar Subtítulos</span>
              </div>
              <input
                type="checkbox"
                checked={config.showCaptions}
                onChange={(e) => onUpdateConfig({ showCaptions: e.target.checked })}
                className="w-4 h-4 rounded-none accent-[#A855F7] cursor-pointer"
              />
            </div>
          </div>
        </div>

        {/* Music & Sound Environment */}
        <div className="space-y-3">
          <label className="text-[10px] font-bold text-white/40 uppercase tracking-[0.2em] flex items-center gap-1.5">
            <Music className="w-3.5 h-3.5 text-[#A855F7]" />
            <span>Música Procedural</span>
          </label>

          <div className="bg-[#111111] p-4 border border-white/10 space-y-3">
            <div className="grid grid-cols-2 gap-1.5">
              {musicThemes.map((m) => (
                <button
                  key={m.id}
                  onClick={() => onUpdateConfig({ musicTheme: m.id })}
                  className={`px-2.5 py-1.5 text-[10px] uppercase font-bold tracking-wider border text-center transition-all cursor-pointer ${
                    config.musicTheme === m.id
                      ? 'bg-[#1A1A1A] border-l-2 border-l-[#A855F7] border-white/30 text-[#A855F7]'
                      : 'bg-[#151515] border-white/10 text-white/40 hover:text-white'
                  }`}
                >
                  {m.label}
                </button>
              ))}
            </div>

            {config.musicTheme !== 'none' && (
              <div className="pt-2 border-t border-white/10">
                <div className="flex justify-between text-[10px] font-mono text-white/40 mb-1">
                  <span>Volumen ambiental</span>
                  <span className="text-[#A855F7] font-bold">{Math.round(config.musicVolume * 100)}%</span>
                </div>
                <input
                  type="range"
                  min="0.05"
                  max="0.8"
                  step="0.05"
                  value={config.musicVolume}
                  onChange={(e) => onUpdateConfig({ musicVolume: parseFloat(e.target.value) })}
                  className="w-full h-1 bg-[#222222] appearance-none cursor-pointer accent-[#A855F7]"
                />
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
