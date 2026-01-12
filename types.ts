
export interface Scene {
  title: string;
  description: string;
  foreshadowing: string;
  visualPrompt: string;
  image?: string;
  videoUrl?: string;
}

export interface BookAnalysis {
  title: string;
  author: string;
  summary: string;
  themes: string[];
  scenes: Scene[];
}

export enum AppStatus {
  IDLE = 'IDLE',
  UPLOADING = 'UPLOADING',
  ANALYZING = 'ANALYZING',
  GENERATING_IMAGES = 'GENERATING_IMAGES',
  GENERATING_VIDEOS = 'GENERATING_VIDEOS',
  COMPLETED = 'COMPLETED',
  ERROR = 'ERROR'
}
