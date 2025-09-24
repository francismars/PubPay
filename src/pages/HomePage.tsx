// Home page component - matches original index.html design exactly
import React, { useState, useEffect, useRef } from 'react';
import { useHomeFunctionality } from '@/hooks/useHomeFunctionality';
import { PayNoteComponent } from '@/components/PayNoteComponent';
import { PubPayPost } from '@/hooks/useHomeFunctionality';

export const HomePage: React.FC = () => {
  const [showQRScanner, setShowQRScanner] = useState(false);
  const [showLoginForm, setShowLoginForm] = useState(false);
  const [showLoggedInForm, setShowLoggedInForm] = useState(false);
  const [showInvoiceOverlay, setShowInvoiceOverlay] = useState(false);
  const [showJSON, setShowJSON] = useState(false);
  const [showNewPayNoteForm, setShowNewPayNoteForm] = useState(false);
  const [nsecInput, setNsecInput] = useState('');
  const [rememberMe, setRememberMe] = useState(false);
  const [qrScanner, setQrScanner] = useState<any>(null);
  const [extensionAvailable, setExtensionAvailable] = useState(true);
  const [externalSignerAvailable, setExternalSignerAvailable] = useState(true);
  const [externalSignerLoading, setExternalSignerLoading] = useState(false);
  const [currentInvoice, setCurrentInvoice] = useState<string>('');

  const qrReaderRef = useRef<HTMLDivElement>(null);

  const {
    isLoading,
    activeFeed,
    posts,
    followingPosts,
    isLoadingMore,
    authState,
    handleFeedChange,
    handleQRScanner,
    handleLogin,
    handleNewPayNote,
    handleSignInExtension,
    handleSignInExternalSigner,
    handleSignInNsec,
    handleContinueWithNsec,
    handleLogout,
    handlePayWithExtension,
    handlePayWithWallet,
    handleCopyInvoice,
    handlePostNote,
    loadMorePosts
  } = useHomeFunctionality();

  // Reset login form to main state
  const resetLoginForm = () => {
    document.getElementById('nsecInputGroup')!.style.display = 'none';
    document.getElementById('loginFormGroup')!.style.display = 'flex';
    setNsecInput('');
  };

  // Handler functions
  const handleSharePost = async (post: PubPayPost) => {
    const noteID = post.id;
    const shareURL = `${window.location.origin}/?note=${noteID}`;

    if (navigator.share) {
      try {
        await navigator.share({
          title: "Check out this PubPay!",
          text: "Here's a PubPay I want to share with you:",
          url: shareURL,
        });
      } catch (error) {
        console.error("Error sharing the link:", error);
      }
    } else {
      try {
        await navigator.clipboard.writeText(shareURL);
        alert("Link copied to clipboard!");
      } catch (error) {
        console.error("Failed to copy the link:", error);
      }
    }
  };

  const handleViewRaw = (post: PubPayPost) => {
    setShowJSON(true);
    // The JSON will be displayed in the overlay
  };

  const handleQRScannerOpen = () => {
    setShowQRScanner(true);
  };

  const handleScannedContent = async (decodedText: string) => {
    try {
      const regex = /(note1[qpzry9x8gf2tvdw0s3jn54khce6mua7l]{58,}|nevent1[qpzry9x8gf2tvdw0s3jn54khce6mua7l]{58,})/i;
      const match = decodedText.match(regex);
      if (!match) return;
      
      decodedText = match[0];
      
      if (typeof window !== 'undefined' && (window as any).NostrTools) {
        const decoded = (window as any).NostrTools.nip19.decode(decodedText);

        if (decoded.type === "note") {
          window.location.href = `/?note=${decodedText}`;
        } else if (decoded.type === "nevent") {
          const noteID = decoded.data.id;
          const note1 = (window as any).NostrTools.nip19.noteEncode(noteID);
          window.location.href = `/?note=${note1}`;
        } else {
          console.error("Invalid QR code content. Expected 'note' or 'nevent'.");
        }
      }
    } catch (error) {
      console.error("Failed to decode QR code content:", error);
    }
  };

  const handleLoginOpen = () => {
    if (authState.isLoggedIn) {
      setShowLoggedInForm(true);
    } else {
      resetLoginForm();
      setShowLoginForm(true);
    }
  };

  const handleNsecContinue = () => {
    if (nsecInput.trim()) {
      handleContinueWithNsec(nsecInput, rememberMe);
      setNsecInput('');
      setShowLoginForm(false);
    }
  };

  const handlePostNoteSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const formData = new FormData(e.target as HTMLFormElement);
    const data: Record<string, string> = {};
    
    for (const [key, value] of formData.entries()) {
      data[key] = value.toString();
    }
    
    // Show "Publishing..." state
    const submitButton = document.getElementById('postNote');
    if (submitButton) {
      submitButton.textContent = 'Publishing...';
    }
    
    try {
      await handlePostNote(data);
      
      // Close the form after successful submission
      setShowNewPayNoteForm(false);
      
      // Reset form fields
      (e.target as HTMLFormElement).reset();
      
      // Reset radio button to fixed
      const fixedRadio = document.getElementById('fixedFlow') as HTMLInputElement;
      if (fixedRadio) {
        fixedRadio.checked = true;
        document.getElementById('fixedInterface')!.style.display = 'block';
        document.getElementById('rangeInterface')!.style.display = 'none';
      }
    } catch (error) {
      console.error('Failed to post note:', error);
    } finally {
      // Reset button text
      if (submitButton) {
        submitButton.textContent = 'Publish';
      }
    }
  };

  // Initialize button states on mount
  useEffect(() => {
    // Both buttons start as available - they only get disabled after failed attempts
    setExtensionAvailable(true);
    setExternalSignerAvailable(true);
  }, []);

  // Handle return from external signer
  useEffect(() => {
    const handleVisibilityChange = async () => {
      if (document.visibilityState === "visible") {
        // Wait for page to have focus
        while (!document.hasFocus()) {
          await new Promise((resolve) => setTimeout(resolve, 100));
        }

        const signInData = JSON.parse(sessionStorage.getItem("signIn") || 'null');
        if (signInData && signInData.rememberMe !== undefined) {
          sessionStorage.removeItem("signIn");
          
          try {
            // Get the public key from clipboard (external signer puts it there)
            const npub = await navigator.clipboard.readText();
            const decodedNPUB = window.NostrTools.nip19.decode(npub);
            const pubKey = decodedNPUB.data;
            
            // Store authentication data
            if (signInData.rememberMe === true) {
              localStorage.setItem("publicKey", pubKey);
              localStorage.setItem("signInMethod", "externalSigner");
            } else {
              sessionStorage.setItem("publicKey", pubKey);
              sessionStorage.setItem("signInMethod", "externalSigner");
            }
            
            // Reset button state
            setExternalSignerLoading(false);
            setExternalSignerAvailable(true);
            
            // Close login form
            setShowLoginForm(false);
            
            // Reload the page to trigger authentication
            window.location.reload();
          } catch (error) {
            console.error('Failed to process external signer return:', error);
            setExternalSignerLoading(false);
            setExternalSignerAvailable(false);
          }
        }
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, []);

  // Initialize QR scanner when overlay opens
  useEffect(() => {
    if (showQRScanner && !qrScanner && typeof window !== 'undefined' && (window as any).Html5Qrcode) {
      // Add a small delay to ensure DOM element is ready
      setTimeout(() => {
        const readerElement = document.getElementById("reader");
        if (readerElement) {
          const html5QrCode = new (window as any).Html5Qrcode("reader");
          setQrScanner(html5QrCode);
          
          html5QrCode.start(
            { facingMode: "environment" },
            {
              fps: 10,
              qrbox: { width: 250, height: 250 },
            },
            async (decodedText: string) => {
              console.log("QR Code scanned:", decodedText);
              html5QrCode.stop().then(() => {
                setShowQRScanner(false);
              });
              await handleScannedContent(decodedText);
            },
            (errorMessage: string) => {
              console.error("QR Code scanning error:", errorMessage);
            }
          ).catch((error: any) => {
            console.error("Failed to start QR scanner:", error);
          });
        }
      }, 100);
    }
  }, [showQRScanner]);

  // Cleanup QR scanner when overlay closes
  useEffect(() => {
    if (!showQRScanner && qrScanner) {
      // Check if scanner is running before trying to stop it
      qrScanner.getState().then((state: any) => {
        if (state === 'ACTIVE' || state === 'PAUSED') {
          return qrScanner.stop();
        }
      }).then(() => {
        setQrScanner(null);
      }).catch((error: any) => {
        console.error("Error stopping QR scanner:", error);
        setQrScanner(null);
      });
    }
  }, [showQRScanner, qrScanner]);

  // Cleanup QR scanner on unmount
  useEffect(() => {
    return () => {
      if (qrScanner) {
        qrScanner.getState().then((state: any) => {
          if (state === 'ACTIVE' || state === 'PAUSED') {
            return qrScanner.stop();
          }
        }).catch((error: any) => {
          console.error("Error stopping QR scanner on unmount:", error);
        });
      }
    };
  }, [qrScanner]);

  return (
    <div>

      <div id="nav">
        <div id="navInner">
          <a id="logo" href="/">
            PUB<span style={{color: '#000'}}>PAY</span><span style={{color: '#0000001c'}}>.me</span><span className="version">alpha 0.02</span>
          </a>
          <div id="navActions">
            <a id="scanQrCode" className="topAction" title="Scan QR Code" onClick={handleQRScannerOpen}>
              <span className="material-symbols-outlined">photo_camera</span>
            </a>
            <a id="settings" href="#" style={{display: 'none'}} className="topAction disabled" title="coming soon">
              <span className="material-symbols-outlined">settings</span>
            </a>
            <a id="login" href="#" className="topAction" onClick={handleLoginOpen}>
              {authState.isLoggedIn && authState.userProfile ? (
                <img 
                  className="userImg currentUserImg"
                  src={JSON.parse(authState.userProfile.content).picture || 'https://icon-library.com/images/generic-user-icon/generic-user-icon-10.jpg'}
                  alt="Profile"
                />
              ) : (
                <span className="material-symbols-outlined">account_circle</span>
              )}
            </a>
            <a id="newPayNote" className="cta" href="#" onClick={() => { handleNewPayNote(); setShowNewPayNoteForm(true); }}>
              New <span className="hideOnMobile">Paynote</span>
            </a>
          </div>
        </div>
      </div>

      <div id="container">
        <div id="feedSelector">
          <a href="#" id="feedGlobal" className={`feedSelectorLink ${activeFeed === 'global' ? 'active' : ''}`} onClick={() => handleFeedChange('global')}>
            Global
          </a>
          <a href="#" id="feedFollowing" className={`feedSelectorLink ${activeFeed === 'following' ? 'active' : ''}`} onClick={() => handleFeedChange('following')}>
            Following
          </a>
          <a href="#" className="feedSelectorLink disabled" title="coming soon">
            High Rollers
          </a>
        </div>

        <div id="main" style={{display: activeFeed === 'global' ? 'block' : 'none'}}>
          {isLoading && posts.length === 0 ? (
            // Show dummy posts while loading
            <>
              <div className="paynote blink">
                <div className="noteProfileImg">
                  <img
                    className="userImg"
                    src="https://icon-library.com/images/generic-user-icon/generic-user-icon-10.jpg"
                    alt="Profile"
                  />
                </div>
                <div className="noteData">
                  <div className="noteHeader">
                    <div className="noteAuthor">
                      <div className="noteDisplayName">
                        <a href="#" className="noteAuthorLink disabled" target="_blank">Loading...</a>
                      </div>
                      <div className="noteNIP05 label">
                        <a href="#" target="_blank">
                          <span className="material-symbols-outlined">check_circle</span>
                          loading@example.com
                        </a>
                      </div>
                      <div className="noteLNAddress label">
                        <a href="#" target="_blank">
                          <span className="material-symbols-outlined">bolt</span>
                          loading@example.com
                        </a>
                      </div>
                    </div>
                    <div className="noteDate label">Loading...</div>
                  </div>
                  <div className="noteContent disabled">Loading posts...</div>
                  <div className="noteValues">
                    <div className="zapMin">
                      <span className="zapMinVal disabled">Loading...</span>
                      <span className="label">sats<br />Min</span>
                    </div>
                    <div className="zapMax">
                      <span className="zapMaxVal disabled">Loading...</span>
                      <span className="label">sats<br />Max</span>
                    </div>
                    <div className="zapUses">
                      <span className="zapUsesCurrent disabled">0</span>
                      <span className="label">of</span>
                      <span className="zapUsesTotal disabled">5</span>
                    </div>
                  </div>
                  <div className="noteCTA">
                    <button className="noteMainCTA cta disabled">Pay</button>
                  </div>
                  <div className="noteActionsReactions">
                    <div className="noteZaps noteZapReactions"></div>
                    <div className="noteActions">
                      <a className="noteAction disabled">
                        <span className="material-symbols-outlined">bolt</span>
                      </a>
                      <a className="noteAction disabled">
                        <span className="material-symbols-outlined">favorite</span>
                      </a>
                      <a className="noteAction disabled">
                        <span className="material-symbols-outlined">ios_share</span>
                      </a>
                      <div className="noteAction dropdown">
                        <button className="dropbtn">
                          <span className="material-symbols-outlined disabled">more_horiz</span>
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
              <div className="paynote blink">
                <div className="noteProfileImg">
                  <img
                    className="userImg"
                    src="https://icon-library.com/images/generic-user-icon/generic-user-icon-10.jpg"
                    alt="Profile"
                  />
                </div>
                <div className="noteData">
                  <div className="noteHeader">
                    <div className="noteAuthor">
                      <div className="noteDisplayName">
                        <a href="#" className="noteAuthorLink disabled" target="_blank">Loading...</a>
                      </div>
                      <div className="noteNIP05 label">
                        <a href="#" target="_blank">
                          <span className="material-symbols-outlined">check_circle</span>
                          loading@example.com
                        </a>
                      </div>
                      <div className="noteLNAddress label">
                        <a href="#" target="_blank">
                          <span className="material-symbols-outlined">bolt</span>
                          loading@example.com
                        </a>
                      </div>
                    </div>
                    <div className="noteDate label">Loading...</div>
                  </div>
                  <div className="noteContent disabled">Loading posts...</div>
                  <div className="noteValues">
                    <div className="zapMin">
                      <span className="zapMinVal disabled">Loading...</span>
                      <span className="label">sats<br />Min</span>
                    </div>
                    <div className="zapMax">
                      <span className="zapMaxVal disabled">Loading...</span>
                      <span className="label">sats<br />Max</span>
                    </div>
                    <div className="zapUses">
                      <span className="zapUsesCurrent disabled">0</span>
                      <span className="label">of</span>
                      <span className="zapUsesTotal disabled">5</span>
                    </div>
                  </div>
                  <div className="noteCTA">
                    <button className="noteMainCTA cta disabled">Pay</button>
                  </div>
                  <div className="noteActionsReactions">
                    <div className="noteZaps noteZapReactions"></div>
                    <div className="noteActions">
                      <a className="noteAction disabled">
                        <span className="material-symbols-outlined">bolt</span>
                      </a>
                      <a className="noteAction disabled">
                        <span className="material-symbols-outlined">favorite</span>
                      </a>
                      <a className="noteAction disabled">
                        <span className="material-symbols-outlined">ios_share</span>
                      </a>
                      <div className="noteAction dropdown">
                        <button className="dropbtn">
                          <span className="material-symbols-outlined disabled">more_horiz</span>
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
              <div className="paynote blink">
                <div className="noteProfileImg">
                  <img
                    className="userImg"
                    src="https://icon-library.com/images/generic-user-icon/generic-user-icon-10.jpg"
                    alt="Profile"
                  />
                </div>
                <div className="noteData">
                  <div className="noteHeader">
                    <div className="noteAuthor">
                      <div className="noteDisplayName">
                        <a href="#" className="noteAuthorLink disabled" target="_blank">Loading...</a>
                      </div>
                      <div className="noteNIP05 label">
                        <a href="#" target="_blank">
                          <span className="material-symbols-outlined">check_circle</span>
                          loading@example.com
                        </a>
                      </div>
                      <div className="noteLNAddress label">
                        <a href="#" target="_blank">
                          <span className="material-symbols-outlined">bolt</span>
                          loading@example.com
                        </a>
                      </div>
                    </div>
                    <div className="noteDate label">Loading...</div>
                  </div>
                  <div className="noteContent disabled">Loading posts...</div>
                  <div className="noteValues">
                    <div className="zapMin">
                      <span className="zapMinVal disabled">Loading...</span>
                      <span className="label">sats<br />Min</span>
                    </div>
                    <div className="zapMax">
                      <span className="zapMaxVal disabled">Loading...</span>
                      <span className="label">sats<br />Max</span>
                    </div>
                    <div className="zapUses">
                      <span className="zapUsesCurrent disabled">0</span>
                      <span className="label">of</span>
                      <span className="zapUsesTotal disabled">5</span>
                    </div>
                  </div>
                  <div className="noteCTA">
                    <button className="noteMainCTA cta disabled">Pay</button>
                  </div>
                  <div className="noteActionsReactions">
                    <div className="noteZaps noteZapReactions"></div>
                    <div className="noteActions">
                      <a className="noteAction disabled">
                        <span className="material-symbols-outlined">bolt</span>
                      </a>
                      <a className="noteAction disabled">
                        <span className="material-symbols-outlined">favorite</span>
                      </a>
                      <a className="noteAction disabled">
                        <span className="material-symbols-outlined">ios_share</span>
                      </a>
                      <div className="noteAction dropdown">
                        <button className="dropbtn">
                          <span className="material-symbols-outlined disabled">more_horiz</span>
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </>
          ) : posts.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px', color: '#666' }}>
              No posts found
            </div>
          ) : (
            posts.map((post) => (
              <PayNoteComponent
                key={post.id}
                post={post}
                onPay={handlePayWithExtension}
                onShare={handleSharePost}
                onViewRaw={handleViewRaw}
                isLoggedIn={authState.isLoggedIn}
              />
            ))
          )}
          
          {isLoadingMore && (
            <div style={{ textAlign: 'center', padding: '20px', color: '#666' }}>
              Loading more posts...
            </div>
          )}
          
          {posts.length > 0 && !isLoadingMore && (
            <div style={{ textAlign: 'center', padding: '20px' }}>
            <button
              onClick={() => loadMorePosts()}
              style={{
                backgroundColor: '#0066cc',
                color: 'white',
                border: 'none',
                padding: '8px 16px',
                borderRadius: '4px',
                cursor: 'pointer'
              }}
            >
              Load More
            </button>
            </div>
          )}
        </div>
        
        <div id="following" style={{display: activeFeed === 'following' ? 'block' : 'none'}}>
          {isLoading && followingPosts.length === 0 ? (
            // Show dummy posts while loading following
            <>
              <div className="paynote blink">
                <div className="noteProfileImg">
                  <img
                    className="userImg"
                    src="https://icon-library.com/images/generic-user-icon/generic-user-icon-10.jpg"
                    alt="Profile"
                  />
                </div>
                <div className="noteData">
                  <div className="noteHeader">
                    <div className="noteAuthor">
                      <div className="noteDisplayName">
                        <a href="#" className="noteAuthorLink disabled" target="_blank">Loading...</a>
                      </div>
                      <div className="noteNIP05 label">
                        <a href="#" target="_blank">
                          <span className="material-symbols-outlined">check_circle</span>
                          loading@example.com
                        </a>
                      </div>
                      <div className="noteLNAddress label">
                        <a href="#" target="_blank">
                          <span className="material-symbols-outlined">bolt</span>
                          loading@example.com
                        </a>
                      </div>
                    </div>
                    <div className="noteDate label">Loading...</div>
                  </div>
                  <div className="noteContent disabled">Loading following posts...</div>
                  <div className="noteValues">
                    <div className="zapMin">
                      <span className="zapMinVal disabled">Loading...</span>
                      <span className="label">sats<br />Min</span>
                    </div>
                    <div className="zapMax">
                      <span className="zapMaxVal disabled">Loading...</span>
                      <span className="label">sats<br />Max</span>
                    </div>
                    <div className="zapUses">
                      <span className="zapUsesCurrent disabled">0</span>
                      <span className="label">of</span>
                      <span className="zapUsesTotal disabled">5</span>
                    </div>
                  </div>
                  <div className="noteCTA">
                    <button className="noteMainCTA cta disabled">Pay</button>
                  </div>
                  <div className="noteActionsReactions">
                    <div className="noteZaps noteZapReactions"></div>
                    <div className="noteActions">
                      <a className="noteAction disabled">
                        <span className="material-symbols-outlined">bolt</span>
                      </a>
                      <a className="noteAction disabled">
                        <span className="material-symbols-outlined">favorite</span>
                      </a>
                      <a className="noteAction disabled">
                        <span className="material-symbols-outlined">ios_share</span>
                      </a>
                      <div className="noteAction dropdown">
                        <button className="dropbtn">
                          <span className="material-symbols-outlined disabled">more_horiz</span>
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </>
          ) : followingPosts.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px', color: '#666' }}>
              No following posts found
            </div>
          ) : (
            followingPosts.map((post) => (
              <PayNoteComponent
                key={post.id}
                post={post}
                onPay={handlePayWithExtension}
                onShare={handleSharePost}
                onViewRaw={handleViewRaw}
                isLoggedIn={authState.isLoggedIn}
              />
            ))
          )}
        </div>
      </div>

      {/* QR Scanner Overlay */}
      <div className="overlayContainer" id="qrScanner" style={{display: showQRScanner ? 'flex' : 'none'}}>
        <div className="overlayInner">
          <div className="brand">PUB<span style={{color: '#cecece'}}>PAY</span><span style={{color: '#00000014'}}>.me</span></div>
          <p className="label" id="titleScanner">Scan note1 or nevent1 QR code</p>
          <div id="reader"></div>
          <a id="stopScanner" href="#" className="label" onClick={() => {
            if (qrScanner) {
              qrScanner.getState().then((state: any) => {
                if (state === 'ACTIVE' || state === 'PAUSED') {
                  return qrScanner.stop();
                }
              }).then(() => {
                setShowQRScanner(false);
              }).catch((error: any) => {
                console.error("Error stopping QR scanner:", error);
                setShowQRScanner(false);
              });
            } else {
              setShowQRScanner(false);
            }
          }}>cancel</a>
        </div>
      </div>

      {/* Login Form Overlay */}
      <div className="overlayContainer" id="loginForm" style={{display: showLoginForm ? 'flex' : 'none'}}>
        <div className="overlayInner">
          <div className="brand">PUB<span style={{color: '#cecece'}}>PAY</span><span style={{color: '#00000014'}}>.me</span></div>
          <p className="label" id="titleSignin">Choose Sign-in Method</p>
          <div className="formFieldGroup" id="loginFormGroup">
            <a 
              href="#" 
              id="signInExtension" 
              className={`cta ${!extensionAvailable ? 'disabled red' : ''}`}
              onClick={async (e) => {
                if (!extensionAvailable) {
                  e.preventDefault();
                  return;
                }
                try {
                  const result = await handleSignInExtension(rememberMe);
                  // Only close the form if sign in was successful
                  if (result && result.success) {
                    setShowLoginForm(false);
                  } else {
                    // If extension is not available, disable the button
                    setExtensionAvailable(false);
                  }
                } catch (error) {
                  console.error('Extension sign in failed:', error);
                  setExtensionAvailable(false);
                }
              }}
            >
              {!extensionAvailable ? 'Not found' : 'Extension'}
            </a>
            <a 
              href="#" 
              id="signInexternalSigner" 
              className={`cta ${!externalSignerAvailable ? 'disabled red' : ''}`}
              onClick={async (e) => {
                if (!externalSignerAvailable || externalSignerLoading) {
                  e.preventDefault();
                  return;
                }
                try {
                  setExternalSignerLoading(true);
                  const result = await handleSignInExternalSigner(rememberMe);
                  // Only close the form if sign in was successful
                  if (result && result.success) {
                    setShowLoginForm(false);
                  } else {
                    // If external signer failed, disable the button
                    setExternalSignerAvailable(false);
                    setExternalSignerLoading(false);
                  }
                } catch (error) {
                  console.error('External signer failed:', error);
                  setExternalSignerAvailable(false);
                  setExternalSignerLoading(false);
                }
              }}
            >
              {!externalSignerAvailable ? 'Not found' : externalSignerLoading ? 'Loading...' : 'Signer'}
            </a>
            <a href="#" id="signInNsec" className="cta" onClick={() => {
              document.getElementById('nsecInputGroup')!.style.display = 'block';
              document.getElementById('loginFormGroup')!.style.display = 'none';
            }}>NSEC</a>
          </div>
          <div id="nsecInputGroup" style={{display: 'none'}}>
            <form onSubmit={(e) => { e.preventDefault(); handleNsecContinue(); }}>
              <input
                type="password"
                id="nsecInput"
                placeholder="Enter your nsec"
                className="inputField"
                value={nsecInput}
                onChange={(e) => setNsecInput(e.target.value)}
                required
              />
              <button id="continueWithNsec" className="cta" type="submit" onClick={async () => {
                await handleContinueWithNsec(nsecInput, rememberMe);
                setShowLoginForm(false);
              }}>Continue</button>
            </form>
          </div>
          <div className="rememberPK">
            <label htmlFor="rememberMe" className="label">Remember</label>
            <input 
              type="checkbox" 
              className="checkBoxRemember" 
              id="rememberMe" 
              checked={rememberMe}
              onChange={(e) => setRememberMe(e.target.checked)}
            />
          </div>
          <a id="cancelLogin" href="#" className="label" onClick={() => {
            resetLoginForm();
            setShowLoginForm(false);
          }}>cancel</a>
        </div>
      </div>

      {/* Logged In Form Overlay */}
      <div className="overlayContainer" id="loggedInForm" style={{display: showLoggedInForm ? 'flex' : 'none'}}>
        <div className="overlayInner">
          <div className="brand">PUB<span style={{color: '#cecece'}}>PAY</span><span style={{color: '#00000014'}}>.me</span></div>
          <p className="label">You are logged in as:</p>
          <p id="loggedInPublicKey">
            {authState.publicKey ? 
              (typeof window !== 'undefined' && (window as any).NostrTools ? 
                (window as any).NostrTools.nip19.npubEncode(authState.publicKey) : 
                authState.publicKey
              ) : 'Unknown'
            }
          </p>
          <p className="label">Sign-in Method:</p>
          <span id="loggedInMethod">{authState.signInMethod || 'Unknown'}</span>
          <a href="" id="logoutButton" className="cta" onClick={handleLogout}>Logout</a>
          <a id="cancelLoggedin" href="#" className="label" onClick={() => setShowLoggedInForm(false)}>cancel</a>
        </div>
      </div>

      {/* Invoice Overlay */}
      <div className="overlayContainer" id="invoiceOverlay" style={{display: showInvoiceOverlay ? 'flex' : 'none'}}>
        <div className="overlayInner">
          <div className="brand">PUB<span style={{color: '#cecece'}}>PAY</span><span style={{color: '#00000014'}}>.me</span></div>
          <p id="qrcodeTitle" className="label">Scan Invoice to Pay Zap</p>
          <canvas id="invoiceQR"></canvas>
          <p id="qrcodeTitle" className="label">Otherwise:</p>
          <div className="formFieldGroup">
            <button id="payWithExtension" className="cta" onClick={() => handlePayWithExtension({} as PubPayPost, 0)}>Pay with Extension</button>
            <button id="payWithWallet" className="cta" onClick={() => handlePayWithWallet({} as PubPayPost, 0)}>Pay with Wallet</button>
            <button id="copyInvoice" className="cta" onClick={() => handleCopyInvoice(currentInvoice)}>Copy Invoice</button>
          </div>
          <a id="closeInvoiceOverlay" href="#" className="label" onClick={() => setShowInvoiceOverlay(false)}>Close</a>
        </div>
      </div>

      {/* JSON Viewer Overlay */}
      <div className="overlayContainer" id="viewJSON" style={{display: showJSON ? 'flex' : 'none'}}>
        <div className="overlayInner">
          <pre id="noteJSON"></pre>
          <a id="closeJSON" href="#" className="label" onClick={() => setShowJSON(false)}>close</a>
        </div>
      </div>

      {/* New Pay Note Form Overlay */}
      <div className="overlayContainer" id="newPayNoteForm" style={{display: showNewPayNoteForm ? 'flex' : 'none'}}>
        <div className="overlayInner">
          <div className="brand">PUB<span style={{color: '#cecece'}}>PAY</span><span style={{color: '#00000014'}}>.me</span></div>
          <form id="newKind1" onSubmit={handlePostNoteSubmit}>
            <div className="formField">
              <label htmlFor="payNoteContent" className="label">Your Payment Request</label>
              <textarea id="payNoteContent" name="payNoteContent" rows={4} placeholder="Payment Request Description"></textarea>
            </div>

            <fieldset className="formField formSelector">
              <legend className="uppercase">Select type</legend>
              <div>
                <input 
                  type="radio" 
                  id="fixedFlow" 
                  name="paymentType" 
                  value="fixed" 
                  defaultChecked 
                  onChange={(e) => {
                    if (e.target.checked) {
                      document.getElementById('fixedInterface')!.style.display = 'block';
                      document.getElementById('rangeInterface')!.style.display = 'none';
                      (document.getElementById('zapMin') as HTMLInputElement)!.value = '';
                      (document.getElementById('zapMax') as HTMLInputElement)!.value = '';
                    }
                  }}
                />
                <label htmlFor="fixedFlow">Fixed</label>
              </div>
              <div>
                <input 
                  type="radio" 
                  id="rangeFlow" 
                  name="paymentType" 
                  value="range" 
                  onChange={(e) => {
                    if (e.target.checked) {
                      document.getElementById('rangeInterface')!.style.display = 'flex';
                      document.getElementById('fixedInterface')!.style.display = 'none';
                      (document.getElementById('zapFixed') as HTMLInputElement)!.value = '';
                    }
                  }}
                />
                <label htmlFor="rangeFlow">Range</label>
              </div>
              <div className="disabled">
                <input type="radio" id="targetFlow" name="paymentType" value="target" disabled />
                <label htmlFor="targetFlow">Target</label>
              </div>
            </fieldset>

            <div className="formFieldGroup" id="fixedInterface">
              <div className="formField">
                <label htmlFor="zapFixed" className="label">Fixed Amount* <span className="tagName">zap-min = zap-max</span></label>
                <input type="number" min={1} id="zapFixed" placeholder="1" name="zapFixed" required />
              </div>
            </div>

            <div className="formFieldGroup" id="rangeInterface" style={{display: 'none'}}>
              <div className="formField">
                <label htmlFor="zapMin" className="label">Minimum* <span className="tagName">zap-min</span></label>
                <input type="number" min={1} id="zapMin" placeholder="1" name="zapMin" />
              </div>
              <div className="formField">
                <label htmlFor="zapMax" className="label">Maximum* <span className="tagName">zap-max</span></label>
                <input type="number" min={1} id="zapMax" placeholder="1000000000" name="zapMax" />
              </div>
            </div>

            <details className="formField">
              <summary className="legend summaryOptions">Advanced Options</summary>

              <div className="formFieldGroup">
                <div className="formField">
                  <label htmlFor="zapUses" className="label">Uses <span className="tagName">zap-uses</span></label>
                  <input type="number" min={1} id="zapUses" placeholder="1" name="zapUses" />
                </div>
                <div className="formField disabled">
                  <label htmlFor="zapIncrement" className="label">Increment <span className="tagName"></span></label>
                  <input type="text" id="zapIncrement" placeholder="0" name="zapIncrement" disabled />
                </div>
              </div>

              <div className="formField">
                <label htmlFor="zapPayer" className="label">Payer <span className="tagName">zap-payer</span></label>
                <input type="text" id="zapPayer" placeholder="npub1..." name="zapPayer" />
              </div>

              <div className="formField">
                <label htmlFor="overrideLNURL" className="label">Override receiving address<span className="tagName"> zap-lnurl</span></label>
                <input type="email" id="overrideLNURL" placeholder="address@lnprovider.net" name="overrideLNURL" />
              </div>

              <div className="formField disabled">
                <label htmlFor="redirectToNote" className="label">Redirect payment to note <span className="tagName">zap-redirect</span> </label>
                <input type="text" id="redirectToNote" placeholder="note1..." name="redirectToNote" disabled />
              </div>
            </details>
            <button type="submit" id="postNote" className="cta">Publish</button>
          </form>
          <a id="cancelNewNote" href="#" className="label" onClick={() => setShowNewPayNoteForm(false)}>cancel</a>
        </div>
      </div>
    </div>
  );
};
