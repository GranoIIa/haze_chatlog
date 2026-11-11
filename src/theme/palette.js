/**
 * Paleta do Haze Studios ("Esmeralda refinada"): ÚNICA fonte das cores da interface.
 * - tailwind.config.js gera as variáveis CSS (--haze-*) e as classes (bg-haze-panel, text-haze-muted...) a partir daqui.
 * - tests/tier5-editor/test_palette.ts confere os contrastes mínimos (WCAG) para evitar regressões.
 *
 * Para trocar o tema, edite só este arquivo.
 */
export const palette = {
  // Superfícies (do mais fundo para o mais alto)
  stage: '#08090B',        // palco atrás da foto (neutro, para não alterar a percepção das cores)
  bg: '#0E1014',           // fundo do app
  field: '#0E1014',        // campos e áreas "encaixadas" dentro dos painéis
  panel: '#171A21',        // painéis e seções
  raised: '#1F232C',       // botões secundários, trilhas e itens elevados
  raisedHover: '#272C37',  // hover dos elevados

  // Bordas
  border: '#2C323E',
  borderStrong: '#3A4150',

  // Texto
  text: '#EDF1F6',         // títulos e valores
  soft: '#CBD3DF',         // texto de apoio
  muted: '#A8B2C1',        // rótulos
  faint: '#8791A1',        // dicas e placeholders (ainda ≥ 4,5:1 sobre o painel)

  // Acento: usado só para a ação principal, estados ativos e foco
  accent: '#34D399',
  accentHover: '#6EE7B7',
  onAccent: '#04120C',     // texto sobre o acento

  // Semânticas
  danger: '#F87171',
  warning: '#F5B83D',
  info: '#38BDF8'
};

/** '#34D399' -> '52 211 153' (formato aceito por rgb(var(--x) / <alpha-value>)) */
export const toChannels = (hex) => {
  const h = hex.replace('#', '');
  return [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16)).join(' ');
};

/** camelCase -> kebab-case ('raisedHover' -> 'raised-hover') */
export const kebab = (s) => s.replace(/[A-Z]/g, m => '-' + m.toLowerCase());
