import { ParsedLine, ChatLineSegment } from '../types';

export const CHAT_COLORS: Record<string, string> = {
  me: "#d8b4fe",
  ame: "#d8b4fe",
  do: "#f5c500",
  white: "#ffffff",
  yellow: "#f5c500",
  green: "#6afe87",
  blue: "#38bdf8",
  system: "#f87171",
  ooc: "#94a3b8",
  radio: "#38bdf8",
  dep: "#38bdf8",
  phone: "#f5c500",
  dispatch: "#f5c500",
  grey: "#cbd5e1",
  darkgrey: "#94a3b8",
  empty: "transparent"
};

export const CHAR_COLORS = [
  "#10b981", "#6afe87", "#38bdf8", "#f5c500", "#cc99ff",
  "#fb7185", "#fb923c", "#2dd4bf", "#a78bfa", "#e879f9"
];

export function splitCensoredSegments(line: string): ChatLineSegment[] {
  const segments: ChatLineSegment[] = [];
  const regex = /(?:\|\|(.*?)\|\||\[(?:censor|censura)\](.*?)\[\/(?:censor|censura)\]|(█+))/gi;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(line)) !== null) {
    if (match.index > lastIndex) {
      segments.push({ text: line.substring(lastIndex, match.index), isCensored: false });
    }
    const textVal = match[1] !== undefined ? match[1] : (match[2] !== undefined ? match[2] : match[3]);
    segments.push({ text: textVal || "   ", isCensored: true });
    lastIndex = regex.lastIndex;
  }

  if (lastIndex < line.length) {
    segments.push({ text: line.substring(lastIndex), isCensored: false });
  }

  return segments.length ? segments : [{ text: line, isCensored: false }];
}

export function parseChatLine(line: string): ParsedLine {
  if (!line || !line.trim()) {
    return { type: 'empty', rawText: '', segments: [] };
  }

  let text = line.trimStart();
  let timestamp: string | undefined;

  // 1. Timestamp extraction: [HH:MM:SS], [HH:MM], (HH:MM:SS), (HH:MM)
  const timeMatch = text.match(/^(\[[0-2]\d:[0-5]\d(?::[0-5]\d)?\]|\([0-2]\d:[0-5]\d(?::[0-5]\d)?\))\s*/);
  if (timeMatch) {
    timestamp = timeMatch[1];
    text = text.substring(timeMatch[0].length);
  }

  const low = text.toLowerCase();
  let type: ParsedLine['type'] = 'white';
  let speaker: string | undefined;
  let messageText: string | undefined;

  // 2. Slash commands
  if (low.startsWith('/me ') || low === '/me') {
    type = 'me';
    messageText = text.substring(3).trimStart();
  } else if (low.startsWith('/do ') || low === '/do') {
    type = 'yellow';
    messageText = text.substring(3).trimStart();
  } else if (low.startsWith('/ame ') || low === '/ame') {
    type = 'ame';
    messageText = text.substring(4).trimStart();
  } else if (low.startsWith('/ooc ') || low === '/ooc' || low.startsWith('/b ') || low === '/b') {
    type = 'ooc';
    messageText = low.startsWith('/ooc') ? text.substring(4).trimStart() : text.substring(2).trimStart();
  } else if (low.startsWith('/r ') || low === '/r' || low.startsWith('/radio ') || low === '/radio' || low.startsWith('/dep ') || low.startsWith('/f ')) {
    type = 'blue';
    messageText = text.replace(/^\/\w+\s*/, '');
  } else if (low.startsWith('/w ') || low.startsWith('/low ') || low.startsWith('/c ') || low === '/w' || low === '/low' || low === '/c') {
    type = 'darkgrey';
    messageText = text.replace(/^\/\w+\s*/, '');
  } else if (low.startsWith('/s ') || low === '/s') {
    type = 'white';
    messageText = text.substring(2).trimStart();
  } else if (low.startsWith('/dispatch ') || low.startsWith('/911 ') || low === '/dispatch' || low === '/911') {
    type = 'yellow';
    messageText = text.replace(/^\/\w+\s*/, '');
  } else if (low.startsWith('/phone ') || low.startsWith('/sms ') || low === '/phone' || low === '/sms') {
    type = 'yellow';
    messageText = text.replace(/^\/\w+\s*/, '');
  } else if (text.startsWith('*')) {
    type = 'me';
    const actionMatch = text.match(/^\*\s*(.+?)(?:\s+(?:puxa|saca|acende|olha|digita|ajusta|pega|corre|ignora|bate)\b|$)/i);
    if (actionMatch) {
      speaker = actionMatch[1].trim();
    }
  } else if (text.startsWith('>')) {
    type = 'ame';
  } else if (text.startsWith('$')) {
    type = 'yellow';
  } else if (text.startsWith('!')) {
    type = 'system';
  } else if (text.startsWith('#')) {
    type = 'yellow';
  } else if (text.startsWith('((')) {
    type = 'ooc';
  } else if (low.startsWith('[rádio]') || low.startsWith('[radio]')) {
    type = 'blue';
  } else if (/\bdiz\b\s*\(\s*(?:celular|telefone)\s*\)/i.test(low)) {
    type = 'white';
  } else if (/\bdiz\b\s*\(\s*(?:sussurrando|sussurando)\s*\)/i.test(low)) {
    type = 'darkgrey';
  } else if (/\bdiz\b\s*\(\s*(?:r[aá]dio)\s*\)/i.test(low)) {
    type = 'blue';
  } else if (/\bdiz\b\s*\(\s*baixo\s*\)/i.test(low)) {
    type = 'grey';
  } else if (/\bdiz\b\s*\(\s*gritando\s*\)/i.test(low) || /\bgrita\b/i.test(low)) {
    type = 'white';
  }

  // 3. Speaker isolation (e.g. "Marcus Vance diz:", "Sarah Miller diz (baixo):", "Policial #12 grita:")
  const speakerMatch = text.match(/^(.+?)\s+(?:diz(?:\s*\([^)]*\))?|grita|sussurra)\s*:\s*(.*)$/i);
  if (speakerMatch) {
    speaker = speakerMatch[1].trim();
    messageText = speakerMatch[2];
  }

  // 4. Fixed leading whitespace slicing bug: slice text, not line
  const rawClean = (text[0] === '!' || text[0] === '#') ? text.slice(1).trimStart() : text;
  const segments = splitCensoredSegments(rawClean);

  return {
    rawText: line,
    type,
    timestamp,
    speaker,
    messageText: messageText !== undefined ? messageText : text,
    segments
  };
}

/**
 * Canvas Text Wrapping Engine (Feature 7)
 * Wraps text into multiple lines when exceeding maxWidth. Preserves newlines and breaks long words safely.
 */
export function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number
): string[] {
  if (!text) return [];
  if (maxWidth <= 0) maxWidth = 50;

  const paragraphs = text.split('\n');
  const resultLines: string[] = [];

  for (const paragraph of paragraphs) {
    if (!paragraph.trim()) {
      resultLines.push('');
      continue;
    }
    const words = paragraph.split(' ').filter(w => w.length > 0);
    let currentLine = '';

    for (let i = 0; i < words.length; i++) {
      const word = words[i];

      // Handle single word exceeding maxWidth
      if (ctx.measureText(word).width > maxWidth && !currentLine) {
        let chunk = '';
        for (const char of word) {
          if (ctx.measureText(chunk + char).width > maxWidth && chunk.length > 0) {
            resultLines.push(chunk);
            chunk = char;
          } else {
            chunk += char;
          }
        }
        if (chunk) currentLine = chunk;
        continue;
      }

      const testLine = currentLine ? `${currentLine} ${word}` : word;
      if (ctx.measureText(testLine).width > maxWidth && currentLine) {
        resultLines.push(currentLine);
        currentLine = word;
      } else {
        currentLine = testLine;
      }
    }

    if (currentLine) {
      resultLines.push(currentLine);
    }
  }

  return resultLines;
}
