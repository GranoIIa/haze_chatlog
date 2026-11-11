import { ParsedLine, ChatLineSegment } from '../types';

export const CHAT_COLORS: Record<string, string> = {
  me: "#cc99ff",
  ame: "#cc99ff",
  white: "#ffffff",
  yellow: "#f5c500",
  green: "#6afe87",
  blue: "#38bdf8",
  system: "#f87171",
  ooc: "#94a3b8",
  grey: "#cbd5e1",
  darkgrey: "#64748b",
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
  const t = line.trimStart();
  const low = t.toLowerCase();
  
  if (!t) return { type: "empty", rawText: "", segments: [] };
  
  let type: ParsedLine['type'] = "white";

  if (t[0] === "*") type = "me";
  else if (t[0] === ">") type = "ame";
  else if (t[0] === "$") type = "yellow";
  else if (t[0] === "!") type = "system";
  else if (t.startsWith("((")) type = "ooc";
  else if (/\bdiz\b\s*\(\s*(?:celular|telefone)\s*\)/.test(low)) type = "yellow";
  else if (/\bdiz\b\s*\(\s*(?:sussurrando|sussurando)\s*\)/.test(low)) type = "darkgrey";
  else if (/\bdiz\b\s*\(\s*baixo\s*\)/.test(low)) type = "grey";
  else if (/\bdiz\b\s*\(\s*gritando\s*\)/.test(low)) type = "white";
  else if (/\bdiz\b\s*\(\s*normal\s*\)/.test(low)) type = "white";
  else if (t[0] === "#") type = "yellow";

  const rawClean = (t[0] === "!" || t[0] === "#") ? line.slice(1).trimStart() : line;
  const segments = splitCensoredSegments(rawClean);

  return {
    type,
    rawText: rawClean,
    segments
  };
}
