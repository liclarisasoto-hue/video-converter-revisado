import React, { useState, useRef, useEffect } from 'react';
import {
  X,
  Download,
  Video,
  CheckCircle2,
  Loader2,
  Sparkles,
  AlertCircle,
  Play,
  Pause,
  RotateCcw,
  RotateCw,
} from 'lucide-react';
import { PresentationData, VideoConfig } from '../types';
import { audioEngine, speechEngine } from '../services/audioSynthesizer';
import { videoExporter } from '../services/videoRecorder';
import { isLightBg } from '../services/googleSlides';
import { loadPresentationFonts } from '../services/fontLoader';
import { parseTextIntoUnits } from '../utils/textParser';
import { prepareNarration, NarrationTrack, unitKey } from '../utils/narrationTimeline';
import { layoutText } from '../utils/textLayout';

interface ExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  presentation: PresentationData;
  config: VideoConfig;
}

export const ExportModal: React.FC<ExportModalProps> = ({
  isOpen,
  onClose,
  presentation,
  config,
}) => {
  const [isExporting, setIsExporting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [statusText, setStatusText] = useState('Listo para generar el video');
  const [videoBlobUrl, setVideoBlobUrl] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [videoMimeType, setVideoMimeType] = useState<string>('video/webm');
  const [totalVideoDuration, setTotalVideoDuration] = useState<number>(0);
  const [previewCurrentTime, setPreviewCurrentTime] = useState<number>(0);
  const [isPreviewPlaying, setIsPreviewPlaying] = useState<boolean>(true);

  const hiddenCanvasRef = useRef<HTMLCanvasElement>(null);
  const previewVideoRef = useRef<HTMLVideoElement>(null);
  const stopExportRef = useRef<boolean>(false);

  const formatTime = (secs: number) => {
    if (!secs || isNaN(secs) || secs < 0) return '00:00';
    const mins = Math.floor(secs / 60);
    const remSecs = Math.floor(secs % 60);
    return `${mins.toString().padStart(2, '0')}:${remSecs.toString().padStart(2, '0')}`;
  };

  useEffect(() => {
    if (!isOpen) {
      if (videoBlobUrl) {
        // keep url or clean
      }
      stopExportRef.current = true;
      setIsExporting(false);
    }
  }, [isOpen]);

  const handleStartExport = async () => {
    if (!hiddenCanvasRef.current) return;
    setIsExporting(true);
    setProgress(0);
    setVideoBlobUrl(null);
    setErrorMessage(null);
    stopExportRef.current = false;
    setStatusText('Inicializando motor de renderizado...');

    const outputCanvas = hiddenCanvasRef.current;
    const canvas = document.createElement('canvas');
    const isWidescreen = config.aspectRatio === '16:9';
    const shortSide = config.resolution === '1080p' ? 1080 : 720;
    canvas.width = config.aspectRatio === '1:1' ? shortSide : isWidescreen ? shortSide * 16 / 9 : shortSide;
    canvas.height = config.aspectRatio === '1:1' ? shortSide : isWidescreen ? shortSide : shortSide * 16 / 9;
    outputCanvas.width = canvas.width;
    outputCanvas.height = canvas.height;
    const sourceAspect = (presentation.slideWidth || 9144000) / (presentation.slideHeight || 5143500);
    canvas.width = Math.round(Math.min(outputCanvas.width, outputCanvas.height * sourceAspect));
    canvas.height = Math.round(canvas.width / sourceAspect);
    const outputCtx = outputCanvas.getContext('2d');
    const ctx = canvas.getContext('2d');

    if (!ctx || !outputCtx) {
      setErrorMessage('No se pudo inicializar el contexto gráfico Canvas');
      setIsExporting(false);
      return;
    }

    try {
      // Ensure all web fonts are loaded so canvas doesn't render invisible text
      if (document.fonts) {
        await document.fonts.ready;
      }

      // Pre-load slide images with CORS proxy to prevent Canvas tainting
      setStatusText('Cargando imágenes en alta definición...');
      const loadedImages: Record<string, HTMLImageElement> = {};

      for (const slide of presentation.slides) {
        for (const el of [...slide.elements, ...(slide.backgroundImageUrl ? [{ type: 'IMAGE', imageUrl: slide.backgroundImageUrl }] : [])]) {
          if (el.type === 'IMAGE' && el.imageUrl && !loadedImages[el.imageUrl]) {
            const loadImage = (url: string) => new Promise<HTMLImageElement | null>(resolve => {
              const img = new Image();
              const finish = (value: HTMLImageElement | null) => {
                clearTimeout(timer);
                img.onload = null;
                img.onerror = null;
                resolve(value);
              };
              const timer = setTimeout(() => finish(null), 15000);
              img.crossOrigin = 'anonymous';
              img.onload = () => finish(img);
              img.onerror = () => finish(null);
              img.src = url;
            });
            const url = el.imageUrl;
            const img = url.startsWith('data:') || url.startsWith('blob:')
              ? await loadImage(url)
              : await loadImage(`/api/proxy/image?url=${encodeURIComponent(url)}`) || await loadImage(url);
            if (img) loadedImages[url] = img;
            if (!loadedImages[el.imageUrl]) throw new Error(`No se pudo cargar una imagen de la diapositiva ${slide.index + 1}. Reintentá antes de exportar.`);
          }
        }
      }

      // Prepare fonts
      loadPresentationFonts(presentation);
      try {
        if (document.fonts) {
          await document.fonts.ready;
        }
      } catch (e) {
        // Fallback gracefully
      }

      if (!presentation.slides.length) throw new Error('La presentación no tiene diapositivas.');
      speechEngine.cancel();
      audioEngine.stopNarration();
      await audioEngine.resumeContext();
      const voiceName = config.voiceName || 'Aoede';
      const narrationTracks = new Map<number, NarrationTrack>();
      if (config.voiceoverEnabled) {
        for (const slide of presentation.slides) {
          setStatusText(`Preparando voz sincronizada: diapositiva ${slide.index + 1} de ${presentation.slides.length}...`);
          narrationTracks.set(slide.index, await prepareNarration(
            slide, text => audioEngine.preloadNarrationAudio(text, voiceName),
            () => stopExportRef.current,
          ));
        }
      }
      const adjustedSlideDurations = presentation.slides.map(slide => Math.max(
        slide.duration / Math.max(0.1, config.autoPacingMultiplier),
        narrationTracks.get(slide.index)?.duration || 0,
      ));

      const totalDuration = adjustedSlideDurations.reduce((acc, d) => acc + d, 0);

      // Prepare audio stream if voiceover OR music enabled
      let audioStream: MediaStream | null = null;
      if (config.voiceoverEnabled || config.musicTheme !== 'none') {
        audioEngine.initContext();
        if (config.voiceVolume !== undefined) {
          audioEngine.setVoiceVolume(config.voiceVolume);
        } else {
          audioEngine.setVoiceVolume(1.0);
        }
        if (config.musicTheme !== 'none') {
          audioEngine.startMusic(config.musicTheme, config.musicVolume);
        }
        audioStream = audioEngine.getAudioDestinationStream();
      }

      setStatusText('Grabando video con voz sincronizada...');
      let startTime = 0;
      const renderFrame = (elapsedSecs: number) => {
          const currentProgress = Math.min(100, (elapsedSecs / totalDuration) * 100);
          setProgress(Math.round(currentProgress));
          let accTime = 0;
          let slideIndex = presentation.slides.length - 1;
          for (let i = 0; i < presentation.slides.length; i++) {
            if (elapsedSecs < accTime + adjustedSlideDurations[i]) { slideIndex = i; break; }
            accTime += adjustedSlideDurations[i];
          }
          const currentSlide = presentation.slides[slideIndex];
          const slideDuration = adjustedSlideDurations[slideIndex];
          const slideTime = Math.min(slideDuration, Math.max(0, elapsedSecs - accTime));
          const narration = narrationTracks.get(currentSlide.index);

          // Clear Canvas with authentic Slide Background Color
          ctx.fillStyle = currentSlide.backgroundColor || '#FFFFFF';
          ctx.fillRect(0, 0, canvas.width, canvas.height);

          const background = currentSlide.backgroundImageUrl && loadedImages[currentSlide.backgroundImageUrl];
          if (background) ctx.drawImage(background, 0, 0, canvas.width, canvas.height);

          const slideFraction = Math.min(1, slideTime / slideDuration);

          // 1. Draw Standalone Shapes & Frames / Recuadros
          currentSlide.elements
            .filter((e) => e.type === 'SHAPE')
            .forEach((el) => {
              const x = (el.position.x / 100) * canvas.width;
              const y = (el.position.y / 100) * canvas.height;
              const w = (el.position.width / 100) * canvas.width;
              const h = (el.position.height / 100) * canvas.height;
              const radius = el.style?.borderRadius || 0;

              ctx.save();
              if (el.style?.backgroundColor && el.style.backgroundColor !== 'transparent') {
                ctx.fillStyle = el.style.backgroundColor;
                ctx.beginPath();
                if (radius > 0 && (ctx as any).roundRect) {
                  (ctx as any).roundRect(x, y, w, h, radius);
                } else {
                  ctx.rect(x, y, w, h);
                }
                ctx.fill();
              }
              if (el.style?.borderColor && el.style?.borderWidth) {
                ctx.strokeStyle = el.style.borderColor;
                ctx.lineWidth = Math.max(1, el.style.borderWidth * (canvas.width / 1280));
                ctx.beginPath();
                if (radius > 0 && (ctx as any).roundRect) {
                  (ctx as any).roundRect(x, y, w, h, radius);
                } else {
                  ctx.rect(x, y, w, h);
                }
                ctx.stroke();
              }
              ctx.restore();
            });

          // 2. Draw Images in exact coordinates with independent imageAnimation
          currentSlide.elements
            .filter((e) => e.type === 'IMAGE')
            .forEach((el) => {
              const img = el.imageUrl ? loadedImages[el.imageUrl] : null;
              if (img && img.complete && img.naturalWidth > 0) {
                const x = (el.position.x / 100) * canvas.width;
                const y = (el.position.y / 100) * canvas.height;
                const w = (el.position.width / 100) * canvas.width;
                const h = (el.position.height / 100) * canvas.height;

                const imgDelay = 0;
                if (slideTime < imgDelay && config.imageAnimation !== 'none') return;

                let alpha = 1;
                let zoomFactor = 1.0;
                let panOffset = 0;
                let yOffset = 0;

                if (config.imageAnimation === 'ken-burns') {
                  zoomFactor = 1.0 + slideFraction * 0.05;
                } else if (config.imageAnimation === 'pan-horizontal') {
                  panOffset = (slideFraction - 0.5) * (canvas.width * 0.02);
                } else if (config.imageAnimation === 'zoom-in') {
                  const popProgress = Math.min(1, Math.max(0, (slideTime - imgDelay) / 0.5));
                  zoomFactor = 0.9 + popProgress * 0.1;
                } else if (config.imageAnimation === 'slide-up') {
                  const enterProgress = Math.min(1, Math.max(0, (slideTime - imgDelay) / 0.5));
                  yOffset = (1 - enterProgress) * (canvas.height * 0.03);
                }

                ctx.save();
                ctx.globalAlpha = alpha;
                ctx.beginPath();
                ctx.rect(x, y, w, h);
                ctx.clip();

                // Draw image with contain calculation to preserve original proportion
                const imgAspect = img.naturalWidth / img.naturalHeight;
                const boxAspect = w / h;
                let renderW = w * zoomFactor;
                let renderH = h * zoomFactor;

                if (boxAspect > imgAspect) {
                  renderW = (h * imgAspect) * zoomFactor;
                  renderH = h * zoomFactor;
                } else {
                  renderW = w * zoomFactor;
                  renderH = (w / imgAspect) * zoomFactor;
                }

                const renderX = x + (w - renderW) / 2 + panOffset;
                const renderY = y + (h - renderH) / 2 + yOffset;

                ctx.drawImage(img, renderX, renderY, renderW, renderH);
                ctx.restore();
              }
            });

          // 3. Draw Texts with independent textAnimation, original font & recuadros
          const isSlideLight = isLightBg(currentSlide.backgroundColor || '#FFFFFF');
          const defaultTextColor = isSlideLight ? '#111827' : '#FFFFFF';

          currentSlide.elements
            .filter((e) => e.type !== 'IMAGE' && e.type !== 'SHAPE')
            .forEach((el, idx) => {
              const textDelay = 0;
              if (slideTime < textDelay && config.textAnimation !== 'none') return;

              let alpha = 1;
              let yOffset = 0;
              let xOffset = 0;

              const isTitle = el.type === 'TITLE';
              const x = (el.position.x / 100) * canvas.width + xOffset;
              const y = (el.position.y / 100) * canvas.height + yOffset;
              const w = (el.position.width / 100) * canvas.width;
              const h = (el.position.height / 100) * canvas.height;

              // Draw recuadro / background of the text box if present
              if (el.style?.backgroundColor || (el.style?.borderColor && el.style?.borderWidth)) {
                ctx.save();
                ctx.globalAlpha = alpha;
                const radius = el.style?.borderRadius || 0;
                if (el.style?.backgroundColor && el.style.backgroundColor !== 'transparent') {
                  ctx.fillStyle = el.style.backgroundColor;
                  ctx.beginPath();
                  if (radius > 0 && (ctx as any).roundRect) {
                    (ctx as any).roundRect(x, y, w, h, radius);
                  } else {
                    ctx.rect(x, y, w, h);
                  }
                  ctx.fill();
                }
                if (el.style?.borderColor && el.style?.borderWidth) {
                  ctx.strokeStyle = el.style.borderColor;
                  ctx.lineWidth = Math.max(1, el.style.borderWidth * (canvas.width / 1280));
                  ctx.beginPath();
                  if (radius > 0 && (ctx as any).roundRect) {
                    (ctx as any).roundRect(x, y, w, h, radius);
                  } else {
                    ctx.rect(x, y, w, h);
                  }
                  ctx.stroke();
                }
                ctx.restore();
              }

              // Compute proportional font size matching canvas dimensions
              const fontSizePx = el.style?.fontSize
                ? (el.style.fontSize / ((presentation.slideHeight || 5143500) / 12700)) * canvas.height
                : isTitle
                ? canvas.height * 0.055
                : canvas.height * 0.03;

              const isBold = el.style?.fontWeight === 700 || isTitle;
              const fontFamily = el.style?.fontFamily
                ? `"${el.style.fontFamily}", system-ui, sans-serif`
                : (isTitle ? '"Playfair Display", serif' : '"Plus Jakarta Sans", sans-serif');
              const fontStyle = el.style?.fontStyle || 'normal';

              ctx.save();
              ctx.globalAlpha = alpha;
              ctx.font = `${fontStyle} ${isBold ? '700 ' : '400 '}${Math.round(fontSizePx)}px ${fontFamily}`;
              ctx.fillStyle = el.style?.color || defaultTextColor;
              ctx.textAlign = (el.style?.textAlign as any) || 'left';

              // Text shadow for legibility only if dark background and no card background
              if (!isSlideLight && !el.style?.backgroundColor) {
                ctx.shadowColor = 'rgba(0, 0, 0, 0.75)';
                ctx.shadowBlur = 6;
                ctx.shadowOffsetX = 0;
                ctx.shadowOffsetY = 2;
              } else {
                ctx.shadowColor = 'transparent';
                ctx.shadowBlur = 0;
              }

              // Multiline wrapped text with padding, paragraph breaks & sequential sentence animation
              const padding = (el.style?.backgroundColor || el.style?.borderColor) ? 8 * (canvas.width / 1280) : 0;
              const innerW = w - padding * 2;
              const innerX = x + padding;
              const targetX = ctx.textAlign === 'center' ? innerX + innerW / 2 : ctx.textAlign === 'right' ? innerX + innerW : innerX;
              const units = parseTextIntoUnits(el.content || '');
              const innerH = h - padding * 2;
              let fittedSize = fontSizePx;
              const setFont = () => { ctx.font = `${fontStyle} ${isBold ? '700' : '400'} ${fittedSize}px ${fontFamily}`; };
              setFont();
              let layout = layoutText(units, innerW, fittedSize * 1.2, text => ctx.measureText(text).width);
              const minimumSize = Math.min(fontSizePx, canvas.height * 0.016);
              while (layout.height > innerH && fittedSize > minimumSize) {
                fittedSize = Math.max(minimumSize, fittedSize * 0.95);
                setFont();
                layout = layoutText(units, innerW, fittedSize * 1.2, text => ctx.measureText(text).width);
              }
              if (layout.height > innerH || innerW <= 0 || innerH <= 0) {
                throw new Error(`El texto no entra en la diapositiva ${currentSlide.index + 1}. Dividí ese bloque en otra escena.`);
              }
              ctx.beginPath();
              ctx.rect(x, y, w, h);
              ctx.clip();
              ctx.textBaseline = 'top';
              for (const line of layout.lines) {
                const reveal = narration?.reveals.get(unitKey(el.id, line.unitIndex));
                // Keep the complete composition visible; highlight the sentence being read.
                // A paraphrased note has no literal match and never hides slide content.
                const active = reveal !== undefined && narration?.segments.some(segment =>
                  segment.start === reveal && slideTime >= segment.start && slideTime < segment.end);
                if (active && config.textAnimation !== 'none') {
                  const textWidth = ctx.measureText(line.text).width;
                  const left = ctx.textAlign === 'center' ? targetX - textWidth / 2 : ctx.textAlign === 'right' ? targetX - textWidth : targetX;
                  ctx.save();
                  ctx.fillStyle = isSlideLight ? 'rgba(250, 204, 21, 0.25)' : 'rgba(250, 204, 21, 0.18)';
                  ctx.fillRect(left, y + padding + line.y, textWidth, fittedSize * 1.2);
                  ctx.restore();
                }
                ctx.fillText(line.text, targetX, y + padding + line.y);
              }

              ctx.restore();
            });

          const spoken = narration?.segments.find(segment => slideTime >= segment.start && slideTime < segment.end);
          if (config.showCaptions && spoken) {
            ctx.save();
            const fontSize = canvas.height * 0.025;
            ctx.font = `${fontSize}px sans-serif`;
            const lines = layoutText(parseTextIntoUnits(spoken.text), canvas.width * 0.86, fontSize * 1.3, text => ctx.measureText(text).width);
            const top = canvas.height - lines.height - fontSize;
            ctx.fillStyle = 'rgba(0,0,0,0.85)';
            ctx.fillRect(canvas.width * 0.05, top - 5, canvas.width * 0.9, lines.height + 10);
            ctx.fillStyle = '#fff';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'top';
            for (const line of lines.lines) ctx.fillText(line.text, canvas.width / 2, top + line.y);
            ctx.restore();
          }
          outputCtx.fillStyle = currentSlide.backgroundColor || '#FFFFFF';
          outputCtx.fillRect(0, 0, outputCanvas.width, outputCanvas.height);
          outputCtx.drawImage(canvas, (outputCanvas.width - canvas.width) / 2, (outputCanvas.height - canvas.height) / 2);
      };

      // The first captured frame already contains the slide, not a blank background.
      renderFrame(0);
      await videoExporter.startRecording(outputCanvas, audioStream, 30);
      startTime = audioEngine.getCurrentTime() + 0.1;
      let offset = 0;
      for (let i = 0; i < presentation.slides.length; i++) {
        for (const segment of narrationTracks.get(presentation.slides[i].index)?.segments || []) {
          audioEngine.scheduleAudioBuffer(segment.buffer, startTime + offset + segment.start);
        }
        offset += adjustedSlideDurations[i];
      }
      await new Promise<void>((resolve, reject) => {
        const loop = () => {
          try {
            if (stopExportRef.current) throw new Error('Exportación cancelada');
            if (document.hidden) throw new Error('La grabación se interrumpió porque la pestaña quedó oculta. Mantenela visible y reintentá.');
            const elapsed = Math.max(0, audioEngine.getCurrentTime() - startTime);
            if (elapsed >= totalDuration) { resolve(); return; }
            renderFrame(elapsed);
            requestAnimationFrame(loop);
          } catch (error) { reject(error); }
        };
        requestAnimationFrame(loop);
      });

      setStatusText('Finalizando codificación de video...');
      audioEngine.stopNarration();
      audioEngine.stopMusic();
      const blob = await videoExporter.stopRecording();
      const url = URL.createObjectURL(blob);
      setVideoBlobUrl(url);
      setVideoMimeType(blob.type || videoExporter.getMimeType());
      setTotalVideoDuration(totalDuration);
      setPreviewCurrentTime(0);
      setIsPreviewPlaying(true);
      setProgress(100);
      setStatusText('¡Video generado con éxito!');
    } catch (err: any) {
      console.error('Export error:', err);
      setErrorMessage(err.message || 'Error durante la exportación de video');
      audioEngine.stopNarration();
      audioEngine.stopMusic();
      await videoExporter.stopRecording().catch(() => {});
    } finally {
      setIsExporting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-sm animate-fade-in">
      <div
        id="export-modal-container"
        className="w-full max-w-lg bg-[#0F0F0F] border border-white/15 p-6 shadow-2xl space-y-5"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/10 pb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-[#1A1A1A] border border-white/15 flex items-center justify-center text-[#A855F7]">
              <Video className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-serif italic text-white">Generate Video File</h2>
              <p className="text-xs text-white/50">
                Texto completo con resaltado sincronizado a la voz. Mantené esta pestaña visible durante la grabación.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={isExporting}
            className="p-2 text-white/40 hover:text-white hover:bg-[#1A1A1A] border border-transparent hover:border-white/10 transition-colors cursor-pointer disabled:opacity-30"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Active Recording Canvas Live Preview */}
        <div className={`overflow-hidden border border-white/15 bg-black ${isExporting ? 'block' : 'opacity-0 pointer-events-none fixed top-[-9999px] left-[-9999px]'}`}>
          {isExporting && (
            <div className="p-2 bg-[#1A1A1A] border-b border-white/10 flex items-center justify-between text-[10px] text-white/60">
              <span className="flex items-center gap-1.5 font-mono text-[#A855F7]">
                <span className="w-2 h-2 rounded-full bg-red-500 animate-ping" />
                GRABANDO EN TIEMPO REAL
              </span>
              <span className="font-mono text-white/80">{config.aspectRatio}</span>
            </div>
          )}
          <canvas
            ref={hiddenCanvasRef}
            className="w-full max-h-52 object-contain mx-auto bg-black"
          />
        </div>

        {/* Video Specs Summary */}
        <div className="bg-[#141414] p-4 border border-white/10 space-y-2 text-xs">
          <div className="flex justify-between text-white/60">
            <span className="text-[10px] uppercase tracking-wider font-bold">Presentación:</span>
            <span className="font-serif italic text-white truncate max-w-[200px]">
              {presentation.title}
            </span>
          </div>
          <div className="flex justify-between text-white/60">
            <span className="text-[10px] uppercase tracking-wider font-bold">Duración:</span>
            <span className="font-mono text-[#A855F7] font-bold">
              {Math.round(presentation.totalDuration * (1 / config.autoPacingMultiplier))}s
            </span>
          </div>
          <div className="flex justify-between text-white/60">
            <span className="text-[10px] uppercase tracking-wider font-bold">Formato:</span>
            <span className="font-mono text-white/80">
              {config.aspectRatio} · {config.resolution}
            </span>
          </div>
          <div className="flex justify-between text-white/60">
            <span className="text-[10px] uppercase tracking-wider font-bold">Narrador de Voz:</span>
            <span className={`font-mono text-[10px] font-bold uppercase tracking-wider ${config.voiceoverEnabled ? 'text-emerald-400' : 'text-white/40'}`}>
              {config.voiceoverEnabled ? `Voz IA (${config.voiceName || 'Aoede'}) en video` : 'Desactivado'}
            </span>
          </div>
          <div className="flex justify-between text-white/60">
            <span className="text-[10px] uppercase tracking-wider font-bold">Soundtrack:</span>
            <span className="text-[#A855F7] uppercase font-bold text-[10px] tracking-wider">{config.musicTheme}</span>
          </div>
        </div>

        {/* Progress or Ready Status */}
        {isExporting ? (
          <div className="space-y-3 py-2">
            <div className="flex items-center justify-between text-xs">
              <span className="text-white/80 font-mono text-[11px] flex items-center gap-2">
                <Loader2 className="w-3.5 h-3.5 animate-spin text-[#A855F7]" />
                {statusText}
              </span>
              <span className="text-[#A855F7] font-mono font-bold">{progress}%</span>
            </div>
            <div className="w-full h-1.5 bg-[#222222] overflow-hidden">
              <div
                className="h-full bg-[#A855F7] shadow-[0_0_15px_#A855F7] transition-all duration-150"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        ) : videoBlobUrl ? (
          <div className="space-y-4 py-2">
            <div className="p-4 bg-[#A855F7]/10 border border-[#A855F7]/30 text-white text-xs flex items-center gap-3">
              <CheckCircle2 className="w-5 h-5 text-[#A855F7] shrink-0" />
              <div>
                <p className="font-serif italic text-sm text-white">¡Video creado con éxito!</p>
                <p className="text-white/60 mt-0.5 text-[11px]">
                  La voz y el resaltado de texto usan la misma línea de tiempo.
                </p>
              </div>
            </div>

            {/* Video Player Preview with interactive timeline and controls */}
            <div className="space-y-2">
              <video
                ref={previewVideoRef}
                src={videoBlobUrl}
                playsInline
                autoPlay
                controls
                onLoadedMetadata={(e) => {
                  const vid = e.currentTarget;
                  if (vid.duration === Infinity || isNaN(vid.duration)) {
                    vid.currentTime = 1e101;
                    vid.ontimeupdate = function () {
                      this.ontimeupdate = null;
                      vid.currentTime = 0;
                    };
                  }
                }}
                onTimeUpdate={(e) => {
                  setPreviewCurrentTime(e.currentTarget.currentTime);
                }}
                onPlay={() => setIsPreviewPlaying(true)}
                onPause={() => setIsPreviewPlaying(false)}
                onEnded={() => setIsPreviewPlaying(false)}
                className="w-full bg-black max-h-48 object-contain border border-white/20"
              />

              {/* Dedicated Timeline Scrubber and Controls */}
              <div className="bg-[#141414] p-3 border border-white/10 space-y-2">
                <div className="flex items-center justify-between text-[11px] font-mono">
                  <span className="text-white font-bold">{formatTime(previewCurrentTime)}</span>
                  <span className="text-white/40">/</span>
                  <span className="text-white/60">
                    {formatTime(
                      previewVideoRef.current?.duration && isFinite(previewVideoRef.current.duration) && previewVideoRef.current.duration > 0
                        ? previewVideoRef.current.duration
                        : totalVideoDuration
                    )}
                  </span>
                </div>

                {/* Scrubber slider bar with draggable cursor */}
                <input
                  type="range"
                  min={0}
                  max={
                    previewVideoRef.current?.duration && isFinite(previewVideoRef.current.duration) && previewVideoRef.current.duration > 0
                      ? previewVideoRef.current.duration
                      : (totalVideoDuration || 1)
                  }
                  step={0.1}
                  value={previewCurrentTime}
                  onChange={(e) => {
                    const val = parseFloat(e.target.value);
                    setPreviewCurrentTime(val);
                    if (previewVideoRef.current) {
                      previewVideoRef.current.currentTime = val;
                    }
                  }}
                  className="w-full h-2 bg-white/20 rounded-lg appearance-none cursor-pointer accent-[#A855F7]"
                  title="Arrastra para avanzar o retroceder el video"
                />

                <div className="flex items-center justify-between pt-1">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        if (!previewVideoRef.current) return;
                        if (previewVideoRef.current.paused) {
                          previewVideoRef.current.play();
                        } else {
                          previewVideoRef.current.pause();
                        }
                      }}
                      className="px-3 py-1 bg-white/10 hover:bg-white/20 text-white transition-colors cursor-pointer text-xs flex items-center gap-1.5 font-mono"
                    >
                      {isPreviewPlaying ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                      <span>{isPreviewPlaying ? 'Pausar' : 'Reproducir'}</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        if (!previewVideoRef.current) return;
                        previewVideoRef.current.currentTime = Math.max(0, previewVideoRef.current.currentTime - 5);
                      }}
                      className="px-2 py-1 bg-white/10 hover:bg-white/20 text-white/80 hover:text-white transition-colors cursor-pointer text-[10px] font-mono flex items-center gap-1"
                      title="Retroceder 5 segundos"
                    >
                      <RotateCcw className="w-3 h-3" />
                      <span>-5s</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        if (!previewVideoRef.current) return;
                        const maxD = previewVideoRef.current.duration || totalVideoDuration;
                        previewVideoRef.current.currentTime = Math.min(maxD, previewVideoRef.current.currentTime + 5);
                      }}
                      className="px-2 py-1 bg-white/10 hover:bg-white/20 text-white/80 hover:text-white transition-colors cursor-pointer text-[10px] font-mono flex items-center gap-1"
                      title="Avanzar 5 segundos"
                    >
                      <RotateCw className="w-3 h-3" />
                      <span>+5s</span>
                    </button>
                  </div>

                  <span className="text-[10px] font-mono text-[#A855F7] bg-[#A855F7]/10 px-2 py-0.5 border border-[#A855F7]/20 uppercase">
                    {videoMimeType.includes('mp4') ? 'MP4' : 'WebM'}
                  </span>
                </div>
              </div>
            </div>

            {(() => {
              const isMp4 = videoMimeType.includes('mp4');
              const ext = isMp4 ? 'mp4' : 'webm';
              const cleanTitle = presentation.title.replace(/[^a-zA-Z0-9]/g, '_');

              return (
                <a
                  href={videoBlobUrl}
                  download={`${cleanTitle}_video.${ext}`}
                  className="w-full py-3.5 bg-[#A855F7] hover:bg-[#9333EA] text-black font-black text-[10px] uppercase tracking-[0.2em] shadow-[0_0_15px_rgba(168,85,247,0.35)] flex items-center justify-center gap-2 transition-all cursor-pointer"
                >
                  <Download className="w-4 h-4 text-black" />
                  <span>Descargar Archivo {ext.toUpperCase()}</span>
                </a>
              );
            })()}
          </div>
        ) : null}

        {errorMessage && (
          <div className="p-3 bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
            <span>{errorMessage}</span>
          </div>
        )}

        {/* Action Button */}
        {!videoBlobUrl && (
          <button
            onClick={handleStartExport}
            disabled={isExporting}
            className="w-full py-3.5 bg-[#A855F7] hover:bg-[#9333EA] disabled:opacity-50 text-black font-black text-[10px] uppercase tracking-[0.2em] shadow-[0_0_15px_rgba(168,85,247,0.35)] flex items-center justify-center gap-2 transition-all active:scale-95 cursor-pointer"
          >
            <Sparkles className="w-4 h-4 text-black" />
            <span>Comenzar Grabación de Video</span>
          </button>
        )}
      </div>
    </div>
  );
};
