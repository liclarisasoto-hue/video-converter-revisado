import React from 'react';
import { PresentationData } from '../types';
import { Sparkles, Clock, Image as ImageIcon, Type } from 'lucide-react';

interface SlideTimelineProps {
  presentation: PresentationData;
  activeSlideIndex: number;
  onSelectSlide: (index: number) => void;
}

export const SlideTimeline: React.FC<SlideTimelineProps> = ({
  presentation,
  activeSlideIndex,
  onSelectSlide,
}) => {
  return (
    <div
      id="slide-timeline-container"
      className="w-full bg-[#0F0F0F] border border-white/10 rounded-sm p-4 sm:p-6 space-y-4 shadow-xl"
    >
      <div className="flex items-center justify-between border-b border-white/10 pb-3">
        <div className="flex items-center gap-3">
          <span className="text-[10px] uppercase tracking-[0.25em] font-bold text-[#A855F7]">
            Slide Timeline ({presentation.slides.length})
          </span>
          <span className="text-[10px] font-mono text-white/40">
            TOTAL: {presentation.totalDuration}s
          </span>
        </div>
        <span className="text-[10px] uppercase tracking-[0.15em] text-white/40 font-mono hidden sm:inline">
          Click slide to seek position
        </span>
      </div>

      {/* Horizontal Strip */}
      <div className="flex gap-3.5 overflow-x-auto pb-3 pt-1">
        {presentation.slides.map((slide, idx) => {
          const isActive = idx === activeSlideIndex;
          const imageCount = slide.elements.filter((e) => e.type === 'IMAGE').length;
          const textCount = slide.elements.filter((e) => e.type !== 'IMAGE').length;

          return (
            <div
              key={slide.id}
              onClick={() => onSelectSlide(idx)}
              className={`flex-shrink-0 w-52 sm:w-60 p-4 cursor-pointer transition-all duration-200 flex flex-col justify-between ${
                isActive
                  ? 'bg-[#1A1A1A] border-l-4 border-l-[#A855F7] border border-white/30 shadow-[0_0_15px_rgba(168,85,247,0.15)]'
                  : 'bg-[#111111] border border-white/10 hover:border-white/30 hover:bg-[#151515]'
              }`}
            >
              {/* Top info badge */}
              <div className="flex items-center justify-between text-[10px] text-white/40 mb-2">
                <span className="font-mono font-bold px-2 py-0.5 bg-black/60 text-white border border-white/10">
                  #{idx + 1}
                </span>
                <span className="flex items-center gap-1 font-mono text-[#A855F7]">
                  <Clock className="w-3 h-3" /> {slide.duration}s
                </span>
              </div>

              {/* Title & Preview */}
              <div className="my-2">
                <h4 className="text-sm font-serif italic text-white line-clamp-1">
                  {slide.title}
                </h4>
                <p className="text-[11px] text-white/40 line-clamp-2 mt-1 leading-snug">
                  {slide.subtitle || slide.narrationScript || 'Animación automática'}
                </p>
              </div>

              {/* Bottom Tags */}
              <div className="mt-3 pt-2.5 border-t border-white/10 flex items-center justify-between text-[10px] text-white/40">
                <div className="flex items-center gap-2.5 font-mono text-[9px]">
                  {imageCount > 0 && (
                    <span className="flex items-center gap-1 text-[#A855F7]" title="Imágenes animadas">
                      <ImageIcon className="w-3 h-3" /> {imageCount}
                    </span>
                  )}
                  {textCount > 0 && (
                    <span className="flex items-center gap-1 text-white/60" title="Textos">
                      <Type className="w-3 h-3" /> {textCount}
                    </span>
                  )}
                </div>

                <span className="text-[9px] font-mono uppercase px-2 py-0.5 bg-[#A855F7]/10 text-[#A855F7] border border-[#A855F7]/30">
                  {slide.directorCue?.cameraMove === 'ken-burns-zoom' ? 'Ken Burns' : 'Pan & Zoom'}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
