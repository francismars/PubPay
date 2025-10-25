// Jukebox page component - matches original jukebox.html design exactly
import React, { useEffect, useState } from 'react';
import { useJukeboxFunctionality } from '@/hooks/useJukeboxFunctionality';

export const JukeboxPage: React.FC = () => {
  const [showNoteLoader, setShowNoteLoader] = useState(true);
  const [showMainLayout, setShowMainLayout] = useState(false);

  const {
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
  } = useJukeboxFunctionality();

  const handleLoadJukebox = () => {
    setShowNoteLoader(false);
    setShowMainLayout(true);
  };

  useEffect(() => {
    // Set up event listeners
    const jukeboxSubmit = document.getElementById('note1LoaderSubmit');
    const styleToggleBtn = document.getElementById('styleToggleBtn');
    const styleOptionsModal = document.getElementById('styleOptionsModal');
    const closeButton = styleOptionsModal?.querySelector('.close-button');
    const skipSongBtn = document.getElementById('skipSong');

    if (jukeboxSubmit) {
      jukeboxSubmit.addEventListener('click', () => {
        handleJukeboxSubmit();
        handleLoadJukebox();
      });
    }

    if (styleToggleBtn) {
      styleToggleBtn.addEventListener('click', handleStyleOptionsToggle);
    }

    if (closeButton) {
      closeButton.addEventListener('click', handleStyleOptionsClose);
    }

    if (skipSongBtn) {
      skipSongBtn.addEventListener('click', handleSkipSong);
    }

    // Cleanup
    return () => {
      if (jukeboxSubmit) {
        jukeboxSubmit.removeEventListener('click', handleJukeboxSubmit);
      }
      if (styleToggleBtn) {
        styleToggleBtn.removeEventListener('click', handleStyleOptionsToggle);
      }
      if (closeButton) {
        closeButton.removeEventListener('click', handleStyleOptionsClose);
      }
      if (skipSongBtn) {
        skipSongBtn.removeEventListener('click', handleSkipSong);
      }
    };
  }, [handleJukeboxSubmit, handleStyleOptionsToggle, handleStyleOptionsClose, handleSkipSong]);

  return (
    <div className="jukebox">
      {/* Note Loader Container */}
      {showNoteLoader && (
        <div id="noteLoaderContainer">
          <div id="noteLoader">
            {/* App Header & Description */}
            <div className="app-header">
              <h1>🎵 PUBPAY Jukebox</h1>
              <p className="app-description">
                Competitive YouTube Music Queue powered by Nostr zaps
              </p>
              <div className="viral-features">
                <span className="feature-badge">🔥 Zap to compete</span>
                <span className="feature-badge">🎯 Higher zaps = priority</span>
                <span className="feature-badge">⚡ Lightning fast</span>
              </div>
            </div>

            <div className="note-input-section">
              <label htmlFor="note1LoaderInput">Enter a Nostr post ID to create your jukebox:</label><br />
              <input type="text" id="note1LoaderInput" name="note1LoaderInput" value="" placeholder="note16a..." /><br />
              <button id="note1LoaderSubmit" className="button primary-button" onClick={handleLoadJukebox}>🚀 Launch Jukebox</button>
            </div>

            <div className="how-it-works">
              <h3>🎯 How it works</h3>
              <div className="steps">
                <div className="step">
                  <div className="step-number">1</div>
                  <div className="step-text">Load a Nostr post to create your jukebox</div>
                </div>
                <div className="step">
                  <div className="step-number">2</div>
                  <div className="step-text">People scan QR code and zap with song requests</div>
                </div>
                <div className="step">
                  <div className="step-number">3</div>
                  <div className="step-text">Higher zaps get priority in the queue</div>
                </div>
                <div className="step">
                  <div className="step-number">4</div>
                  <div className="step-text">Songs automatically play in priority order</div>
                </div>
              </div>
            </div>

            <div className="examples-section">
              <h3>💡 Examples</h3>
              <p>Zap with a YouTube URL or video ID in your comment:</p>
              <div className="example-comments">
                <div className="example-comment">"https://youtube.com/watch?v=dQw4w9WgXcQ"</div>
                <div className="example-comment">"https://youtu.be/dQw4w9WgXcQ"</div>
                <div className="example-comment">"dQw4w9WgXcQ"</div>
              </div>
              <p className="example-note">⚠️ Only YouTube URLs and video IDs are accepted. General search terms are not supported.</p>
            </div>

            <div className="styleOptionsModalToggle button secondary-button">
              ⚙️ Style Options
            </div>
          </div>
        </div>
      )}

      {/* Main three-column layout */}
      {showMainLayout && (
        <div id="mainLayout" className="main-layout jukebox-layout">
          {/* Background image overlay for the entire layout */}
          <div className="liveZapOverlay"></div>

          {/* LEFT SIDE: Post/kind1 information and QR Code */}
          <div className="left-side">
            <div className="post-info">
              <h3 className="section-label">🎵 Jukebox Post</h3>

              {/* Author Section */}
              <div className="author-section">
                <img id="authorNameProfileImg" className="author-image" src={authorImage} />
                <div className="author-info">
                  <div id="authorName" className="author-name">{authorName}</div>
                </div>
              </div>

              {/* Note Content Section */}
              <div className="note-section">
                <div id="noteContent" className="note-content">
                  {noteContent || 'Note content will be populated here'}
                </div>
              </div>

              {/* QR Code Section */}
              <div className="qr-section">
                <a href="" target="_blank" id="qrcodeLinkNostr">
                  <img id="qrCode" className="qr-code" />
                </a>
                <div className="qr-instructions">
                  📱 Scan to zap and request songs
                </div>
                <div className="qr-stats">
                  <div className="stat-item">
                    <span className="stat-label">Queue:</span>
                    <span id="queueCount" className="stat-value">{queueCount}</span>
                  </div>
                  <div className="stat-item">
                    <span className="stat-label">Played:</span>
                    <span id="playedCount" className="stat-value">{playedCount}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* CENTER: Currently Playing and Queue */}
          <div className="center-side">
            {/* Currently Playing Section */}
            <div className="currently-playing">
              <h3 className="section-label">
                🎵 Now Playing
                <div className="zaps-header-right">
                  <button id="styleToggleBtn" className="style-toggle-btn">
                    ⚙️
                  </button>

                  <div className="powered-by">
                    <img src="/images/powered_by_white_bg.png" />
                  </div>
                </div>
              </h3>
              <div id="currentVideo" className="video-container">
                <div className="no-video-message">
                  <div className="no-video-icon">🎵</div>
                  <div className="no-video-text">No song playing yet</div>
                  <div className="no-video-subtext">Zap with a YouTube URL or video ID to request a song!</div>
                  <div className="no-video-examples">
                    <div className="example-item">📺 youtube.com/watch?v=VIDEO_ID</div>
                    <div className="example-item">🔗 youtu.be/VIDEO_ID</div>
                    <div className="example-item">🎯 Just the video ID (11 characters)</div>
                  </div>
                </div>
              </div>

              {/* Video Progress Bar */}
              <div id="videoProgressContainer" className="video-progress-container" style={{display: 'none'}}>
                <div className="progress-bar">
                  <div id="videoProgressBar" className="progress-fill"></div>
                </div>
                <div className="progress-time">
                  <span id="currentTime">0:00</span> / <span id="totalTime">0:00</span>
                </div>
              </div>
              <div id="currentSongInfo" className="song-info">
                {/* Song info will be populated here */}
              </div>
              <div className="player-controls">
                <button id="skipSong" className="control-button skip-button" disabled>
                  ⏭️ Skip Song
                </button>
              </div>
            </div>
          </div>

          {/* RIGHT SIDE: Queue and History */}
          <div className="right-side">
            {/* Queue Section */}
            <div className="queue-section">
              <h3 className="section-label">📋 Next Up (Queue)</h3>
              <div id="queueStats" className="queue-stats">
                <span className="queue-count">0 songs in queue</span>
                <span className="queue-total">Total: 0 sats</span>
              </div>
              <div id="songQueue" className="song-queue">
                {/* Queue will be populated here */}
              </div>
            </div>

            {/* Played Songs History */}
            <div className="history-section">
              <h3 className="section-label">📚 Recently Played</h3>
              <div id="playedSongs" className="played-songs">
                {/* Played songs will be populated here */}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Style options modal - simplified for now */}
      <div id="styleOptionsModal">
        <div className="style-options-content">
          <div className="style-options-header">
            <h2>Style Options</h2>
            <button className="close-button">&times;</button>
          </div>
          <div className="style-options-body">
            <p>Style options will be implemented here</p>
          </div>
        </div>
      </div>
    </div>
  );
};
