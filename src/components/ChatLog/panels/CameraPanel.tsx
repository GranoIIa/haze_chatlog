import React from 'react';
import {
  CameraPreset, CameraState, CAMERA_PRESET_EFFECTS, NO_EFFECTS, EFFECT_LABELS
} from '../../../utils/cameraFx';

interface CameraPanelProps {
  camera: CameraState;
  setCamera: React.Dispatch<React.SetStateAction<CameraState>>;
  /** Nome do personagem ativo (usado como oficial padrão da bodycam). */
  activeCharName?: string;
}

/** Presets de câmera RP (Bodycam, CCTV, Noite Fria), campos editáveis e efeitos de filme. */
export const CameraPanel: React.FC<CameraPanelProps> = ({ camera, setCamera, activeCharName }) => {
  return (
        <div className="p-4 rounded-2xl bg-[#121722] border border-[#1E2638] shadow-md space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-emerald-400">Câmera RP &amp; Efeitos</span>
            <span className="text-[11px] font-mono text-slate-300">
              {({ none: 'Padrão', bodycam: 'Bodycam', cctv: 'CCTV', noir: 'Noite Fria' } as const)[camera.preset]}
            </span>
          </div>

          <div className="grid grid-cols-4 gap-1.5" role="group" aria-label="Preset de câmera">
            {([['none', 'Padrão'], ['bodycam', 'Bodycam'], ['cctv', 'CCTV'], ['noir', 'Noite Fria']] as const).map(([key, label]) => (
              <button
                key={key}
                aria-pressed={camera.preset === key}
                onClick={() => {
                  // clicar no preset ativo volta ao Padrão
                  const next: CameraPreset = camera.preset === key && key !== 'none' ? 'none' : key;
                  setCamera(c => ({ ...c, preset: next, effects: { ...CAMERA_PRESET_EFFECTS[next] } }));
                }}
                className={`py-1.5 rounded-lg text-[11px] border transition-colors ${
                  camera.preset === key ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/50' : 'border-[#1E2638] text-slate-300 hover:border-emerald-500/30'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {(() => {
            const now = new Date();
            const p2 = (n: number) => String(n).padStart(2, '0');
            const nowDate = `${now.getFullYear()}-${p2(now.getMonth() + 1)}-${p2(now.getDate())}`;
            const nowTime = `${p2(now.getHours())}:${p2(now.getMinutes())}:${p2(now.getSeconds())}`;
            const setCustom = (patch: Partial<CameraState['custom']>) =>
              setCamera(c => ({ ...c, custom: { ...c.custom, ...patch } }));
            const field = (label: string, key: keyof CameraState['custom'], placeholder: string) => (
              <label key={key} className="text-[11px] text-slate-400">
                {label}
                <input
                  type="text" maxLength={48} value={camera.custom[key]} placeholder={placeholder}
                  onChange={(e) => setCustom({ [key]: e.target.value } as Partial<CameraState['custom']>)}
                  className="mt-1 w-full p-1.5 rounded-lg bg-[#0B0E14] border border-[#1E2638] text-[11px] text-slate-200 font-mono placeholder:text-slate-600"
                />
              </label>
            );
            if (camera.preset === 'bodycam') {
              return (
                <div className="grid grid-cols-2 gap-2">
                  {field('Data', 'bodycamDate', nowDate)}
                  {field('Hora', 'bodycamTime', nowTime)}
                  {field('Departamento', 'bodycamDept', 'POLICE / SHERIFF')}
                  {field('Oficial', 'bodycamOfficer', activeCharName ?? 'M. MENDOZA')}
                  <button
                    onClick={() => setCustom({ bodycamDate: nowDate, bodycamTime: nowTime })}
                    className="col-span-2 py-1.5 rounded-lg border border-[#1E2638] text-[11px] text-slate-300 hover:border-emerald-500/40"
                  >
                    Usar data e hora de agora
                  </button>
                </div>
              );
            }
            if (camera.preset === 'cctv') {
              return (
                <div className="grid grid-cols-2 gap-2">
                  <div className="col-span-2">{field('Nome da câmera', 'cctvCamName', 'CAM 03 [SURVEILLANCE HQ]')}</div>
                  {field('Data', 'cctvDate', nowDate)}
                  {field('Hora', 'cctvTime', nowTime)}
                  <div className="col-span-2">{field('Informação (canto superior)', 'cctvLocation', 'PAL 25FPS · 1080P · LIVE')}</div>
                  <button
                    onClick={() => setCustom({ cctvDate: nowDate, cctvTime: nowTime })}
                    className="col-span-2 py-1.5 rounded-lg border border-[#1E2638] text-[11px] text-slate-300 hover:border-emerald-500/40"
                  >
                    Usar data e hora de agora
                  </button>
                </div>
              );
            }
            return null;
          })()}

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[11px] text-slate-400">Efeitos de filme</span>
              <button
                onClick={() => setCamera(c => ({ ...c, effects: { ...NO_EFFECTS } }))}
                className="text-[11px] text-slate-300 hover:text-emerald-300 underline-offset-2 hover:underline"
              >
                Limpar
              </button>
            </div>
            <div className="grid grid-cols-3 gap-1.5" role="group" aria-label="Efeitos de filme">
              {EFFECT_LABELS.map(([key, label]) => (
                <button
                  key={key}
                  aria-pressed={camera.effects[key]}
                  onClick={() => setCamera(c => ({ ...c, effects: { ...c.effects, [key]: !c.effects[key] } }))}
                  className={`py-1.5 rounded-lg text-[11px] border transition-colors ${
                    camera.effects[key] ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/50' : 'border-[#1E2638] text-slate-300 hover:border-emerald-500/30'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>
  );
};
