import React, { useEffect, useRef } from 'react';

type InvoiceQRProps = {
  bolt11: string;
};

export const InvoiceQR: React.FC<InvoiceQRProps> = ({ bolt11 }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    if (!bolt11) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    // Clear
    (canvas as any).innerHTML = '';
    // Render QR using global QRCode lib
    if ((window as any).QRCode) {
      (window as any).QRCode.toCanvas(canvas, bolt11).catch(() => {});
    }
  }, [bolt11]);

  return <canvas id="invoiceQR" ref={canvasRef}></canvas>;
};


