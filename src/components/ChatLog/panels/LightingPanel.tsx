import React from 'react';
import {
  Lighting, LightSource, LIGHTING_PRESETS, LIGHT_SOURCES, LIGHT_BLENDS, LIGHT_POSITIONS
} from '../../../utils/lighting';
import type { MouseTool } from '../../../utils/editorSettings';

interface LightingPanelProps {
  lighting: Lighting;
  patchLighting: (patch: Partial<Lighting>) => void;
  mouseTool: MouseTool;
  setMouseTool: React.Dispatch<React.SetStateAction<MouseTool>>;
}

/** Iluminação colorida: presets, tipo de fonte, mistura, cores e posição da luz. */
export const LightingPanel: React.FC<LightingPanelProps> = ({ lighting, patchLighting, mouseTool, setMouseTool }) => {
  const lightEdit = mouseTool === 'light';
  return (
        <div className="p-4 rounded-2xl bg-[#121722] border border-[#1E2638] shadow-md space-y-3">
          <div className="flex items-center justify-between">
            <span className="section-title text-xs font-bold uppercase tracking-wider text-emerald-400">Iluminação &amp; Luz Colorida</span>
            <label className="flex items-center gap-1.5 text-[11px] cursor-pointer">
              <input
                type="checkbox"
                checked={lighting.enabled}
                onChange={(e) => { patchLighting({ enabled: e.target.checked }); if (!e.target.checked && mouseTool === 'light') setMouseTool('chat'); }}
                className="accent-emerald-500"
                aria-label="Ativar iluminação"
              />
              <span className={lighting.enabled ? 'text-emerald-300' : 'text-slate-500'}>{lighting.enabled ? 'ATIVA' : 'DESLIGADA'}</span>
            </label>
          </div>

          {lighting.enabled && (
            <>
              <div className="grid grid-cols-2 gap-1.5" role="group" aria-label="Presets de iluminação">
                {LIGHTING_PRESETS.map(p => (
                  <button
                    key={p.label}
                    onClick={() => patchLighting({ ...p.patch, enabled: true })}
                    className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg border border-[#1E2638] hover:border-emerald-500/40 text-[11px] text-slate-300 text-left"
                  >
                    <span className="w-3 h-3 rounded-full shrink-0" style={{ background: p.patch.color }} />
                    <span className="truncate">{p.label}</span>
                  </button>
                ))}
              </div>

              <div className="grid grid-cols-2 gap-2">
                <label className="text-[11px] text-slate-400">
                  Tipo de fonte
                  <select
                    value={lighting.sourceType}
                    onChange={(e) => patchLighting({ sourceType: e.target.value as LightSource })}
                    className="mt-1 w-full p-1.5 rounded-lg bg-[#0B0E14] border border-[#1E2638] text-[11px] text-slate-200"
                  >
                    {LIGHT_SOURCES.map(([k, label]) => <option key={k} value={k}>{label}</option>)}
                  </select>
                </label>
                <label className="text-[11px] text-slate-400">
                  Mistura
                  <select
                    value={lighting.blendMode}
                    onChange={(e) => patchLighting({ blendMode: e.target.value as GlobalCompositeOperation })}
                    className="mt-1 w-full p-1.5 rounded-lg bg-[#0B0E14] border border-[#1E2638] text-[11px] text-slate-200"
                  >
                    {LIGHT_BLENDS.map(([k, label]) => <option key={k} value={k}>{label}</option>)}
                  </select>
                </label>
              </div>

              <div className="flex items-center justify-between text-[11px] text-slate-400">
                <span>Cor da luz</span>
                <input
                  type="color" value={lighting.color} aria-label="Cor da luz"
                  onChange={(e) => patchLighting({ color: e.target.value })}
                  className="w-10 h-6 rounded bg-transparent cursor-pointer"
                />
              </div>

              {([
                ['Intensidade', lighting.intensity, 0, 100, (v: number) => patchLighting({ intensity: v })],
                ['Raio', lighting.radius, 10, 150, (v: number) => patchLighting({ radius: v })],
                ['Suavidade', lighting.softness, 0, 100, (v: number) => patchLighting({ softness: v })],
                ['Posição X', Math.round(lighting.x), 0, 100, (v: number) => patchLighting({ x: v })],
                ['Posição Y', Math.round(lighting.y), 0, 100, (v: number) => patchLighting({ y: v })]
              ] as const).map(([label, value, min, max, onChange]) => (
                <div key={label}>
                  <div className="flex justify-between text-[11px] text-slate-400 mb-1">
                    <span>{label}</span>
                    <span className="font-mono text-slate-200">{value}%</span>
                  </div>
                  <input
                    type="range" min={min} max={max} value={value} aria-label={`Luz: ${label}`}
                    onChange={(e) => onChange(parseInt(e.target.value))}
                    className="w-full accent-emerald-500 h-1 bg-slate-800 rounded cursor-pointer"
                  />
                </div>
              ))}

              {lighting.sourceType === 'duotone' && (
                <div className="space-y-2 pt-2 border-t border-[#1E2638]">
                  <div className="flex items-center justify-between text-[11px] text-slate-400">
                    <span>Cor da luz de recorte</span>
                    <input
                      type="color" value={lighting.secondaryColor} aria-label="Cor da luz de recorte"
                      onChange={(e) => patchLighting({ secondaryColor: e.target.value })}
                      className="w-10 h-6 rounded bg-transparent cursor-pointer"
                    />
                  </div>
                  {([
                    ['Recorte: intensidade', lighting.secondaryIntensity, (v: number) => patchLighting({ secondaryIntensity: v })],
                    ['Recorte: X', Math.round(lighting.secondaryX), (v: number) => patchLighting({ secondaryX: v })],
                    ['Recorte: Y', Math.round(lighting.secondaryY), (v: number) => patchLighting({ secondaryY: v })]
                  ] as const).map(([label, value, onChange]) => (
                    <div key={label}>
                      <div className="flex justify-between text-[11px] text-slate-400 mb-1">
                        <span>{label}</span>
                        <span className="font-mono text-slate-200">{value}%</span>
                      </div>
                      <input
                        type="range" min={0} max={100} value={value} aria-label={`Luz: ${label}`}
                        onChange={(e) => onChange(parseInt(e.target.value))}
                        className="w-full accent-emerald-500 h-1 bg-slate-800 rounded cursor-pointer"
                      />
                    </div>
                  ))}
                </div>
              )}

              <div>
                <span className="text-[11px] text-slate-400 block mb-1">Posição rápida da luz</span>
                <div className="grid grid-cols-3 gap-1 w-28">
                  {LIGHT_POSITIONS.map(([sym, label, px, py]) => (
                    <button
                      key={label}
                      onClick={() => patchLighting({ x: px, y: py })}
                      title={label}
                      aria-label={`Luz: ${label}`}
                      className="py-1 rounded border border-[#1E2638] text-xs text-slate-300 hover:border-emerald-500/40"
                    >
                      {sym}
                    </button>
                  ))}
                </div>
              </div>

              <button
                onClick={() => setMouseTool(t => (t === 'light' ? 'chat' : 'light'))}
                aria-pressed={lightEdit}
                className={`w-full py-2 rounded-lg border text-[11px] font-semibold transition-colors ${
                  lightEdit ? 'border-amber-400/60 bg-amber-400/10 text-amber-300' : 'border-[#1E2638] text-slate-300 hover:border-emerald-500/40'
                }`}
              >
                {lightEdit ? '💡 Arrastando a luz no preview (clique para sair)' : '💡 Posicionar luz arrastando no preview'}
              </button>
            </>
          )}
        </div>
  );
};
