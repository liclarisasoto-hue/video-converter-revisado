import React, { useState, useEffect } from 'react';
import {
  X,
  Search,
  Presentation,
  Sparkles,
  Link2,
  HardDrive,
  Loader2,
  ArrowRight,
  ExternalLink,
} from 'lucide-react';
import { GoogleDriveFile, PresentationData } from '../types';
import { listGoogleDrivePresentations, fetchGooglePresentation } from '../services/googleSlides';
import { SAMPLE_PRESENTATIONS } from '../services/sampleData';

interface PresentationPickerProps {
  isOpen: boolean;
  onClose: () => void;
  accessToken: string | null;
  onSelectPresentation: (presentation: PresentationData) => void;
  onSignIn: () => void;
}

export const PresentationPicker: React.FC<PresentationPickerProps> = ({
  isOpen,
  onClose,
  accessToken,
  onSelectPresentation,
  onSignIn,
}) => {
  const [activeTab, setActiveTab] = useState<'drive' | 'url' | 'demos'>('demos');
  const [driveFiles, setDriveFiles] = useState<GoogleDriveFile[]>([]);
  const [isLoadingDrive, setIsLoadingDrive] = useState(false);
  const [driveError, setDriveError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [urlInput, setUrlInput] = useState('');
  const [isLoadingUrl, setIsLoadingUrl] = useState(false);
  const [urlError, setUrlError] = useState<string | null>(null);

  // If accessToken changes or drive tab is opened, fetch files
  useEffect(() => {
    if (isOpen && activeTab === 'drive' && accessToken) {
      loadDriveFiles();
    } else if (isOpen && !accessToken && activeTab === 'drive') {
      setActiveTab('demos');
    }
  }, [isOpen, activeTab, accessToken]);

  const loadDriveFiles = async () => {
    if (!accessToken) return;
    setIsLoadingDrive(true);
    setDriveError(null);
    try {
      const files = await listGoogleDrivePresentations(accessToken);
      setDriveFiles(files);
      if (files.length === 0) {
        setDriveError('No se encontraron presentaciones de Google Slides en tu Google Drive.');
      }
    } catch (err: any) {
      setDriveError(err.message || 'Error al conectar con Google Drive');
    } finally {
      setIsLoadingDrive(false);
    }
  };

  const handleSelectDriveFile = async (file: GoogleDriveFile) => {
    if (!accessToken) return;
    setIsLoadingDrive(true);
    setDriveError(null);
    try {
      const presentation = await fetchGooglePresentation(file.id, accessToken);
      onSelectPresentation(presentation);
      onClose();
    } catch (err: any) {
      setDriveError(`Error al abrir "${file.name}": ${err.message}`);
    } finally {
      setIsLoadingDrive(false);
    }
  };

  const handleLoadByUrl = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!urlInput.trim()) return;

    if (!accessToken) {
      setUrlError('Debes iniciar sesión con Google para acceder a tus presentaciones por enlace.');
      return;
    }

    setIsLoadingUrl(true);
    setUrlError(null);
    try {
      const presentation = await fetchGooglePresentation(urlInput, accessToken);
      onSelectPresentation(presentation);
      onClose();
    } catch (err: any) {
      setUrlError(err.message || 'No se pudo cargar la presentación. Verifica el enlace y los permisos.');
    } finally {
      setIsLoadingUrl(false);
    }
  };

  const handleSelectDemo = (demo: PresentationData) => {
    onSelectPresentation(demo);
    onClose();
  };

  if (!isOpen) return null;

  const filteredDriveFiles = driveFiles.filter((f) =>
    f.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-sm animate-fade-in">
      <div
        id="presentation-picker-modal"
        className="w-full max-w-2xl bg-[#0F0F0F] border border-white/15 shadow-2xl overflow-hidden flex flex-col max-h-[85vh]"
      >
        {/* Modal Header */}
        <div className="p-6 border-b border-white/10 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-[#1A1A1A] border border-white/15 flex items-center justify-center text-[#A855F7]">
              <Presentation className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-serif italic text-white">Select Slides Source</h2>
              <p className="text-xs text-white/50">
                Elige de tu Google Drive, pega un enlace o prueba una presentación curada
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-white/40 hover:text-white hover:bg-[#1A1A1A] border border-transparent hover:border-white/10 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-white/10 bg-[#111111] px-6 pt-2 gap-3">
          <button
            onClick={() => setActiveTab('demos')}
            className={`pb-3 px-3 text-xs uppercase tracking-[0.15em] font-bold border-b-2 flex items-center gap-2 transition-all cursor-pointer ${
              activeTab === 'demos'
                ? 'border-[#A855F7] text-[#A855F7]'
                : 'border-transparent text-white/40 hover:text-white'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>Demos Curadas</span>
          </button>

          <button
            onClick={() => setActiveTab('drive')}
            className={`pb-3 px-3 text-xs uppercase tracking-[0.15em] font-bold border-b-2 flex items-center gap-2 transition-all cursor-pointer ${
              activeTab === 'drive'
                ? 'border-[#A855F7] text-[#A855F7]'
                : 'border-transparent text-white/40 hover:text-white'
            }`}
          >
            <HardDrive className="w-3.5 h-3.5" />
            <span>Google Drive</span>
          </button>

          <button
            onClick={() => setActiveTab('url')}
            className={`pb-3 px-3 text-xs uppercase tracking-[0.15em] font-bold border-b-2 flex items-center gap-2 transition-all cursor-pointer ${
              activeTab === 'url'
                ? 'border-[#A855F7] text-[#A855F7]'
                : 'border-transparent text-white/40 hover:text-white'
            }`}
          >
            <Link2 className="w-3.5 h-3.5" />
            <span>Por Enlace</span>
          </button>
        </div>

        {/* Tab Content */}
        <div className="p-6 overflow-y-auto flex-1 bg-[#0A0A0A]">
          {/* Tab 1: Demos */}
          {activeTab === 'demos' && (
            <div className="space-y-4">
              <div className="bg-[#1A1A1A] border border-white/10 p-4 text-xs text-white/70 flex items-start gap-3">
                <Sparkles className="w-4 h-4 text-[#A855F7] shrink-0 mt-0.5" />
                <p>
                  Prueba la animación 100% autónoma ahora mismo con una de estas presentaciones curadas con imágenes en alta resolución y kinetic typography.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {SAMPLE_PRESENTATIONS.map((demo) => (
                  <div
                    key={demo.id}
                    onClick={() => handleSelectDemo(demo)}
                    className="group p-5 bg-[#121212] hover:bg-[#181818] border border-white/10 hover:border-[#A855F7] transition-all cursor-pointer flex flex-col justify-between"
                  >
                    <div>
                      <div className="flex items-center justify-between mb-2.5">
                        <span className="text-[10px] font-mono uppercase px-2 py-0.5 bg-black text-white/80 border border-white/10">
                          {demo.slides.length} diapositivas
                        </span>
                        <span className="text-[10px] font-mono text-[#A855F7] font-bold">
                          {demo.totalDuration}s video
                        </span>
                      </div>
                      <h3 className="font-serif italic text-white text-base group-hover:text-[#A855F7] transition-colors">
                        {demo.title}
                      </h3>
                      <p className="text-xs text-white/40 mt-1 line-clamp-2">
                        {demo.slides[0]?.subtitle || 'Presentación lista para animar'}
                      </p>
                    </div>

                    <div className="mt-4 pt-3 border-t border-white/10 flex items-center justify-between text-[10px] uppercase tracking-[0.2em] text-[#A855F7] font-black">
                      <span>Cargar y Animar</span>
                      <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform" />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Tab 2: Drive Browser */}
          {activeTab === 'drive' && (
            <div className="space-y-4">
              {!accessToken ? (
                <div className="text-center py-10 px-4 bg-[#121212] border border-white/10">
                  <HardDrive className="w-10 h-10 text-[#A855F7] mx-auto mb-3" />
                  <h3 className="text-base font-serif italic text-white">Conecta tu cuenta de Google Drive</h3>
                  <p className="text-xs text-white/50 max-w-sm mx-auto mt-1 mb-5">
                    Inicia sesión para listar automáticamente todas tus presentaciones de Google Drive.
                  </p>
                  <button
                    onClick={onSignIn}
                    className="inline-flex items-center gap-2 px-5 py-2.5 bg-white hover:bg-neutral-200 text-black font-black text-[10px] uppercase tracking-[0.15em] transition-all shadow cursor-pointer"
                  >
                    Iniciar Sesión con Google
                  </button>
                </div>
              ) : (
                <>
                  <div className="relative">
                    <Search className="w-4 h-4 text-white/40 absolute left-3.5 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Buscar por título en Google Drive..."
                      className="w-full bg-[#161616] border border-white/15 pl-10 pr-4 py-2.5 text-xs sm:text-sm text-white placeholder-white/30 focus:outline-none focus:border-[#A855F7] transition-colors"
                    />
                  </div>

                  {isLoadingDrive && (
                    <div className="text-center py-10 text-white/40">
                      <Loader2 className="w-6 h-6 animate-spin mx-auto text-[#A855F7] mb-2" />
                      <p className="text-xs">Buscando presentaciones en Drive...</p>
                    </div>
                  )}

                  {driveError && (
                    <div className="p-3 bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs">
                      {driveError}
                    </div>
                  )}

                  {!isLoadingDrive && !driveError && (
                    <div className="space-y-2 max-h-64 overflow-y-auto">
                      {filteredDriveFiles.length > 0 ? (
                        filteredDriveFiles.map((file) => (
                          <div
                            key={file.id}
                            onClick={() => handleSelectDriveFile(file)}
                            className="p-3.5 bg-[#141414] hover:bg-[#1C1C1C] border border-white/10 hover:border-[#A855F7] flex items-center justify-between transition-all cursor-pointer group"
                          >
                            <div className="flex items-center gap-3 min-w-0">
                              <div className="p-2 bg-black border border-white/10 text-[#A855F7] shrink-0">
                                <Presentation className="w-4 h-4" />
                              </div>
                              <div className="min-w-0">
                                <h4 className="text-xs sm:text-sm font-medium text-white group-hover:text-[#A855F7] truncate">
                                  {file.name}
                                </h4>
                                <p className="text-[10px] font-mono text-white/30">
                                  ID: {file.id.substring(0, 14)}...
                                </p>
                              </div>
                            </div>
                            <ArrowRight className="w-4 h-4 text-white/40 group-hover:text-[#A855F7] group-hover:translate-x-1 transition-all shrink-0" />
                          </div>
                        ))
                      ) : (
                        <div className="text-center py-8 text-white/40 text-xs font-mono">
                          No se encontraron presentaciones.
                        </div>
                      )}
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {/* Tab 3: URL / ID Input */}
          {activeTab === 'url' && (
            <form onSubmit={handleLoadByUrl} className="space-y-4">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-white/60 mb-2">
                  Enlace de Google Slides o ID:
                </label>
                <div className="relative">
                  <input
                    type="text"
                    value={urlInput}
                    onChange={(e) => setUrlInput(e.target.value)}
                    placeholder="https://docs.google.com/presentation/d/1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms/edit"
                    className="w-full bg-[#161616] border border-white/15 px-3.5 py-3 text-xs sm:text-sm text-white placeholder-white/30 focus:outline-none focus:border-[#A855F7] transition-colors"
                  />
                </div>
                <p className="text-[11px] text-white/40 mt-1.5">
                  Abre tu presentación en Google Slides, copia la URL y pégala aquí.
                </p>
              </div>

              {urlError && (
                <div className="p-3 bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs">
                  {urlError}
                </div>
              )}

              <button
                type="submit"
                disabled={isLoadingUrl || !urlInput.trim()}
                className="w-full py-3 bg-[#A855F7] hover:bg-[#9333EA] disabled:opacity-50 text-black font-black text-[10px] uppercase tracking-[0.2em] transition-all flex items-center justify-center gap-2 cursor-pointer shadow-[0_0_15px_rgba(168,85,247,0.35)]"
              >
                {isLoadingUrl ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin text-black" />
                    <span>Cargando animación autónoma...</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-3.5 h-3.5 text-black" />
                    <span>Generar Video de esta Presentación</span>
                  </>
                )}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};
