# 🌲 Haze Studios — RP Creator Suite (Emerald Edition v2.0)

<div align="center">
  <img src="./11_logo_transparent_1200x400.png" alt="Haze Studios" width="480">
  <p><b>A plataforma visual definitiva para a comunidade de FiveM & GTA RP: Chat Log cinematográfico, Editor Canvas de fotos com presets e Conversor de Vídeo para GIF em alta performance com Web Worker.</b></p>
</div>

---

## ⚡ Sobre a Versão 2.0 (Emerald Edition)

O **Haze RP Studio** é uma **suíte criativa completa de Roleplay**, unificando as melhores funcionalidades do **Canva**, **Photoshop** e do **Ezgif**, projetadas especificamente para as necessidades dos jogadores, facções e corporações de GTA RP.

Construído em **Vite + React 18 + TypeScript + Tailwind CSS**, roda **100% no navegador (Client-Side)** com privacidade total, alta performance e custo zero de infraestrutura na Vercel.

---

## 🚀 Os 3 Módulos da Plataforma

### 1. 💬 Chat Log Creator (Pro Engine + Photo Lab Integrado)
- **Parser Inteligente de Chat RP:** Reconhece e estiliza automaticamente 17 formatos de fala (`* /me`, `> /ame`, mensagens de sistema `!`, transações financeiras `$`, conversas `(( OOC ))`, rádio policial, chamadas, `/dispatch`, `/tweet`).
- **Contorno GTA-Style (*Text Stroke*):** Contorno nítido de 1px a 2px que assegura legibilidade sobre qualquer cena.
- **Laboratório Fotográfico de Retoque:**
  - Presets de *Color Grading* de Los Santos (Golden Hour, Midnight Neon, Grit & Crime, San Andreas 90s).
  - Ajustes de Brilho, Contraste, Saturação e Temperatura de cor.
  - **Smart Sharpen:** Realce laplaciano de bordas em latarias de viaturas, armas e roupas.
  - **Depth of Field (Bokeh):** Desfoque radial suave simulando lente profissional 50mm f/1.8.
  - **Cinematic Letterbox (21:9):** Barras pretas anamórficas de cinema com 1 clique.
  - **Censura Interativa:** Ferramenta para aplicar tarjas pretas ou mosaico (*pixelate*) sobre IDs de players ou trechos sensíveis.
- **Gerenciador de Personagens:** Cadastro dinâmico com identificadores coloridos e atalhos rápidos de fala.
- **Drag & Drop Interativo:** Reposicione o texto livremente com o mouse sobre qualquer parte da cena.
- **Super-Sampling 2×:** Exportação nítida em ultra definição.

### 2. 🎨 RP Canvas Photo Editor (O Canva Especializado de RP)
- **Presets Cinemáticos de 1 Clique:**
  - 📷 **Bodycam Policial (AXON Signal):** Overlay de câmera corporal com timestamp militar sincronizado, identificação do oficial e departamento.
  - 📺 **Weazel News (Plantão):** Tarja de telejornal ao vivo, GC informativo e manchete dramática editável.
  - 🚁 **FLIR / Câmera de Helicóptero (Águia):** Câmera térmica com tracking de veículo, altitude, azimute e radar de velocidade do alvo.
  - 🚓 **Dashcam de Viatura Policial:** Câmera frontal de para-brisa com radar duplo de velocidade (viatura e alvo).
  - 🛡️ **CCTV / Vigilância Urbana:** Lente de segurança com scanlines, data/hora retrô verde e indicador de câmera.
  - 🚨 **Ficha Criminal (Mugshot):** Plaqueta de detenção policial com identificação de artigos e nome do suspeito.
- **Adesivos & Marcadores Forenses:** Marcadores triangulares amarelos (`EVIDENCE #01`, `EVIDENCE #02`), fita policial de isolamento (*"POLICE LINE DO NOT CROSS"*), tarja preta de censura (`CENSORED`), distintivos LSPD e Sheriff BCSO, perfurações de tiro e miras táticas.
- **Manipulação de Camadas:** Alças visuais para arrastar, redimensionar e rotacionar camadas com seleção inteligente em Z reverso (*reverse-Z hit-testing*) e cache em **Offscreen Canvas**.

### 3. 🎬 Video to GIF Lab (Ezgif Moderno com Web Worker)
- **Processamento em Segundo Plano:** Execução desacoplada da thread principal via **Web Worker dedicado** (`gifWorker.ts`) com buffers binários transferíveis (`ArrayBuffer`) — zero congelamento na interface enquanto o GIF é gerado.
- **Corte de Duração (Trim):** Slider visual com precisão de início e fim do clipe de ação ou tiroteio.
- **Presets de 1 Clique para Discord:**
  - 💎 **Banner de Perfil Nitro** (< 10 MB - 540p)
  - 👤 **Avatar Animado** (< 8 MB - 320p)
  - 😄 **Emoji / Figurinha** (< 256 KB - 128p)
- **Otimização LZW O(1):** Redução inteligente de paleta NeuQuant e controle de velocidade (0.5× a 2.0×).
- **Marca d'água:** Inserção de texto/arroba de canal sobre os frames do GIF.

---

## 🧪 Qualidade & Testes Automatizados

O projeto conta com **288 testes ponta a ponta (E2E)** cobrindo todas as funcionalidades:
- **Tier 1:** Comportamento de recursos e renderização de canvas.
- **Tier 2:** Limites de memória e isolamento de módulos.
- **Tier 3:** Integração e interoperabilidade par a par.
- **Tier 4:** Testes de estresse adversarial e validação binária da especificação GIF89a.

```bash
# Executar a suíte de testes E2E
npm run test:e2e
```

---

## 🛠️ Como Executar Localmente

```bash
# 1. Instalar as dependências
npm install

# 2. Iniciar o servidor de desenvolvimento
npm run dev

# 3. Gerar a versão de produção otimizada
npm run build
```

---

## 🌐 Deploy na Vercel

O repositório está pronto para deploy contínuo na [Vercel](https://vercel.com):
1. **Framework Preset:** Vite
2. **Build Command:** `npm run build`
3. **Output Directory:** `dist`

---

<div align="center">
  <sub>Desenvolvido com carinho para a <b>Haze Studios</b>.</sub>
</div>
