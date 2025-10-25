// React hook for jukebox functionality integration - matches legacy behavior exactly
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
  const [authorImage, setAuthorImage] = useState<string>(
    '/images/gradient_color.gif'
  );
  const [queue, setQueue] = useState<any[]>([]);
  const [currentTrack, setCurrentTrack] = useState<any>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [queueCount, setQueueCount] = useState<number>(0);
  const [playedCount, setPlayedCount] = useState<number>(0);

  // Legacy variables - exactly like the original
  const poolRef = useRef<any>(null);
  const relaysRef = useRef<string[]>([
    'wss://relay.damus.io',
    'wss://relay.primal.net',
    'wss://relay.nostr.band/',
    'wss://relay.nostr.nu/'
  ]);
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
  const processedProfilesRef = useRef<Set<string>>(new Set());
  const profileCacheRef = useRef<
    Map<string, { name: string; picture: string }>
  >(new Map());
  const allZapsLoadedRef = useRef<boolean>(false);
  const zapQueueRef = useRef<any[]>([]);
  const currentTopZapRef = useRef<any>(null);
  const activeSubscriptionsRef = useRef<Set<string>>(new Set());

  // Add new refs to prevent duplicate operations
  const currentNoteIdRef = useRef<string | null>(null);
  const noteSubscriptionRef = useRef<any>(null);
  const zapsSubscriptionRef = useRef<any>(null);
  const isInitializedRef = useRef<boolean>(false);

  // Style options - exactly like legacy
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

  // Initialize exactly like legacy
  useEffect(() => {
    // Prevent duplicate initialization
    if (isInitializedRef.current) {
      console.log('Already initialized, skipping duplicate initialization');
      return;
    }
    isInitializedRef.current = true;

    // Initialize Nostr relay pool
    poolRef.current = new NostrTools.SimplePool();

    // Set background image dynamically to avoid webpack CSS-loader issues
    const liveZapOverlay = document.querySelector(
      '.liveZapOverlay'
    ) as HTMLElement;
    if (liveZapOverlay) {
      liveZapOverlay.style.backgroundImage = 'url(/images/lightning.gif)';
    }

    // Check for note parameter in URL and decode nevent to note if present
    let urlToParse = location.search;
    const params = new URLSearchParams(urlToParse);
    let nevent = params.get('note');

    // Decode nevent to note if present in URL - exactly like legacy
    if (nevent) {
      try {
        const decoded = NostrTools.nip19.decode(nevent);
        if (decoded.type === 'nevent') {
          // Convert nevent to note format and update URL
          const note = NostrTools.nip19.noteEncode(decoded.data.id);
          const currentParams = new URLSearchParams(window.location.search);
          currentParams.set('note', note);
          const newUrl =
            window.location.pathname + '?' + currentParams.toString();
          window.history.replaceState({}, '', newUrl);
          nevent = note;
        }
      } catch (e) {
        console.log('Error decoding note parameter:', e);
      }
    }

    // If we have a note parameter, load the jukebox
    if (nevent) {
      loadNoteAndStartJukebox(nevent);
    }

    // Setup style options exactly like legacy
    setupStyleOptions();
    applyStylesFromURL();

    // Initialize YouTube Player API exactly like legacy
    if (window.YT && window.YT.ready) {
      window.YT.ready(() => {
        console.log('YouTube IFrame API ready');
        createYouTubePlayer();
      });
    } else {
      window.onYouTubeIframeAPIReady = () => {
        console.log('YouTube IFrame API ready');
        createYouTubePlayer();
      };
    }
  }, []);

  // Core functions - exactly like legacy
  const loadNoteAndStartJukebox = async (noteId: string) => {
    try {
      // Prevent duplicate calls for the same note
      if (currentNoteIdRef.current === noteId) {
        console.log('Note already loaded, skipping duplicate call:', noteId);
        return;
      }

      // Prevent duplicate calls while loading
      if (isLoading) {
        console.log('Already loading, skipping duplicate call');
        return;
      }

      // Clean up previous subscriptions
      if (noteSubscriptionRef.current) {
        console.log('Cleaning up previous note subscription');
        noteSubscriptionRef.current = null;
      }
      if (zapsSubscriptionRef.current) {
        console.log('Cleaning up previous zaps subscription');
        zapsSubscriptionRef.current = null;
      }

      setIsLoading(true);
      setError(null);
      currentNoteIdRef.current = noteId;

      // Decode note ID to get the actual hex string
      let noteIdHex: string;
      try {
        const decoded = NostrTools.nip19.decode(noteId);
        if (decoded.type === 'note') {
          noteIdHex = decoded.data;
        } else if (decoded.type === 'nevent') {
          noteIdHex = decoded.data.id;
        } else {
          throw new Error('Invalid note format');
        }
      } catch (e) {
        console.log('Error decoding note:', e);
        alert('Invalid note ID format. Please use a valid note1... ID.');
        setIsLoading(false);
        currentNoteIdRef.current = null;
        return;
      }

      console.log('Loading note with event ID:', noteIdHex);

      // Clear previous data
      json9735ListRef.current = [];
      songQueueRef.current = [];
      processedZapsRef.current.clear();
      processedProfilesRef.current.clear();
      profileCacheRef.current.clear();
      activeSubscriptionsRef.current.clear();
      allZapsLoadedRef.current = false;

      // Subscribe to the specific note using subscribe method
      noteSubscriptionRef.current = poolRef.current.subscribe(
        relaysRef.current,
        {
          ids: [noteIdHex]
        },
        {
          onevent(event: any) {
            console.log('Received note event:', event);
            loadJukeboxFromNote(event);

            // Now subscribe to zaps for this note
            subscribeToZaps(noteIdHex);

            // Also check if we need to start playback after a short delay
            setTimeout(() => {
              console.log(
                'Note loaded, checking if we should start playback. Queue length:',
                songQueueRef.current.length
              );
              if (
                songQueueRef.current.length > 0 &&
                !currentlyPlayingRef.current
              ) {
                console.log('Starting playback after note load');
                playNextSong();
              }
            }, 2000);
          },
          oneose() {
            console.log('Note subscription EOS');
          },
          onclosed() {
            console.log('Note subscription closed');
          }
        }
      );

      // Set a timeout in case the note doesn't exist
      setTimeout(() => {
        if (!noteContent && isLoading) {
          console.log('Note not found after timeout, showing error');
          setError('Note not found. Please check the note ID and try again.');
          setIsLoading(false);
          currentNoteIdRef.current = null;
          const noteLoaderContainer = document.getElementById(
            'noteLoaderContainer'
          );
          const mainLayout = document.getElementById('mainLayout');
          if (noteLoaderContainer) noteLoaderContainer.style.display = 'block';
          if (mainLayout) mainLayout.style.display = 'none';
        }
      }, 10000);
    } catch (error) {
      console.error('Error loading note:', error);
      setError(
        'Error loading note: ' +
          (error instanceof Error ? error.message : 'Unknown error')
      );
      setIsLoading(false);
      currentNoteIdRef.current = null;
    }
  };

  const loadJukeboxFromNote = async (event: any) => {
    try {
      // Update state with note content
      setNoteContent(event.content);
      setAuthorName('Loading...'); // Show loading state instead of pubkey
      setAuthorImage('/images/gradient_color.gif');
      setIsLoading(false); // Clear loading state when note is found

      // Show main layout and hide loader - exactly like legacy
      const noteLoaderContainer = document.getElementById(
        'noteLoaderContainer'
      );
      const mainLayout = document.getElementById('mainLayout');

      if (noteLoaderContainer) {
        noteLoaderContainer.style.display = 'none';
      }
      if (mainLayout) {
        mainLayout.style.display = 'grid';
      }

      // Generate QR code for the note
      generateQRCode(event);

      // Fetch author profile
      const profileResult = await fetchAuthorProfile(event.pubkey);

      // If profile lookup failed, set a fallback name
      if (!profileResult) {
        console.log('Profile lookup failed, using fallback name');
        setAuthorName('Unknown Author');
      }

      // Subscribe to zaps for this note
      subscribeToZaps(event.id);
    } catch (error) {
      console.error('Error loading jukebox from note:', error);
    }
  };

  const fetchAuthorProfile = async (authorPubkey: string) => {
    return new Promise(resolve => {
      // Check if we already have an active subscription for this pubkey
      if (activeSubscriptionsRef.current.has(authorPubkey)) {
        console.log('Profile subscription already active for:', authorPubkey);
        resolve(null);
        return;
      }

      // Mark subscription as active
      activeSubscriptionsRef.current.add(authorPubkey);

      let profileFound = false;

      // Use subscribe with timeout
      const subscription = poolRef.current.subscribe(
        relaysRef.current,
        {
          kinds: [0],
          authors: [authorPubkey]
        },
        {
          onevent(profileEvent: any) {
            console.log('Received author profile event:', profileEvent);
            updateAuthorInfo(profileEvent);
            profileFound = true;

            // Store profile data in cache
            try {
              const profile = JSON.parse(profileEvent.content);
              const displayName =
                profile.display_name || profile.name || 'Unknown';
              const picture = profile.picture || '/images/gradient_color.gif';
              profileCacheRef.current.set(authorPubkey, {
                name: displayName,
                picture: picture
              });
            } catch (error) {
              console.error('Error parsing profile for cache:', error);
            }

            activeSubscriptionsRef.current.delete(authorPubkey);
            resolve(profileEvent);
          },
          oneose() {
            console.log('Author profile subscription EOS');
            if (!profileFound) {
              activeSubscriptionsRef.current.delete(authorPubkey);
              resolve(null);
            }
          },
          onclosed() {
            console.log('Author profile subscription closed');
            if (!profileFound) {
              activeSubscriptionsRef.current.delete(authorPubkey);
            }
          }
        }
      );

      // Set timeout for profile lookup
      setTimeout(() => {
        if (!profileFound) {
          console.log('Author profile lookup timeout, using fallback');
          activeSubscriptionsRef.current.delete(authorPubkey);
          resolve(null);
        }
      }, 5000); // Increased timeout to 5 seconds
    });
  };

  const updateAuthorInfo = (profileEvent: any) => {
    try {
      const profile = JSON.parse(profileEvent.content);
      const displayName = profile.display_name || profile.name || 'Unknown';
      const picture = profile.picture || '/images/gradient_color.gif';

      console.log('Updating author info:', { displayName, picture });

      setAuthorName(displayName);
      setAuthorImage(picture);
    } catch (error) {
      console.error('Error parsing author profile:', error);
    }
  };

  const generateQRCode = (event: any) => {
    try {
      const qrCode = document.getElementById('qrCode');
      const qrcodeLinkNostr = document.getElementById('qrcodeLinkNostr');

      if (!qrCode || !qrcodeLinkNostr) return;

      // Create zap request URL - use njump.me instead of nostr: scheme
      const zapRequest = `https://njump.me/${NostrTools.nip19.noteEncode(event.id)}`;

      // Generate QR code
      const qr = new QRious({
        element: qrCode,
        value: zapRequest,
        size: 200,
        level: 'M'
      });

      // Set link
      (qrcodeLinkNostr as HTMLAnchorElement).href = zapRequest;
    } catch (error) {
      console.error('Error generating QR code:', error);
    }
  };

  const subscribeToZaps = (eventId: string) => {
    try {
      console.log('Subscribing to zaps for event:', eventId);

      // Prevent duplicate subscriptions
      if (allZapsLoadedRef.current || zapsSubscriptionRef.current) {
        console.log(
          'Zaps already loaded or subscription active, skipping duplicate subscription'
        );
        return;
      }

      // Flag to track if we're still in initial loading phase
      let initialLoadingComplete = false;

      zapsSubscriptionRef.current = poolRef.current.subscribe(
        relaysRef.current,
        {
          kinds: [9735], // Zap events
          '#e': [eventId] // Zaps for this specific note
        },
        {
          onevent(event: any) {
            console.log('Received zap event:', event);
            // Pass the loading state to processZapEvent
            processZapEvent(event, initialLoadingComplete);
          },
          oneose() {
            console.log('Zaps subscription EOS');
            // Mark initial loading as complete
            initialLoadingComplete = true;
            allZapsLoadedRef.current = true;

            // After all zaps are loaded, ensure playback starts automatically
            setTimeout(() => {
              console.log(
                'Zaps EOS - checking if we should start playback. Queue length:',
                songQueueRef.current.length,
                'isPlaying:',
                isPlayingRef.current,
                'currentlyPlaying:',
                currentlyPlayingRef.current
              );

              // Only start playback if nothing is currently playing
              if (
                songQueueRef.current.length > 0 &&
                !currentlyPlayingRef.current
              ) {
                console.log(
                  'Starting playback after zaps loaded - no song currently playing'
                );
                playNextSong();
              } else if (
                songQueueRef.current.length > 0 &&
                currentlyPlayingRef.current &&
                !isPlayingRef.current
              ) {
                console.log(
                  'Resuming playback after zaps loaded - song exists but not playing'
                );
                // Don't call playNextSong() - just resume the current song
                if (playerReadyRef.current && youtubePlayerRef.current) {
                  youtubePlayerRef.current.playVideo();
                  isPlayingRef.current = true;
                }
              } else if (
                songQueueRef.current.length > 0 &&
                currentlyPlayingRef.current &&
                isPlayingRef.current
              ) {
                console.log('Playback already in progress - no action needed');
              } else {
                console.log('No songs in queue after zaps loaded');
              }
            }, 500); // Reduced delay for faster response
          },
          onclosed() {
            console.log('Zaps subscription closed');
          }
        }
      );
    } catch (error) {
      console.error('Error subscribing to zaps:', error);
    }
  };

  const processZapEvent = async (
    event: any,
    initialLoadingComplete: boolean = false
  ) => {
    try {
      // Prevent duplicate processing
      if (processedZapsRef.current.has(event.id)) {
        console.log('Zap already processed, skipping duplicate:', event.id);
        return;
      }
      processedZapsRef.current.add(event.id);

      // Parse the zap event
      const description = event.tags.find(
        (tag: any) => tag[0] === 'description'
      );
      if (!description) return;

      const zapData = JSON.parse(description[1]);
      const bolt11 = event.tags.find((tag: any) => tag[0] === 'bolt11');
      if (!bolt11) return;

      const decodedBolt11 = Bolt11.decode(bolt11[1]);
      const amount = decodedBolt11.satoshis;

      // The zapper's profile info comes from the kind 9734 event inside the description
      // The kind 9735 event's pubkey is the recipient, not the zapper
      const zapperPubkey = zapData.pubkey; // This is the actual zapper's pubkey

      console.log('Processing zap event:', {
        eventPubkey: event.pubkey,
        zapperPubkey: zapperPubkey,
        zapData: zapData,
        amount: amount
      });

      // Get zapper profile info
      let zapperName = 'Unknown';
      let zapperPicture = '/images/gradient_color.gif';

      try {
        // Check if we already have profile info cached
        if (processedProfilesRef.current.has(zapData.pubkey)) {
          console.log('Profile already processed for pubkey:', zapData.pubkey);

          // Get cached profile data
          const cachedProfile = profileCacheRef.current.get(zapData.pubkey);
          const cachedName = cachedProfile ? cachedProfile.name : 'Unknown';
          const cachedPicture = cachedProfile
            ? cachedProfile.picture
            : '/images/gradient_color.gif';

          // Use cached profile info and process the zap
          const zapInfo: any = {
            amount: amount,
            kind9735content: zapData.content || '',
            kind1Name: cachedName,
            picture: cachedPicture,
            pubkey: zapData.pubkey,
            timestamp: event.created_at * 1000
          };

          const songInfo = await extractYouTubeInfo(zapData.content || '');
          if (songInfo && songInfo.type === 'youtube') {
            zapInfo.songInfo = songInfo;

            if (initialLoadingComplete) {
              await addToQueue(zapInfo);
            } else {
              await addToQueueSilently(zapInfo);
            }
            addToZapsList(zapInfo);
          }
          return;
        }
        processedProfilesRef.current.add(zapData.pubkey);

        // Check if we already have an active subscription for this pubkey
        if (activeSubscriptionsRef.current.has(zapData.pubkey)) {
          console.log(
            'Profile subscription already active for:',
            zapData.pubkey
          );
          // Process zap with default info
          const zapInfo: any = {
            amount: amount,
            kind9735content: zapData.content || '',
            kind1Name: 'Unknown',
            picture: '/images/gradient_color.gif',
            pubkey: zapData.pubkey,
            timestamp: event.created_at * 1000
          };

          const songInfo = await extractYouTubeInfo(zapData.content || '');
          if (songInfo && songInfo.type === 'youtube') {
            zapInfo.songInfo = songInfo;

            if (initialLoadingComplete) {
              await addToQueue(zapInfo);
            } else {
              await addToQueueSilently(zapInfo);
            }
            addToZapsList(zapInfo);
          }
          return;
        }

        // Mark subscription as active
        activeSubscriptionsRef.current.add(zapData.pubkey);

        // Use subscribe instead of subscribeMany
        poolRef.current.subscribe(
          relaysRef.current,
          {
            kinds: [0],
            authors: [zapData.pubkey] // Use zapper's pubkey from kind 9734
          },
          {
            async onevent(profileEvent: any) {
              const profile = JSON.parse(profileEvent.content);
              zapperName = profile.display_name || profile.name || 'Unknown';
              zapperPicture = profile.picture || '/images/gradient_color.gif';

              // Store profile data in cache
              profileCacheRef.current.set(zapData.pubkey, {
                name: zapperName,
                picture: zapperPicture
              });

              console.log('Found zapper profile:', {
                pubkey: zapperPubkey,
                name: zapperName,
                picture: zapperPicture
              });

              // Clean up subscription
              activeSubscriptionsRef.current.delete(zapData.pubkey);

              // Add zap to the list
              const zapInfo: any = {
                amount: amount,
                kind9735content: zapData.content || '',
                kind1Name: zapperName,
                picture: zapperPicture,
                pubkey: zapData.pubkey, // Use zapper's pubkey, not event.pubkey
                timestamp: event.created_at * 1000
              };

              console.log(
                `Processing zap event: amount=${amount}, content="${zapData.content || ''}", zapper=${zapperName}`
              );

              // Only process zaps with valid YouTube content
              const songInfo = await extractYouTubeInfo(zapData.content || '');
              if (songInfo && songInfo.type === 'youtube') {
                // Add songInfo to zapInfo for proper filtering
                zapInfo.songInfo = songInfo;

                // Use silent version during initial loading, regular version for live zaps
                if (initialLoadingComplete) {
                  await addToQueue(zapInfo);
                } else {
                  await addToQueueSilently(zapInfo);
                }
                addToZapsList(zapInfo);
              } else {
                console.log(
                  'Skipping zap - no valid YouTube content:',
                  songInfo
                );
              }
            },
            oneose() {
              console.log('Profile subscription EOS');
              activeSubscriptionsRef.current.delete(zapData.pubkey);
            },
            onclosed() {
              console.log('Profile subscription closed');
              activeSubscriptionsRef.current.delete(zapData.pubkey);
            }
          }
        );

        // Set timeout for profile lookup
        setTimeout(async () => {
          if (zapperName === 'Unknown') {
            console.log(
              'Profile lookup timeout, using fallback for zapper:',
              zapperPubkey
            );

            // Clean up subscription
            activeSubscriptionsRef.current.delete(zapData.pubkey);

            const zapInfo: any = {
              amount: amount,
              kind9735content: zapData.content || '',
              kind1Name: zapperName,
              picture: zapperPicture,
              pubkey: zapData.pubkey, // Use zapper's pubkey, not event.pubkey
              timestamp: event.created_at * 1000
            };

            // Only process zaps with valid YouTube content
            const songInfo = await extractYouTubeInfo(zapData.content || '');
            if (songInfo && songInfo.type === 'youtube') {
              // Add songInfo to zapInfo for proper filtering
              zapInfo.songInfo = songInfo;

              // Use silent version during initial loading, regular version for live zaps
              if (initialLoadingComplete) {
                await addToQueue(zapInfo);
              } else {
                await addToQueueSilently(zapInfo);
              }
              addToZapsList(zapInfo);
            } else {
              console.log(
                'Skipping zap timeout fallback - no valid YouTube content:',
                songInfo
              );
            }
          }
        }, 3000);
      } catch (e) {
        console.error('Error processing profile:', e);
        const zapInfo: any = {
          amount: amount,
          kind9735content: zapData.content || '',
          kind1Name: zapperName,
          picture: zapperPicture,
          pubkey: zapData.pubkey, // Use zapper's pubkey, not event.pubkey
          timestamp: event.created_at * 1000
        };

        // Only process zaps with valid YouTube content
        const songInfo = await extractYouTubeInfo(zapData.content || '');
        if (songInfo && songInfo.type === 'youtube') {
          // Add songInfo to zapInfo for proper filtering
          zapInfo.songInfo = songInfo;

          // Use silent version during initial loading, regular version for live zaps
          if (initialLoadingComplete) {
            await addToQueue(zapInfo);
          } else {
            await addToQueueSilently(zapInfo);
          }
          addToZapsList(zapInfo);
        } else {
          console.log(
            'Skipping zap error fallback - no valid YouTube content:',
            songInfo
          );
        }
      }
    } catch (error) {
      console.error('Error processing zap event:', error);
    }
  };

  const extractYouTubeInfo = async (zapContent: string) => {
    console.log(`extractYouTubeInfo called with: "${zapContent}"`);

    if (!zapContent || typeof zapContent !== 'string') {
      console.log('extractYouTubeInfo: Invalid content, returning null');
      return null;
    }

    // Look for YouTube URLs (including those with additional parameters)
    const youtubeUrlRegex =
      /(https?:\/\/(?:www\.)?youtube\.com\/watch\?v=([\w\-]+)(?:[&\w=]*)|https?:\/\/youtu\.be\/([\w\-]+)(?:\?[&\w=]*)?)/gi;
    const urlMatch = youtubeUrlRegex.exec(zapContent);

    if (urlMatch) {
      const videoId = urlMatch[2] || urlMatch[3];
      console.log(`extractYouTubeInfo: Found YouTube URL, videoId: ${videoId}`);
      return {
        type: 'youtube',
        videoId: videoId,
        searchTerm: null,
        originalContent: zapContent
      };
    }

    // Look for YouTube video IDs (11 characters, alphanumeric + underscore + hyphen)
    const videoIdRegex = /^([a-zA-Z0-9_-]{11})$/;
    const videoIdMatch = videoIdRegex.exec(zapContent.trim());

    if (videoIdMatch) {
      const videoId = videoIdMatch[1];
      console.log(`extractYouTubeInfo: Found YouTube video ID: ${videoId}`);
      return {
        type: 'youtube',
        videoId: videoId,
        searchTerm: null,
        originalContent: zapContent
      };
    }

    // Look for search terms (anything that's not a URL and not empty)
    const cleanContent = zapContent.trim();

    // More strict validation for search terms
    if (
      cleanContent &&
      !cleanContent.startsWith('http') &&
      cleanContent.length >= 3 &&
      !/^\s*$/.test(cleanContent) && // Not just whitespace
      !/^[^\w\s]*$/.test(cleanContent)
    ) {
      // Not just special characters

      console.log(
        `extractYouTubeInfo: Found valid search term: "${cleanContent}", creating search result`
      );

      // For search terms, create a search result that can be displayed
      return {
        type: 'search',
        videoId: null,
        searchTerm: cleanContent,
        originalContent: zapContent,
        searchUrl: `https://www.youtube.com/results?search_query=${encodeURIComponent(cleanContent)}`
      };
    } else {
      console.log(`extractYouTubeInfo: Content validation failed:`, {
        cleanContent: cleanContent,
        length: cleanContent ? cleanContent.length : 0,
        startsWithHttp: cleanContent ? cleanContent.startsWith('http') : false,
        isJustWhitespace: cleanContent ? /^\s*$/.test(cleanContent) : true,
        isJustSpecialChars: cleanContent
          ? /^[^\w\s]*$/.test(cleanContent)
          : false
      });
    }

    console.log('extractYouTubeInfo: No valid content found, returning null');
    return null;
  };

  const addToQueue = async (zapData: any) => {
    const songInfo = await extractYouTubeInfo(zapData.kind9735content);
    if (!songInfo || songInfo.type !== 'youtube') {
      console.log('Skipping zap - no valid YouTube content:', songInfo);
      return;
    }

    const queueItem = {
      ...zapData,
      songInfo: songInfo,
      timestamp: zapData.timestamp || Date.now(),
      queueId: Date.now() + Math.random() // Unique ID for queue management
    };

    songQueueRef.current.push(queueItem);
    songQueueRef.current.sort((a, b) => b.amount - a.amount); // Sort by zap amount (highest first)
    updateQueueDisplay();
    updateStats();

    console.log(
      `Added YouTube song to queue. Queue length: ${songQueueRef.current.length}, isPlaying: ${isPlayingRef.current}, currentlyPlaying: ${currentlyPlayingRef.current ? 'yes' : 'no'}`
    );
    console.log(`Song info:`, songInfo);

    // Always try to start playback if we have songs and nothing is currently playing
    if (!currentlyPlayingRef.current) {
      console.log(
        'No song currently playing, starting playback immediately...'
      );
      playNextSong();
    } else if (!isPlayingRef.current && songQueueRef.current.length > 0) {
      console.log('Song exists but not playing, starting playback...');
      playNextSong();
    } else if (songQueueRef.current.length === 1) {
      // If this is the first song being added, ensure it starts
      console.log('First song added, ensuring playback starts...');
      playNextSong();
    }
  };

  // Silent version for loading existing zaps without auto-starting playback
  const addToQueueSilently = async (zapData: any) => {
    const songInfo = await extractYouTubeInfo(zapData.kind9735content);
    if (!songInfo || songInfo.type !== 'youtube') {
      console.log(
        'Skipping zap silently - no valid YouTube content:',
        songInfo
      );
      return;
    }

    const queueItem = {
      ...zapData,
      songInfo: songInfo,
      timestamp: zapData.timestamp || Date.now(),
      queueId: Date.now() + Math.random() // Unique ID for queue management
    };

    songQueueRef.current.push(queueItem);
    songQueueRef.current.sort((a, b) => b.amount - a.amount); // Sort by zap amount (highest first)
    updateQueueDisplay();
    updateStats();

    console.log(
      `Silently added YouTube song to queue. Queue length: ${songQueueRef.current.length}`
    );
    console.log(`Song info:`, songInfo);
    console.log(`Full songQueue after adding:`, songQueueRef.current);

    // Check if this is the first song added and we should start playback
    if (songQueueRef.current.length === 1) {
      console.log('First song added to queue, setting up playback...');
      // Set a flag to indicate all zaps are loaded
      allZapsLoadedRef.current = true;
      // Populate zapQueue with the songs that are already in songQueue
      songQueueRef.current.forEach(song => {
        zapQueueRef.current.push({
          content: song.songInfo.originalContent,
          zapId: song.queueId,
          zapperName: song.kind1Name,
          zapperProfileImg: song.picture,
          zapAmount: song.amount,
          zapTime: song.timestamp
        });
      });

      // Now process the top zap to start playback
      setTimeout(() => {
        processTopZap();
      }, 500); // Small delay to ensure everything is set up
    }

    // Note: No automatic playback - this is for loading existing zaps
    // Return the queue item for potential use by caller
    return queueItem;
  };

  const addToZapsList = (zapInfo: any) => {
    // Only add zaps with valid YouTube content to the display list
    if (zapInfo.songInfo && zapInfo.songInfo.type === 'youtube') {
      // Check if this zap is already in the list to avoid duplicates
      const existingZap = json9735ListRef.current.find(
        zap =>
          zap.pubkey === zapInfo.pubkey &&
          zap.amount === zapInfo.amount &&
          zap.kind9735content === zapInfo.kind9735content
      );

      if (!existingZap) {
        json9735ListRef.current.push(zapInfo);
        json9735ListRef.current.sort((a, b) => b.amount - a.amount);

        // Only update display if zaps elements exist
        const zapsContainer = document.getElementById('zaps');
        const totalValue = document.getElementById('zappedTotalValue');

        if (zapsContainer && totalValue) {
          drawKinds9735(json9735ListRef.current);
        }
      } else {
        console.log('Zap already exists in list, skipping duplicate');
      }
    } else {
      console.log(
        'Skipping zap display - no valid YouTube content:',
        zapInfo.songInfo
      );
    }
  };

  const drawKinds9735 = (json9735List: any[]) => {
    const zapsContainer = document.getElementById('zaps');
    const totalValue = document.getElementById('zappedTotalValue');

    // Only proceed if zaps elements exist
    if (!zapsContainer || !totalValue) {
      console.log('Zaps display elements not found, skipping display update');
      return;
    }

    // Filter to only show zaps with valid YouTube content
    const youtubeZaps = json9735List.filter(zap => {
      // Check if this zap has songInfo with YouTube type
      return zap.songInfo && zap.songInfo.type === 'youtube';
    });

    console.log(
      `Filtered ${json9735List.length} total zaps to ${youtubeZaps.length} YouTube zaps`
    );

    let totalSats = 0;
    let zapsHTML = '';

    youtubeZaps.forEach((zap, index) => {
      totalSats += zap.amount;

      // Debug logging to see what data we have
      console.log(`Drawing YouTube zap ${index}:`, {
        amount: zap.amount,
        kind1Name: zap.kind1Name,
        picture: zap.picture,
        pubkey: zap.pubkey,
        content: zap.kind9735content,
        songInfo: zap.songInfo
      });

      // Use the same structure as live.js for consistency
      if (!zap.picture) zap.picture = '';
      const profileImage =
        zap.picture == '' ? '/images/gradient_color.gif' : zap.picture;

      zapsHTML += `
        <div class="zap" data-index="${index}">
          <div class="zapperProfile">
            <img class="zapperProfileImg" src="${profileImage}" alt="Avatar">
            <div class="zapperName">${zap.kind1Name || 'Unknown'}</div>
          </div>
          <div class="zapperAmount">
            <div class="zapperAmountSats">${zap.amount} sats</div>
          </div>
        </div>
      `;
    });

    totalValue.textContent = totalSats.toString();

    if (youtubeZaps.length === 0) {
      zapsContainer.innerHTML = `
        <div class="no-youtube-zaps">
          <div class="no-zaps-icon">🎵</div>
          <div class="no-zaps-text">No YouTube zaps yet</div>
          <div class="no-zaps-subtext">Zap with a YouTube URL to get started!</div>
        </div>
      `;
    } else {
      zapsContainer.innerHTML = zapsHTML;
    }
  };

  const playNextSong = () => {
    console.log(
      `playNextSong called. Queue length: ${songQueueRef.current.length}, isPlaying: ${isPlayingRef.current}, currentlyPlaying: ${currentlyPlayingRef.current ? 'yes' : 'no'}`
    );

    if (songQueueRef.current.length === 0) {
      console.log('No songs in queue, stopping playback');
      isPlayingRef.current = false;
      currentlyPlayingRef.current = null;

      // Clean up current video
      if (playerReadyRef.current && youtubePlayerRef.current) {
        youtubePlayerRef.current.stopVideo();
        stopProgressTracking();
      }

      updateCurrentVideoDisplay();
      return;
    }

    // Safety check: if we're already playing something, stop it first
    if (currentlyPlayingRef.current && isPlayingRef.current) {
      console.log('Stopping current song before playing next');
      if (playerReadyRef.current && youtubePlayerRef.current) {
        youtubePlayerRef.current.stopVideo();
        stopProgressTracking();
      }
      isPlayingRef.current = false;
    }

    const nextSong = songQueueRef.current.shift();
    console.log(
      `Playing next song: ${nextSong.songInfo.originalContent}, amount: ${nextSong.amount} sats`
    );
    console.log('Next song object:', nextSong);
    console.log('Next song songInfo:', nextSong.songInfo);
    currentlyPlayingRef.current = nextSong;
    isPlayingRef.current = true;

    // Clean up previous video
    if (playerReadyRef.current && youtubePlayerRef.current) {
      youtubePlayerRef.current.stopVideo();
      stopProgressTracking();
    }

    // Add to played songs history
    playedSongsRef.current.unshift({
      ...nextSong,
      playedAt: Date.now()
    });

    // Keep only last 20 played songs for performance
    if (playedSongsRef.current.length > 20) {
      playedSongsRef.current.pop();
    }

    updateCurrentVideoDisplay();
    updateQueueDisplay();
    updatePlayedSongsDisplay();
    updateStats();

    // Start song timer (5 minutes default)
    startSongTimer();

    // Enable player controls
    const skipSongBtn = document.getElementById('skipSong');
    if (skipSongBtn) {
      (skipSongBtn as HTMLButtonElement).disabled = false;
    }
  };

  const startSongTimer = () => {
    // Clear existing timer
    if (songTimerRef.current) {
      clearTimeout(songTimerRef.current);
    }

    // Set timer for 5 minutes (300000ms)
    songTimerRef.current = setTimeout(
      () => {
        if (currentlyPlayingRef.current && isPlayingRef.current) {
          console.log('Song timer expired, advancing to next song');
          playNextSong();
        }
      },
      5 * 60 * 1000
    );
  };

  const stopProgressTracking = () => {
    if (progressUpdateIntervalRef.current) {
      clearInterval(progressUpdateIntervalRef.current);
      progressUpdateIntervalRef.current = null;
    }
  };

  const updateCurrentVideoDisplay = () => {
    const currentVideo = document.getElementById('currentVideo');
    const currentSongInfo = document.getElementById('currentSongInfo');
    const progressContainer = document.getElementById('videoProgressContainer');

    console.log('updateCurrentVideoDisplay called with:', {
      currentlyPlaying: currentlyPlayingRef.current,
      isPlaying: isPlayingRef.current,
      songQueueLength: songQueueRef.current.length
    });

    if (!currentVideo || !currentSongInfo) return;

    if (!currentlyPlayingRef.current) {
      console.log('No song currently playing, checking queue...');

      // If we have songs in queue but nothing is playing, show queue status instead of no-video message
      if (songQueueRef.current.length > 0) {
        console.log(
          'Songs in queue but nothing playing, showing queue status...'
        );
        currentVideo.innerHTML = `
          <div class="queue-status-message">
            <div class="queue-status-icon">📋</div>
            <div class="queue-status-text">${songQueueRef.current.length} song${songQueueRef.current.length > 1 ? 's' : ''} in queue</div>
            <div class="queue-status-subtext">Ready to play! Click play to start</div>
            <button onclick="playNextSong()" class="control-button play-button">▶️ Start Playing</button>
          </div>
        `;
        currentSongInfo.innerHTML = '';

        // Hide progress bar when no video is playing
        if (progressContainer) {
          progressContainer.style.display = 'none';
        }
        return;
      }

      // Only show no-video message if there are truly no songs
      console.log('No songs in queue, showing no-video message');
      // HTML already contains the no-video message, so we don't need to set it here
      // Just ensure the container is visible
      currentVideo.style.display = 'block';
      currentSongInfo.innerHTML = '';

      // Hide progress bar when no video is playing
      if (progressContainer) {
        progressContainer.style.display = 'none';
      }
      return;
    }

    const songInfo = currentlyPlayingRef.current.songInfo;
    console.log('Song info for display:', songInfo);

    if (songInfo.type === 'youtube') {
      console.log('Displaying YouTube video:', songInfo.videoId);
      // Use YouTube Player API instead of iframe
      if (playerReadyRef.current && youtubePlayerRef.current) {
        loadVideo(songInfo.videoId);
      } else {
        // Fallback to iframe if player not ready
        currentVideo.innerHTML = `
          <div class="videoWrapper youtube">
            <iframe src="https://www.youtube.com/embed/${songInfo.videoId}?autoplay=1" 
                    frameborder="0" 
                    allowfullscreen
                    allow="autoplay; encrypted-media">
            </iframe>
          </div>
        `;
      }
    } else if (songInfo.type === 'search') {
      console.log('Displaying search term:', songInfo.searchTerm);
      // For search terms, show a search result display
      currentVideo.innerHTML = `
        <div class="search-result-display">
          <div class="search-header">
            <div class="search-icon">🔍</div>
            <div class="search-title">Search Request</div>
          </div>
          <div class="search-content">
            <div class="search-term-display">"${songInfo.searchTerm}"</div>
            <div class="search-description">This is a search request for YouTube</div>
            <div class="search-actions">
              <a href="${songInfo.searchUrl}" target="_blank" class="search-button">
                🔍 Search YouTube
              </a>
              <div class="search-note">Click to search for this term on YouTube</div>
            </div>
          </div>
        </div>
      `;
    } else {
      console.log('Unknown song type:', songInfo.type);
      // Show error message for unknown song type
      currentVideo.innerHTML = `
        <div class="video-error">
          <div class="error-icon">⚠️</div>
          <div class="error-text">Unknown Song Type</div>
          <div class="error-subtext">Cannot display this song</div>
        </div>
      `;
    }

    currentSongInfo.innerHTML = `
      <div class="current-song-details">
        <div class="song-requester">
          <strong>🎤 Requested by:</strong> ${currentlyPlayingRef.current.kind1Name || 'Unknown'}
        </div>
        <div class="song-zap-amount">
          <strong>⚡ Zap amount:</strong> ${currentlyPlayingRef.current.amount} sats
        </div>
        <div class="song-request-time">
          <strong>🕐 Requested:</strong> ${new Date(currentlyPlayingRef.current.timestamp).toLocaleTimeString()}
        </div>
        <div class="song-original-content">
          <strong>💬 Request:</strong> "${songInfo.originalContent}"
        </div>
        ${
          songInfo.searchResult
            ? `
        <div class="song-search-result">
          <strong>🔍 Found:</strong> "${songInfo.searchResult.title}" by ${songInfo.searchResult.channelTitle}
        </div>
        `
            : ''
        }
      </div>
    `;
  };

  const updateQueueDisplay = () => {
    const songQueueElement = document.getElementById('songQueue');
    if (!songQueueElement) return;

    if (songQueueRef.current.length === 0) {
      songQueueElement.innerHTML =
        '<div class="empty-queue">🎵 No songs in queue</div>';
      return;
    }

    songQueueElement.innerHTML = songQueueRef.current
      .map(
        (item, index) => `
      <div class="queue-item" data-index="${index}">
        <div class="queue-position">#${index + 1}</div>
        <div class="queue-song-info">
          <div class="queue-requester">${item.kind1Name || 'Unknown'}</div>
          <div class="queue-song-details">
            ${
              item.songInfo.type === 'youtube'
                ? `🎥 YouTube: ${item.songInfo.videoId}`
                : `🔍 Search: "${item.songInfo.searchTerm}"`
            }
          </div>
          <div class="queue-zap-amount">⚡ ${item.amount} sats</div>
          <div class="queue-time">🕐 ${new Date(item.timestamp).toLocaleTimeString()}</div>
        </div>
      </div>
    `
      )
      .join('');
  };

  const updatePlayedSongsDisplay = () => {
    const playedSongsElement = document.getElementById('playedSongs');
    if (!playedSongsElement) return;

    if (playedSongsRef.current.length === 0) {
      playedSongsElement.innerHTML =
        '<div class="empty-history">📚 No songs played yet</div>';
      return;
    }

    playedSongsElement.innerHTML = playedSongsRef.current
      .map(
        (item, index) => `
      <div class="played-song-item">
        <div class="played-song-info">
          <div class="played-requester">${item.kind1Name || 'Unknown'}</div>
          <div class="played-song-details">
            ${
              item.songInfo.type === 'youtube'
                ? `🎥 YouTube: ${item.songInfo.videoId}`
                : `🔍 Search: "${item.songInfo.searchTerm}"`
            }
          </div>
          <div class="played-zap-amount">⚡ ${item.amount} sats</div>
          <div class="played-time">🕐 ${new Date(item.playedAt).toLocaleTimeString()}</div>
        </div>
      </div>
    `
      )
      .join('');
  };

  const updateStats = () => {
    const queueCountElement = document.getElementById('queueCount');
    const playedCountElement = document.getElementById('playedCount');
    const queueStatsElement = document.getElementById('queueStats');

    if (queueCountElement)
      queueCountElement.textContent = songQueueRef.current.length.toString();
    if (playedCountElement)
      playedCountElement.textContent = playedSongsRef.current.length.toString();

    const queueTotal = songQueueRef.current.reduce(
      (sum, item) => sum + item.amount,
      0
    );
    const playedTotal = playedSongsRef.current.reduce(
      (sum, item) => sum + item.amount,
      0
    );

    if (queueStatsElement) {
      queueStatsElement.innerHTML = `
        <span class="queue-count">${songQueueRef.current.length} songs in queue</span>
        <span class="queue-total">Total: ${queueTotal} sats</span>
      `;
    }
  };

  const loadVideo = (videoId: string) => {
    if (!playerReadyRef.current || !youtubePlayerRef.current) {
      console.log('Player not ready, queuing video load');
      setTimeout(() => loadVideo(videoId), 1000);
      return;
    }

    if (currentVideoIdRef.current === videoId) {
      console.log('Video already loaded, playing');
      youtubePlayerRef.current.playVideo();
      return;
    }

    console.log('Loading video:', videoId);
    currentVideoIdRef.current = videoId;

    // Try cueVideoById first (better autoplay support)
    try {
      youtubePlayerRef.current.cueVideoById({
        videoId: videoId,
        startSeconds: 0,
        suggestedQuality: 'medium'
      });
    } catch (e) {
      console.log('cueVideoById failed, falling back to loadVideoById');
      youtubePlayerRef.current.loadVideoById(videoId);
    }

    // Auto-play the video after it loads (multiple attempts for browser compatibility)
    setTimeout(() => {
      console.log('Attempting to auto-play video (attempt 1)');
      youtubePlayerRef.current.playVideo();
    }, 1000);

    // Second attempt after 2 seconds
    setTimeout(() => {
      console.log('Attempting to auto-play video (attempt 2)');
      youtubePlayerRef.current.playVideo();
    }, 2000);

    // Third attempt after 3 seconds
    setTimeout(() => {
      console.log('Attempting to auto-play video (attempt 3)');
      youtubePlayerRef.current.playVideo();
    }, 3000);

    // Get video duration after loading
    setTimeout(() => {
      if (youtubePlayerRef.current && youtubePlayerRef.current.getDuration) {
        videoDurationRef.current = youtubePlayerRef.current.getDuration();
        console.log('Video duration:', videoDurationRef.current);
      }
    }, 2000);
  };

  const processTopZap = async () => {
    if (!allZapsLoadedRef.current || zapQueueRef.current.length === 0) {
      console.log('No zaps loaded yet or zap queue is empty');
      return;
    }

    // Filter out zaps with empty content first
    const validZaps = zapQueueRef.current.filter(
      zap =>
        zap.content &&
        typeof zap.content === 'string' &&
        zap.content.trim().length > 0
    );

    if (validZaps.length === 0) {
      console.log('No zaps with valid content found in queue');
      return;
    }

    // Find the zap with the highest amount among valid zaps
    const topZap = validZaps.reduce((highest, current) =>
      current.zapAmount > highest.zapAmount ? current : highest
    );

    console.log('Processing top zap:', topZap);

    // Check if we've already processed this zap
    if (
      currentTopZapRef.current &&
      currentTopZapRef.current.zapId === topZap.zapId
    ) {
      console.log('Top zap already processed, skipping');
      return;
    }

    try {
      // Validate top zap content before processing
      if (
        !topZap.content ||
        typeof topZap.content !== 'string' ||
        topZap.content.trim().length === 0
      ) {
        console.log('Top zap has no valid content, skipping:', {
          content: topZap.content,
          zapId: topZap.zapId
        });
        return;
      }

      // Extract YouTube info from the top zap only
      const youtubeInfo = await extractYouTubeInfo(topZap.content);
      if (youtubeInfo && youtubeInfo.type === 'youtube') {
        const zapData = {
          ...youtubeInfo,
          zapId: topZap.zapId,
          zapperName: topZap.zapperName,
          zapperProfileImg: topZap.zapperProfileImg,
          zapAmount: topZap.zapAmount,
          zapTime: topZap.zapTime
        };

        // Add to queue and start playback
        await addToQueue(zapData); // Use regular addToQueue instead of silent version
        currentTopZapRef.current = topZap;

        console.log(`Top zap processed successfully`);

        // No need to manually start playback - addToQueue handles this automatically
        console.log('Playback should start automatically via addToQueue');
      } else {
        console.log('No valid YouTube content found in top zap, skipping:', {
          content: topZap.content,
          youtubeInfo: youtubeInfo
        });
      }
    } catch (error) {
      console.error('Error processing top zap:', error);
    }
  };

  const setupStyleOptions = () => {
    // Setup style options exactly like legacy
    // This would initialize the style options modal and its controls
    console.log('Setting up style options');
  };

  const applyStylesFromURL = () => {
    // Apply styles from URL parameters exactly like legacy
    // This would parse URL parameters and apply corresponding styles
    console.log('Applying styles from URL');
  };

  // Event handlers for UI interactions
  const handleJukeboxSubmit = () => {
    const noteInput = document.getElementById(
      'note1LoaderInput'
    ) as HTMLInputElement;
    if (noteInput && noteInput.value) {
      console.log('Launching jukebox with note:', noteInput.value);
      loadNoteAndStartJukebox(noteInput.value);
    } else {
      alert('Please enter a valid note ID');
    }
  };

  const handleStyleOptionsToggle = () => {
    const modal = document.getElementById('styleOptionsModal');
    if (modal) {
      modal.classList.add('show');
      document.body.classList.add('style-panel-open');
    }
  };

  const handleStyleOptionsClose = () => {
    const modal = document.getElementById('styleOptionsModal');
    if (modal) {
      modal.classList.remove('show');
      document.body.classList.remove('style-panel-open');
    }
  };

  const handleSkipSong = () => {
    if (currentlyPlayingRef.current && isPlayingRef.current) {
      console.log('Skipping current song');

      // Stop YouTube player if available
      if (playerReadyRef.current && youtubePlayerRef.current) {
        youtubePlayerRef.current.stopVideo();
        stopProgressTracking();
      }

      if (songTimerRef.current) {
        clearTimeout(songTimerRef.current);
      }
      playNextSong();
    }
  };

  // YouTube Player API functions - exactly like legacy
  const createYouTubePlayer = () => {
    youtubePlayerRef.current = new window.YT.Player('currentVideo', {
      height: '315',
      width: '560',
      videoId: '',
      playerVars: {
        autoplay: 1,
        controls: 1,
        disablekb: 0,
        enablejsapi: 1,
        fs: 1,
        rel: 0,
        modestbranding: 1,
        playsinline: 1,
        mute: 0,
        start: 0
      },
      events: {
        onReady: onPlayerReady,
        onStateChange: onPlayerStateChange,
        onError: onPlayerError
      }
    });
  };

  const onPlayerReady = (event: any) => {
    console.log('YouTube player ready');
    playerReadyRef.current = true;
  };

  const onPlayerStateChange = (event: any) => {
    const state = event.data;
    console.log('Player state changed:', state);

    switch (state) {
      case window.YT.PlayerState.PLAYING:
        isPlayingRef.current = true;
        startProgressTracking();
        break;
      case window.YT.PlayerState.PAUSED:
        isPlayingRef.current = false;
        stopProgressTracking();
        break;
      case window.YT.PlayerState.ENDED:
        console.log('Video ended, playing next song');
        playNextSong();
        break;
      case window.YT.PlayerState.BUFFERING:
        console.log('Video buffering...');
        break;
      case window.YT.PlayerState.CUED:
        console.log('Video cued, attempting to play');
        // When video is cued, try to play it
        setTimeout(() => {
          if (youtubePlayerRef.current && !isPlayingRef.current) {
            console.log('Video cued, forcing play');
            youtubePlayerRef.current.playVideo();
          }
        }, 500);
        break;
    }
  };

  const onPlayerError = (event: any) => {
    console.error('YouTube player error:', event.data);
    // Handle different error types
    switch (event.data) {
      case 2:
        console.error('Invalid video ID');
        break;
      case 5:
        console.error('HTML5 player error');
        break;
      case 100:
        console.error('Video not found');
        break;
      case 101:
      case 150:
        console.error('Video not allowed to be played in embedded players');
        break;
    }
  };

  const startProgressTracking = () => {
    if (progressUpdateIntervalRef.current) {
      clearInterval(progressUpdateIntervalRef.current);
    }

    progressUpdateIntervalRef.current = setInterval(() => {
      if (youtubePlayerRef.current && youtubePlayerRef.current.getCurrentTime) {
        videoProgressRef.current = youtubePlayerRef.current.getCurrentTime();
        // Update progress display if needed
      }
    }, 1000);
  };

  // Return the hook interface
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
    // Expose key functions for external use
    loadNoteAndStartJukebox,
    playNextSong,
    skipCurrentSong: handleSkipSong,
    // Event handlers
    handleJukeboxSubmit,
    handleStyleOptionsToggle,
    handleStyleOptionsClose,
    handleSkipSong
  };
};
