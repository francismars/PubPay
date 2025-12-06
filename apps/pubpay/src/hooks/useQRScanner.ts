import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { STORAGE_KEYS } from '../constants';
import { handleQRCodeContent, extractNsecFromQR } from '../utils/qrCodeHandler';

interface UseQRScannerOptions {
  isVisible: boolean;
  onNsecScanned?: (nsec: string) => void;
}

export const useQRScanner = ({ isVisible, onNsecScanned }: UseQRScannerOptions) => {
  const navigate = useNavigate();
  const [qrScanner, setQrScanner] = useState<any>(null);
  const [isScannerRunning, setIsScannerRunning] = useState(false);
  const [cameraList, setCameraList] = useState<any[]>([]);
  const currentCameraIdRef = useRef<string | null>(null);
  const [zoomSupported, setZoomSupported] = useState(false);
  const [torchSupported, setTorchSupported] = useState(false);
  const [torchOn, setTorchOn] = useState(false);
  const [zoomMin, setZoomMin] = useState(1);
  const [zoomMax, setZoomMax] = useState(1);
  const [zoomStep, setZoomStep] = useState(0.1);
  const [zoomVal, setZoomVal] = useState(1);
  const [showCameraPicker, setShowCameraPicker] = useState(false);
  const isStoppingScannerRef = useRef(false);

  // Helper function to safely stop the QR scanner
  const safelyStopScanner = useCallback(async () => {
    // Prevent multiple simultaneous stop attempts
    if (isStoppingScannerRef.current) {
      return;
    }

    if (!qrScanner || !isScannerRunning) {
      // Scanner not running, just clear state
      setQrScanner(null);
      setIsScannerRunning(false);
      return;
    }

    isStoppingScannerRef.current = true;

    try {
      await qrScanner.stop();
      setIsScannerRunning(false);
      setQrScanner(null);
    } catch (error) {
      // Ignore errors - scanner might already be stopped or in transition
      console.log(
        'Scanner stop attempted (already stopped or in transition):',
        error
      );
      setIsScannerRunning(false);
      setQrScanner(null);
    } finally {
      isStoppingScannerRef.current = false;
    }
  }, [qrScanner, isScannerRunning]);

  // Initialize QR scanner when overlay opens
  useEffect(() => {
    const initScanner = async () => {
      if (
        isVisible &&
        !qrScanner &&
        (window as any).Html5Qrcode
      ) {
        try {
          const html5QrCode = new (window as any).Html5Qrcode('reader');

          // Start the scanner FIRST, then store it in state
          try {
            // Get available cameras
            const cams = await (window as any).Html5Qrcode.getCameras();
            setCameraList(cams);

            // Get saved camera preference
            const saved = localStorage.getItem(STORAGE_KEYS.QR_CAMERA_ID);
            const deviceId = saved && cams.length > 0 ? saved : cams[0]?.id;

            if (deviceId) {
              currentCameraIdRef.current = deviceId;

              await html5QrCode.start(
                deviceId,
                {
                  fps: 10,
                  qrbox: { width: 250, height: 250 },
                  aspectRatio: 1.0
                },
                (decodedText: string) => {
                  console.log('QR Code scanned:', decodedText);
                  setIsScannerRunning(false);
                  
                  // Check for nsec first (needs special handling)
                  const nsec = extractNsecFromQR(decodedText);
                  if (nsec && onNsecScanned) {
                    onNsecScanned(nsec);
                    safelyStopScanner();
                    return;
                  }

                  // Handle other QR code formats
                  handleQRCodeContent(decodedText, navigate).then(result => {
                    if (result.handled && result.shouldCloseScanner) {
                      safelyStopScanner();
                    }
                  });
                },
                (errorMessage: string) => {
                  // Ignore scanning errors - they're frequent and expected
                }
              );

              // Check for zoom support
              const capabilities = html5QrCode.getRunningTrackCapabilities();
              if (capabilities && capabilities.zoom) {
                setZoomSupported(true);
                setZoomMin(capabilities.zoom.min || 1);
                setZoomMax(capabilities.zoom.max || 1);
                setZoomStep(capabilities.zoom.step || 0.1);
                setZoomVal(capabilities.zoom.min || 1);
              }

              // Check for torch support
              if (capabilities && capabilities.torch) {
                setTorchSupported(true);
              }

              setQrScanner(html5QrCode);
              setIsScannerRunning(true);
              isStoppingScannerRef.current = false;
            }
          } catch (error) {
            console.error('Failed to start QR scanner:', error);
            setIsScannerRunning(false);
            isStoppingScannerRef.current = false;
          }
        } catch (error) {
          console.error('Failed to initialize QR scanner:', error);
        }
      }
    };

    initScanner();
  }, [isVisible, navigate, onNsecScanned, safelyStopScanner]);

  // Cleanup QR scanner when overlay closes
  useEffect(() => {
    // Only stop scanner when overlay is closed AND scanner is running
    if (!isVisible && qrScanner && isScannerRunning) {
      safelyStopScanner();
    }
  }, [isVisible, qrScanner, isScannerRunning, safelyStopScanner]);

  // Cleanup QR scanner on unmount
  useEffect(() => {
    return () => {
      if (qrScanner) {
        safelyStopScanner().catch(() => {
          // Ignore cleanup errors
        });
      }
    };
  }, [qrScanner, safelyStopScanner]);

  const selectCamera = async (deviceId: string) => {
    if (!qrScanner || !isScannerRunning) return;

    try {
      const html5QrCode = qrScanner;
      await html5QrCode.stop().catch(() => {});

      localStorage.setItem(STORAGE_KEYS.QR_CAMERA_ID, deviceId);
      currentCameraIdRef.current = deviceId;

      await html5QrCode.start(
        deviceId,
        { fps: 10, qrbox: { width: 250, height: 250 }, aspectRatio: 1.0 },
        (decodedText: string) => {
          setIsScannerRunning(false);
          
          // Check for nsec first
          const nsec = extractNsecFromQR(decodedText);
          if (nsec && onNsecScanned) {
            onNsecScanned(nsec);
            safelyStopScanner();
            return;
          }

          // Handle other QR code formats
          handleQRCodeContent(decodedText, navigate).then(result => {
            if (result.handled && result.shouldCloseScanner) {
              safelyStopScanner();
            }
          });
        },
        () => {}
      );
    } catch (error) {
      console.error('Failed to switch camera:', error);
    }
  };

  const applyZoom = async (value: number) => {
    if (!qrScanner || !isScannerRunning) return;

    try {
      setZoomVal(value);
      await (qrScanner as any).applyVideoConstraints({
        advanced: [{ zoom: value }]
      });
    } catch (error) {
      console.error('Failed to apply zoom:', error);
    }
  };

  const toggleTorch = async () => {
    if (!qrScanner || !isScannerRunning) return;

    try {
      const newTorchState = !torchOn;
      setTorchOn(newTorchState);
      await (qrScanner as any).applyVideoConstraints({
        advanced: [{ torch: newTorchState }]
      });
    } catch (error) {
      console.error('Failed to toggle torch:', error);
    }
  };

  return {
    isScannerRunning,
    cameraList,
    currentCameraId: currentCameraIdRef.current,
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
    toggleTorch,
    safelyStopScanner
  };
};

