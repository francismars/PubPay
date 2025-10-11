import { jsx as _jsx } from "react/jsx-runtime";
import { useEffect, useRef } from 'react';
import QRCode from 'qrcode';
export const InvoiceQR = ({ bolt11 }) => {
    const canvasRef = useRef(null);
    useEffect(() => {
        if (!bolt11)
            return;
        const canvas = canvasRef.current;
        if (!canvas)
            return;
        // Clear canvas
        const ctx = canvas.getContext('2d');
        if (ctx) {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
        }
        // Render QR using qrcode npm package
        QRCode.toCanvas(canvas, bolt11, {
            width: 200,
            margin: 2,
        }).catch((error) => {
            console.error('Error generating QR code:', error);
        });
    }, [bolt11]);
    return _jsx("canvas", { id: "invoiceQR", ref: canvasRef, width: "200", height: "200" });
};
