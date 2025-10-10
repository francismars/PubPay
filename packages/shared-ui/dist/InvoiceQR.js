import { jsx as _jsx } from "react/jsx-runtime";
import { useEffect, useRef } from 'react';
export const InvoiceQR = ({ bolt11 }) => {
    const canvasRef = useRef(null);
    useEffect(() => {
        if (!bolt11)
            return;
        const canvas = canvasRef.current;
        if (!canvas)
            return;
        // Clear
        canvas.innerHTML = '';
        // Render QR using global QRCode lib
        if (window.QRCode) {
            window.QRCode.toCanvas(canvas, bolt11).catch(() => { });
        }
    }, [bolt11]);
    return _jsx("canvas", { id: "invoiceQR", ref: canvasRef });
};
