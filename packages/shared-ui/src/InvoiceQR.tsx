import React, { useEffect, useRef } from 'react';
import QRCode from 'qrcode';

type InvoiceQRProps = {
  bolt11: string;
};

export const InvoiceQR: React.FC<InvoiceQRProps> = ({ bolt11 }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    if (!bolt11) return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    // Clear canvas
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    }

    // Render QR using qrcode npm package
    QRCode.toCanvas(canvas, bolt11, {
      width: 200,
      margin: 2
    }).catch((error: Error) => {
      console.error('Error generating QR code:', error);
    });
  }, [bolt11]);

  return (
    <canvas id="invoiceQR" ref={canvasRef} width="200" height="200"></canvas>
  );
};
