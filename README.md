# 🌲 Haze Studios — Chat Log Creator (Emerald Edition)

<div align="center">
  <img src="./11_logo_transparent_1200x400.png" alt="Haze Studios" width="480">
  <p><b>Ferramenta web leve, moderna e interativa para criação de Chat Logs cinematográficos de GTA RP.</b></p>
</div>

---

## ⚡ Sobre o Projeto

O **Haze Chat Log Creator** foi desenvolvido para a comunidade de GTA RP, permitindo criar prints e capturas narrativas de alta qualidade com o padrão visual do design system **Lation Modern UI (Emerald Edition)**.

Diferente de soluções convencionais baseadas em compiladores pesados em runtime, esta versão foi construída 100% em **HTML5, CSS3 moderno e Vanilla JavaScript**, garantindo inicialização instantânea, alta performance e suporte nativo ao **Canvas API**.

---

## 🚀 Principais Recursos

- 💬 **Parser Inteligente de Chat RP:** Reconhece e estiliza automaticamente:
  - `* /me` e `/do` (Ações em tom lilás/púrpura)
  - `> /ame` (Ações menores)
  - `!` Mensagens de sistema e notificações
  - `$` Transações financeiras e itens entregues
  - `(( ... ))` Conversas fora do personagem (OOC)
  - Chamadas e mensagens de celular (Amarelo ouro)
  - Falas normais, sussurradas e em tom baixo
- 👥 **Gerenciamento de Personagens:** Cadastro dinâmico com identificadores coloridos e atalhos rápidos de fala.
- 🎯 **Posicionamento por Arrastar e Soltar (Drag & Drop):** Reposicione o texto interativamente sobre a imagem em tempo real.
- 🖼️ **Super-Sampling 2×:** Renderização em dobro da densidade de pixels para exportação de PNGs nítidos mesmo com zoom.
- 🎨 **Filtros Fotográficos:** Granulado procedural (*grain*), vinheta, *light leak* analógico, sépia vintage, contraste e preto & branco.
- 📦 **Exportação Individual e em Lote (ZIP):** Suporte a processamento de sessões inteiras de fotos com barra de progresso usando JSZip.
- 📁 **Drag & Drop do Windows Explorer:** Arraste qualquer imagem diretamente para o navegador.

---

## 🛠️ Como Executar

Basta abrir o arquivo `index.html` em qualquer navegador moderno (Google Chrome, Microsoft Edge, Firefox, Brave, Safari, Opera).

Não é necessário instalar `node_modules`, dependências externas ou servidores HTTP.

---

## 🌐 Publicação no GitHub Pages

Para disponibilizar a ferramenta online gratuitamente via GitHub Pages:
1. Vá até a aba **Settings** do seu repositório no GitHub.
2. Acesse a seção **Pages** no menu lateral esquerdo.
3. Em **Build and deployment > Branch**, selecione `main` (ou `master`) e a pasta `/ (root)`.
4. Clique em **Save**. Em poucos instantes sua aplicação estará online!

---

<div align="center">
  <sub>Desenvolvido com carinho para a <b>Haze Studios</b>.</sub>
</div>
