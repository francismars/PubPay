// Jukebox API Service - Handles communication with backend
export interface JukeboxApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export interface QueueItem {
  id: string;
  videoId: string;
  title: string;
  amount: number;
  zapper: string;
  timestamp: number;
}

export interface JukeboxStatus {
  isPlaying: boolean;
  currentTrack: QueueItem | null;
  queue: QueueItem[];
  totalTracks: number;
  totalAmount: number;
}

export class JukeboxApiService {
  private baseUrl: string;

  constructor(baseUrl: string = 'http://localhost:3002') {
    this.baseUrl = baseUrl;
  }

  // Get current jukebox status
  async getJukeboxStatus(): Promise<JukeboxApiResponse<JukeboxStatus>> {
    try {
      const response = await fetch(`${this.baseUrl}/jukebox/status`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      return data;
    } catch (error) {
      console.error('Error getting jukebox status:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  // Play a track (add to queue)
  async playTrack(trackId: string, amount: number): Promise<JukeboxApiResponse<{ trackId: string; amount: number; status: string }>> {
    try {
      const response = await fetch(`${this.baseUrl}/jukebox/play`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          trackId,
          amount
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      return data;
    } catch (error) {
      console.error('Error playing track:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  // Skip current track
  async skipTrack(): Promise<JukeboxApiResponse<{ status: string }>> {
    try {
      const response = await fetch(`${this.baseUrl}/jukebox/skip`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      return data;
    } catch (error) {
      console.error('Error skipping track:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  // Get queue information
  async getQueue(): Promise<JukeboxApiResponse<QueueItem[]>> {
    try {
      const response = await fetch(`${this.baseUrl}/jukebox/queue`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      return data;
    } catch (error) {
      console.error('Error getting queue:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }
}
