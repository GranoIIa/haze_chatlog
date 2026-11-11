import React from 'react';
import { ActiveTab } from '../types';
import { MessageSquareText, Palette, Film, Sparkles, ExternalLink } from 'lucide-react';

interface NavbarProps {
  activeTab: ActiveTab;
  setActiveTab: (tab: ActiveTab) => void;
}

export const Navbar: React.FC<NavbarProps> = ({ activeTab, setActiveTab }) => {
  return (
    <header className="sticky top-0 z-50 bg-[#0B0E14]/90 backdrop-blur-md border-b border-[#1E2638] px-4 lg:px-8 py-3 transition-all">
      <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
        
        {/* Brand Group */}
        <div className="flex items-center gap-3">
          <div className="relative flex items-center justify-center w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500/20 to-transparent border border-emerald-500/30 text-emerald-400">
            <Sparkles className="w-5 h-5" />
            <div className="absolute inset-0 bg-emerald-500/10 blur-sm rounded-xl"></div>
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-extrabold text-lg tracking-wider text-white">HAZE</span>
              <span className="px-2 py-0.5 text-[10px] font-black uppercase tracking-wider rounded-md bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                STUDIOS
              </span>
              <span className="text-xs font-semibold text-emerald-400/80 font-mono">v2.0 PRO</span>
            </div>
            <p className="text-[11px] text-slate-400 hidden sm:block">
              The Ultimate RP Creator Suite — Feito para a comunidade de Roleplay
            </p>
          </div>
        </div>

        {/* Navigation Tabs (Switcher das 3 Ferramentas) */}
        <nav className="flex items-center p-1 rounded-xl bg-[#121722] border border-[#1E2638] shadow-inner">
          <button
            onClick={() => setActiveTab('chatlog')}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              activeTab === 'chatlog'
                ? 'bg-emerald-500 text-slate-950 font-bold shadow-lg shadow-emerald-500/20'
                : 'text-slate-400 hover:text-white hover:bg-slate-800/40'
            }`}
          >
            <MessageSquareText className="w-4 h-4" />
            <span>Chat Log Creator</span>
          </button>

          <button
            onClick={() => setActiveTab('canvas')}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              activeTab === 'canvas'
                ? 'bg-emerald-500 text-slate-950 font-bold shadow-lg shadow-emerald-500/20'
                : 'text-slate-400 hover:text-white hover:bg-slate-800/40'
            }`}
          >
            <Palette className="w-4 h-4" />
            <span>RP Canvas Studio</span>
            <span className="text-[9px] px-1.5 py-0.2 bg-emerald-950/80 text-emerald-300 rounded font-mono border border-emerald-400/30">
              CANVA
            </span>
          </button>

          <button
            onClick={() => setActiveTab('giflab')}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              activeTab === 'giflab'
                ? 'bg-emerald-500 text-slate-950 font-bold shadow-lg shadow-emerald-500/20'
                : 'text-slate-400 hover:text-white hover:bg-slate-800/40'
            }`}
          >
            <Film className="w-4 h-4" />
            <span>Video to GIF Lab</span>
            <span className="text-[9px] px-1.5 py-0.2 bg-emerald-950/80 text-emerald-300 rounded font-mono border border-emerald-400/30">
              EZGIF
            </span>
          </button>
        </nav>

        {/* Right Info */}
        <div className="hidden lg:flex items-center gap-3">
          <div className="flex items-center gap-2 px-2.5 py-1 rounded-full bg-[#121722] border border-[#1E2638] text-xs text-slate-300">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
            <span>100% Client-Side</span>
          </div>
          <a
            href="https://github.com/GranoIIa/haze_chatlog"
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-emerald-400 transition-colors"
          >
            <span>GitHub</span>
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
        </div>

      </div>
    </header>
  );
};
