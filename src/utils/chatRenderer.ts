import { Character, ParsedLine } from '../types';
import { parseChatLine, splitCensoredSegments, CHAT_COLORS } from './chatParser';

/** Tudo que define a aparência do chat log (compartilhado entre Chat Log e GIF Lab). */
export interface ChatStyle {
  rawText: string;
  characters: Character[];
  fontSize: number;
  fontFamily: string;
  lineHeightFactor: number;
  strokeEnabled: boolean;
  strokeWidth: number;
  strokeColor: string;
  bgEnabled: boolean;
  bgColor: string;
  bgOpacity: number;
  maxWidthPercent: number;
  shadowEnabled: boolean;
  censorStyle: 'mosaic' | 'solid';
  showTimestamps: boolean;
  /** Posição do canto superior esquerdo do chat, em pixels do canvas de referência. */
  chatPos: { x: number; y: number };
}

interface RenderToken {
  text: string;
  isCensored: boolean;
  color: string;
}

interface RenderRow {
  tokens: Array<{ text: string; isCensored: boolean; color: string; width: number }>;
  totalWidth: number;
}

/**
 * Desenha o chat log (multilinha, contorno GTA, caixa de fundo, censura) sobre o contexto dado.
 * `scale` multiplica fonte, contorno, margens e posição em relação ao canvas de referência.
 */
export function renderChatText(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  scale: number,
  style: ChatStyle
): void {
  const {
    rawText, characters, fontSize, fontFamily, lineHeightFactor, strokeEnabled, strokeWidth,
    strokeColor, bgEnabled, bgColor, bgOpacity, maxWidthPercent, shadowEnabled, censorStyle,
    showTimestamps, chatPos
  } = style;
  void height;
  void characters;
  ctx.save(); // o estado (fonte, linha de base, sombra) não pode vazar para quem desenha depois

  // 4. Configurar Tipografia & Escalas
  const clampedFontSize = Math.min(Math.max(10, fontSize), 72);
  const scaledFontSize = Math.round(clampedFontSize * scale);
  const lineHeight = Math.round(scaledFontSize * lineHeightFactor);
  const padX = Math.round(scaledFontSize * 0.4);
  const padY = Math.round(scaledFontSize * 0.2);

  ctx.font = `bold ${scaledFontSize}px ${fontFamily}`;
  ctx.textBaseline = 'top';

  const clampedMaxWidthPercent = Math.min(Math.max(30, maxWidthPercent), 100);
  const maxW = Math.round((width * clampedMaxWidthPercent) / 100);
  const startX = Math.round(chatPos.x * scale);
  let curY = Math.round(chatPos.y * scale);

  const lines = rawText.split('\n');

  lines.forEach((line) => {
    if (!line.trim()) {
      curY += Math.round(lineHeight * 0.6);
      return;
    }

    const parsed: ParsedLine = parseChatLine(line);
    const lineDefaultColor = parsed.colorOverride || CHAT_COLORS[parsed.type] || '#ffffff';

    // 4.1 Montagem dos Tokens da Linha (Timestamp + Speaker Tag + Conteúdo Redigido)
    const sourceTokens: RenderToken[] = [];

    // Timestamp [HH:MM:SS]
    if (showTimestamps && parsed.timestamp) {
      sourceTokens.push({
        text: `${parsed.timestamp} `,
        isCensored: false,
        color: '#94a3b8'
      });
    }

    // Linha de fala com speaker identificado (ex: "Mike Johnson diz:", "Oliver Walker diz (gritando):")
    const textToScan = parsed.rawText.replace(/^(\[[0-2]\d:[0-5]\d(?::[0-5]\d)?\]|\([0-2]\d:[0-5]\d(?::[0-5]\d)?\))\s*/, '');
    const speechPrefixMatch = textToScan.match(/^((?:.+?\s+)?(?:diz(?:\s*\([^)]*\))?|grita|gritando|grito|sussurra|\([^)]*(?:gritando|grito)[^)]*\))\s*:\s*)/i);

    if (speechPrefixMatch) {
      const prefixStr = speechPrefixMatch[1];
      // A cor do speaker segue o padrão do estilo de texto da linha, sem forçar cor do personagem
      const speakerColor = lineDefaultColor;
      sourceTokens.push({
        text: prefixStr,
        isCensored: false,
        color: speakerColor
      });

      // Diálogo subsequente
      let dialogueBody = textToScan.substring(prefixStr.length);

      // Em fala no tom gritando, somente o texto após ":" fica todo em MAIÚSCULO
      const isShouting = /\b(?:gritando|grita|grito)\b/i.test(prefixStr);
      if (isShouting) {
        dialogueBody = dialogueBody.toUpperCase();
      }

      const dialogueSegments = splitCensoredSegments(dialogueBody);
      dialogueSegments.forEach(seg => {
        sourceTokens.push({
          text: seg.text,
          isCensored: !!seg.isCensored,
          color: lineDefaultColor
        });
      });
    } else if (textToScan.startsWith('*') && parsed.speaker) {
      // Ação RP com personagem identificado (* Nome ...) - segue estilo de cor da ação (/me)
      const speakerColor = lineDefaultColor;
      const actionPrefix = `* ${parsed.speaker} `;
      sourceTokens.push({
        text: actionPrefix,
        isCensored: false,
        color: speakerColor
      });

      const actionRest = textToScan.substring(actionPrefix.length);
      const actionSegments = splitCensoredSegments(actionRest);
      actionSegments.forEach(seg => {
        sourceTokens.push({
          text: seg.text,
          isCensored: !!seg.isCensored,
          color: lineDefaultColor
        });
      });
    } else {
      // Demais linhas (ações /me padrão, comandos de rádio, OOC, banco)
      parsed.segments.forEach(seg => {
        sourceTokens.push({
          text: seg.text,
          isCensored: !!seg.isCensored,
          color: lineDefaultColor
        });
      });
    }

    // 4.2 Quebra de Linha em Fileiras (Word-Wrap Multi-Row Engine)
    const rows: RenderRow[] = [];
    let currentRowTokens: Array<{ text: string; isCensored: boolean; color: string; width: number }> = [];
    let currentRowWidth = 0;

    const pushCurrentRow = () => {
      if (currentRowTokens.length > 0) {
        rows.push({ tokens: currentRowTokens, totalWidth: currentRowWidth });
        currentRowTokens = [];
        currentRowWidth = 0;
      }
    };

    for (const token of sourceTokens) {
      if (token.isCensored) {
        const textW = ctx.measureText(token.text).width;
        const blockW = Math.max(textW, scaledFontSize * 1.2);

        if (currentRowWidth + blockW > maxW && currentRowTokens.length > 0) {
          pushCurrentRow();
        }

        currentRowTokens.push({
          text: token.text,
          isCensored: true,
          color: token.color,
          width: blockW
        });
        currentRowWidth += blockW;
      } else {
        const words = token.text.split(/(\s+)/);
        for (const word of words) {
          if (!word) continue;
          const wordW = ctx.measureText(word).width;

          // Palavra única que excede a largura total permitida
          if (wordW > maxW && currentRowTokens.length === 0 && word.trim().length > 0) {
            let chunk = '';
            for (const ch of word) {
              const chunkW = ctx.measureText(chunk + ch).width;
              if (chunkW > maxW && chunk.length > 0) {
                const w = ctx.measureText(chunk).width;
                currentRowTokens.push({ text: chunk, isCensored: false, color: token.color, width: w });
                currentRowWidth += w;
                pushCurrentRow();
                chunk = ch;
              } else {
                chunk += ch;
              }
            }
            if (chunk) {
              const w = ctx.measureText(chunk).width;
              currentRowTokens.push({ text: chunk, isCensored: false, color: token.color, width: w });
              currentRowWidth += w;
            }
            continue;
          }

          if (currentRowWidth + wordW > maxW && currentRowTokens.length > 0 && word.trim().length > 0) {
            pushCurrentRow();
          }

          currentRowTokens.push({
            text: word,
            isCensored: false,
            color: token.color,
            width: wordW
          });
          currentRowWidth += wordW;
        }
      }
    }

    pushCurrentRow();

    // 4.3 Renderização das Fileiras no Canvas
    rows.forEach((row) => {
      // Fundo independente por fileira (eliminando bug de caixa única)
      if (bgEnabled && bgOpacity > 0 && row.totalWidth > 0) {
        ctx.save();
        ctx.fillStyle = bgColor;
        ctx.globalAlpha = Math.min(Math.max(0, bgOpacity), 1);
        ctx.fillRect(
          startX - padX,
          curY - padY,
          row.totalWidth + padX * 2,
          scaledFontSize + padY * 2
        );
        ctx.restore();
      }

      let tokenX = startX;

      row.tokens.forEach((t) => {
        if (t.isCensored) {
          // Renderização de Censura (Mosaico procedural ou Tarja sólida)
          if (censorStyle === 'mosaic') {
            const grainSize = Math.max(3, Math.round(4 * scale));
            const cols = Math.ceil(t.width / grainSize);
            const rowsCount = Math.ceil(scaledFontSize / grainSize);
            ctx.save();
            for (let c = 0; c < cols; c++) {
              for (let r = 0; r < rowsCount; r++) {
                const hash = Math.sin((tokenX + c * 17) * 12.9898 + (curY + r * 31) * 78.233) * 43758.5453;
                const rand = hash - Math.floor(hash);
                const shade = Math.floor(35 + rand * 85);
                ctx.fillStyle = `rgb(${shade}, ${shade}, ${shade})`;
                ctx.fillRect(
                  tokenX + c * grainSize,
                  curY + r * grainSize,
                  Math.min(grainSize, t.width - c * grainSize),
                  Math.min(grainSize, scaledFontSize - r * grainSize)
                );
              }
            }
            ctx.restore();
          } else {
            // Tarja sólida preta
            ctx.save();
            ctx.fillStyle = '#000000';
            ctx.fillRect(tokenX, curY, t.width, scaledFontSize);
            ctx.restore();
          }
        } else {
          // Renderização de Texto com Contorno Autêntico de GTA
          const sanitizedStrokeWidth = Math.min(Math.max(0, strokeWidth), 8);
          const scaledStroke = Math.max(0, Math.round(sanitizedStrokeWidth * scale));

          if (strokeEnabled && scaledStroke > 0) {
            ctx.save();
            ctx.strokeStyle = strokeColor;
            ctx.lineWidth = scaledStroke;
            ctx.lineJoin = 'miter';
            ctx.miterLimit = 2;
            if (shadowEnabled) {
              ctx.shadowColor = 'rgba(0, 0, 0, 0.95)';
              ctx.shadowBlur = 3 * scale;
              ctx.shadowOffsetX = 1.5 * scale;
              ctx.shadowOffsetY = 1.5 * scale;
            }
            ctx.strokeText(t.text, tokenX, curY);
            ctx.restore();
          }

          ctx.save();
          ctx.shadowColor = 'transparent';
          ctx.fillStyle = t.color;
          ctx.fillText(t.text, tokenX, curY);
          ctx.restore();
        }

        tokenX += t.width;
      });

      curY += lineHeight;
    });
  });
  ctx.restore();
}
