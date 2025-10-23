// Jukebox Types
export interface JukeboxConfig {
  noteId: string;
  authorName: string;
  authorImage: string;
  noteContent: string;
}

export interface SongRequest {
  videoId: string;
  title: string;
  amount: number;
  zapper: string;
  comment: string;
  timestamp: number;
}

export interface QueueItem {
  id: string;
  videoId: string;
  title: string;
  amount: number;
  zapper: string;
  timestamp: number;
  thumbnail?: string;
  duration?: string;
}

export interface JukeboxState {
  isLoading: boolean;
  error: string | null;
  noteContent: string;
  authorName: string;
  authorImage: string;
  queue: QueueItem[];
  currentTrack: QueueItem | null;
  isPlaying: boolean;
  queueCount: number;
  playedCount: number;
  totalAmount: number;
}

export interface YouTubeVideoInfo {
  id: string;
  title: string;
  thumbnail: string;
  duration: string;
  channelTitle: string;
}

export interface JukeboxEventHandlers {
  handleJukeboxSubmit: () => Promise<void>;
  handleStyleOptionsToggle: () => void;
  handleStyleOptionsClose: () => void;
  handleSkipSong: () => void;
  handleQueueUpdate: (queue: QueueItem[]) => void;
  handleTrackChange: (track: QueueItem | null) => void;
}
