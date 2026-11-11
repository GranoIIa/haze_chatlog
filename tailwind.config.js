import { palette, toChannels, kebab } from './src/theme/palette.js';

// bg-haze-panel, text-haze-muted, border-haze-border/50... (com suporte a opacidade)
const hazeColors = Object.fromEntries(
  Object.keys(palette).map(k => [kebab(k), `rgb(var(--haze-${kebab(k)}) / <alpha-value>)`])
);

// :root { --haze-panel: 23 26 33; ... }
const hazeVars = Object.fromEntries(
  Object.entries(palette).map(([k, v]) => [`--haze-${kebab(k)}`, toChannels(v)])
);

/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        haze: hazeColors
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'monospace']
      }
    },
  },
  plugins: [
    ({ addBase }) => addBase({ ':root': hazeVars })
  ],
}
