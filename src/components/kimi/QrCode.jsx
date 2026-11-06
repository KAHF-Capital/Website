import React, { useMemo } from 'react';
import QRCode from 'qrcode';

/** Scannable QR code rendered as SVG (no network, no canvas). */
export default function QrCode({ value, size = 168, className = '' }) {
  const modules = useMemo(() => {
    try {
      return QRCode.create(value, { errorCorrectionLevel: 'M' }).modules;
    } catch {
      return null;
    }
  }, [value]);
  if (!modules) return null;
  const n = modules.size;
  const quiet = 2;
  const rects = [];
  for (let r = 0; r < n; r += 1) {
    for (let c = 0; c < n; c += 1) {
      if (modules.get(r, c)) rects.push(<rect key={`${r}-${c}`} x={c + quiet} y={r + quiet} width="1" height="1" />);
    }
  }
  return (
    <svg
      viewBox={`0 0 ${n + quiet * 2} ${n + quiet * 2}`}
      width={size}
      height={size}
      className={className}
      shapeRendering="crispEdges"
      role="img"
      aria-label={`QR code for ${value}`}
    >
      <rect width="100%" height="100%" fill="#fff" />
      <g fill="#111827">{rects}</g>
    </svg>
  );
}
