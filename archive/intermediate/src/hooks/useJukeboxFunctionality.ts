// React hook for jukebox functionality integration
import { useEffect, useRef, useState } from 'react';

export const useJukeboxFunctionality = () => {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [noteContent, setNoteContent] = useState<string>('');
  const [authorName, setAuthorName] = useState<string>('Author');
  const [authorImage, setAuthorImage] = useState<string>(
    '/images/gradient_color.gif'
  );
  const [queue, setQueue] = useState<any[]>([]);
  const [currentTrack, setCurrentTrack] = useState<any>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [queueCount, setQueueCount] = useState<number>(0);
  const [playedCount, setPlayedCount] = useState<number>(0);

  const jukeboxRef = useRef<any>(null);

  useEffect(() => {
    const initializeJukeboxFunctionality = async () => {
      try {
        setIsLoading(true);
        setError(null);

        // Initialize YouTube API if available
        if (typeof window !== 'undefined' && (window as any).YT) {
          (window as any).YT.ready(() => {
            console.log('YouTube API ready');
          });
        }

        setIsLoading(false);
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : 'Failed to initialize jukebox functionality'
        );
        setIsLoading(false);
      }
    };

    initializeJukeboxFunctionality();
  }, []);

  const handleJukeboxSubmit = async () => {
    const input = document.getElementById(
      'note1LoaderInput'
    ) as HTMLInputElement;
    const noteId = input?.value?.trim();

    if (noteId) {
      await loadJukeboxContent(noteId);
    }
  };

  const loadJukeboxContent = async (noteId: string) => {
    try {
      // Validate note ID
      if (!validateNoteId(noteId)) {
        throw new Error('Invalid note ID format');
      }

      // Load the jukebox content
      setNoteContent('Jukebox content will be loaded here');
      setAuthorName('Jukebox Author');

      // Initialize the jukebox
      await initializeJukebox();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Failed to load jukebox content'
      );
    }
  };

  const validateNoteId = (noteId: string): boolean => {
    if (!noteId) return false;

    // Check for valid nostr identifiers
    const validPrefixes = ['note1', 'nevent1', 'naddr1', 'nprofile1'];
    return validPrefixes.some(prefix => noteId.startsWith(prefix));
  };

  const initializeJukebox = async () => {
    try {
      // Initialize the jukebox with the loaded content
      console.log('Initializing jukebox...');

      // This would integrate with the existing jukebox services
      // For now, just set some default values
      setQueueCount(0);
      setPlayedCount(0);
      setQueue([]);
      setCurrentTrack(null);
      setIsPlaying(false);
    } catch (err) {
      throw new Error('Failed to initialize jukebox');
    }
  };

  const handleStyleOptionsToggle = () => {
    const modal = document.getElementById('styleOptionsModal');
    if (modal) {
      modal.style.display = modal.style.display === 'none' ? 'block' : 'none';
    }
  };

  const handleStyleOptionsClose = () => {
    const modal = document.getElementById('styleOptionsModal');
    if (modal) {
      modal.style.display = 'none';
    }
  };

  const handleSkipSong = () => {
    // Skip to next song in queue
    console.log('Skipping song...');
  };

  return {
    isLoading,
    error,
    noteContent,
    authorName,
    authorImage,
    queue,
    currentTrack,
    isPlaying,
    queueCount,
    playedCount,
    handleJukeboxSubmit,
    handleStyleOptionsToggle,
    handleStyleOptionsClose,
    handleSkipSong
  };
};
