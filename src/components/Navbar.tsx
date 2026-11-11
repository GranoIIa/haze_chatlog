import React from 'react';
import { ActiveTab } from '../types';
import logoUrl from '../assets/haze-logo.png';
import { MessageSquareText, Palette, Film, Sparkles, ExternalLink } from 'lucide-react';

interface NavbarProps {
  activeTab: ActiveTab;
  setActiveTab: (tab: ActiveTab) => void;
}

export const Navbar: React.FC<NavbarProps> = ({ activeTab, setActiveTab }) => {
  return (
    <header className="sticky top-0 z-50 bg-haze-bg/90 backdrop-blur-md border-b border-haze-border px-4 lg:px-8 py-3 transition-all">
      <div className="max-w-[1800px] mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
        
        {/* Brand Group */}
        <div className="flex items-center gap-3">
          <img
            src={logoUrl}
            alt="Haze"
            className="h-9 w-auto select-none"
            draggable={false}
          />
          <div>
            <div className="flex items-center gap-2">
              <span className="px-2 py-0.5 text-[11px] font-black uppercase tracking-wider rounded-md bg-haze-accent/15 text-haze-accent border border-haze-accent/30">
                STUDIOS
              </span>
              <span className="text-xs font-semibold text-haze-accent/80 font-mono">v2.0 PRO</span>
            </div>
            <p className="text-xs text-haze-muted hidden sm:block">
              The Ultimate RP Creator Suite — Feito para a comunidade de Roleplay
            </p>
          </div>
        </div>

        {/* Navigation Tabs (Switcher das 2 Ferramentas) */}
        <nav className="flex items-center p-1 rounded-xl bg-haze-panel border border-haze-border shadow-inner">
          <button
            onClick={() => setActiveTab('chatlog')}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              activeTab === 'chatlog'
                ? 'bg-haze-accent text-haze-on-accent font-bold shadow-lg shadow-haze-accent/20'
                : 'text-haze-muted hover:text-white hover:bg-haze-raised/40'
            }`}
          >
            <MessageSquareText className="w-4 h-4" />
            <span className="whitespace-nowrap">Editor RP</span>
            <span className="text-[11px] hidden xl:inline-block px-1.5 py-0.5 bg-haze-accent/10 text-haze-accent rounded font-mono border border-haze-accent/30">
              CHAT + CANVAS
            </span>
          </button>

          <button
            onClick={() => setActiveTab('giflab')}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              activeTab === 'giflab'
                ? 'bg-haze-accent text-haze-on-accent font-bold shadow-lg shadow-haze-accent/20'
                : 'text-haze-muted hover:text-white hover:bg-haze-raised/40'
            }`}
          >
            <Film className="w-4 h-4" />
            <span className="whitespace-nowrap">Video to GIF Lab</span>
            <span className="text-[11px] hidden xl:inline-block px-1.5 py-0.5 bg-haze-accent/10 text-haze-accent rounded font-mono border border-haze-accent/30">
              EZGIF
            </span>
          </button>
        </nav>

        {/* Right Info */}
        <div className="hidden lg:flex items-center gap-3">
          <div className="flex items-center gap-2 px-2.5 py-1 rounded-full bg-haze-panel border border-haze-border text-xs text-haze-soft">
            <span className="w-2 h-2 rounded-full bg-haze-accent animate-pulse"></span>
            <span>100% Client-Side</span>
          </div>
          <a
            href="https://github.com/GranoIIa/haze_chatlog"
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-1.5 text-xs text-haze-muted hover:text-haze-accent-hover transition-colors"
          >
            <span>GitHub</span>
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
        </div>

      </div>
    </header>
  );
};
