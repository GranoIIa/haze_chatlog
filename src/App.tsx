import { lazy, Suspense, useState } from 'react';
import { ActiveTab } from './types';
import { Navbar } from './components/Navbar';
import { ChatLogView } from './components/ChatLog/ChatLogView';
import { GifLabView } from './components/GifLab/GifLabView';
// Video Studio é carregado sob demanda: as outras abas não pagam o custo do mediabunny/timeline.
const VideoStudioView = lazy(() => import('./components/VideoStudio/VideoStudioView').then(m => ({ default: m.VideoStudioView })));
import logoUrl from './assets/haze-logo.png';

export function App() {
  const [activeTab, setActiveTab] = useState<ActiveTab>('chatlog');

  return (
    <div className="min-h-screen bg-haze-bg text-haze-text flex flex-col">
      {/* Top Navbar */}
      <Navbar activeTab={activeTab} setActiveTab={setActiveTab} />

      {/* Main Content Area - Persistent Tab State (No unmounting on switch) */}
      <main className="flex-1 min-h-0 flex flex-col">
        <div className={activeTab === 'chatlog' ? 'block' : 'hidden'}>
          <ChatLogView />
        </div>
        <div className={activeTab === 'giflab' ? 'block' : 'hidden'}>
          <GifLabView onNavigateToChatLog={() => setActiveTab('chatlog')} />
        </div>
        <div className={`${activeTab === 'video' ? 'flex' : 'hidden'} h-full flex-1 flex-col min-h-0`}>
          <Suspense fallback={<div className="p-6 text-xs text-haze-muted">Carregando Video Studio…</div>}>
            <VideoStudioView active={activeTab === 'video'} />
          </Suspense>
        </div>
      </main>

      {/* Footer */}
      {activeTab !== 'video' && (
        <footer className="border-t border-haze-border bg-haze-stage py-4 text-center text-xs text-haze-faint">
          <img src={logoUrl} alt="Haze" className="h-6 w-auto mx-auto mb-2 opacity-70" draggable={false} />
          <p>
            Haze Studios &copy; {new Date().getFullYear()} — Criado com carinho para a comunidade FiveM & GTA RP.
          </p>
        </footer>
      )}
    </div>
  );
}

export default App;
