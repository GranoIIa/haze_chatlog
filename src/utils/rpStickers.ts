export interface RPSticker {
  id: string;
  name: string;
  category: 'police' | 'crime' | 'military' | 'stamps';
  draw: (ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) => void;
}

export const RP_STICKERS: RPSticker[] = [
  {
    id: 'crime-tape',
    name: 'Fita de Cena de Crime',
    category: 'police',
    draw: (ctx, x, y, w, h) => {
      ctx.save();
      // Yellow crime tape banner
      ctx.fillStyle = '#eab308';
      ctx.shadowColor = 'rgba(0,0,0,0.5)';
      ctx.shadowBlur = 8;
      ctx.fillRect(x, y, w, h);

      // Black hazard stripes & text
      ctx.fillStyle = '#000000';
      ctx.font = `900 ${Math.round(h * 0.55)}px "Inter", sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      
      const text = 'POLICE LINE DO NOT CROSS  ///  CRIME SCENE  ///  POLICE LINE DO NOT CROSS';
      ctx.fillText(text, x + w / 2, y + h / 2);
      ctx.restore();
    }
  },
  {
    id: 'badge-lspd',
    name: 'Distintivo LSPD (Gold)',
    category: 'police',
    draw: (ctx, x, y, w, h) => {
      ctx.save();
      const cx = x + w / 2;
      const cy = y + h / 2;
      const r = Math.min(w, h) / 2;

      // Outer gold shield/circle
      ctx.fillStyle = '#eab308';
      ctx.strokeStyle = '#ca8a04';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(cx, cy, r * 0.9, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      // Inner star/circle
      ctx.fillStyle = '#0f172a';
      ctx.beginPath();
      ctx.arc(cx, cy, r * 0.65, 0, Math.PI * 2);
      ctx.fill();

      // Star shape in the middle
      ctx.fillStyle = '#fde047';
      ctx.beginPath();
      for (let i = 0; i < 5; i++) {
        const angle = (i * 4 * Math.PI) / 5 - Math.PI / 2;
        const dist = (i % 2 === 0) ? r * 0.45 : r * 0.22;
        const px = cx + Math.cos(angle) * dist;
        const py = cy + Math.sin(angle) * dist;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.fill();

      // Text around
      ctx.fillStyle = '#ffffff';
      ctx.font = `bold ${Math.round(r * 0.22)}px "Inter", sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillText('LSPD', cx, y + r * 0.45);
      ctx.fillText('OFFICER', cx, y + h - r * 0.25);

      ctx.restore();
    }
  },
  {
    id: 'bullet-hole',
    name: 'Marca de Tiro (Bala)',
    category: 'crime',
    draw: (ctx, x, y, w, h) => {
      ctx.save();
      const cx = x + w / 2;
      const cy = y + h / 2;
      const r = Math.min(w, h) / 2;

      // Dark hole
      ctx.fillStyle = '#000000';
      ctx.beginPath();
      ctx.arc(cx, cy, r * 0.35, 0, Math.PI * 2);
      ctx.fill();

      // Metal/Glass cracked fractures
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.7)';
      ctx.lineWidth = 2;
      for (let i = 0; i < 8; i++) {
        const angle = (i * Math.PI) / 4 + (Math.sin(i) * 0.2);
        ctx.beginPath();
        ctx.moveTo(cx + Math.cos(angle) * r * 0.35, cy + Math.sin(angle) * r * 0.35);
        ctx.lineTo(cx + Math.cos(angle) * r * 0.95, cy + Math.sin(angle) * r * 0.95);
        ctx.stroke();
      }
      ctx.restore();
    }
  },
  {
    id: 'tactical-crosshair',
    name: 'Mira Tática / Sniper',
    category: 'military',
    draw: (ctx, x, y, w, h) => {
      ctx.save();
      const cx = x + w / 2;
      const cy = y + h / 2;
      const r = Math.min(w, h) / 2;

      ctx.strokeStyle = '#ef4444';
      ctx.lineWidth = 2;
      
      // Outer reticle
      ctx.beginPath();
      ctx.arc(cx, cy, r * 0.8, 0, Math.PI * 2);
      ctx.stroke();

      // Center cross lines
      ctx.beginPath();
      ctx.moveTo(cx - r, cy);
      ctx.lineTo(cx - r * 0.2, cy);
      ctx.moveTo(cx + r * 0.2, cy);
      ctx.lineTo(cx + r, cy);
      
      ctx.moveTo(cx, cy - r);
      ctx.lineTo(cx, cy - r * 0.2);
      ctx.moveTo(cx, cy + r * 0.2);
      ctx.lineTo(cx, cy + r);
      ctx.stroke();

      // Center dot
      ctx.fillStyle = '#ef4444';
      ctx.beginPath();
      ctx.arc(cx, cy, 3, 0, Math.PI * 2);
      ctx.fill();

      ctx.restore();
    }
  },
  {
    id: 'stamp-confidential',
    name: 'Carimbo CONFIDENCIAL',
    category: 'stamps',
    draw: (ctx, x, y, w, h) => {
      ctx.save();
      ctx.translate(x + w / 2, y + h / 2);
      ctx.rotate(-0.15); // Slight tilt

      ctx.strokeStyle = '#dc2626';
      ctx.lineWidth = 4;
      ctx.strokeRect(-w / 2, -h / 2, w, h);

      ctx.fillStyle = '#dc2626';
      ctx.font = `900 ${Math.round(h * 0.55)}px "Inter", sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('CONFIDENCIAL', 0, 0);

      ctx.restore();
    }
  }
];
