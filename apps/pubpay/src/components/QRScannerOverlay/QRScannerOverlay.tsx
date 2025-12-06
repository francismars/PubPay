import React from 'react';
import { useQRScanner } from '../../hooks/useQRScanner';

interface QRScannerOverlayProps {
  isVisible: boolean;
  onClose: () => void;
  onNsecScanned?: (nsec: string) => void;
}

export const QRScannerOverlay: React.FC<QRScannerOverlayProps> = ({
  isVisible,
  onClose,
  onNsecScanned
}) => {
  const {
    isScannerRunning,
    cameraList,
    currentCameraId,
    zoomSupported,
    torchSupported,
    torchOn,
    zoomMin,
    zoomMax,
    zoomStep,
    zoomVal,
    showCameraPicker,
    setShowCameraPicker,
    selectCamera,
    applyZoom,
    toggleTorch
  } = useQRScanner({
    isVisible,
    onNsecScanned
  });

  return (
    <div
      className="overlayContainer"
      id="qrScanner"
      style={{
        display: 'flex',
        visibility: isVisible ? 'visible' : 'hidden',
        opacity: isVisible ? 1 : 0,
        pointerEvents: isVisible ? 'auto' : 'none',
        alignItems: 'center',
        justifyContent: 'center',
        animation: 'none',
        transition: 'none'
      }}
      onClick={onClose}
    >
      <div
        className="overlayInner"
        onClick={e => e.stopPropagation()}
        style={{
          transform: 'none',
          animation: 'none'
        }}
      >
        <div className="brand">
          PUB<span className="logoPay">PAY</span>
          <span className="logoMe">.me</span>
        </div>
        <p className="label" id="titleScanner">
          Scan QR code: <br />
          note/nevent, npub/nprofile, nsec <br />
          BOLT11 invoice, or Lightning Address
        </p>
        <div id="reader" style={{ position: 'relative' }}></div>

        {/* Camera Controls Container - iPhone Style */}
        <div className="camera-controls-container">
          {/* Zoom Slider - Top of controls */}
          {zoomSupported && (
            <div className="camera-zoom-control">
              <div className="zoom-value-display">{zoomVal.toFixed(1)}x</div>
              <div className="zoom-slider-wrapper">
                <input
                  type="range"
                  min={zoomMin}
                  max={zoomMax}
                  step={zoomStep}
                  value={zoomVal}
                  onChange={e => applyZoom(parseFloat(e.target.value))}
                  className="camera-zoom-slider"
                />
              </div>
            </div>
          )}

          {/* Bottom Control Bar */}
          <div className="camera-controls-bar">
            {/* Camera Switch Button */}
            {cameraList.length > 0 && (
              <div className="camera-control-button-wrapper">
                <button
                  className="camera-control-button"
                  onClick={e => {
                    e.preventDefault();
                    e.stopPropagation();
                    setShowCameraPicker(v => !v);
                  }}
                  title="Switch Camera"
                  aria-label="Switch Camera"
                >
                  <span className="material-symbols-outlined camera-icon">
                    cameraswitch
                  </span>
                </button>
                {showCameraPicker && (
                  <>
                    <div
                      className="camera-picker-overlay"
                      onClick={e => {
                        e.preventDefault();
                        e.stopPropagation();
                        setShowCameraPicker(false);
                      }}
                    />
                    <div className="camera-picker-menu">
                      {cameraList.map((c: any) => (
                        <button
                          key={c.id}
                          className={`camera-picker-item ${
                            c.id === currentCameraId ? 'active' : ''
                          }`}
                          onClick={e => {
                            e.preventDefault();
                            e.stopPropagation();
                            selectCamera(c.id);
                            setShowCameraPicker(false);
                          }}
                        >
                          <span className="material-symbols-outlined">
                            {/back|rear|environment/i.test(c.label)
                              ? 'camera_rear'
                              : /front|user|face/i.test(c.label)
                                ? 'camera_front'
                                : 'videocam'}
                          </span>
                          <span className="camera-picker-label">
                            {c.label || c.id}
                          </span>
                          {c.id === currentCameraId && (
                            <span className="material-symbols-outlined check-icon">
                              check
                            </span>
                          )}
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>
            )}

            {/* Torch Button */}
            {torchSupported && (
              <button
                className={`camera-control-button ${torchOn ? 'active' : ''}`}
                onClick={e => {
                  e.preventDefault();
                  e.stopPropagation();
                  toggleTorch();
                }}
                title={torchOn ? 'Turn off torch' : 'Turn on torch'}
                aria-label={torchOn ? 'Turn off torch' : 'Turn on torch'}
              >
                <span className="material-symbols-outlined camera-icon">
                  {torchOn ? 'flashlight_on' : 'flashlight_off'}
                </span>
              </button>
            )}
          </div>
        </div>
        <a
          id="stopScanner"
          href="#"
          className="label"
          onClick={e => {
            e.preventDefault();
            e.stopPropagation();
            onClose();
          }}
        >
          cancel
        </a>
      </div>
    </div>
  );
};

