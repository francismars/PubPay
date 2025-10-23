// React hook for jukebox functionality integration
import { useEffect, useRef, useState, useCallback } from 'react';
import * as NostrTools from 'nostr-tools';
const QRious = require('qrious') as any;
const Bolt11 = require('bolt11') as any;

// Import YouTube API types
declare global {
  interface Window {
    YT: any;
    onYouTubeIframeAPIReady: () => void;
  }
}

export const useJukeboxFunctionality = () => {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [noteContent, setNoteContent] = useState<string>('');
  const [authorName, setAuthorName] = useState<string>('Author');
  const [authorImage, setAuthorImage] = useState<string>('/images/gradient_color.gif');
  const [queue, setQueue] = useState<any[]>([]);
  const [currentTrack, setCurrentTrack] = useState<any>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [queueCount, setQueueCount] = useState<number>(0);
  const [playedCount, setPlayedCount] = useState<number>(0);

  // Legacy variables
  const poolRef = useRef<any>(null);
  const relaysRef = useRef<string[]>(['wss://relay.damus.io', 'wss://relay.primal.net', 'wss://relay.nostr.band/', 'wss://relay.nostr.nu/']);
  const json9735ListRef = useRef<any[]>([]);
  const songQueueRef = useRef<any[]>([]);
  const currentlyPlayingRef = useRef<any>(null);
  const playedSongsRef = useRef<any[]>([]);
  const isPlayingRef = useRef<boolean>(false);
  const currentVideoPlayerRef = useRef<any>(null);
  const songTimerRef = useRef<any>(null);
  const youtubePlayerRef = useRef<any>(null);
  const playerReadyRef = useRef<boolean>(false);
  const currentVideoIdRef = useRef<string | null>(null);
  const videoDurationRef = useRef<number>(0);
  const videoProgressRef = useRef<number>(0);
  const progressUpdateIntervalRef = useRef<any>(null);
  const searchResultCacheRef = useRef<Map<string, any>>(new Map());
  const processedZapsRef = useRef<Set<string>>(new Set());
  const allZapsLoadedRef = useRef<boolean>(false);
  const zapQueueRef = useRef<any[]>([]);
  const currentTopZapRef = useRef<any>(null);

  // Style options
  const DEFAULT_STYLES = {
    textColor: '#ffffff',
    bgColor: '#000000',
    bgImage: '/images/lightning.gif',
    qrInvert: true,
    qrScreenBlend: true,
    qrMultiplyBlend: false,
    layoutInvert: false,
    hideZapperContent: false
  };

  // Initialize Nostr pool and YouTube API
  useEffect(() => {
    const initializeServices = async () => {
      try {
        setIsLoading(true);
        setError(null);

        // Initialize Nostr pool
        poolRef.current = new NostrTools.SimplePool();

        // Initialize YouTube API
        if (typeof window !== 'undefined' && window.YT) {
          window.YT.ready(() => {
            playerReadyRef.current = true;
            console.log('YouTube API ready');
          });
        } else {
          // Set up callback for when YouTube API loads
          window.onYouTubeIframeAPIReady = () => {
            playerReadyRef.current = true;
            console.log('YouTube API ready');
          };
        }

        // Check for note parameter in URL
        const urlParams = new URLSearchParams(window.location.search);
        const noteParam = urlParams.get('note');
        
        if (noteParam) {
          await loadJukeboxFromNote(noteParam);
        }

        setIsLoading(false);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to initialize jukebox functionality');
        setIsLoading(false);
      }
    };

    initializeServices();
  }, []);

  const loadJukeboxFromNote = async (noteId: string) => {
    try {
      // Decode nevent to note if present
      let decodedNote = noteId;
      if (noteId.startsWith('nevent')) {
        try {
          const decoded = NostrTools.nip19.decode(noteId);
          if (decoded.type === 'nevent') {
            decodedNote = NostrTools.nip19.noteEncode(decoded.data.id);
            // Update URL
            const currentParams = new URLSearchParams(window.location.search);
            currentParams.set('note', decodedNote);
            const newUrl = window.location.pathname + '?' + currentParams.toString();
            window.history.replaceState({}, '', newUrl);
          }
        } catch (e) {
          console.log("Error decoding note parameter:", e);
        }
      }

      // Load the note content
      const noteIdDecoded = NostrTools.nip19.decode(decodedNote);
      if (noteIdDecoded.type === 'note') {
        const noteIdHex = noteIdDecoded.data;
        
        // Subscribe to the specific note
        const sub = poolRef.current.subscribe(relaysRef.current, [
          {
            ids: [noteIdHex]
          }
        ]);

        sub.on('event', (event: any) => {
          console.log('Received note event:', event);
          setNoteContent(event.content);
          setAuthorName(event.pubkey);
          setAuthorImage('/images/gradient_color.gif'); // Default image
          
          // Generate QR code for the note
          generateQRCode(decodedNote);
          
          // Subscribe to zaps for this note
          subscribeToZaps(noteIdHex);
        });

        sub.on('eose', () => {
          console.log('Note subscription ended');
        });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load note');
    }
  };

  const generateQRCode = (noteId: string) => {
    try {
      const qrElement = document.getElementById('qrCode') as HTMLImageElement;
      const qrLink = document.getElementById('qrcodeLinkNostr') as HTMLAnchorElement;
      
      if (qrElement && qrLink) {
        // Create QR code
        const qr = new QRious({
          value: `nostr:${noteId}`,
          size: Math.min(window.innerWidth * 0.6, window.innerHeight * 0.7)
        });
        
        qrElement.src = qr.toDataURL();
        qrLink.href = `nostr:${noteId}`;
      }
    } catch (err) {
      console.error('Error generating QR code:', err);
    }
  };

  const subscribeToZaps = (noteIdHex: string) => {
    try {
      const sub = poolRef.current.subscribe(relaysRef.current, [
        {
          kinds: [9735], // Zap receipts
          '#e': [noteIdHex] // Referencing the note
        }
      ]);

      sub.on('event', (event: any) => {
        console.log('Received zap event:', event);
        processZapEvent(event);
      });

      sub.on('eose', () => {
        console.log('Zap subscription ended');
        allZapsLoadedRef.current = true;
        processZapQueue();
      });
    } catch (err) {
      console.error('Error subscribing to zaps:', err);
    }
  };

  const processZapEvent = (event: any) => {
    try {
      const zapId = event.id;
      if (processedZapsRef.current.has(zapId)) {
        return; // Already processed
      }
      processedZapsRef.current.add(zapId);

      // Extract zap data
      const bolt11Tag = event.tags.find((tag: any) => tag[0] === 'bolt11');
      const descriptionTag = event.tags.find((tag: any) => tag[0] === 'description');
      
      if (bolt11Tag && descriptionTag) {
        const bolt11 = bolt11Tag[1];
        const description = descriptionTag[1];
        
        // Decode bolt11 to get amount
        const decoded = Bolt11.decode(bolt11);
        const amount = decoded.satoshis || 0;
        
        // Extract YouTube URL from description
        const youtubeUrl = extractYouTubeUrl(description);
        if (youtubeUrl) {
          const videoId = extractVideoId(youtubeUrl);
          if (videoId) {
            const songData = {
              id: zapId,
              videoId: videoId,
              youtubeUrl: youtubeUrl,
              amount: amount,
              description: description,
              timestamp: event.created_at,
              zapper: event.pubkey
            };
            
            zapQueueRef.current.push(songData);
            processZapQueue();
          }
        }
      }
    } catch (err) {
      console.error('Error processing zap event:', err);
    }
  };

  const extractYouTubeUrl = (text: string): string | null => {
    const youtubeRegex = /(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/;
    const match = text.match(youtubeRegex);
    return match ? match[0] : null;
  };

  const extractVideoId = (url: string): string | null => {
    const regex = /(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/;
    const match = url.match(regex);
    return match ? match[1] : null;
  };

  const processZapQueue = () => {
    if (!allZapsLoadedRef.current) return;

    // Sort by amount (highest first)
    zapQueueRef.current.sort((a, b) => b.amount - a.amount);
    
    // Update queue
    setQueue(zapQueueRef.current);
    setQueueCount(zapQueueRef.current.length);
    
    // Start playing if nothing is playing
    if (!isPlayingRef.current && zapQueueRef.current.length > 0) {
      playNextSong();
    }
  };

  const playNextSong = () => {
    if (zapQueueRef.current.length === 0) return;
    
    const nextSong = zapQueueRef.current.shift();
    currentlyPlayingRef.current = nextSong;
    setCurrentTrack(nextSong);
    setQueue(zapQueueRef.current);
    setQueueCount(zapQueueRef.current.length);
    
    // Play the song
    playSong(nextSong);
  };

  const playSong = (song: any) => {
    try {
      if (youtubePlayerRef.current && playerReadyRef.current) {
        youtubePlayerRef.current.loadVideoById(song.videoId);
        youtubePlayerRef.current.playVideo();
        isPlayingRef.current = true;
        setIsPlaying(true);
        
        // Enable skip button
        const skipBtn = document.getElementById('skipSong') as HTMLButtonElement;
        if (skipBtn) {
          skipBtn.disabled = false;
        }
        
        // Update song info
        updateSongInfo(song);
      } else {
        // Initialize YouTube player if not ready
        initializeYouTubePlayer(song);
      }
    } catch (err) {
      console.error('Error playing song:', err);
    }
  };

  const initializeYouTubePlayer = (song: any) => {
    try {
      const container = document.getElementById('currentVideo');
      if (container) {
        // Clear existing content
        container.innerHTML = '';
        
        // Create YouTube iframe
        const iframe = document.createElement('iframe');
        iframe.id = 'youtube-player';
        iframe.width = '100%';
        iframe.height = '315';
        iframe.src = `https://www.youtube.com/embed/${song.videoId}?enablejsapi=1&autoplay=1`;
        iframe.frameBorder = '0';
        iframe.allow = 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture';
        iframe.allowFullscreen = true;
        
        container.appendChild(iframe);
        
        // Initialize player
        youtubePlayerRef.current = new window.YT.Player('youtube-player', {
          events: {
            onReady: () => {
              playerReadyRef.current = true;
              youtubePlayerRef.current.playVideo();
              isPlayingRef.current = true;
              setIsPlaying(true);
              
              // Enable skip button
              const skipBtn = document.getElementById('skipSong') as HTMLButtonElement;
              if (skipBtn) {
                skipBtn.disabled = false;
              }
              
              // Update song info
              updateSongInfo(song);
            },
            onStateChange: (event: any) => {
              if (event.data === window.YT.PlayerState.ENDED) {
                // Song ended, play next
                songEnded();
              }
            }
          }
        });
      }
    } catch (err) {
      console.error('Error initializing YouTube player:', err);
    }
  };

  const updateSongInfo = (song: any) => {
    const songInfoElement = document.getElementById('currentSongInfo');
    if (songInfoElement) {
      songInfoElement.innerHTML = `
        <div class="song-title">${song.description}</div>
        <div class="song-amount">${song.amount} sats</div>
        <div class="song-zapper">Zapped by: ${song.zapper}</div>
      `;
    }
  };

  const songEnded = () => {
    if (currentlyPlayingRef.current) {
      // Add to played songs
      playedSongsRef.current.unshift(currentlyPlayingRef.current);
      setPlayedCount(playedSongsRef.current.length);
      
      // Clear current track
      currentlyPlayingRef.current = null;
      setCurrentTrack(null);
      isPlayingRef.current = false;
      setIsPlaying(false);
      
      // Disable skip button
      const skipBtn = document.getElementById('skipSong') as HTMLButtonElement;
      if (skipBtn) {
        skipBtn.disabled = true;
      }
      
      // Play next song
      if (zapQueueRef.current.length > 0) {
        playNextSong();
      } else {
        // Show no video message
        const container = document.getElementById('currentVideo');
        if (container) {
          container.innerHTML = `
            <div class="no-video-message">
              <div class="no-video-icon">🎵</div>
              <div class="no-video-text">No song playing yet</div>
              <div class="no-video-subtext">Zap with a YouTube URL or video ID to request a song!</div>
              <div class="no-video-examples">
                <div class="example-item">📺 youtube.com/watch?v=VIDEO_ID</div>
                <div class="example-item">🔗 youtu.be/VIDEO_ID</div>
                <div class="example-item">🎯 Just the video ID (11 characters)</div>
              </div>
            </div>
          `;
        }
      }
    }
  };

  const handleJukeboxSubmit = async () => {
    const input = document.getElementById('note1LoaderInput') as HTMLInputElement;
    const noteId = input?.value?.trim();

    if (noteId) {
      await loadJukeboxFromNote(noteId);
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
    if (isPlayingRef.current) {
      songEnded();
    }
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