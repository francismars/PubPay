// Live page component - matches original live.html design exactly
import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useLiveFunctionality } from '@live/hooks/useLiveFunctionality';
// Temporarily disabled for CSS debugging - import '../styles/live.css';
import { nip19 } from 'nostr-tools';

export const LivePage: React.FC = () => {
  const { eventId } = useParams<{ eventId?: string }>();
  const [showNoteLoader, setShowNoteLoader] = useState(!eventId);
  const [showMainLayout, setShowMainLayout] = useState(!!eventId);

  // Set body class to 'live' for proper CSS styling
  useEffect(() => {
    document.body.className = 'live';
    
    // Cleanup: remove live class when component unmounts
    return () => {
      document.body.className = '';
    };
  }, []);

  const {
    isLoading,
    error,
    noteContent,
    authorName,
    authorImage,
    zaps,
    totalZaps,
    totalAmount,
    handleNoteLoaderSubmit,
    handleStyleOptionsToggle,
    handleStyleOptionsClose,
    showLoadingError,
    resetToDefaults,
    copyStyleUrl
  } = useLiveFunctionality(eventId);

  // Legacy-style URL parsing/validation: support compound nprofile/.../live/:id and invalid IDs
  useEffect(() => {
    // Helper to strip nostr: prefix
    const stripNostrPrefix = (id: string) => id?.replace(/^nostr:/, '') ?? '';

    try {
      const pathParts = window.location.pathname.split('/').filter(Boolean);

      // Try compound form: /{nprofile...}/live/{event-id} → build naddr(kind 30311) and normalize URL
      // If any legacy '/live' segment is present, normalize away from it
      if (pathParts.includes('live')) {
        const possibleNprofile = pathParts[pathParts.length - 3];
        const liveIdentifier = pathParts[pathParts.length - 1];
        if (possibleNprofile && liveIdentifier) {
          try {
            const decoded: any = nip19.decode(possibleNprofile as string);
            if (decoded && decoded.type === 'nprofile') {
              const pubkey: string = decoded.data?.pubkey as string;
              if (pubkey) {
                const naddr = nip19.naddrEncode({ identifier: liveIdentifier as string, pubkey, kind: 30311, relays: [] });
                const cleanUrl = `/${naddr}`;
                if (window.location.pathname !== cleanUrl) {
                  window.history.replaceState({}, '', cleanUrl);
                }
                setShowNoteLoader(false);
                setShowMainLayout(true);
                return; // URL normalized; hook will use updated param on next render
              }
            }
          } catch {
            // Fall through to standard handling
          }
        }
      }

      // Standard handling: last path segment or router param
      const lastPart = (pathParts[pathParts.length - 1] || '').trim();
      const candidate = stripNostrPrefix(lastPart || (eventId ?? ''));

      if (!candidate) {
        setShowNoteLoader(true);
        setShowMainLayout(false);
        return;
      }

      // Basic prefix validation first
      const validPrefixes = ['note1', 'nevent1', 'naddr1', 'nprofile1'];
      if (!validPrefixes.some(p => candidate.startsWith(p))) {
        setShowNoteLoader(true);
        setShowMainLayout(false);
        showLoadingError('Invalid format. Please enter a valid nostr identifier (note1/nevent1/naddr1/nprofile1).');
        return;
      }

      // Bech32/NIP-19 validation
      try {
        // Decode to ensure the identifier is a valid NIP-19 bech32
        nip19.decode(candidate as string);
        // Normalize URL to clean "/:identifier"
        const cleanUrl = `/${candidate}`;
        if (window.location.pathname !== cleanUrl) {
          window.history.replaceState({}, '', cleanUrl);
        }
        setShowNoteLoader(false);
        setShowMainLayout(true);
      } catch {
        setShowNoteLoader(true);
        setShowMainLayout(false);
        // Delay until after the note loader mounts so the DOM nodes exist
        setTimeout(() => {
          // Legacy-style messages based on intended type
          let msg = 'Invalid nostr identifier format. Please check the note ID and try again.';
          if (candidate.startsWith('naddr1')) {
            msg = 'Failed to load live event. Please check the identifier and try again.';
          } else if (candidate.startsWith('nprofile1')) {
            msg = 'Failed to load profile. Please check the identifier and try again.';
          }
          showLoadingError(msg);
          const input = document.getElementById('note1LoaderInput') as HTMLInputElement | null;
          if (input) {
            input.value = candidate;
            input.focus();
            input.select();
          }
        }, 50);
      }
    } catch {
      // If anything unexpected happens, fall back to note loader with error
      setShowNoteLoader(true);
      setShowMainLayout(false);
      showLoadingError('Failed to parse URL. Please enter a valid nostr identifier.');
    }
    // We want this to run on initial mount and when eventId changes from the router
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventId]);

  useEffect(() => {
    if (eventId) {
      // Wait for NostrTools to be available before validating
      const validateEventId = async () => {
        // Wait for NostrTools to load
        const waitForNostrTools = () => {
          return new Promise<void>((resolve) => {
            const checkNostrTools = () => {
              if ((window as any).NostrTools) {
                resolve();
              } else {
                setTimeout(checkNostrTools, 100);
              }
            };
            checkNostrTools();
          });
        };

        await waitForNostrTools();

        // Validate if the eventId is a valid Nostr identifier
        const isValidNostrId = (id: string): boolean => {
          if (!id) return false;

          // Check if it starts with valid Nostr prefixes
          const validPrefixes = ['note1', 'nevent1', 'naddr1', 'nprofile1'];
          if (!validPrefixes.some(prefix => id.startsWith(prefix))) {
            return false;
          }

          // Try to decode the identifier to make sure it's valid
          try {
            (window as any).NostrTools.nip19.decode(id);
            return true;
          } catch (error) {
            // Debug log removed
            return false;
          }
        };

        if (isValidNostrId(eventId)) {
          setShowNoteLoader(false);
          setShowMainLayout(true);
        } else {
          // Invalid note ID, show error in note loader (like original behavior)
          // Debug log removed
          setShowNoteLoader(true);
          setShowMainLayout(false);

          // Show error message in the note loader
          setTimeout(() => {
            showLoadingError('Invalid nostr identifier format. Please check the note ID and try again.');
          }, 100);
        }
      };

      validateEventId();
    } else {
      setShowNoteLoader(true);
      setShowMainLayout(false);
    }
  }, [eventId]);

  // Listen for URL changes to handle note loader submissions
  useEffect(() => {
    const handlePopState = () => {
      const pathParts = window.location.pathname.split('/');
      const currentEventId = pathParts[pathParts.length - 1];

      if (currentEventId && currentEventId !== 'live') {
        setShowNoteLoader(false);
        setShowMainLayout(true);
      } else {
        setShowNoteLoader(true);
        setShowMainLayout(false);
      }
    };

    const handleNoteLoaderSubmitted = (event: any) => {
      // Debug log removed
      setShowNoteLoader(false);
      setShowMainLayout(true);

      // Force a re-render by updating the eventId
      const pathParts = window.location.pathname.split('/');
      const newEventId = pathParts[pathParts.length - 1];
      if (newEventId && newEventId !== 'live') {
        // Trigger a re-render by updating the URL in a way React Router will notice
        window.history.replaceState({}, '', window.location.pathname);
        // Force component to re-render with new eventId
        window.location.reload();
      }
    };

    window.addEventListener('popstate', handlePopState);
    window.addEventListener('noteLoaderSubmitted', handleNoteLoaderSubmitted);

    return () => {
      window.removeEventListener('popstate', handlePopState);
      window.removeEventListener('noteLoaderSubmitted', handleNoteLoaderSubmitted);
    };
  }, []);

  useEffect(() => {
    // Wait for NostrTools to be available
    const waitForNostrTools = () => {
      return new Promise<void>((resolve) => {
        const checkNostrTools = () => {
          if ((window as any).NostrTools) {
            // Debug log removed
            resolve();
          } else {
            setTimeout(checkNostrTools, 100);
          }
        };
        checkNostrTools();
      });
    };

    waitForNostrTools();
  }, []);

  useEffect(() => {
    // Set up event listeners with a small delay to ensure DOM is ready
    setTimeout(() => {
      const styleToggleBtn = document.getElementById('styleToggleBtn');
      const styleOptionsModal = document.getElementById('styleOptionsModal');
      const closeButton = styleOptionsModal?.querySelector('.close-button');

      // Note: noteLoaderSubmit event listener is handled by useLiveFunctionality hook

      if (styleToggleBtn) {
        // Debug log removed
        styleToggleBtn.addEventListener('click', (e) => {
          e.preventDefault();
          // Debug log removed
          const styleOptionsModal = document.getElementById('styleOptionsModal');
          // Debug log removed
          if (styleOptionsModal) {
            styleOptionsModal.style.display = 'block';
            styleOptionsModal.classList.add('show');
            document.body.classList.add('style-panel-open');
            // Debug log removed

          // NOTE: Do NOT call setupStyleOptions here - it should only be called on page load
          // and when individual controls change, not when opening/closing the modal
          }
        });
      } else {
        // Debug log removed
      }

      if (closeButton) {
        closeButton.addEventListener('click', handleStyleOptionsClose);
      }


      // Style options modal toggle
      const styleOptionsModalToggle = document.querySelector('.styleOptionsModalToggle');
      if (styleOptionsModalToggle) {
        styleOptionsModalToggle.addEventListener('click', () => {
          const styleOptionsModal = document.getElementById('styleOptionsModal');
          if (styleOptionsModal) {
            styleOptionsModal.style.display = 'block';
          }
        });
      }
    }, 100); // Small delay to ensure DOM is ready

    // Cleanup
    return () => {
      // Note: We can't easily remove the event listeners from setTimeout
      // This is a limitation of this approach
    };
  }, [handleStyleOptionsToggle, handleStyleOptionsClose]);

  return (
    <div className="live">
      {/* Note Loader Container */}
      {showNoteLoader && (
        <div id="noteLoaderContainer">
          <div id="noteLoader">
            {/* Portrait Swiper */}
            <div className="portrait-swiper">
              <div className="swiper">
                <div className="swiper-wrapper">
                  <div className="swiper-slide">
                    <img src="https://m.primal.net/Majo.jpg" alt="Max Demarco Vicky El Salvador Chain Duel Party PubPay" />
                  </div>
                  <div className="swiper-slide">
                    <img src="https://i.nostr.build/itlLMXlxccOBG06L.jpg" alt="Roger 9000 Adopting Bitcoin After Party PubPay" />
                  </div>
                  <div className="swiper-slide">
                    <img src="https://r2.primal.net/cache/0/c4/57/0c4571c1e9e51ba2dde56dc3af65726adac4e68299f5a5d3adf9bc09efb67e8f.jpg" alt="Network School Flute Piano PubPay" />
                  </div>
                  <div className="swiper-slide">
                    <img src="https://r2.primal.net/cache/6/3e/9f/63e9f4b439c17fd2c88617210cbd91c6c9b1ee2be2d82f47a7085379dd183e3c.jpg" alt="Network School Flute Piano PubPay" />
                  </div>
                  <div className="swiper-slide">
                    <img src="https://r2.primal.net/cache/b/f6/bd/bf6bde3a8c8e5568dd8ce9d2d32b31d6d4287281e9cb5650cd28cb740b9bf932.jpg" alt="PubPay Event" />
                  </div>
                  <div className="swiper-slide">
                    <img src="https://r2a.primal.net/uploads2/8/af/e3/8afe3c42163ee657479c9d151e92e9058f9116cc05dd71829426e567020ec21e.png" alt="PubPay Event" />
                  </div>
                </div>
              </div>
            </div>

            {/* Main Content Sections */}
            <div className="note-loader-content">
              {/* App Header & Description */}
              <div className="app-header">
                <h1><span style={{color: '#4a75ff'}}>PUB</span><span style={{color: '#000'}}>PAY</span><span style={{color: '#0000001c'}}>.me</span> <span style={{color: '#5f5f5f'}}>Live</span></h1>
                <p className="app-description">
                  Real time tip tracker
                </p>
              </div>

              <label htmlFor="note1LoaderInput">Enter note, event, or profile</label>
              <input type="text" id="note1LoaderInput" name="note1LoaderInput" placeholder="note1abc123... or nevent1xyz789... or naddr1def456... or nprofile1ghi789..." />
              <div id="noteLoaderError" className="error-message" style={{display: 'none'}}></div>
              <div className="button-container">
                <button id="note1LoaderSubmit" className="button">Load</button>
                <div className="styleOptionsModalToggle button outline">Style Options</div>
              </div>

              <div className="examples-section">
                <h3>Examples - Notes, Live Events & Profiles</h3>
                <div className="example-item">
                  <a href="/note16a7m73en9w4artfclcnhqf8jzngepmg2j2et3l2yk0ksfhftv0ls3hugv7" target="_blank">
                    Zap my set at at Plan B at Adopting Bitcoin after party ⚡️
                  </a>
                  <div className="author-name">
                    <img src="https://primal.b-cdn.net/media-upload?u=https%3A%2F%2Fmedia.primal.net%2Fuploads%2Fd%2F87%2F9f%2Fd879f18ec704fed0700a3c2befae75b0148822d19166feb9293192279864db82.jpg" alt="Roger 9000" className="author-avatar" />
                    Roger 9000
                  </div>
                </div>
                <div className="example-item">
                  <a href="/note1j8fpjg60gkw266lz86ywmyr2mmy5e6kfkhtfu4umaxneff6qeyhqrl37gu" target="_blank">
                    Bienvenidos a nuestro querido el salvador 🇸🇻
                  </a>
                  <div className="author-name">
                    <img src="https://cdn.satellite.earth/080a8d6c0664cd39b386a27f095d6dac8e223a26c69357e3e144da2d54dc39a3.png" alt="Vicky" className="author-avatar" />
                    Vicky
                  </div>
                </div>
                <div className="example-item">
                  <a href="/note1lsreglfs5s5zm6e8ssavaak2adsajkad27axp00rvz734u443znqspwhvv" target="_blank">
                    The Network School of Rock is Live from Malaysia!
                  </a>
                  <div className="author-name">
                    <img src="https://m.primal.net/QIbm.jpg" alt="lucas" className="author-avatar" />
                    lucas
                  </div>
                </div>
                <div className="example-item">
                  <a href="/nevent1qqsphk43g2pzpwfr8qcp5zdx8ftgaj7gvxk682y4sedjvscrsm0lpssc96mm3" target="_blank">
                    Hola Barcelona! Pubpay me at the After Party of Bitcoin Cypher Conference!!!! @BCC 8333
                  </a>
                  <div className="author-name">
                    <img src="https://i.nostr.build/itlLMXlxccOBG06L.jpg" alt="Roger 9000" className="author-avatar" />
                    Roger 9000
                  </div>
                </div>
                <div className="example-item">
                  <a href="/naddr1qqjr2vehvyenvdtr94nrzetr956rgctr94skvvfs95eryep3x3snwve389nxyqg3waehxw309ahx7um5wgh8w6twv5hsygx0gknt5ymr44ldyyaq0rn3p5jpzkh8y8ymg773a06ytr4wldxz55psgqqqwensuq723w" target="_blank">
                    NoGood Radio is a 24/7 pirate radio station running on scrap parts and broadcasting from a basement somewhere.
                  </a>
                  <div className="author-name">
                    <img src="https://blossom.nogood.studio/458fee0afeba08618c9b9bea4f77b73d62f480c00dffe60d14b4b6a51045d122.jpg" alt="NoGood Radio" className="author-avatar" />
                    NoGood Radio
                  </div>
                </div>
              </div>

              {/* Footer */}
              <div className="note-loader-footer">
                <div className="footer-links">
                  <a href="https://nostr.com" target="_blank" className="footer-link">
                    Follow us
                  </a>
                  <a href="/" className="footer-link">
                    Powered by PubPay
                  </a>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Main two-column layout */}
      {showMainLayout && (
        <div id="mainLayout" className="main-layout">
          {/* Background image overlay for the entire layout */}
          <div className="liveZapOverlay"></div>

          {/* LEFT SIDE: Post/kind1 information (fixed, no scroll) */}
          <div className="left-side">
            <div className="post-info">
              <h3 className="section-label">Note Content</h3>

              {/* Author Section */}
              <div className="author-section">
                <img id="authorNameProfileImg" className="author-image" src={authorImage || '/images/gradient_color.gif'} />
                <div className="author-info">
                  <div id="authorName" className="author-name">{authorName}</div>
                </div>
              </div>

              {/* Note Content Section */}
              <div className="note-section">
                <div id="noteContent" className="note-content">
                  {noteContent || ''}
                </div>
              </div>

              {/* QR Code Section */}
              <div className="qr-section">
                <h3 className="section-label">scan to zap</h3>
                {/* Swiper for QR Code slideshow */}
                <div className="swiper qr-swiper">
                  <div className="swiper-wrapper">
                    <div className="swiper-slide">
                      <div className="qr-slide-title">Web <span className="qr-data-preview" id="qrDataPreview1"></span></div>
                      <a href="" target="_blank" id="qrcodeLinkNostr">
                        <img id="qrCode" className="qr-code" />
                      </a>
                      <div className="qr-slide-label">Scan with Camera APP</div>
                    </div>
                    <div className="swiper-slide">
                      <div className="qr-slide-title">Nostr <span className="qr-data-preview" id="qrDataPreview2"></span></div>
                      <a href="" target="_blank" id="qrcodeNeventLink">
                        <img id="qrCodeNevent" className="qr-code" />
                      </a>
                      <div className="qr-slide-label">Scan with Nostr client</div>
                    </div>
                    <div className="swiper-slide">
                      <div className="qr-slide-title">Nostr <span className="qr-data-preview" id="qrDataPreview3"></span></div>
                      <a href="" target="_blank" id="qrcodeNoteLink">
                        <img id="qrCodeNote" className="qr-code" />
                      </a>
                      <div className="qr-slide-label">Scan with Nostr client</div>
                    </div>
                    {/* Lightning Payment QR Slide */}
                    <div className="swiper-slide lightning-qr-slide" id="lightningQRSlide" style={{display: 'none'}}>
                      <div className="qr-slide-title">Lightning <span className="qr-data-preview" id="qrDataPreview4"></span></div>
                      <a href="" target="_blank" id="lightningQRLink">
                        <div id="lightningQRCode" className="qr-code"></div>
                      </a>
                      <div className="qr-slide-label">Scan with Lightning Wallet</div>
                    </div>
                  </div>
                  <div className="swiper-pagination"></div>
                </div>
              </div>
            </div>
          </div>

          {/* RIGHT SIDE: Zaps (can overflow/scroll) */}
          <div className="right-side">
            <div className="zaps-header">
              <div className="zaps-header-left">
                <h3 className="section-label">zap stats</h3>
                <div>
                
                <span id="zappedTotalValue" className="total-amount">{totalAmount}</span>
                <span className="total-sats">sats</span>
                <span className="zap-count-separator">•</span>
                <span id="zappedTotalCount" className="total-count">{totalZaps}</span>
                <span className="total-zaps">zaps</span>
                </div>
              </div>

              <div className="zaps-header-right">
                <button id="styleToggleBtn" className="style-toggle-btn">
                  ⚙️
                </button>

                <div className="powered-by">
                  <img id="partnerLogo" src="/images/gradient_color.gif" alt="Partner Logo" style={{display: 'none'}} />
                  <a href="https://pubpay.me" target="_blank">
                    <img src="/images/powered_by_white_bg.png" />
                  </a>
                </div>
              </div>
            </div>

            {/* Top Zappers Bar */}
            <div id="top-zappers-bar" className="top-zappers-bar" style={{display: 'none'}}>
              <h3 className="section-label">cumulative zaps leaderboard</h3>
              <div className="top-zappers-list">
                <div className="top-zapper" id="top-zapper-1">
                  <div className="zapper-rank">1</div>
                  <img className="zapper-avatar" src="/images/gradient_color.gif" alt="Top Zapper" />
                  <div className="zapper-info">
                    <div className="zapper-name">Loading...</div>
                    <div className="zapper-total">0 sats</div>
                  </div>
                </div>
                <div className="top-zapper" id="top-zapper-2">
                  <div className="zapper-rank">2</div>
                  <img className="zapper-avatar" src="/images/gradient_color.gif" alt="Top Zapper" />
                  <div className="zapper-info">
                    <div className="zapper-name">Loading...</div>
                    <div className="zapper-total">0 sats</div>
                  </div>
                </div>
                <div className="top-zapper" id="top-zapper-3">
                  <div className="zapper-rank">3</div>
                  <img className="zapper-avatar" src="/images/gradient_color.gif" alt="Top Zapper" />
                  <div className="zapper-info">
                    <div className="zapper-name">Loading...</div>
                    <div className="zapper-total">0 sats</div>
                  </div>
                </div>
                <div className="top-zapper" id="top-zapper-4">
                  <div className="zapper-rank">4</div>
                  <img className="zapper-avatar" src="/images/gradient_color.gif" alt="Top Zapper" />
                  <div className="zapper-info">
                    <div className="zapper-name">Loading...</div>
                    <div className="zapper-total">0 sats</div>
                  </div>
                </div>
                <div className="top-zapper" id="top-zapper-5">
                  <div className="zapper-rank">5</div>
                  <img className="zapper-avatar" src="/images/gradient_color.gif" alt="Top Zapper" />
                  <div className="zapper-info">
                    <div className="zapper-name">Loading...</div>
                    <div className="zapper-total">0 sats</div>
                  </div>
                </div>
              </div>
            </div>

            <div className="zaps-container">
              <h3 className="section-label">top zaps</h3>
              <div id="zaps" className="zaps-list">
                {/* Zaps will be populated here */}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Style options modal */}
      <div id="styleOptionsModal">
        <div className="style-options-content">
          <div className="style-options-header">
            <h2>STYLE OPTIONS</h2>
            <button className="close-button" onClick={handleStyleOptionsClose}>&times;</button>
          </div>
          <div className="style-options-body">
            {/* Style Presets Section */}
            <div className="style-section">
              <h3 className="section-title">QUICK PRESETS</h3>
              <div className="presets-container">
                <button className="preset-btn" data-preset="lightMode">Light Mode</button>
                <button className="preset-btn" data-preset="darkMode">Dark Mode</button>
                <button className="preset-btn" data-preset="cosmic">Cosmic</button>
                <button className="preset-btn" data-preset="vibrant">Vibrant</button>
                <button className="preset-btn" data-preset="electric">Electric</button>
                <button className="preset-btn" data-preset="warm">Warm</button>
                <button className="preset-btn" data-preset="adopting">Adopting</button>
                <button className="preset-btn" data-preset="bitcoinConf">Bitcoin Conf</button>
              </div>
            </div>

            {/* Colors Section */}
            <div className="style-section">
              <h3 className="section-title">COLORS</h3>
              <div className="colors-container">
                <div className="style-option-group">
                  <label htmlFor="textColorPicker">Text Color</label>
                  <div className="color-picker-container">
                    <input type="color" id="textColorPicker" defaultValue="#000000" />
                    <input type="text" id="textColorValue" defaultValue="#000000" placeholder="#000000" />
                  </div>
                </div>
                <div className="style-option-group">
                  <label htmlFor="bgColorPicker">Background Color</label>
                  <div className="color-picker-container">
                    <input type="color" id="bgColorPicker" defaultValue="#ffffff" />
                    <input type="text" id="bgColorValue" defaultValue="#ffffff" placeholder="#ffffff" />
                  </div>
                </div>
              </div>
              <div className="opacity-container">
                <div className="style-option-group">
                  <label htmlFor="textOpacitySlider">Text Opacity</label>
                  <div className="slider-container">
                    <input type="range" id="textOpacitySlider" min="0.1" max="1.0" step="0.1" defaultValue="1.0" />
                    <span id="textOpacityValue">100%</span>
                  </div>
                </div>
                <div className="style-option-group">
                  <label htmlFor="opacitySlider">Background Opacity</label>
                  <div className="slider-container">
                    <input type="range" id="opacitySlider" min="0.0" max="1.0" step="0.1" defaultValue="1.0" />
                    <span id="opacityValue">100%</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Background Section */}
            <div className="style-section">
              <h3 className="section-title">BACKGROUND</h3>
              <div className="style-option-group full-width">
                <label htmlFor="bgImagePreset">Choose Background</label>
                <div className="bg-preset-controls">
                  <div className="preset-inputs">
                    <select id="bgImagePreset" className="bg-preset-select">
                      <option value="">No Background (Default)</option>
                      <option value="/images/adopting.webp">Adopting Bitcoin</option>
                      <option value="/images/sky.jpg">Sky</option>
                      <option value="/images/lightning.gif">Lightning</option>
                      <option value="/images/bitcoin-rocket.gif">Bitcoin Rocket</option>
                      <option value="/images/bitcoin-astronaut.gif">Bitcoin Astronaut</option>
                      <option value="/images/bitcoin-space.gif">Bitcoin Space</option>
                      <option value="/images/bitcoin-sunset.gif">Bitcoin Sunset</option>
                      <option value="/images/bitcoin-rotating.gif">Bitcoin Rotating</option>
                      <option value="/images/nostr-ostriches.gif">Nostr Ostriches</option>
                      <option value="/images/send-zaps.gif">Send Zaps</option>
                      <option value="/images/gm-nostr.gif">GM Nostr</option>
                      <option value="custom">Custom URL</option>
                    </select>
                    <div className="url-input-container" id="customUrlGroup" style={{display: 'none'}}>
                      <input type="text" id="bgImageUrl" defaultValue="" placeholder="Enter image URL" />
                      <button id="clearBgImage" className="clear-button">Clear</button>
                    </div>
                  </div>
                  <div className="preset-preview-container">
                    <img id="bgPresetPreview" src="" alt="No background" />
                  </div>
                </div>
              </div>
            </div>

            {/* Partner Logo Section */}
            <div className="style-section">
              <h3 className="section-title">PARTNER LOGO</h3>
              <div className="style-option-group full-width">
                <label htmlFor="partnerLogoSelect">Partner Logo</label>
                <div className="partner-logo-controls">
                  <div className="preset-inputs">
                    <select id="partnerLogoSelect" className="partner-logo-select">
                      <option value="">None (Default)</option>
                      <option value="https://adoptingbitcoin.org/images/AB-logo.svg">Adopting Bitcoin</option>
                      <option value="https://cdn.prod.website-files.com/6488b0b0fcd2d95f6b83c9d4/653bd44cf83c3b0498c2e622_bitcoin_conference.svg">Bitcoin Conference</option>
                      <option value="custom">Custom URL</option>
                    </select>
                    <div className="url-input-container" id="customPartnerLogoGroup" style={{display: 'none'}}>
                      <input type="text" id="partnerLogoUrl" defaultValue="" placeholder="Enter logo URL" />
                      <button id="clearPartnerLogo" className="clear-button">Clear</button>
                    </div>
                  </div>
                  <div className="preset-preview-container">
                    <img id="partnerLogoPreview" src="/images/gradient_color.gif" alt="No partner logo" style={{height: '30px', maxWidth: '100px', objectFit: 'contain'}} />
                  </div>
                </div>
              </div>
            </div>

            {/* Layout Section */}
            <div className="style-section">
              <h3 className="section-title">LAYOUT</h3>
              <div className="toggles-container">
                <div className="style-option-group toggle-group">
                  <label className="toggle-label">
                    <div className="toggle-switch">
                      <input type="checkbox" id="layoutInvertToggle" />
                      <span className="toggle-slider"></span>
                    </div>
                    <span>Invert Layout</span>
                  </label>
                </div>
                <div className="style-option-group toggle-group">
                  <label className="toggle-label">
                    <div className="toggle-switch">
                      <input type="checkbox" id="hideZapperContentToggle" />
                      <span className="toggle-slider"></span>
                    </div>
                    <span>Hide Zapper Content</span>
                  </label>
                </div>
                <div className="style-option-group toggle-group">
                  <label className="toggle-label">
                    <div className="toggle-switch">
                      <input type="checkbox" id="showTopZappersToggle" />
                      <span className="toggle-slider"></span>
                    </div>
                    <span>Show All Time Zappers</span>
                  </label>
                </div>
                <div className="style-option-group toggle-group">
                  <label className="toggle-label">
                    <div className="toggle-switch">
                      <input type="checkbox" id="podiumToggle" />
                      <span className="toggle-slider"></span>
                    </div>
                    <span>Top 3 Podium</span>
                  </label>
                </div>
                <div className="style-option-group toggle-group">
                  <label className="toggle-label">
                    <div className="toggle-switch">
                      <input type="checkbox" id="zapGridToggle" />
                      <span className="toggle-slider"></span>
                    </div>
                    <span>Grid Layout</span>
                  </label>
                </div>
              </div>
            </div>

            {/* QR Code Effects Section */}
            <div className="style-section">
              <h3 className="section-title">QR CODE EFFECTS</h3>
              <div className="toggles-container">
                <div className="style-option-group toggle-group">
                  <label className="toggle-label">
                    <div className="toggle-switch">
                      <input type="checkbox" id="qrInvertToggle" />
                      <span className="toggle-slider"></span>
                    </div>
                    <span>Invert QR Code</span>
                  </label>
                </div>
                <div className="style-option-group toggle-group">
                  <label className="toggle-label">
                    <div className="toggle-switch">
                      <input type="checkbox" id="qrScreenBlendToggle" />
                      <span className="toggle-slider"></span>
                    </div>
                    <span>Screen Blend Mode</span>
                  </label>
                </div>
                <div className="style-option-group toggle-group">
                  <label className="toggle-label">
                    <div className="toggle-switch">
                      <input type="checkbox" id="qrMultiplyBlendToggle" />
                      <span className="toggle-slider"></span>
                    </div>
                    <span>Multiply Blend Mode</span>
                  </label>
                </div>
              </div>
            </div>

            {/* QR Slide Visibility Section */}
            <div className="style-section">
              <h3 className="section-title">QR SLIDE VISIBILITY</h3>
              <div className="toggles-container">
                <div className="style-option-group toggle-group">
                  <label className="toggle-label">
                    <div className="toggle-switch">
                      <input type="checkbox" id="qrShowWebLinkToggle" />
                      <span className="toggle-slider"></span>
                    </div>
                    <span>Show Web Link</span>
                  </label>
                </div>
                <div className="style-option-group toggle-group">
                  <label className="toggle-label">
                    <div className="toggle-switch">
                      <input type="checkbox" id="qrShowNeventToggle" />
                      <span className="toggle-slider"></span>
                    </div>
                    <span>Show Nostr Event</span>
                  </label>
                </div>
                <div className="style-option-group toggle-group">
                  <label className="toggle-label">
                    <div className="toggle-switch">
                      <input type="checkbox" id="qrShowNoteToggle" />
                      <span className="toggle-slider"></span>
                    </div>
                    <span>Show Note ID</span>
                  </label>
                </div>
                <div className="style-option-group toggle-group">
                  <label className="toggle-label">
                    <div className="toggle-switch">
                      <input type="checkbox" id="lightningToggle" />
                      <span className="toggle-slider"></span>
                    </div>
                    <span>Enable Lightning Payments</span>
                  </label>
                </div>
              </div>
              {/* Lightning Payment Status */}
              <div className="lightning-status-container" id="lightningStatusContainer" style={{display: 'none'}}>
                <div className="payment-status" id="paymentStatus">
                  {/* Status messages will appear here */}
                </div>
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="style-actions">
            <button id="resetStyles" className="action-btn secondary" onClick={resetToDefaults}>Reset</button>
            <button id="copyStyleUrl" className="action-btn primary" onClick={copyStyleUrl}>Copy Style URL</button>
          </div>
        </div>
      </div>
    </div>
  );
};
