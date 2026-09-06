export interface SlideElement {
  id: string;
  type: 'TEXT' | 'IMAGE' | 'SHAPE' | 'TITLE' | 'SUBTITLE' | 'BODY';
  content?: string;
  imageUrl?: string;
  position: {
    x: number; // percentage 0-100
    y: number; // percentage 0-100
    width: number; // percentage 0-100
    height: number; // percentage 0-100
    zIndex?: number;
  };
  style?: {
    fontSize?: number;
    fontFamily?: string;
    fontWeight?: string | number;
    fontStyle?: 'normal' | 'italic';
    color?: string;
    backgroundColor?: string;
    borderColor?: string;
    borderWidth?: number;
    borderStyle?: 'solid' | 'dashed' | 'dotted' | 'none';
    borderRadius?: number;
    padding?: number;
    textAlign?: 'left' | 'center' | 'right' | 'justify';
  };
  animation?: {
    delay: number; // in seconds from slide start
    duration: number; // duration of animation
    effect: 'fade-up' | 'fade-down' | 'zoom-in' | 'typewriter' | 'spring-reveal' | 'blur-in' | 'slide-in-left' | 'ken-burns';
    zoomDirection?: 'zoom-in-center' | 'zoom-out-center' | 'pan-left-to-right' | 'pan-right-to-left' | 'pan-top-to-bottom';
    scaleRange?: [number, number];
  };
}

export interface SlideData {
  id: string;
  index: number;
  title?: string;
  subtitle?: string;
  notes?: string;
  duration: number; // duration in seconds
  backgroundColor?: string;
  backgroundImageUrl?: string;
  elements: SlideElement[];
  narrationScript?: string;
  directorCue?: {
    cameraMove: 'ken-burns-zoom' | 'pan-horizontal' | 'pan-vertical' | 'subtle-pulse' | 'static';
    pacingTone: 'dynamic' | 'cinematic' | 'calm' | 'corporate';
    transitionOut: 'crossfade' | 'slide-left' | 'zoom-through' | 'blur-dissolve' | 'cube-flip';
    accentColor?: string;
    keyHighlightWords?: string[];
  };
}

export interface PresentationData {
  id: string;
  title: string;
  thumbnailUrl?: string;
  slideWidth?: number;
  slideHeight?: number;
  slides: SlideData[];
  totalDuration: number;
}

export type DirectorStyle = 'cinematic' | 'dynamic' | 'minimal' | 'storyteller';

export type MusicTheme = 'ambient' | 'tech' | 'cinematic' | 'acoustic' | 'none';

export type AspectRatio = '16:9' | '9:16' | '1:1';

export type TextAnimationType = 'slide-up' | 'fade-in' | 'zoom-in' | 'slide-left' | 'none';
export type ImageAnimationType = 'ken-burns' | 'pan-horizontal' | 'fade-in' | 'zoom-in' | 'slide-up' | 'none';

export type VoiceNameType = 'Aoede' | 'Fenrir' | 'Kore' | 'Puck' | 'Charon';

export interface VideoConfig {
  directorStyle: DirectorStyle;
  textAnimation: TextAnimationType;
  imageAnimation: ImageAnimationType;
  preserveOriginalFormatting: boolean;
  musicTheme: MusicTheme;
  musicVolume: number; // 0 to 1
  voiceoverEnabled: boolean;
  voiceName?: VoiceNameType;
  voiceVolume?: number; // 0 to 1
  voiceSpeed: number; // 0.8 to 1.3
  voicePitch: number;
  voiceGender?: 'female' | 'male';
  aspectRatio: AspectRatio;
  autoPacingMultiplier: number; // 0.8 to 1.5
  showCaptions: boolean;
  resolution: '1080p' | '720p';
}

export interface GoogleDriveFile {
  id: string;
  name: string;
  modifiedTime?: string;
  thumbnailLink?: string;
  iconLink?: string;
}
