import { useState } from 'react';
import { ActiveTab } from './types';
import { Navbar } from './components/Navbar';
import { ChatLogView } from './components/ChatLog/ChatLogView';
import { CanvasEditorView } from './components/CanvasEditor/CanvasEditorView';
import { GifLabView } from './components/GifLab/GifLabView';

export function App() {
  const [activeTab, setActiveTab] = useState<ActiveTab>('chatlog');

  return (
    <div className="min-h-screen bg-[#0B0E14] text-slate-100 flex flex-col">
      {/* Top Navbar */}
      <Navbar activeTab={activeTab} setActiveTab={setActiveTab} />

      {/* Main Content Area - Persistent Tab State (No unmounting on switch) */}
      <main className="flex-1">
        <div className={activeTab === 'chatlog' ? 'block' : 'hidden'}>
          <ChatLogView />
        </div>
        <div className={activeTab === 'canvas' ? 'block' : 'hidden'}>
          <CanvasEditorView />
        </div>
        <div className={activeTab === 'giflab' ? 'block' : 'hidden'}>
          <GifLabView />
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-[#1E2638] bg-[#07090E] py-4 text-center text-xs text-slate-500">
        <p>
          Haze Studios &copy; {new Date().getFullYear()} — Criado com carinho para a comunidade FiveM & GTA RP.
        </p>
      </footer>
    </div>
  );
}

export default App;
