import React from 'react';
import { User } from 'firebase/auth';
import {
  Video,
  Sparkles,
  FolderOpen,
  Download,
  LogOut,
  SlidersHorizontal,
} from 'lucide-react';

interface NavbarProps {
  user: User | null;
  presentationTitle: string;
  onOpenPicker: () => void;
  onSignIn: () => void;
  onSignOut: () => void;
  onOpenExport: () => void;
  onToggleDirector: () => void;
  isDirectorOpen: boolean;
  isAiAnalyzing: boolean;
}

export const Navbar: React.FC<NavbarProps> = ({
  user,
  presentationTitle,
  onOpenPicker,
  onSignIn,
  onSignOut,
  onOpenExport,
  onToggleDirector,
  isDirectorOpen,
  isAiAnalyzing,
}) => {
  return (
    <header id="main-navbar" className="w-full bg-[#0F0F0F] border-b border-white/10 text-[#F0F0F0] sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-8 h-18 flex items-center justify-between gap-4">
        {/* Brand & Presentation Title */}
        <div className="flex items-center gap-4 min-w-0">
          <div className="w-10 h-10 bg-[#1A1A1A] border border-white/15 flex items-center justify-center shrink-0 shadow-[0_0_12px_rgba(168,85,247,0.2)]">
            <Video className="w-5 h-5 text-[#A855F7]" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2.5">
              <span className="text-xl sm:text-2xl font-black tracking-tighter text-white">
                SLIDE<span className="text-[#A855F7]">FLUX</span>
              </span>
              <span className="hidden sm:inline-flex items-center gap-1 text-[9px] uppercase tracking-[0.2em] font-bold px-2 py-0.5 bg-[#A855F7]/10 text-[#A855F7] border border-[#A855F7]/30">
                <Sparkles className="w-2.5 h-2.5" /> Auto-Motion
              </span>
            </div>
            <p className="text-[11px] font-mono text-white/40 truncate max-w-[180px] sm:max-w-xs md:max-w-md mt-0.5">
              {presentationTitle || 'Sin presentación seleccionada'}
            </p>
          </div>
        </div>

        {/* Central / Right Actions */}
        <div className="flex items-center gap-2 sm:gap-4 shrink-0">
          {/* Pick / Change Presentation */}
          <button
            id="btn-open-picker"
            onClick={onOpenPicker}
            className="flex items-center gap-2 px-3.5 sm:px-4 py-2 bg-[#1A1A1A] hover:bg-[#222222] text-white/80 hover:text-white text-[10px] uppercase tracking-[0.2em] font-bold border border-white/10 hover:border-[#A855F7] transition-all cursor-pointer"
            title="Seleccionar otra presentación de Google Drive o Demo"
          >
            <FolderOpen className="w-3.5 h-3.5 text-[#A855F7]" />
            <span className="hidden md:inline">Diapositivas</span>
            <span className="md:hidden">Slides</span>
          </button>

          {/* Toggle AI Director Settings */}
          <button
            id="btn-toggle-director"
            onClick={onToggleDirector}
            className={`flex items-center gap-2 px-3.5 sm:px-4 py-2 text-[10px] uppercase tracking-[0.2em] font-bold border transition-all cursor-pointer ${
              isDirectorOpen
                ? 'bg-[#1A1A1A] border-l-4 border-l-[#A855F7] border-white/20 text-[#A855F7]'
                : 'bg-[#1A1A1A] hover:bg-[#222222] border-white/10 text-white/60 hover:text-white'
            }`}
            title="Configuración del Director Autónomo"
          >
            <SlidersHorizontal className="w-3.5 h-3.5 text-[#A855F7]" />
            <span className="hidden lg:inline">Director IA</span>
          </button>

          {/* Export Video Button */}
          <button
            id="btn-export-video"
            onClick={onOpenExport}
            className="flex items-center gap-2 px-4 sm:px-5 py-2.5 bg-[#A855F7] hover:bg-[#9333EA] text-black font-black text-[10px] uppercase tracking-[0.25em] shadow-[0_0_15px_rgba(168,85,247,0.35)] transition-all active:scale-95 cursor-pointer"
          >
            <Download className="w-3.5 h-3.5 text-black" />
            <span>Generar Video</span>
          </button>

          {/* Google Auth Pill */}
          {user ? (
            <div className="flex items-center gap-2 pl-3 border-l border-white/10">
              {user.photoURL ? (
                <img
                  src={user.photoURL}
                  alt={user.displayName || 'Usuario'}
                  className="w-7 h-7 border border-[#A855F7]/40 object-cover"
                  referrerPolicy="no-referrer"
                />
              ) : (
                <div className="w-7 h-7 bg-[#1A1A1A] border border-white/20 text-white text-[10px] flex items-center justify-center font-bold">
                  {(user.displayName || user.email || 'U')[0].toUpperCase()}
                </div>
              )}
              <button
                id="btn-sign-out"
                onClick={onSignOut}
                className="p-1.5 text-white/40 hover:text-rose-400 hover:bg-[#1A1A1A] transition-colors"
                title="Cerrar sesión de Google"
              >
                <LogOut className="w-3.5 h-3.5" />
              </button>
            </div>
          ) : (
            <button
              id="btn-google-signin"
              onClick={onSignIn}
              className="flex items-center gap-2 px-3.5 py-2 bg-white hover:bg-neutral-200 text-black text-[10px] uppercase tracking-[0.15em] font-bold transition-all shadow cursor-pointer"
            >
              <svg className="w-3.5 h-3.5" viewBox="0 0 48 48">
                <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
                <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
                <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
                <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
              </svg>
              <span className="hidden sm:inline">Drive</span>
            </button>
          )}
        </div>
      </div>
    </header>
  );
};
