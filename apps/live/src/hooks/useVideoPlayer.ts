import { useCallback, useRef, useEffect } from 'react';
import {
  handleError,
  handleErrorSilently,
  videoErrorHandler,
  logger,
  ErrorCategory,
  ErrorSeverity
} from '../utils/errorHandling';
import type { HlsInstance, HlsConfig, HlsError } from '../types/global';

// Constants
const SUBSCRIPTION_TIMEOUT = 30000; // 30 seconds
const MAX_RECONNECT_ATTEMPTS = 10;

interface UseVideoPlayerOptions {
  videoElementId?: string;
  errorElementId?: string;
}

/**
 * Hook for managing live video player functionality
 * Handles HLS streaming, regular video formats, reconnection, and audio state preservation
 */
export const useVideoPlayer = (options: UseVideoPlayerOptions = {}) => {
  const { videoElementId = 'live-video', errorElementId = 'video-error' } = options;
  
  // Store HLS instance and player state in refs to persist across renders
  const hlsInstanceRef = useRef<HlsInstance | null>(null);
  const reconnectAttemptsRef = useRef<number>(0);
  const lastVolumeRef = useRef<number>(0.8);
  const wasMutedRef = useRef<boolean>(false);
  const wasPlayingRef = useRef<boolean>(false);

  /**
   * Preserves volume and mute state of the video element
   */
  const preserveAudioState = useCallback((video: HTMLVideoElement) => {
    if (!wasMutedRef.current && video.muted) {
      video.muted = false;
    }
    if (lastVolumeRef.current > 0 && video.volume !== lastVolumeRef.current) {
      video.volume = lastVolumeRef.current;
    }
  }, []);

  /**
   * Saves current audio state of the video element
   */
  const saveAudioState = useCallback((video: HTMLVideoElement) => {
    lastVolumeRef.current = video.volume;
    wasMutedRef.current = video.muted;
    wasPlayingRef.current = !video.paused;
  }, []);

  /**
   * Shows error message and hides video
   */
  const showError = useCallback((video: HTMLVideoElement | null, videoError: HTMLElement | null) => {
    if (video) video.style.display = 'none';
    if (videoError) videoError.style.display = 'block';
  }, []);

  /**
   * Hides error message and shows video
   */
  const hideError = useCallback((video: HTMLVideoElement | null, videoError: HTMLElement | null) => {
    if (video) video.style.display = 'block';
    if (videoError) videoError.style.display = 'none';
  }, []);

  /**
   * Attempts to reconnect to the video stream
   */
  const attemptReconnect = useCallback((
    video: HTMLVideoElement,
    videoError: HTMLElement | null,
    streamingUrl: string,
    initializeStream: () => void
  ) => {
      if (reconnectAttemptsRef.current >= MAX_RECONNECT_ATTEMPTS) {
        handleError(
          new Error('Max reconnection attempts reached'),
          'Max reconnection attempts reached',
          ErrorCategory.VIDEO,
          ErrorSeverity.HIGH,
          { attempts: reconnectAttemptsRef.current, streamingUrl }
        );
        showError(video, videoError);
        return;
      }

      reconnectAttemptsRef.current++;
      const delay = Math.min(1000 * Math.pow(2, reconnectAttemptsRef.current - 1), SUBSCRIPTION_TIMEOUT);
      logger.info(
        `Attempting reconnection ${reconnectAttemptsRef.current}/${MAX_RECONNECT_ATTEMPTS} in ${delay}ms`,
        ErrorCategory.VIDEO,
        { attempt: reconnectAttemptsRef.current, delay, streamingUrl }
      );

    setTimeout(() => {
      initializeStream();
    }, delay);
  }, []);

  /**
   * Initializes the video stream (HLS or regular format)
   */
  const initializeStream = useCallback((
    video: HTMLVideoElement,
    videoError: HTMLElement | null,
    streamingUrl: string
  ) => {
    console.log('🎥 Initializing stream...');

    // Handle different streaming formats
    if (streamingUrl.includes('.m3u8') || streamingUrl.includes('hls')) {
      // HLS stream - try to use HLS.js if available
      if (
        typeof window.Hls !== 'undefined' &&
        window.Hls.isSupported()
      ) {
          logger.info('Using HLS.js for HLS stream', ErrorCategory.VIDEO, { streamingUrl });
        
        // Clean up existing HLS instance if any
        if (hlsInstanceRef.current) {
          try {
            hlsInstanceRef.current.destroy();
          } catch (e) {
            console.warn('Error destroying previous HLS instance:', e);
          }
        }

        hlsInstanceRef.current = new window.Hls!({
          enableWorker: true,
          lowLatencyMode: false,
          maxBufferLength: 30,
          maxMaxBufferLength: 60,
          liveSyncDurationCount: 3,
          liveMaxLatencyDurationCount: 5
        });

        hlsInstanceRef.current.loadSource(streamingUrl);
        hlsInstanceRef.current.attachMedia(video);

          hlsInstanceRef.current.on(window.Hls!.Events.MANIFEST_PARSED, () => {
            logger.info('HLS manifest parsed', ErrorCategory.VIDEO, { streamingUrl });
          reconnectAttemptsRef.current = 0;
          hideError(video, videoError);
          video
            .play()
            .then(() => {
              preserveAudioState(video);
            })
            .catch(e => {
              preserveAudioState(video);
            });
        });

        hlsInstanceRef.current.on(
          window.Hls!.Events.ERROR,
          (_event: unknown, data: unknown) => {
            videoErrorHandler(
              data,
              'HLS playback error',
              undefined,
              { streamingUrl, hlsError: data }
            );
            const errorData = data as HlsError;
            if (errorData.fatal) {
              attemptReconnect(video, videoError, streamingUrl, () => 
                initializeStream(video, videoError, streamingUrl)
              );
            }
          }
        );
        } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
          // Native HLS support (Safari)
          logger.info('Using native HLS support', ErrorCategory.VIDEO, { streamingUrl });
          video.src = streamingUrl;
          video
            .play()
            .then(() => {
              logger.info('Native HLS stream started', ErrorCategory.VIDEO, { streamingUrl });
            reconnectAttemptsRef.current = 0;
            hideError(video, videoError);
            preserveAudioState(video);
          })
            .catch(e => {
              videoErrorHandler(
                e,
                'Native HLS play failed',
                undefined,
                { streamingUrl }
              );
            preserveAudioState(video);
            attemptReconnect(video, videoError, streamingUrl, () => 
              initializeStream(video, videoError, streamingUrl)
            );
          });
        } else {
          handleError(
            new Error('HLS not supported'),
            'HLS not supported by browser',
            ErrorCategory.VIDEO,
            ErrorSeverity.HIGH,
            { streamingUrl }
          );
          showError(video, videoError);
        }
      } else {
        // Regular video formats (MP4, WebM, etc.)
        logger.info('Using regular video format', ErrorCategory.VIDEO, { streamingUrl });
        video.src = streamingUrl;
        video
          .play()
          .then(() => {
            logger.info('Regular video stream started', ErrorCategory.VIDEO, { streamingUrl });
          reconnectAttemptsRef.current = 0;
          hideError(video, videoError);
          preserveAudioState(video);
        })
          .catch(e => {
            videoErrorHandler(
              e,
              'Regular video play failed',
              undefined,
              { streamingUrl }
            );
          preserveAudioState(video);
          attemptReconnect(video, videoError, streamingUrl, () => 
            initializeStream(video, videoError, streamingUrl)
          );
        });
    }
  }, [preserveAudioState, hideError, showError, attemptReconnect]);

  /**
   * Initializes the live video player with a streaming URL
   */
  const initializeLiveVideoPlayer = useCallback((streamingUrl: string) => {
    console.log('🎥 Initializing video player with URL:', streamingUrl);

    const video = document.getElementById(videoElementId) as HTMLVideoElement;
    const videoError = document.getElementById(errorElementId);

    if (!video) {
      handleError(
        new Error(`Video element with id "${videoElementId}" not found`),
        'Video element not found',
        ErrorCategory.VIDEO,
        ErrorSeverity.HIGH,
        { videoElementId }
      );
      return;
    }
    logger.info('Video element found', ErrorCategory.VIDEO, { videoElementId });

    // Initialize audio state from current video state
    lastVolumeRef.current = video.volume || 0.8;
    wasMutedRef.current = video.muted || false;
    reconnectAttemptsRef.current = 0;

    // Set up video event handlers
    const handleVideoError = (e: Event) => {
      videoErrorHandler(
        e,
        'Video playback error occurred',
        undefined,
        { streamingUrl }
      );
      saveAudioState(video);
      attemptReconnect(video, videoError, streamingUrl, () => 
        initializeStream(video, videoError, streamingUrl)
      );
    };

    const handleLoadstart = () => {
      logger.info('Video load started', ErrorCategory.VIDEO, { streamingUrl });
    };

    const handleCanplay = () => {
      logger.info('Video can play', ErrorCategory.VIDEO, { streamingUrl });
      hideError(video, videoError);
      preserveAudioState(video);
    };

    const handlePlay = () => {
      wasPlayingRef.current = true;
      preserveAudioState(video);
    };

    const handlePause = () => {
      wasPlayingRef.current = false;
      saveAudioState(video);
    };

    const handleVolumechange = () => {
      saveAudioState(video);
    };

    const handleStalled = () => {
      saveAudioState(video);
      setTimeout(() => {
        if (video.readyState < 3 && wasPlayingRef.current) {
          attemptReconnect(video, videoError, streamingUrl, () => 
            initializeStream(video, videoError, streamingUrl)
          );
        }
      }, 5000);
    };

    const handleWaiting = () => {
      saveAudioState(video);
    };

    // Remove existing event listeners to avoid duplicates
    video.removeEventListener('error', handleVideoError);
    video.removeEventListener('loadstart', handleLoadstart);
    video.removeEventListener('canplay', handleCanplay);
    video.removeEventListener('play', handlePlay);
    video.removeEventListener('pause', handlePause);
    video.removeEventListener('volumechange', handleVolumechange);
    video.removeEventListener('stalled', handleStalled);
    video.removeEventListener('waiting', handleWaiting);

    // Add event listeners
    video.addEventListener('error', handleVideoError);
    video.addEventListener('loadstart', handleLoadstart);
    video.addEventListener('canplay', handleCanplay);
    video.addEventListener('play', handlePlay);
    video.addEventListener('pause', handlePause);
    video.addEventListener('volumechange', handleVolumechange);
    video.addEventListener('stalled', handleStalled);
    video.addEventListener('waiting', handleWaiting);

    // Start initial stream
    initializeStream(video, videoError, streamingUrl);
  }, [videoElementId, errorElementId, initializeStream, preserveAudioState, saveAudioState, hideError, attemptReconnect]);

  /**
   * Cleans up the video player (destroys HLS instance, removes event listeners)
   */
  const cleanupLiveVideoPlayer = useCallback(() => {
    logger.info('Cleaning up video player', ErrorCategory.VIDEO);

    // Destroy HLS instance if it exists
    if (hlsInstanceRef.current) {
      try {
        hlsInstanceRef.current.destroy();
        hlsInstanceRef.current = null;
      } catch (error) {
        handleErrorSilently(
          error,
          'Error destroying HLS instance',
          ErrorCategory.VIDEO
        );
      }
    }

    // Reset reconnection attempts
    reconnectAttemptsRef.current = 0;

    // Get video element and remove event listeners
    const video = document.getElementById(videoElementId) as HTMLVideoElement;
    if (video) {
      // Clone and replace to remove all event listeners
      const newVideo = video.cloneNode(true) as HTMLVideoElement;
      if (video.parentNode) {
        video.parentNode.replaceChild(newVideo, video);
      }
    }
  }, [videoElementId]);

  // Expose cleanup function globally for useContentRendering hook
  useEffect(() => {
    (window as any).cleanupLiveVideoPlayer = cleanupLiveVideoPlayer;
    return () => {
      delete (window as any).cleanupLiveVideoPlayer;
    };
  }, [cleanupLiveVideoPlayer]);

  return {
    initializeLiveVideoPlayer,
    cleanupLiveVideoPlayer
  };
};
