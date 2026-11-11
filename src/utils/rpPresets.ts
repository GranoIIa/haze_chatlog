export interface PresetRenderer {
  draw: (ctx: CanvasRenderingContext2D, width: number, height: number, data: any) => void;
}

export const RP_PRESETS = {
  bodycam: {
    id: 'bodycam',
    name: 'Bodycam Policial (AXON)',
    description: 'Interface de câmera corporal com timestamp e identificação militar',
    defaultData: {
      officerName: 'OFC. J. MILLER #402',
      department: 'LSPD MISSION ROW',
      showDate: true,
      showBattery: true,
      recDot: true
    },
    draw: (ctx: CanvasRenderingContext2D, width: number, height: number, data: any) => {
      ctx.save();
      
      const now = new Date();
      const dateStr = now.toISOString().replace('T', ' ').substring(0, 19) + 'Z';
      const fontSize = Math.max(14, Math.round(width * 0.018));
      
      ctx.font = `bold ${fontSize}px "Share Tech Mono", "JetBrains Mono", monospace`;
      ctx.shadowColor = 'rgba(0, 0, 0, 0.9)';
      ctx.shadowBlur = 4;
      ctx.shadowOffsetX = 2;
      ctx.shadowOffsetY = 2;

      // Top Right: AXON Logo & Rec status
      const topMargin = Math.round(height * 0.05);
      const rightMargin = Math.round(width * 0.04);
      
      ctx.textAlign = 'right';
      ctx.fillStyle = '#f87171';
      if (data.recDot) {
        ctx.fillText('● REC', width - rightMargin, topMargin);
      }

      ctx.fillStyle = '#ffffff';
      ctx.fillText('AXON BODY 3', width - rightMargin, topMargin + fontSize * 1.4);
      
      // Top Left: Timestamp & Officer Info
      const leftMargin = Math.round(width * 0.04);
      ctx.textAlign = 'left';
      ctx.fillStyle = '#f1f5f9';
      
      if (data.showDate) {
        ctx.fillText(dateStr, leftMargin, topMargin);
      }
      
      ctx.fillStyle = '#e2e8f0';
      ctx.fillText(`${data.officerName} | ${data.department}`, leftMargin, topMargin + fontSize * 1.4);

      // Subtle bodycam lens distortion vignette
      const gradient = ctx.createRadialGradient(
        width / 2, height / 2, width * 0.35,
        width / 2, height / 2, width * 0.7
      );
      gradient.addColorStop(0, 'rgba(0,0,0,0)');
      gradient.addColorStop(1, 'rgba(0,0,0,0.35)');
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, width, height);

      ctx.restore();
    }
  },

  weazel: {
    id: 'weazel',
    name: 'Weazel News (Plantão)',
    description: 'Tarja televisiva de jornalismo dramático com GC e manchete',
    defaultData: {
      tag: 'AO VIVO',
      headline: 'TIROTEIO INTENSO EM MISSION ROW DEIXA DOIS POLICIAIS FERIDOS',
      subHeadline: 'Equipes táticas cercam o perímetro; suspeitos fugiram em veículo esportivo',
      location: 'LOS SANTOS • CENTRO'
    },
    draw: (ctx: CanvasRenderingContext2D, width: number, height: number, data: any) => {
      ctx.save();
      
      const bannerHeight = Math.round(height * 0.18);
      const startY = height - bannerHeight - Math.round(height * 0.04);
      
      // Live Badge (Top-Left)
      const badgeH = Math.round(bannerHeight * 0.28);
      ctx.fillStyle = '#dc2626'; // Vermelho forte
      ctx.fillRect(width * 0.05, startY - badgeH, width * 0.22, badgeH);
      
      ctx.font = `bold ${Math.round(badgeH * 0.6)}px "Inter", sans-serif`;
      ctx.fillStyle = '#ffffff';
      ctx.textAlign = 'center';
      ctx.fillText(`● ${data.tag}`, width * 0.16, startY - (badgeH * 0.3));

      // Weazel News Logo Box
      const logoBoxW = Math.round(width * 0.25);
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(width * 0.05, startY, logoBoxW, bannerHeight);
      
      // Yellow accent line
      ctx.fillStyle = '#f59e0b';
      ctx.fillRect(width * 0.05, startY, logoBoxW, 4);

      ctx.fillStyle = '#f8fafc';
      ctx.font = `900 ${Math.round(bannerHeight * 0.28)}px "Oswald", sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillText('WEAZEL', width * 0.05 + logoBoxW / 2, startY + bannerHeight * 0.42);
      ctx.fillStyle = '#eab308';
      ctx.font = `700 ${Math.round(bannerHeight * 0.18)}px "Inter", sans-serif`;
      ctx.fillText('NEWS', width * 0.05 + logoBoxW / 2, startY + bannerHeight * 0.64);
      ctx.font = `600 ${Math.round(bannerHeight * 0.12)}px "Inter", sans-serif`;
      ctx.fillStyle = '#94a3b8';
      ctx.fillText(data.location, width * 0.05 + logoBoxW / 2, startY + bannerHeight * 0.85);

      // Main Headline Background
      const mainW = width * 0.9 - logoBoxW;
      const mainX = width * 0.05 + logoBoxW;
      
      ctx.fillStyle = 'rgba(15, 23, 42, 0.95)';
      ctx.fillRect(mainX, startY, mainW, bannerHeight * 0.65);
      
      ctx.fillStyle = '#ffffff';
      ctx.font = `bold ${Math.round(bannerHeight * 0.22)}px "Inter", sans-serif`;
      ctx.textAlign = 'left';
      ctx.fillText(data.headline, mainX + 20, startY + bannerHeight * 0.38, mainW - 40);

      // Sub-headline Ticker Bar
      ctx.fillStyle = '#dc2626';
      ctx.fillRect(mainX, startY + bannerHeight * 0.65, mainW, bannerHeight * 0.35);
      
      ctx.fillStyle = '#fef2f2';
      ctx.font = `500 ${Math.round(bannerHeight * 0.16)}px "Inter", sans-serif`;
      ctx.fillText(data.subHeadline, mainX + 20, startY + bannerHeight * 0.88, mainW - 40);

      ctx.restore();
    }
  },

  cctv: {
    id: 'cctv',
    name: 'CCTV / Câmera de Vigilância',
    description: 'Filtro de segurança com scanlines, ruído e marcação de câmera',
    defaultData: {
      camName: 'CAM-02 DEPÓSITO DOCAS',
      showDate: true
    },
    draw: (ctx: CanvasRenderingContext2D, width: number, height: number, data: any) => {
      ctx.save();
      
      const now = new Date();
      const dateStr = now.toLocaleDateString('pt-BR') + ' ' + now.toLocaleTimeString('pt-BR');
      const fontSize = Math.max(16, Math.round(width * 0.022));

      // Scanline effect
      ctx.fillStyle = 'rgba(0, 0, 0, 0.12)';
      for (let y = 0; y < height; y += 4) {
        ctx.fillRect(0, y, width, 2);
      }

      // CCTV HUD Text in Neon Green / Retro Yellow
      ctx.font = `bold ${fontSize}px "Share Tech Mono", monospace`;
      ctx.fillStyle = '#4ade80';
      ctx.shadowColor = 'rgba(74, 222, 128, 0.6)';
      ctx.shadowBlur = 8;

      const margin = Math.round(width * 0.04);
      ctx.textAlign = 'left';
      ctx.fillText(`[VIGILÂNCIA URBANA]`, margin, margin + fontSize);
      ctx.fillText(data.camName, margin, margin + fontSize * 2.3);

      ctx.textAlign = 'right';
      ctx.fillText(dateStr, width - margin, margin + fontSize);
      ctx.fillText('STATUS: ONLINE', width - margin, margin + fontSize * 2.3);

      // 4 corners camera frame
      const cornerLen = Math.round(width * 0.05);
      ctx.strokeStyle = '#4ade80';
      ctx.lineWidth = 3;
      
      // Top Left
      ctx.beginPath();
      ctx.moveTo(margin, margin + cornerLen);
      ctx.lineTo(margin, margin);
      ctx.lineTo(margin + cornerLen, margin);
      ctx.stroke();

      // Top Right
      ctx.beginPath();
      ctx.moveTo(width - margin - cornerLen, margin);
      ctx.lineTo(width - margin, margin);
      ctx.lineTo(width - margin, margin + cornerLen);
      ctx.stroke();

      // Bottom Left
      ctx.beginPath();
      ctx.moveTo(margin, height - margin - cornerLen);
      ctx.lineTo(margin, height - margin);
      ctx.lineTo(margin + cornerLen, height - margin);
      ctx.stroke();

      // Bottom Right
      ctx.beginPath();
      ctx.moveTo(width - margin - cornerLen, height - margin);
      ctx.lineTo(width - margin, height - margin);
      ctx.lineTo(width - margin, height - margin - cornerLen);
      ctx.stroke();

      ctx.restore();
    }
  },

  mugshot: {
    id: 'mugshot',
    name: 'Ficha Criminal (Mugshot)',
    description: 'Plaqueta policial de identificação de detenção para fotos de suspeitos',
    defaultData: {
      suspectName: 'ALEX "GHOST" SILVA',
      bookingId: 'BK-992014',
      charges: 'ART. 157 (ASSALTO A BANCO) • ART. 288',
      policeDept: 'DEPARTAMENTO POLICIAL DE LOS SANTOS'
    },
    draw: (ctx: CanvasRenderingContext2D, width: number, height: number, data: any) => {
      ctx.save();
      
      // Plaqueta na parte inferior central
      const boardW = Math.round(width * 0.55);
      const boardH = Math.round(height * 0.22);
      const boardX = (width - boardW) / 2;
      const boardY = height - boardH - Math.round(height * 0.05);

      // Background board with shadow
      ctx.fillStyle = '#090d16';
      ctx.shadowColor = 'rgba(0, 0, 0, 0.8)';
      ctx.shadowBlur = 15;
      ctx.shadowOffsetY = 8;
      ctx.fillRect(boardX, boardY, boardW, boardH);

      // Border
      ctx.strokeStyle = '#334155';
      ctx.lineWidth = 4;
      ctx.strokeRect(boardX, boardY, boardW, boardH);

      // Header Department
      ctx.fillStyle = '#cbd5e1';
      ctx.font = `bold ${Math.round(boardH * 0.12)}px "Inter", sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillText(data.policeDept, width / 2, boardY + boardH * 0.2);

      // White Chalk-style Suspect Name
      ctx.fillStyle = '#f8fafc';
      ctx.font = `900 ${Math.round(boardH * 0.22)}px "Oswald", sans-serif`;
      ctx.fillText(data.suspectName, width / 2, boardY + boardH * 0.48);

      // Booking ID
      ctx.fillStyle = '#f59e0b';
      ctx.font = `bold ${Math.round(boardH * 0.14)}px "JetBrains Mono", monospace`;
      ctx.fillText(`REGISTRO: ${data.bookingId}`, width / 2, boardY + boardH * 0.68);

      // Charges
      ctx.fillStyle = '#94a3b8';
      ctx.font = `600 ${Math.round(boardH * 0.11)}px "Inter", sans-serif`;
      ctx.fillText(data.charges, width / 2, boardY + boardH * 0.86);

      ctx.restore();
    }
  }
};
