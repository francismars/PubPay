document.addEventListener('DOMContentLoaded', function () {
  // Initialize Nostr relay pool
  const pool = new NostrTools.SimplePool();
  const relays = [
    'wss://relay.damus.io',
    'wss://relay.primal.net',
    'wss://relay.nostr.band/',
    'wss://relay.nostr.nu/'
  ];

  let urlToParse = location.search;
  const params = new URLSearchParams(urlToParse);
  console.log(params.get('note'));
  let nevent = params.get('note');

  // Decode nevent to note if present in URL
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

  let json9735List = [];
  let songQueue = [];
  let currentlyPlaying = null;
  let playedSongs = [];
  let isPlaying = false;
  let currentVideoPlayer = null;
  let songTimer = null;

  // YouTube Player API variables
  let youtubePlayer = null;
  let playerReady = false;
  let currentVideoId = null;
  let videoDuration = 0;
  let videoProgress = 0;
  let progressUpdateInterval = null;

  // Global variables for caching and tracking
  let searchResultCache = new Map();
  let processedZaps = new Set();
  let allZapsLoaded = false;
  let zapQueue = [];
  let currentTopZap = null;

  // Style options URL parameters
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

  // DOM Elements for style options
  const liveElement = document.querySelector('.jukebox');
  const qrCode = document.getElementById('qrCode');
  const bgImageUrl = document.getElementById('bgImageUrl');
  const bgImagePreview = document.getElementById('bgImagePreview');
  const clearBgImage = document.getElementById('clearBgImage');
  const liveZapOverlay = document.querySelector('.liveZapOverlay');
  const qrInvertToggle = document.getElementById('qrInvertToggle');
  const qrScreenBlendToggle = document.getElementById('qrScreenBlendToggle');
  const qrMultiplyBlendToggle = document.getElementById(
    'qrMultiplyBlendToggle'
  );
  const layoutInvertToggle = document.getElementById('layoutInvertToggle');
  const hideZapperContentToggle = document.getElementById(
    'hideZapperContentToggle'
  );

  // Jukebox specific elements
  const currentVideo = document.getElementById('currentVideo');
  const currentSongInfo = document.getElementById('currentSongInfo');
  const songQueueElement = document.getElementById('songQueue');
  const playedSongsElement = document.getElementById('playedSongs');
  const queueCount = document.getElementById('queueCount');
  const playedCount = document.getElementById('playedCount');
  const queueStats = document.getElementById('queueStats');
  const skipSongBtn = document.getElementById('skipSong');
  // pausePlayBtn removed - YouTube player handles play/pause

  // Helper functions for color handling
  function isValidHexColor(color) {
    return /^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/.test(color);
  }

  function toHexColor(color) {
    // If it's already a valid hex, return it
    if (isValidHexColor(color)) {
      return color.toLowerCase();
    }

    // Try to parse as RGB/RGBA
    if (color.startsWith('rgb')) {
      const rgb = color.match(/\d+/g);
      if (rgb && rgb.length >= 3) {
        const r = parseInt(rgb[0]).toString(16).padStart(2, '0');
        const g = parseInt(rgb[1]).toString(16).padStart(2, '0');
        const b = parseInt(rgb[2]).toString(16).padStart(2, '0');
        return `#${r}${g}${b}`;
      }
    }

    // If we can't convert, return the default color
    return DEFAULT_STYLES.textColor;
  }

  function updateStyleURL() {
    const currentParams = new URLSearchParams(window.location.search);
    const mainLayout = document.querySelector('.main-layout');

    // Only add parameters that differ from defaults
    const currentTextColor = toHexColor(mainLayout.style.color);
    if (currentTextColor !== DEFAULT_STYLES.textColor) {
      currentParams.set('textColor', currentTextColor);
    } else {
      currentParams.delete('textColor');
    }

    const currentBgColor = toHexColor(mainLayout.style.backgroundColor);
    if (currentBgColor !== DEFAULT_STYLES.bgColor) {
      currentParams.set('bgColor', currentBgColor);
    } else {
      currentParams.delete('bgColor');
    }

    if (bgImageUrl.value !== DEFAULT_STYLES.bgImage) {
      currentParams.set('bgImage', bgImageUrl.value);
    } else {
      currentParams.delete('bgImage');
    }

    const qrCodeContainer = document.getElementById('qrCode');

    if (
      qrCodeContainer &&
      qrCodeContainer.style.filter !==
        (DEFAULT_STYLES.qrInvert ? 'invert(1)' : 'none')
    ) {
      currentParams.set('qrInvert', qrInvertToggle.checked);
    } else {
      currentParams.delete('qrInvert');
    }

    if (
      qrCodeContainer &&
      qrCodeContainer.style.mixBlendMode !==
        (DEFAULT_STYLES.qrScreenBlend
          ? 'screen'
          : DEFAULT_STYLES.qrMultiplyBlend
            ? 'multiply'
            : 'normal')
    ) {
      if (qrScreenBlendToggle.checked) {
        currentParams.set('qrBlend', 'screen');
      } else if (qrMultiplyBlendToggle.checked) {
        currentParams.set('qrBlend', 'multiply');
      } else {
        currentParams.delete('qrBlend');
      }
    } else {
      currentParams.delete('qrBlend');
    }

    if (
      document.body.classList.contains('flex-direction-invert') !==
      DEFAULT_STYLES.layoutInvert
    ) {
      currentParams.set('layoutInvert', layoutInvertToggle.checked);
    } else {
      currentParams.delete('layoutInvert');
    }

    if (
      document.body.classList.contains('hide-zapper-content') !==
      DEFAULT_STYLES.hideZapperContent
    ) {
      currentParams.set('hideZapperContent', hideZapperContentToggle.checked);
    } else {
      currentParams.delete('hideZapperContent');
    }

    // Update URL without reloading the page
    const newUrl =
      window.location.pathname +
      (currentParams.toString() ? '?' + currentParams.toString() : '');
    window.history.replaceState({}, '', newUrl);
  }

  function applyStylesFromURL() {
    const mainLayout = document.querySelector('.main-layout');

    // Apply default background color if no custom color is specified
    if (!params.has('bgColor')) {
      const defaultColor = DEFAULT_STYLES.bgColor;
      const rgbaColor = hexToRgba(defaultColor, 0.5);
      mainLayout.style.backgroundColor = rgbaColor;
      document.getElementById('bgColorPicker').value = defaultColor;
      document.getElementById('bgColorValue').value = defaultColor;
    }

    // Apply text color
    if (params.has('textColor')) {
      const color = toHexColor(params.get('textColor'));
      mainLayout.style.setProperty('--text-color', color);

      // Also specifically override zaps header elements that have hardcoded colors (if they exist)
      const zapsHeaderH2 = mainLayout.querySelector('.zaps-header-left h2');
      const totalLabel = mainLayout.querySelector('.total-label');
      const totalSats = mainLayout.querySelector('.total-sats');

      if (zapsHeaderH2) zapsHeaderH2.style.color = color;
      if (totalLabel) totalLabel.style.color = color;
      if (totalSats) totalSats.style.color = color;

      document.getElementById('textColorPicker').value = color;
      document.getElementById('textColorValue').value = color;
    }

    // Apply background color
    if (params.has('bgColor')) {
      const color = toHexColor(params.get('bgColor'));
      const rgbaColor = hexToRgba(color, 0.5);
      mainLayout.style.backgroundColor = rgbaColor;
      document.getElementById('bgColorPicker').value = color;
      document.getElementById('bgColorValue').value = color;
    }

    // Apply background image
    if (params.has('bgImage')) {
      const imageUrl = params.get('bgImage');
      bgImageUrl.value = imageUrl;
      updateBackgroundImage(imageUrl);
    }

    // Apply default QR code blend mode if no custom blend is specified
    if (!params.has('qrBlend')) {
      const qrCodeContainer = document.getElementById('qrCode');
      if (qrCodeContainer) {
        if (DEFAULT_STYLES.qrScreenBlend) {
          qrCodeContainer.style.mixBlendMode = 'screen';
          qrScreenBlendToggle.checked = true;
        } else if (DEFAULT_STYLES.qrMultiplyBlend) {
          qrCodeContainer.style.mixBlendMode = 'multiply';
          qrMultiplyBlendToggle.checked = true;
        }
      }
    } else {
      const qrCodeContainer = document.getElementById('qrCode');
      if (qrCodeContainer) {
        const blendMode = params.get('qrBlend');
        if (blendMode === 'screen') {
          qrCodeContainer.style.mixBlendMode = 'screen';
          qrScreenBlendToggle.checked = true;
        } else if (blendMode === 'multiply') {
          qrCodeContainer.style.mixBlendMode = 'multiply';
          qrMultiplyBlendToggle.checked = true;
        }
      }
    }

    // Apply QR invert
    if (params.has('qrInvert')) {
      const qrCodeContainer = document.getElementById('qrCode');
      if (qrCodeContainer) {
        const shouldInvert = params.get('qrInvert') === 'true';
        qrCodeContainer.style.filter = shouldInvert ? 'invert(1)' : 'none';
        qrInvertToggle.checked = shouldInvert;
      }
    } else {
      const qrCodeContainer = document.getElementById('qrCode');
      if (qrCodeContainer) {
        if (DEFAULT_STYLES.qrInvert) {
          qrCodeContainer.style.filter = 'invert(1)';
          qrInvertToggle.checked = true;
        }
      }
    }

    // Apply layout inversion
    if (params.has('layoutInvert')) {
      const shouldInvert = params.get('layoutInvert') === 'true';
      document.body.classList.toggle('flex-direction-invert', shouldInvert);
      layoutInvertToggle.checked = shouldInvert;
    } else {
      if (DEFAULT_STYLES.layoutInvert) {
        document.body.classList.add('flex-direction-invert');
        layoutInvertToggle.checked = true;
      }
    }

    // Apply hide zapper content
    if (params.has('hideZapperContent')) {
      const shouldHide = params.get('hideZapperContent') === 'true';
      document.body.classList.toggle('hide-zapper-content', shouldHide);
      hideZapperContentToggle.checked = shouldHide;
    } else {
      if (DEFAULT_STYLES.hideZapperContent) {
        document.body.classList.add('hide-zapper-content');
        hideZapperContentToggle.checked = true;
      }
    }
  }

  // Helper function to convert hex color to rgba with transparency
  function hexToRgba(hex, alpha) {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }

  // YouTube Player API initialization
  function onYouTubeIframeAPIReady() {
    console.log('YouTube IFrame API ready');
    createYouTubePlayer();
  }

  function createYouTubePlayer() {
    youtubePlayer = new YT.Player('currentVideo', {
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
  }

  function onPlayerReady(event) {
    console.log('YouTube player ready');
    playerReady = true;

    // Set initial volume
    if (youtubePlayer) {
      youtubePlayer.setVolume(50); // Default to 50%

      // Try to unmute if the player is muted (required for autoplay in some browsers)
      if (youtubePlayer.isMuted()) {
        console.log('Player was muted, attempting to unmute');
        youtubePlayer.unMute();
      }
    }

    // Enable player controls
    if (currentlyPlaying) {
      loadVideo(currentlyPlaying.songInfo.videoId);
    }
  }

  function onPlayerStateChange(event) {
    const state = event.data;
    console.log('Player state changed:', state);

    switch (state) {
      case YT.PlayerState.PLAYING:
        isPlaying = true;
        startProgressTracking();
        break;
      case YT.PlayerState.PAUSED:
        isPlaying = false;
        stopProgressTracking();
        break;
      case YT.PlayerState.ENDED:
        console.log('Video ended, playing next song');
        playNextSong();
        break;
      case YT.PlayerState.BUFFERING:
        console.log('Video buffering...');
        break;
      case YT.PlayerState.CUED:
        console.log('Video cued, attempting to play');
        // When video is cued, try to play it
        setTimeout(() => {
          if (youtubePlayer && !isPlaying) {
            console.log('Video cued, forcing play');
            youtubePlayer.playVideo();
          }
        }, 500);
        break;
    }
  }

  function onPlayerError(event) {
    console.error('YouTube player error:', event.data);

    // Show error message to user
    const currentVideo = document.getElementById('currentVideo');
    if (currentVideo) {
      currentVideo.innerHTML = `
                <div class="video-error">
                    <div class="error-icon">⚠️</div>
                    <div class="error-text">Video Error</div>
                    <div class="error-subtext">Error code: ${event.data}</div>
                    <button onclick="playNextSong()" class="control-button">Skip to Next Song</button>
                </div>
            `;
    }

    // Try to play next song on error after a delay
    setTimeout(() => {
      if (currentlyPlaying) {
        console.log('Attempting to play next song due to error');
        playNextSong();
      }
    }, 5000);
  }

  function loadVideo(videoId) {
    if (!playerReady || !youtubePlayer) {
      console.log('Player not ready, queuing video load');
      setTimeout(() => loadVideo(videoId), 1000);
      return;
    }

    if (currentVideoId === videoId) {
      console.log('Video already loaded, playing');
      youtubePlayer.playVideo();
      return;
    }

    console.log('Loading video:', videoId);
    currentVideoId = videoId;

    // Try cueVideoById first (better autoplay support)
    try {
      youtubePlayer.cueVideoById({
        videoId: videoId,
        startSeconds: 0,
        suggestedQuality: 'medium'
      });
    } catch (e) {
      console.log('cueVideoById failed, falling back to loadVideoById');
      youtubePlayer.loadVideoById(videoId);
    }

    // Auto-play the video after it loads (multiple attempts for browser compatibility)
    setTimeout(() => {
      console.log('Attempting to auto-play video (attempt 1)');
      youtubePlayer.playVideo();
    }, 1000);

    // Second attempt after 2 seconds
    setTimeout(() => {
      console.log('Attempting to auto-play video (attempt 2)');
      youtubePlayer.playVideo();
    }, 2000);

    // Third attempt after 3 seconds
    setTimeout(() => {
      console.log('Attempting to auto-play video (attempt 3)');
      youtubePlayer.playVideo();
    }, 3000);

    // Get video duration after loading
    setTimeout(() => {
      if (youtubePlayer && youtubePlayer.getDuration) {
        videoDuration = youtubePlayer.getDuration();
        console.log('Video duration:', videoDuration);
      }
    }, 2000);
  }

  function startProgressTracking() {
    if (progressUpdateInterval) {
      clearInterval(progressUpdateInterval);
    }

    progressUpdateInterval = setInterval(() => {
      if (youtubePlayer && isPlaying) {
        videoProgress = youtubePlayer.getCurrentTime();
        // Update progress display if needed
        updateProgressDisplay();
      }
    }, 1000);
  }

  function stopProgressTracking() {
    if (progressUpdateInterval) {
      clearInterval(progressUpdateInterval);
      progressUpdateInterval = null;
    }
  }

  function updateProgressDisplay() {
    if (!videoDuration || videoDuration <= 0) return;

    const progressPercent = (videoProgress / videoDuration) * 100;
    const progressBar = document.getElementById('videoProgressBar');
    const currentTimeSpan = document.getElementById('currentTime');
    const totalTimeSpan = document.getElementById('totalTime');
    const progressContainer = document.getElementById('videoProgressContainer');

    if (progressBar && currentTimeSpan && totalTimeSpan && progressContainer) {
      // Update progress bar
      progressBar.style.width = `${progressPercent}%`;

      // Update time displays
      currentTimeSpan.textContent = formatTime(videoProgress);
      totalTimeSpan.textContent = formatTime(videoDuration);

      // Show progress container when video is playing
      if (isPlaying && currentlyPlaying) {
        progressContainer.style.display = 'block';
      }
    }
  }

  // toggleMute and updateVolume functions removed - YouTube player handles this

  function formatTime(seconds) {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = Math.floor(seconds % 60);
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
  }

  // Function to get YouTube video info using oEmbed (no API key required)
  async function searchYouTubeVideo(searchTerm) {
    // Validate search term before proceeding
    if (
      !searchTerm ||
      typeof searchTerm !== 'string' ||
      searchTerm.trim().length === 0
    ) {
      console.log(
        'searchYouTubeVideo: Invalid or empty search term:',
        searchTerm
      );
      return null;
    }

    const trimmedTerm = searchTerm.trim();
    if (trimmedTerm.length < 2) {
      console.log('searchYouTubeVideo: Search term too short:', trimmedTerm);
      return null;
    }

    // Check cache first
    if (searchResultCache.has(trimmedTerm)) {
      console.log('Using cached result for:', trimmedTerm);
      return searchResultCache.get(trimmedTerm);
    }

    try {
      // Check if it's already a YouTube URL
      if (
        trimmedTerm.includes('youtube.com/watch?v=') ||
        trimmedTerm.includes('youtu.be/')
      ) {
        console.log('Search term is a YouTube URL, extracting video info...');
        const response = await fetch(
          `/youtube/search?q=${encodeURIComponent(trimmedTerm)}`
        );

        if (!response.ok) {
          const errorData = await response.json();
          console.error('YouTube oEmbed error:', errorData);
          return null;
        }

        const data = await response.json();

        // Cache the result
        searchResultCache.set(trimmedTerm, data);

        console.log(`YouTube video info retrieved via oEmbed: ${data.title}`);
        return data;
      } else if (/^[a-zA-Z0-9_-]{11}$/.test(trimmedTerm)) {
        // Check if it's a YouTube video ID (11 characters, alphanumeric + underscore + hyphen)
        console.log(
          'Search term appears to be a YouTube video ID:',
          trimmedTerm
        );

        // Create a YouTube URL from the ID and fetch oEmbed data
        const youtubeUrl = `https://www.youtube.com/watch?v=${trimmedTerm}`;
        const response = await fetch(
          `/youtube/search?q=${encodeURIComponent(youtubeUrl)}`
        );

        if (!response.ok) {
          const errorData = await response.json();
          console.error('YouTube oEmbed error for video ID:', errorData);
          return null;
        }

        const data = await response.json();

        // Cache the result
        searchResultCache.set(trimmedTerm, data);

        console.log(
          `YouTube video info retrieved via oEmbed for video ID: ${data.title}`
        );
        return data;
      } else {
        // For search terms, create a search result that shows the search term
        console.log('Search term provided, creating search result display');
        const searchResult = {
          type: 'search',
          searchTerm: trimmedTerm,
          videoId: null,
          title: `Search: "${trimmedTerm}"`,
          channelTitle: 'YouTube Search',
          searchUrl: `https://www.youtube.com/results?search_query=${encodeURIComponent(trimmedTerm)}`
        };

        // Cache the result
        searchResultCache.set(trimmedTerm, searchResult);

        return searchResult;
      }
    } catch (error) {
      console.error('Error processing YouTube request:', error);
      return null;
    }
  }

  // Function to load note and start jukebox
  async function loadNoteAndStartJukebox(noteId) {
    try {
      // Hide the note loader and show the main layout
      document.getElementById('noteLoaderContainer').style.display = 'none';
      document.getElementById('mainLayout').style.display = 'grid';

      // Decode note ID to get the actual event ID
      let eventId;
      try {
        const decoded = NostrTools.nip19.decode(noteId);
        if (decoded.type === 'note') {
          eventId = decoded.data;
        } else {
          throw new Error('Invalid note format');
        }
      } catch (e) {
        console.error('Error decoding note:', e);
        alert('Invalid note ID format. Please use a valid note1... ID.');
        return;
      }

      console.log('Loading note with event ID:', eventId);

      // Subscribe to the specific note
      pool.subscribeMany(
        relays,
        [
          {
            ids: [eventId]
          }
        ],
        {
          onevent(event) {
            console.log('Received note event:', event);
            displayNoteContent(event);

            // Now subscribe to zaps for this note
            subscribeToZaps(eventId);

            // Also check if we need to start playback after a short delay
            setTimeout(() => {
              console.log(
                'Note loaded, checking if we should start playback. Queue length:',
                songQueue.length
              );
              if (songQueue.length > 0 && !currentlyPlaying) {
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
        if (!document.getElementById('noteContent').textContent) {
          alert('Note not found. Please check the note ID and try again.');
          document.getElementById('noteLoaderContainer').style.display =
            'block';
          document.getElementById('mainLayout').style.display = 'none';
        }
      }, 10000);
    } catch (error) {
      console.error('Error loading note:', error);
      alert('Error loading note: ' + error.message);
    }
  }

  // Function to display note content
  function displayNoteContent(event) {
    const noteContent = document.getElementById('noteContent');
    const authorName = document.getElementById('authorName');
    const authorNameProfileImg = document.getElementById(
      'authorNameProfileImg'
    );

    // Process content for both images and nostr mentions
    processNoteContent(event.content)
      .then(processedContent => {
        noteContent.innerHTML = processedContent;
      })
      .catch(error => {
        console.error('Error processing note content:', error);
        // Fallback to plain text if processing fails
        noteContent.textContent = event.content;
      });

    // Fetch and display author profile information
    fetchAuthorProfile(event.pubkey);

    // Generate QR code for zapping
    generateQRCode(event.id);
  }

  // Function to generate QR code
  function generateQRCode(eventId) {
    const qrCode = document.getElementById('qrCode');
    const qrcodeLinkNostr = document.getElementById('qrcodeLinkNostr');

    // Create zap request URL - use njump.me instead of nostr: scheme
    const zapRequest = `https://njump.me/${NostrTools.nip19.noteEncode(eventId)}`;

    // Generate QR code
    const qr = new QRious({
      element: qrCode,
      value: zapRequest,
      size: 200,
      level: 'M'
    });

    // Set link
    qrcodeLinkNostr.href = zapRequest;
  }

  // Function to fetch author profile information
  async function fetchAuthorProfile(authorPubkey) {
    try {
      console.log('Fetching author profile for pubkey:', authorPubkey);

      // Subscribe to the author's profile (kind 0)
      pool.subscribeMany(
        relays,
        [
          {
            kinds: [0],
            authors: [authorPubkey]
          }
        ],
        {
          onevent(profileEvent) {
            console.log('Received author profile event:', profileEvent);
            updateAuthorInfo(profileEvent);
          },
          oneose() {
            console.log('Author profile subscription EOS');
          },
          onclosed() {
            console.log('Author profile subscription closed');
          }
        }
      );

      // Set a timeout in case the profile doesn't exist
      setTimeout(() => {
        const authorName = document.getElementById('authorName');
        if (authorName.textContent === 'Author') {
          console.log('Author profile not found, using fallback');
          // Use a fallback name based on the pubkey
          const npub = NostrTools.nip19.npubEncode(authorPubkey);
          authorName.textContent =
            npub.substring(0, 8) + '...' + npub.substring(npub.length - 8);
        }
      }, 5000);
    } catch (error) {
      console.error('Error fetching author profile:', error);
    }
  }

  // Function to update author information display
  function updateAuthorInfo(profileEvent) {
    try {
      const authorContent = JSON.parse(profileEvent.content);
      const authorName = document.getElementById('authorName');
      const authorNameProfileImg = document.getElementById(
        'authorNameProfileImg'
      );

      // Update author name
      let displayName =
        authorContent.displayName ||
        authorContent.display_name ||
        authorContent.name;
      if (displayName) {
        authorName.textContent = displayName;
      }

      // Update author profile image
      if (authorContent.picture) {
        authorNameProfileImg.src = authorContent.picture;
      }

      console.log('Updated author info:', {
        name: displayName,
        picture: authorContent.picture
      });
    } catch (error) {
      console.error('Error updating author info:', error);
    }
  }

  // Function to process note content (mentions, images, etc.)
  async function processNoteContent(content) {
    // First process images
    let processedContent = await replaceImages(content);
    // Then process nostr mentions
    processedContent = await replaceNostrMentions(processedContent);
    return processedContent;
  }

  // Function to replace images in content
  async function replaceImages(content) {
    if (!content) return '';

    const images = parseImages(content);
    if (images.length === 0) return content;

    // Sort images by index in reverse order to avoid index shifting during replacement
    images.sort((a, b) => b.index - a.index);

    let processedContent = content;

    for (const image of images) {
      const replacement = `<img src="${image.url}" class="note-image" alt="Note image" loading="lazy" />`;
      processedContent =
        processedContent.slice(0, image.index) +
        replacement +
        processedContent.slice(image.index + image.fullMatch.length);
    }

    return processedContent;
  }

  // Function to parse images from content
  function parseImages(content) {
    // Match both markdown image syntax and raw URLs
    const imageRegex =
      /(?:!\[.*?\]\((.*?)\))|(https?:\/\/\S+\.(?:jpg|jpeg|png|gif|webp)(?:\?[^\s]*)?)/gi;
    const images = [];
    let match;

    while ((match = imageRegex.exec(content)) !== null) {
      const [fullMatch, markdownUrl, rawUrl] = match;
      const imageUrl = markdownUrl || rawUrl;
      if (imageUrl) {
        images.push({
          url: imageUrl,
          fullMatch,
          index: match.index
        });
      }
    }

    return images;
  }

  // Function to replace nostr mentions in content
  async function replaceNostrMentions(content) {
    if (!content) return '';

    const mentions = parseNostrMentions(content);
    if (mentions.length === 0) return content;

    // Sort mentions by index in reverse order to avoid index shifting during replacement
    mentions.sort((a, b) => b.index - a.index);

    let processedContent = content;
    const processedMentions = new Map(); // Cache for profile lookups

    for (const mention of mentions) {
      let profile;
      if (!processedMentions.has(mention.pubkey)) {
        profile = await lookupProfile(mention.pubkey);
        processedMentions.set(mention.pubkey, profile);
      } else {
        profile = processedMentions.get(mention.pubkey);
      }

      if (profile) {
        try {
          const profileData = JSON.parse(profile.content);
          const displayName =
            profileData.displayName || profileData.display_name;
          const name = displayName || profileData.name || 'Unknown';
          const npub = NostrTools.nip19.npubEncode(mention.pubkey);
          const replacement = `<a href="https://njump.me/${npub}" target="_blank" class="nostr-mention">@${name}</a>`;
          processedContent =
            processedContent.slice(0, mention.index) +
            replacement +
            processedContent.slice(mention.index + mention.fullMatch.length);
        } catch (e) {
          console.log('Error processing profile data:', e);
        }
      }
    }

    return processedContent;
  }

  // Function to parse nostr mentions from content
  function parseNostrMentions(content) {
    // Match both nostr: and raw npub/nprofile formats
    const nostrRegex = /(?:nostr:)?((?:npub|nprofile)[a-zA-Z0-9]+)/g;
    const mentions = [];
    let match;

    while ((match = nostrRegex.exec(content)) !== null) {
      const [fullMatch, encoded] = match;
      try {
        // Use the encoded part without the nostr: prefix for decoding
        const decoded = NostrTools.nip19.decode(encoded);

        if (decoded.type === 'npub') {
          mentions.push({
            type: 'npub',
            pubkey: decoded.data,
            fullMatch,
            index: match.index
          });
        } else if (decoded.type === 'nprofile') {
          mentions.push({
            type: 'nprofile',
            pubkey: decoded.data.pubkey,
            fullMatch,
            index: match.index
          });
        }
      } catch (e) {
        console.log(
          'Error decoding nostr mention:',
          e,
          'for match:',
          fullMatch
        );
      }
    }

    return mentions;
  }

  // Function to lookup profile information
  async function lookupProfile(pubkey) {
    return new Promise(resolve => {
      const sub = pool.subscribeMany(
        [...relays],
        [
          {
            kinds: [0],
            authors: [pubkey]
          }
        ],
        {
          onevent(kind0) {
            resolve(kind0);
            sub.close();
          },
          oneose() {
            resolve(null);
            sub.close();
          }
        }
      );
    });
  }

  // Function to subscribe to zaps
  function subscribeToZaps(eventId) {
    console.log('Subscribing to zaps for event:', eventId);

    // Flag to track if we're still in initial loading phase
    let initialLoadingComplete = false;

    pool.subscribeMany(
      relays,
      [
        {
          kinds: [9735], // Zap events
          '#e': [eventId] // Zaps for this specific note
        }
      ],
      {
        onevent(event) {
          console.log('Received zap event:', event);
          // Pass the loading state to processZapEvent
          processZapEvent(event, initialLoadingComplete);
        },
        oneose() {
          console.log('Zaps subscription EOS');
          // Mark initial loading as complete
          initialLoadingComplete = true;

          // After all zaps are loaded, ensure playback starts automatically
          setTimeout(() => {
            console.log(
              'Zaps EOS - checking if we should start playback. Queue length:',
              songQueue.length,
              'isPlaying:',
              isPlaying,
              'currentlyPlaying:',
              currentlyPlaying
            );

            // Only start playback if nothing is currently playing
            if (songQueue.length > 0 && !currentlyPlaying) {
              console.log(
                'Starting playback after zaps loaded - no song currently playing'
              );
              playNextSong();
            } else if (songQueue.length > 0 && currentlyPlaying && !isPlaying) {
              console.log(
                'Resuming playback after zaps loaded - song exists but not playing'
              );
              // Don't call playNextSong() - just resume the current song
              if (playerReady && youtubePlayer) {
                youtubePlayer.playVideo();
                isPlaying = true;
              }
            } else if (songQueue.length > 0 && currentlyPlaying && isPlaying) {
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
  }

  // Function to process zap events
  async function processZapEvent(event, initialLoadingComplete = false) {
    try {
      // Parse the zap event
      const description = event.tags.find(tag => tag[0] === 'description');
      if (!description) return;

      const zapData = JSON.parse(description[1]);
      const bolt11 = event.tags.find(tag => tag[0] === 'bolt11');
      if (!bolt11) return;

      const decodedBolt11 = lightningPayReq.decode(bolt11[1]);
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
        pool.subscribeMany(
          relays,
          [
            {
              kinds: [0],
              authors: [zapData.pubkey] // Use zapper's pubkey from kind 9734
            }
          ],
          {
            async onevent(profileEvent) {
              const profile = JSON.parse(profileEvent.content);
              zapperName = profile.display_name || profile.name || 'Unknown';
              zapperPicture = profile.picture || '/images/gradient_color.gif';

              console.log('Found zapper profile:', {
                pubkey: zapperPubkey,
                name: zapperName,
                picture: zapperPicture
              });

              // Add zap to the list
              const zapInfo = {
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
            },
            onclosed() {
              console.log('Profile subscription closed');
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
            const zapInfo = {
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
        const zapInfo = {
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
  }

  // Function to add zap to the zaps list
  function addToZapsList(zapInfo) {
    // Only add zaps with valid YouTube content to the display list
    if (zapInfo.songInfo && zapInfo.songInfo.type === 'youtube') {
      // Check if this zap is already in the list to avoid duplicates
      const existingZap = json9735List.find(
        zap =>
          zap.pubkey === zapInfo.pubkey &&
          zap.amount === zapInfo.amount &&
          zap.kind9735content === zapInfo.kind9735content
      );

      if (!existingZap) {
        json9735List.push(zapInfo);
        json9735List.sort((a, b) => b.amount - a.amount);

        // Only update display if zaps elements exist
        const zapsContainer = document.getElementById('zaps');
        const totalValue = document.getElementById('zappedTotalValue');

        if (zapsContainer && totalValue) {
          drawKinds9735(json9735List);
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
  }

  // Jukebox specific functions
  async function extractYouTubeInfo(zapContent) {
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
  }

  async function addToQueue(zapData) {
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

    songQueue.push(queueItem);
    songQueue.sort((a, b) => b.amount - a.amount); // Sort by zap amount (highest first)
    updateQueueDisplay();
    updateStats();

    console.log(
      `Added YouTube song to queue. Queue length: ${songQueue.length}, isPlaying: ${isPlaying}, currentlyPlaying: ${currentlyPlaying ? 'yes' : 'no'}`
    );
    console.log(`Song info:`, songInfo);

    // Always try to start playback if we have songs and nothing is currently playing
    if (!currentlyPlaying) {
      console.log(
        'No song currently playing, starting playback immediately...'
      );
      playNextSong();
    } else if (!isPlaying && songQueue.length > 0) {
      console.log('Song exists but not playing, starting playback...');
      playNextSong();
    } else if (songQueue.length === 1) {
      // If this is the first song being added, ensure it starts
      console.log('First song added, ensuring playback starts...');
      playNextSong();
    }
  }

  // Silent version for loading existing zaps without auto-starting playback
  async function addToQueueSilently(zapData) {
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

    songQueue.push(queueItem);
    songQueue.sort((a, b) => b.amount - a.amount); // Sort by zap amount (highest first)
    updateQueueDisplay();
    updateStats();

    console.log(
      `Silently added YouTube song to queue. Queue length: ${songQueue.length}`
    );
    console.log(`Song info:`, songInfo);
    console.log(`Full songQueue after adding:`, songQueue);

    // Check if this is the first song added and we should start playback
    if (songQueue.length === 1) {
      console.log('First song added to queue, setting up playback...');
      // Set a flag to indicate all zaps are loaded
      allZapsLoaded = true;
      // Populate zapQueue with the songs that are already in songQueue
      songQueue.forEach(song => {
        zapQueue.push({
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
  }

  function playNextSong() {
    console.log(
      `playNextSong called. Queue length: ${songQueue.length}, isPlaying: ${isPlaying}, currentlyPlaying: ${currentlyPlaying ? 'yes' : 'no'}`
    );

    if (songQueue.length === 0) {
      console.log('No songs in queue, stopping playback');
      isPlaying = false;
      currentlyPlaying = null;

      // Clean up current video
      if (playerReady && youtubePlayer) {
        youtubePlayer.stopVideo();
        stopProgressTracking();
      }

      updateCurrentVideoDisplay();
      return;
    }

    // Safety check: if we're already playing something, stop it first
    if (currentlyPlaying && isPlaying) {
      console.log('Stopping current song before playing next');
      if (playerReady && youtubePlayer) {
        youtubePlayer.stopVideo();
        stopProgressTracking();
      }
      isPlaying = false;
    }

    const nextSong = songQueue.shift();
    console.log(
      `Playing next song: ${nextSong.songInfo.originalContent}, amount: ${nextSong.amount} sats`
    );
    console.log('Next song object:', nextSong);
    console.log('Next song songInfo:', nextSong.songInfo);
    currentlyPlaying = nextSong;
    isPlaying = true;

    // Clean up previous video
    if (playerReady && youtubePlayer) {
      youtubePlayer.stopVideo();
      stopProgressTracking();
    }

    // Add to played songs history
    playedSongs.unshift({
      ...nextSong,
      playedAt: Date.now()
    });

    // Keep only last 20 played songs for performance
    if (playedSongs.length > 20) {
      playedSongs.pop();
    }

    updateCurrentVideoDisplay();
    updateQueueDisplay();
    updatePlayedSongsDisplay();
    updateStats();

    // Start song timer (5 minutes default)
    startSongTimer();

    // Enable player controls
    skipSongBtn.disabled = false;
  }

  function startSongTimer() {
    // Clear existing timer
    if (songTimer) {
      clearTimeout(songTimer);
    }

    // Set timer for 5 minutes (300000ms)
    songTimer = setTimeout(
      () => {
        if (currentlyPlaying && isPlaying) {
          console.log('Song timer expired, advancing to next song');
          playNextSong();
        }
      },
      5 * 60 * 1000
    );
  }

  function updateCurrentVideoDisplay() {
    const progressContainer = document.getElementById('videoProgressContainer');

    console.log('updateCurrentVideoDisplay called with:', {
      currentlyPlaying: currentlyPlaying,
      isPlaying: isPlaying,
      songQueueLength: songQueue.length
    });

    if (!currentlyPlaying) {
      console.log('No song currently playing, checking queue...');

      // If we have songs in queue but nothing is playing, show queue status instead of no-video message
      if (songQueue.length > 0) {
        console.log(
          'Songs in queue but nothing playing, showing queue status...'
        );
        currentVideo.innerHTML = `
                    <div class="queue-status-message">
                        <div class="queue-status-icon">📋</div>
                        <div class="queue-status-text">${songQueue.length} song${songQueue.length > 1 ? 's' : ''} in queue</div>
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

    const songInfo = currentlyPlaying.songInfo;
    console.log('Song info for display:', songInfo);

    if (songInfo.type === 'youtube') {
      console.log('Displaying YouTube video:', songInfo.videoId);
      // Use YouTube Player API instead of iframe
      if (playerReady && youtubePlayer) {
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
                    <strong>🎤 Requested by:</strong> ${currentlyPlaying.kind1Name || 'Unknown'}
                </div>
                <div class="song-zap-amount">
                    <strong>⚡ Zap amount:</strong> ${currentlyPlaying.amount} sats
                </div>
                <div class="song-request-time">
                    <strong>🕐 Requested:</strong> ${new Date(currentlyPlaying.timestamp).toLocaleTimeString()}
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
  }

  function updateQueueDisplay() {
    if (songQueue.length === 0) {
      songQueueElement.innerHTML =
        '<div class="empty-queue">🎵 No songs in queue</div>';
      return;
    }

    songQueueElement.innerHTML = songQueue
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
  }

  function updatePlayedSongsDisplay() {
    if (playedSongs.length === 0) {
      playedSongsElement.innerHTML =
        '<div class="empty-history">📚 No songs played yet</div>';
      return;
    }

    playedSongsElement.innerHTML = playedSongs
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
  }

  function updateStats() {
    queueCount.textContent = songQueue.length;
    playedCount.textContent = playedSongs.length;

    const queueTotal = songQueue.reduce((sum, item) => sum + item.amount, 0);
    const playedTotal = playedSongs.reduce((sum, item) => sum + item.amount, 0);

    queueStats.innerHTML = `
            <span class="queue-count">${songQueue.length} songs in queue</span>
            <span class="queue-total">Total: ${queueTotal} sats</span>
        `;
  }

  // Modified createkinds9735JSON function for jukebox
  async function createkinds9735JSON(kind9735List, kind0fromkind9735List) {
    for (let kind9735 of kind9735List) {
      const description9735 = JSON.parse(
        kind9735.tags.find(tag => tag[0] == 'description')[1]
      );
      const pubkey9735 = description9735.pubkey;
      const bolt119735 = kind9735.tags.find(tag => tag[0] == 'bolt11')[1];
      const amount9735 = lightningPayReq.decode(bolt119735).satoshis;
      const kind1from9735 = kind9735.tags.find(tag => tag[0] == 'e')[1];
      const kind9735id = NostrTools.nip19.noteEncode(kind9735.id);
      const kind9735Content = description9735.content;
      console.log(kind9735);
      let kind0picture = '';
      let kind0npub = '';
      let kind0name = '';
      let kind0finalName = '';
      const kind0fromkind9735 = kind0fromkind9735List.find(
        kind0 => pubkey9735 === kind0.pubkey
      );
      if (kind0fromkind9735) {
        const displayName = JSON.parse(kind0fromkind9735.content).displayName;
        kind0name = displayName
          ? JSON.parse(kind0fromkind9735.content).displayName
          : JSON.parse(kind0fromkind9735.content).display_name;
        kind0finalName =
          kind0name != ''
            ? kind0name
            : JSON.parse(kind0fromkind9735.content).name;
        console.log(kind0finalName);
        kind0picture = JSON.parse(kind0fromkind9735.content).picture;
        kind0npub = NostrTools.nip19.npubEncode(kind0fromkind9735.pubkey);
      }
      const json9735 = {
        e: kind1from9735,
        amount: amount9735,
        picture: kind0picture,
        npubPayer: kind0npub,
        pubKey: pubkey9735,
        zapEventID: kind9735id,
        kind9735content: kind9735Content,
        kind1Name: kind0finalName
      };
      json9735List.push(json9735);
    }
    json9735List.sort((a, b) => b.amount - a.amount);
    drawKinds9735(json9735List);

    // Process new zaps for jukebox (but don't start playback yet)
    console.log(
      'Processing',
      json9735List.length,
      'existing zaps for jukebox queue...'
    );

    // Instead of processing every zap, just collect them and process only the top one
    for (let zap of json9735List) {
      // Create a unique identifier for this zap to avoid duplicate processing
      const zapIdentifier = `${zap.pubKey}-${zap.amount}-${zap.kind9735content}`;

      if (!processedZaps.has(zapIdentifier)) {
        processedZaps.add(zapIdentifier);

        // Add to zap queue without making YouTube API calls
        const zapData = {
          content: zap.kind9735content,
          zapId: zapIdentifier,
          zapperName: zap.kind1Name || 'Unknown',
          zapperProfileImg: zap.picture || '/images/gradient_color.gif',
          zapAmount: zap.amount,
          zapTime: Date.now()
        };

        // Debug logging to see what content we're getting
        console.log('Adding zap to queue:', {
          content: zapData.content,
          contentLength: zapData.content ? zapData.content.length : 0,
          contentType: typeof zapData.content,
          zapId: zapData.zapId
        });

        zapQueue.push(zapData);
      } else {
        console.log('Skipping duplicate zap:', zapIdentifier);
      }
    }

    // Mark all zaps as loaded
    allZapsLoaded = true;

    // Now process only the top zap (highest amount) to minimize API calls
    await processTopZap();
  }

  function drawKinds9735(json9735List) {
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

    totalValue.textContent = totalSats;

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
  }

  // Player control functions
  function skipCurrentSong() {
    if (currentlyPlaying && isPlaying) {
      console.log('Skipping current song');

      // Stop YouTube player if available
      if (playerReady && youtubePlayer) {
        youtubePlayer.stopVideo();
        stopProgressTracking();
      }

      if (songTimer) {
        clearTimeout(songTimer);
      }
      playNextSong();
    }
  }

  // togglePausePlay function removed - YouTube player handles play/pause

  // Initialize the jukebox
  if (nevent) {
    // Load the note and start the jukebox
    console.log('Loading jukebox for note:', nevent);
    loadNoteAndStartJukebox(nevent);
  }

  // Setup event listeners
  document
    .getElementById('note1LoaderSubmit')
    .addEventListener('click', function () {
      const noteInput = document.getElementById('note1LoaderInput').value;
      if (noteInput) {
        window.location.href = window.location.pathname + '?note=' + noteInput;
      }
    });

  // Setup progress bar click event for seeking
  document.addEventListener('click', function (e) {
    if (
      e.target.classList.contains('progress-bar') ||
      e.target.classList.contains('progress-fill')
    ) {
      const progressBar = e.target.closest('.progress-bar');
      if (progressBar && playerReady && youtubePlayer && videoDuration > 0) {
        const rect = progressBar.getBoundingClientRect();
        const clickX = e.clientX - rect.left;
        const clickPercent = clickX / rect.width;
        const seekTime = clickPercent * videoDuration;

        console.log('Seeking to:', seekTime, 'seconds');
        youtubePlayer.seekTo(seekTime, true);
      }
    }
  });

  // Player control event listeners
  skipSongBtn.addEventListener('click', skipCurrentSong);

  // Volume control removed - YouTube player handles this

  // Setup style options
  setupStyleOptions();
  applyStylesFromURL();

  // Style options setup functions
  function setupStyleOptions() {
    // Setup both color pickers
    setupColorPicker('textColorPicker', 'textColorValue', 'color');
    setupColorPicker('bgColorPicker', 'bgColorValue', 'backgroundColor');

    // Background image functionality
    const bgImageUrl = document.getElementById('bgImageUrl');
    const bgImagePreview = document.getElementById('bgImagePreview');
    const clearBgImage = document.getElementById('clearBgImage');

    // Update background when URL changes
    bgImageUrl.addEventListener('input', function (e) {
      const url = e.target.value.trim();
      if (url) {
        // Test if the image loads
        const img = new Image();
        img.onload = function () {
          updateBackgroundImage(url);
          updateStyleURL();
        };
        img.onerror = function () {
          // If image fails to load, show error in preview
          bgImagePreview.src = '';
          bgImagePreview.alt = 'Failed to load image';
        };
        img.src = url;
      } else {
        updateBackgroundImage('');
        updateStyleURL();
      }
    });

    // Clear background image
    clearBgImage.addEventListener('click', function () {
      bgImageUrl.value = '';
      updateBackgroundImage('');
      updateStyleURL();
    });

    // QR Code toggles
    const qrInvertToggle = document.getElementById('qrInvertToggle');
    const qrScreenBlendToggle = document.getElementById('qrScreenBlendToggle');
    const qrMultiplyBlendToggle = document.getElementById(
      'qrMultiplyBlendToggle'
    );
    const layoutInvertToggle = document.getElementById('layoutInvertToggle');
    const hideZapperContentToggle = document.getElementById(
      'hideZapperContentToggle'
    );

    qrInvertToggle.addEventListener('change', function (e) {
      qrCode.style.filter = e.target.checked ? 'invert(1)' : 'none';
      updateStyleURL();
    });

    qrScreenBlendToggle.addEventListener('change', function (e) {
      if (e.target.checked) {
        qrMultiplyBlendToggle.checked = false;
      }
      updateBlendMode();
    });

    qrMultiplyBlendToggle.addEventListener('change', function (e) {
      if (e.target.checked) {
        qrScreenBlendToggle.checked = false;
      }
      updateBlendMode();
    });

    // Layout inversion toggle
    layoutInvertToggle.addEventListener('change', function (e) {
      document.body.classList.toggle('flex-direction-invert', e.target.checked);
      updateStyleURL();
    });

    // Add event listener for hide zapper content toggle
    hideZapperContentToggle.addEventListener('change', function (e) {
      console.log('Hide zapper content toggle changed:', e.target.checked);
      document.body.classList.toggle('hide-zapper-content', e.target.checked);
      console.log(
        'Body classes after toggle:',
        document.body.classList.toString()
      );
      updateStyleURL();
    });
  }

  function setupColorPicker(pickerId, valueId, targetProperty) {
    const picker = document.getElementById(pickerId);
    const value = document.getElementById(valueId);
    const liveElement = document.querySelector('.jukebox');
    const mainLayout = document.querySelector('.main-layout');

    // Update text input when color picker changes
    picker.addEventListener('input', function (e) {
      const color = toHexColor(e.target.value);
      value.value = color;

      if (targetProperty === 'backgroundColor') {
        // For background color, update the main-layout with 0.5 transparency
        const rgbaColor = hexToRgba(color, 0.5);
        mainLayout.style.backgroundColor = rgbaColor;
      } else if (targetProperty === 'color') {
        // For text color, use CSS custom property for consistent inheritance
        mainLayout.style.setProperty('--text-color', color);

        // Also specifically override zaps header elements that have hardcoded colors (if they exist)
        const zapsHeaderH2 = mainLayout.querySelector('.zaps-header-left h2');
        const totalLabel = mainLayout.querySelector('.total-label');
        const totalSats = mainLayout.querySelector('.total-sats');

        if (zapsHeaderH2) zapsHeaderH2.style.color = color;
        if (totalLabel) totalLabel.style.color = color;
        if (totalSats) totalSats.style.color = color;
      } else {
        // For other properties, update the live element
        liveElement.style[targetProperty] = color;
      }

      updateStyleURL();
    });

    // Update color picker when text input changes
    value.addEventListener('input', function (e) {
      const color = toHexColor(e.target.value);
      if (isValidHexColor(color)) {
        picker.value = color;

        if (targetProperty === 'backgroundColor') {
          // For background color, update the main-layout with 0.5 transparency
          const rgbaColor = hexToRgba(color, 0.5);
          mainLayout.style.backgroundColor = rgbaColor;
        } else if (targetProperty === 'color') {
          // For text color, use CSS custom property for consistent inheritance
          mainLayout.style.setProperty('--text-color', color);

          // Also specifically override zaps header elements that have hardcoded colors (if they exist)
          const zapsHeaderH2 = mainLayout.querySelector('.zaps-header-left h2');
          const totalLabel = mainLayout.querySelector('.total-label');
          const totalSats = mainLayout.querySelector('.total-sats');

          if (zapsHeaderH2) zapsHeaderH2.style.color = color;
          if (totalLabel) totalLabel.style.color = color;
          if (totalSats) totalSats.style.color = color;
        } else {
          // For other properties, update the live element
          liveElement.style[targetProperty] = color;
        }

        updateStyleURL();
      }
    });
  }

  function updateBlendMode() {
    const qrScreenBlendToggle = document.getElementById('qrScreenBlendToggle');
    const qrMultiplyBlendToggle = document.getElementById(
      'qrMultiplyBlendToggle'
    );
    const qrCodeContainer = document.getElementById('qrCode');

    if (qrScreenBlendToggle.checked) {
      qrCodeContainer.style.mixBlendMode = 'screen';
      qrMultiplyBlendToggle.checked = false;
    } else if (qrMultiplyBlendToggle.checked) {
      qrCodeContainer.style.mixBlendMode = 'multiply';
      qrScreenBlendToggle.checked = false;
    } else {
      qrCodeContainer.style.mixBlendMode = 'normal';
    }
    updateStyleURL();
  }

  function updateBackgroundImage(url) {
    if (url && url.trim() !== '') {
      liveZapOverlay.style.backgroundImage = `url("${url}")`;
      liveZapOverlay.style.backgroundSize = 'cover';
      liveZapOverlay.style.backgroundPosition = 'center';
      liveZapOverlay.style.backgroundRepeat = 'no-repeat';
      document.getElementById('bgImagePreview').src = url;
    } else {
      liveZapOverlay.style.backgroundImage = 'none';
      document.getElementById('bgImagePreview').src = '';
    }
  }

  // Style options modal functionality
  document
    .getElementById('styleOptionsModalToggle')
    .addEventListener('click', function () {
      document.getElementById('styleOptionsModal').classList.add('show');
      document.body.classList.add('style-panel-open');
    });

  document
    .getElementById('styleToggleBtn')
    .addEventListener('click', function () {
      document.getElementById('styleOptionsModal').classList.add('show');
      document.body.classList.add('style-panel-open');
    });

  document
    .querySelector('#styleOptionsModal .close-button')
    .addEventListener('click', function () {
      document.getElementById('styleOptionsModal').classList.remove('show');
      document.body.classList.remove('style-panel-open');
    });

  // Close modal when clicking outside
  document
    .getElementById('styleOptionsModal')
    .addEventListener('click', function (e) {
      if (e.target === this) {
        this.classList.remove('show');
        document.body.classList.remove('style-panel-open');
      }
    });

  // Function to process only the top zap to minimize processing overhead
  async function processTopZap() {
    if (!allZapsLoaded || zapQueue.length === 0) {
      console.log('No zaps loaded yet or zap queue is empty');
      return;
    }

    // Filter out zaps with empty content first
    const validZaps = zapQueue.filter(
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
    if (currentTopZap && currentTopZap.zapId === topZap.zapId) {
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
        currentTopZap = topZap;

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
  }
}); // Close DOMContentLoaded function
