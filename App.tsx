import React, { useState, useEffect } from 'react';
import { User } from 'firebase/auth';
import { Navbar } from './components/Navbar';
import { VideoPlayer } from './components/VideoPlayer';
import { SlideTimeline } from './components/SlideTimeline';
import { DirectorControls } from './components/DirectorControls';
import { PresentationPicker } from './components/PresentationPicker';
import { ExportModal } from './components/ExportModal';
import { PresentationData, VideoConfig } from './types';
import { SAMPLE_PRESENTATIONS } from './services/sampleData';
import { initAuth, googleSignIn, logout, getAccessToken } from './services/firebase';
import {
  Sparkles,
  Zap,
  Image as ImageIcon,
  Type,
  Clock,
  Music,
  CheckCircle2,
  FolderOpen,
} from 'lucide-react';

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);

  // Active presentation (defaults to demo 1 so user has instant playable content)
  const [presentation, setPresentation] = useState<PresentationData>(SAMPLE_PRESENTATIONS[0]);
  const [activeSlideIndex, setActiveSlideIndex] = useState<number>(0);

  // Director Configuration
  const [config, setConfig] = useState<VideoConfig>({
    directorStyle: 'cinematic',
    textAnimation: 'slide-up',
    imageAnimation: 'ken-burns',
    preserveOriginalFormatting: true,
    musicTheme: 'ambient',
    musicVolume: 0.45,
    voiceoverEnabled: true,
    voiceName: 'Aoede',
    voiceVolume: 1.0,
    voiceSpeed: 1.0,
    voicePitch: 1.0,
    aspectRatio: '16:9',
    autoPacingMultiplier: 1.0,
    showCaptions: false,
    resolution: '1080p',
  });

  // Modal / UI states
  const [isPickerOpen, setIsPickerOpen] = useState<boolean>(false);
  const [isExportOpen, setIsExportOpen] = useState<boolean>(false);
  const [isDirectorOpen, setIsDirectorOpen] = useState<boolean>(true);
  const [isAiAnalyzing, setIsAiAnalyzing] = useState<boolean>(false);

  // Initialize Firebase Auth listener
  useEffect(() => {
    const unsubscribe = initAuth(
      (currentUser, token) => {
        setUser(currentUser);
        setAccessToken(token);
      },
      () => {
        setUser(null);
        setAccessToken(null);
      }
    );
    return () => {
      if (typeof unsubscribe === 'function') unsubscribe();
    };
  }, []);

  const handleSignIn = async () => {
    try {
      const result = await googleSignIn();
      if (result) {
        setUser(result.user);
        setAccessToken(result.accessToken);
        // Automatically open the picker so they can choose their Google Drive slides
        setIsPickerOpen(true);
      }
    } catch (err) {
      console.error('Sign-in failed:', err);
    }
  };

  const handleSignOut = async () => {
    await logout();
    setUser(null);
    setAccessToken(null);
  };

  const handleUpdateConfig = (newConfig: Partial<VideoConfig>) => {
    setConfig((prev) => ({ ...prev, ...newConfig }));
  };

  const handleSelectPresentation = (newPres: PresentationData) => {
    setPresentation(newPres);
    setActiveSlideIndex(0);
  };

  const handleAiEnhancePresentation = (enhancedData: any) => {
    if (!enhancedData.slidePlans || !Array.isArray(enhancedData.slidePlans)) return;

    setPresentation((prev) => {
      const updatedSlides = prev.slides.map((s, idx) => {
        const plan = enhancedData.slidePlans.find((p: any) => p.slideIndex === idx);
        if (plan) {
          return {
            ...s,
            duration: plan.pacingSeconds || s.duration,
            narrationScript: plan.narrationScript || s.narrationScript,
            directorCue: {
              cameraMove: plan.cameraMove || s.directorCue?.cameraMove || 'ken-burns-zoom',
              pacingTone: s.directorCue?.pacingTone || 'cinematic',
              transitionOut: plan.transitionOut || s.directorCue?.transitionOut || 'crossfade',
              keyHighlightWords: plan.keyHighlightWords || s.directorCue?.keyHighlightWords || [],
            },
          };
        }
        return s;
      });

      const totalDur = updatedSlides.reduce((acc, s) => acc + s.duration, 0);

      return {
        ...prev,
        slides: updatedSlides,
        totalDuration: Math.round(totalDur * 10) / 10,
      };
    });
  };

  return (
    <div className="min-h-screen bg-[#0F0F0F] text-[#F0F0F0] flex flex-col selection:bg-[#A855F7] selection:text-black font-sans relative">
      {/* Top Navbar */}
      <Navbar
        user={user}
        presentationTitle={presentation.title}
        onOpenPicker={() => setIsPickerOpen(true)}
        onSignIn={handleSignIn}
        onSignOut={handleSignOut}
        onOpenExport={() => setIsExportOpen(true)}
        onToggleDirector={() => setIsDirectorOpen((prev) => !prev)}
        isDirectorOpen={isDirectorOpen}
        isAiAnalyzing={isAiAnalyzing}
      />

      {/* Main Body Canvas Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 lg:p-8 flex flex-col gap-6">
        {/* Answer Banner & Feature Highlights */}
        <div className="w-full bg-[#121212] border border-white/10 p-5 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div className="space-y-1.5">
            <div className="flex items-center gap-2.5">
              <span className="w-6 h-6 bg-[#1A1A1A] border border-white/15 flex items-center justify-center text-[#A855F7]">
                <Sparkles className="w-3.5 h-3.5" />
              </span>
              <h1 className="text-base font-serif italic text-white">
                Generación Dinámica 100% Autónoma
              </h1>
            </div>
            <p className="text-xs text-white/60 max-w-3xl leading-relaxed">
              Tus diapositivas de Google Slides se animan automáticamente: las imágenes reciben efectos de zoom/paneo <strong className="text-white">Ken Burns</strong>, los textos entran con <strong className="text-white">tipografía cinética escalonada</strong> y el ritmo se adapta a la lectura, sin necesidad de edición manual.
            </p>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => setIsPickerOpen(true)}
              className="flex items-center gap-2 px-4 py-2.5 bg-[#1C1C1C] hover:bg-[#282828] border border-white/20 text-white font-bold text-[10px] uppercase tracking-[0.15em] transition-all cursor-pointer"
            >
              <FolderOpen className="w-3.5 h-3.5 text-[#A855F7]" />
              <span>Cambiar Slides</span>
            </button>
          </div>
        </div>

        {/* Video Player Stage */}
        <section aria-label="Reproductor de Video Dinámico" className="w-full">
          <VideoPlayer
            suspended={isExportOpen}
            presentation={presentation}
            config={config}
            onUpdateConfig={handleUpdateConfig}
            activeSlideIndex={activeSlideIndex}
            setActiveSlideIndex={setActiveSlideIndex}
          />
        </section>

        {/* Filmstrip Timeline */}
        <section aria-label="Línea de Diapositivas" className="w-full">
          <SlideTimeline
            presentation={presentation}
            activeSlideIndex={activeSlideIndex}
            onSelectSlide={(idx) => setActiveSlideIndex(idx)}
          />
        </section>

        {/* Autonomous Director Controls (Collapsible or visible) */}
        {isDirectorOpen && (
          <section aria-label="Controles del Director Autónomo" className="w-full">
            <DirectorControls
              config={config}
              onUpdateConfig={handleUpdateConfig}
              presentation={presentation}
              onAiEnhancePresentation={handleAiEnhancePresentation}
              isAiAnalyzing={isAiAnalyzing}
              setIsAiAnalyzing={setIsAiAnalyzing}
            />
          </section>
        )}

        {/* Highlights & Capabilities Bar */}
        <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 pt-2">
          <div className="bg-[#121212] border border-white/10 p-4 flex items-start gap-3.5 hover:border-white/20 transition-colors">
            <div className="w-9 h-9 bg-black border border-white/10 text-[#A855F7] flex items-center justify-center shrink-0">
              <ImageIcon className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-xs font-serif italic text-white">Ken Burns Zoom & Pan</h3>
              <p className="text-[11px] text-white/50 mt-1 leading-relaxed">
                Zooms suaves y paneos cinemáticos calculados según la posición de cada elemento.
              </p>
            </div>
          </div>

          <div className="bg-[#121212] border border-white/10 p-4 flex items-start gap-3.5 hover:border-white/20 transition-colors">
            <div className="w-9 h-9 bg-black border border-white/10 text-[#A855F7] flex items-center justify-center shrink-0">
              <Type className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-xs font-serif italic text-white">Kinetic Typography</h3>
              <p className="text-[11px] text-white/50 mt-1 leading-relaxed">
                Entradas escalonadas y fluidas de títulos, subtítulos y viñetas sin timeline manual.
              </p>
            </div>
          </div>

          <div className="bg-[#121212] border border-white/10 p-4 flex items-start gap-3.5 hover:border-white/20 transition-colors">
            <div className="w-9 h-9 bg-black border border-white/10 text-[#A855F7] flex items-center justify-center shrink-0">
              <Clock className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-xs font-serif italic text-white">Adaptive Pacing</h3>
              <p className="text-[11px] text-white/50 mt-1 leading-relaxed">
                Calcula la duración exacta de cada diapositiva según la carga de lectura natural.
              </p>
            </div>
          </div>

          <div className="bg-[#121212] border border-white/10 p-4 flex items-start gap-3.5 hover:border-white/20 transition-colors">
            <div className="w-9 h-9 bg-black border border-white/10 text-[#A855F7] flex items-center justify-center shrink-0">
              <Music className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-xs font-serif italic text-white">Procedural Soundscapes</h3>
              <p className="text-[11px] text-white/50 mt-1 leading-relaxed">
                Banda sonora ambiental generada en tiempo real con Web Audio API y voz en off sintetizada.
              </p>
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="w-full border-t border-white/10 py-6 text-center text-[10px] font-mono text-white/40 uppercase tracking-[0.2em]">
        <p>Google Slides Autonomous Director Studio • Artistic Flair Edition</p>
      </footer>

      {/* Modals */}
      <PresentationPicker
        isOpen={isPickerOpen}
        onClose={() => setIsPickerOpen(false)}
        accessToken={accessToken}
        onSelectPresentation={handleSelectPresentation}
        onSignIn={handleSignIn}
      />

      <ExportModal
        isOpen={isExportOpen}
        onClose={() => setIsExportOpen(false)}
        presentation={presentation}
        config={config}
      />
    </div>
  );
}
