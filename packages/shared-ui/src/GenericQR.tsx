import React, { useEffect, useRef } from 'react';
import QRCode from 'qrcode';

type GenericQRProps = {
  data: string;
  width?: number;
  height?: number;
  id?: string;
};

export const GenericQR: React.FC<GenericQRProps> = ({
  data,
  width = 200,
  height = 200,
  id
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    if (!data) return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    // Clear canvas
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    }

    // Render QR using qrcode npm package
    QRCode.toCanvas(canvas, data, {
      width: width,
      margin: 2
    }).catch((error: Error) => {
      console.error('Error generating QR code:', error);
    });
  }, [data, width]);

  return <canvas id={id} ref={canvasRef} width={width} height={height} />;
};
