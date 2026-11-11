import React from 'react';
import { CanvasLayer } from '../../types';
import { RP_PRESETS } from '../../utils/rpPresets';
import { RP_STICKERS } from '../../utils/rpStickers';
import {
  Palette, Type, Image as ImageIcon, Sparkles, Layers, Eye, EyeOff,
  Trash2, ArrowUp, ArrowDown, ShieldAlert,
  Camera, Tv, ShieldCheck, Crosshair, Plane, Car, Sliders, Clapperboard,
  Lock, Unlock, Copy, RotateCcw, Upload, Plus, AlignLeft, AlignCenter, AlignRight,
  ChevronsUp, ChevronsDown
} from 'lucide-react';

const BLEND_MODES: { label: string; value: GlobalCompositeOperation }[] = [
  { label: 'Normal', value: 'source-over' },
  { label: 'Screen (Divisão)', value: 'screen' },
  { label: 'Multiply (Multiplicação)', value: 'multiply' },
  { label: 'Overlay (Sobreposição)', value: 'overlay' },
  { label: 'Lighten (Clarear)', value: 'lighten' },
  { label: 'Darken (Escurecer)', value: 'darken' },
  { label: 'Color Dodge (Subexposição)', value: 'color-dodge' },
  { label: 'Color Burn (Superexposição)', value: 'color-burn' },
  { label: 'Hard Light (Luz Direta)', value: 'hard-light' },
  { label: 'Difference (Diferença)', value: 'difference' },
];

const FONT_FAMILIES = [
  { label: 'Inter (Moderno)', value: 'Inter, sans-serif' },
  { label: 'Share Tech Mono (Militar / Bodycam)', value: '"Share Tech Mono", monospace' },
  { label: 'JetBrains Mono (Código / Terminal)', value: '"JetBrains Mono", monospace' },
  { label: 'Oswald (Jornal / Manchete)', value: '"Oswald", sans-serif' },
  { label: 'Impact (Destaque)', value: 'Impact, sans-serif' },
];

export type PresetKey = 'bodycam' | 'weazel' | 'flir' | 'dashcam' | 'cctv' | 'mugshot';

export interface CanvasLayersSidebarProps {
  layers: CanvasLayer[];
  setLayers: React.Dispatch<React.SetStateAction<CanvasLayer[]>>;
  selectedLayerId: string | null;
  setSelectedLayerId: (id: string | null) => void;
  applyPreset: (key: PresetKey) => void;
  addSticker: (stickerId: string) => void;
  addTextLayer: () => void;
  moveLayer: (id: string, direction: 'up' | 'down') => void;
  bringLayerToFront: (id: string) => void;
  sendLayerToBack: (id: string) => void;
  duplicateLayer: (id: string) => void;
  deleteLayer: (id: string) => void;
  updateSelectedLayer: (updates: Partial<CanvasLayer>) => void;
  updatePresetDataField: (field: string, value: any) => void;
}

/** Presets cinemáticos, adesivos, texto, inspetor e lista de camadas de RP (editor unificado). */
export const CanvasLayersSidebar: React.FC<CanvasLayersSidebarProps> = ({
  layers, setLayers, selectedLayerId, setSelectedLayerId, applyPreset, addSticker, addTextLayer,
  moveLayer, bringLayerToFront, sendLayerToBack, duplicateLayer, deleteLayer,
  updateSelectedLayer, updatePresetDataField
}) => {
  const selectedLayer = layers.find(l => l.id === selectedLayerId);
  void RP_PRESETS;

  return (
    <>
        {/* Presets de 1 Clique (RP) */}
        <div className="p-4 rounded-2xl bg-[#121722] border border-[#1E2638] shadow-md">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-bold uppercase tracking-wider text-emerald-400 flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5" /> Presets Cinemáticos de RP
            </span>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => applyPreset('bodycam')}
              className="p-2.5 rounded-xl bg-[#0B0E14] hover:bg-slate-800/80 border border-[#1E2638] hover:border-emerald-500/50 text-left transition-all"
            >
              <div className="flex items-center gap-1.5 text-emerald-400 font-bold text-xs mb-0.5">
                <Camera className="w-3.5 h-3.5" /> Bodycam AXON
              </div>
              <p className="text-[10px] text-slate-400">Timestamp militar e oficial.</p>
            </button>

            <button
              onClick={() => applyPreset('weazel')}
              className="p-2.5 rounded-xl bg-[#0B0E14] hover:bg-slate-800/80 border border-[#1E2638] hover:border-amber-500/50 text-left transition-all"
            >
              <div className="flex items-center gap-1.5 text-amber-400 font-bold text-xs mb-0.5">
                <Tv className="w-3.5 h-3.5" /> Weazel News
              </div>
              <p className="text-[10px] text-slate-400">Tarja de telejornal ao vivo e GC.</p>
            </button>

            <button
              onClick={() => applyPreset('flir')}
              className="p-2.5 rounded-xl bg-[#0B0E14] hover:bg-slate-800/80 border border-[#1E2638] hover:border-sky-500/50 text-left transition-all"
            >
              <div className="flex items-center gap-1.5 text-sky-400 font-bold text-xs mb-0.5">
                <Plane className="w-3.5 h-3.5" /> FLIR Águia
              </div>
              <p className="text-[10px] text-slate-400">Visão aérea térmica com mira.</p>
            </button>

            <button
              onClick={() => applyPreset('dashcam')}
              className="p-2.5 rounded-xl bg-[#0B0E14] hover:bg-slate-800/80 border border-[#1E2638] hover:border-yellow-500/50 text-left transition-all"
            >
              <div className="flex items-center gap-1.5 text-yellow-400 font-bold text-xs mb-0.5">
                <Car className="w-3.5 h-3.5" /> Dashcam Viatura
              </div>
              <p className="text-[10px] text-slate-400">Radar de velocidade e viatura.</p>
            </button>

            <button
              onClick={() => applyPreset('cctv')}
              className="p-2.5 rounded-xl bg-[#0B0E14] hover:bg-slate-800/80 border border-[#1E2638] hover:border-green-500/50 text-left transition-all"
            >
              <div className="flex items-center gap-1.5 text-green-400 font-bold text-xs mb-0.5">
                <ShieldCheck className="w-3.5 h-3.5" /> CCTV Segurança
              </div>
              <p className="text-[10px] text-slate-400">Câmera de vigilância e scanlines.</p>
            </button>

            <button
              onClick={() => applyPreset('mugshot')}
              className="p-2.5 rounded-xl bg-[#0B0E14] hover:bg-slate-800/80 border border-[#1E2638] hover:border-red-500/50 text-left transition-all"
            >
              <div className="flex items-center gap-1.5 text-red-400 font-bold text-xs mb-0.5">
                <ShieldAlert className="w-3.5 h-3.5" /> Ficha Criminal
              </div>
              <p className="text-[10px] text-slate-400">Plaqueta policial de detenção.</p>
            </button>
          </div>
        </div>

        {/* Adesivos, Texto, Imagem e Fundo */}
        <div className="p-4 rounded-2xl bg-[#121722] border border-[#1E2638] shadow-md space-y-3">
          <span className="text-xs font-bold uppercase tracking-wider text-emerald-400 flex items-center gap-1.5">
            <Palette className="w-3.5 h-3.5" /> Adesivos &amp; Marcadores Forenses
          </span>

          <div className="grid grid-cols-2 gap-2">
            {RP_STICKERS.map(sticker => (
              <button
                key={sticker.id}
                onClick={() => addSticker(sticker.id)}
                className="px-2.5 py-1.5 rounded-lg bg-[#0B0E14] hover:bg-slate-800/80 border border-[#1E2638] text-xs text-slate-300 flex items-center justify-between transition-colors"
              >
                <span className="truncate">{sticker.name}</span>
                <span className="text-[10px] text-emerald-400 font-mono">+Add</span>
              </button>
            ))}
          </div>

          <div className="pt-2">
            <button
              onClick={addTextLayer}
              className="w-full py-2 px-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-white flex items-center justify-center gap-1.5 transition-colors"
            >
              <Type className="w-3.5 h-3.5 text-emerald-400" /> Adicionar texto
            </button>
          </div>
        </div>

        {/* Inspetor de Propriedades da Camada (Feature 13) */}
        <div className="p-4 rounded-2xl bg-[#121722] border border-[#1E2638] shadow-md space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-emerald-400 flex items-center gap-1.5">
              <Sliders className="w-3.5 h-3.5" /> Inspetor de Propriedades
            </span>
            {selectedLayer && (
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-800 text-emerald-400 border border-slate-700">
                {selectedLayer.type.toUpperCase()}
              </span>
            )}
          </div>

          {selectedLayer ? (
            <div className="space-y-3">
              {/* Controles Universais */}
              <div className="space-y-2 text-xs">
                <div>
                  <span className="text-slate-400 block mb-1">Nome da Camada</span>
                  <input
                    type="text"
                    value={selectedLayer.name}
                    onChange={(e) => updateSelectedLayer({ name: e.target.value })}
                    className="w-full bg-[#0B0E14] border border-[#1E2638] rounded-lg px-2.5 py-1 text-white focus:outline-none focus:border-emerald-500"
                  />
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <span className="text-slate-400 block mb-1">Opacidade ({Math.round(selectedLayer.opacity * 100)}%)</span>
                    <input
                      type="range"
                      min="0"
                      max="100"
                      value={Math.round(selectedLayer.opacity * 100)}
                      onChange={(e) => updateSelectedLayer({ opacity: parseInt(e.target.value) / 100 })}
                      className="w-full accent-emerald-500 h-1 bg-slate-800 rounded cursor-pointer"
                    />
                  </div>

                  <div>
                    <span className="text-slate-400 block mb-1">Modo de Mesclagem</span>
                    <select
                      value={selectedLayer.blendMode || 'source-over'}
                      onChange={(e) => updateSelectedLayer({ blendMode: e.target.value as GlobalCompositeOperation })}
                      className="w-full bg-[#0B0E14] border border-[#1E2638] rounded-lg px-2 py-1 text-white text-[11px] focus:outline-none focus:border-emerald-500"
                    >
                      {BLEND_MODES.map(mode => (
                        <option key={mode.value} value={mode.value}>{mode.label}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <label className="flex items-center gap-2 text-[11px] text-slate-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={selectedLayer.aboveChat === false}
                    onChange={(e) => updateSelectedLayer({ aboveChat: e.target.checked ? false : true })}
                    className="accent-emerald-500"
                  />
                  Desenhar abaixo do texto do chat
                </label>

                {/* Ações Rápidas da Camada */}
                <div className="flex items-center gap-1.5 pt-1">
                  <button
                    onClick={() => updateSelectedLayer({ locked: !selectedLayer.locked })}
                    className={`flex-1 py-1 px-2 rounded-lg border text-[11px] font-semibold flex items-center justify-center gap-1 transition-colors ${
                      selectedLayer.locked
                        ? 'bg-amber-500/20 border-amber-500 text-amber-300'
                        : 'bg-[#0B0E14] border-[#1E2638] text-slate-400 hover:text-white'
                    }`}
                  >
                    {selectedLayer.locked ? <Lock className="w-3 h-3" /> : <Unlock className="w-3 h-3" />}
                    <span>{selectedLayer.locked ? 'Travado' : 'Travar'}</span>
                  </button>

                  <button
                    onClick={() => updateSelectedLayer({ visible: !selectedLayer.visible })}
                    className={`flex-1 py-1 px-2 rounded-lg border text-[11px] font-semibold flex items-center justify-center gap-1 transition-colors ${
                      selectedLayer.visible
                        ? 'bg-emerald-500/20 border-emerald-500 text-emerald-300'
                        : 'bg-[#0B0E14] border-[#1E2638] text-slate-400 hover:text-white'
                    }`}
                  >
                    {selectedLayer.visible ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
                    <span>{selectedLayer.visible ? 'Visível' : 'Oculto'}</span>
                  </button>

                  <button
                    onClick={() => duplicateLayer(selectedLayer.id)}
                    className="p-1.5 rounded-lg bg-[#0B0E14] border border-[#1E2638] text-slate-400 hover:text-emerald-400 transition-colors"
                    title="Duplicar Camada"
                  >
                    <Copy className="w-3 h-3" />
                  </button>

                  <button
                    onClick={() => bringLayerToFront(selectedLayer.id)}
                    className="p-1.5 rounded-lg bg-[#0B0E14] border border-[#1E2638] text-slate-400 hover:text-white transition-colors"
                    title="Trazer para Frente"
                  >
                    <ChevronsUp className="w-3 h-3" />
                  </button>

                  <button
                    onClick={() => sendLayerToBack(selectedLayer.id)}
                    className="p-1.5 rounded-lg bg-[#0B0E14] border border-[#1E2638] text-slate-400 hover:text-white transition-colors"
                    title="Enviar para Trás"
                  >
                    <ChevronsDown className="w-3 h-3" />
                  </button>

                  <button
                    onClick={() => deleteLayer(selectedLayer.id)}
                    className="p-1.5 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 hover:bg-red-500/20 transition-colors"
                    title="Excluir Camada"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              </div>

              {/* Controles Específicos para Camada de Texto */}
              {selectedLayer.type === 'text' && (
                <div className="space-y-2 pt-2 border-t border-[#1E2638] text-xs">
                  <div>
                    <span className="text-slate-400 block mb-1">Conteúdo do Texto</span>
                    <textarea
                      rows={2}
                      value={selectedLayer.text ?? selectedLayer.content ?? ''}
                      onChange={(e) => updateSelectedLayer({ text: e.target.value, content: e.target.value })}
                      className="w-full bg-[#0B0E14] border border-[#1E2638] rounded-lg px-2.5 py-1.5 text-white focus:outline-none focus:border-emerald-500"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <span className="text-slate-400 block mb-1">Família da Fonte</span>
                      <select
                        value={selectedLayer.fontFamily || 'Inter, sans-serif'}
                        onChange={(e) => updateSelectedLayer({ fontFamily: e.target.value })}
                        className="w-full bg-[#0B0E14] border border-[#1E2638] rounded-lg px-2 py-1 text-white text-[11px] focus:outline-none focus:border-emerald-500"
                      >
                        {FONT_FAMILIES.map(f => (
                          <option key={f.value} value={f.value}>{f.label}</option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <span className="text-slate-400 block mb-1">Tamanho ({selectedLayer.fontSize || 32}px)</span>
                      <input
                        type="range"
                        min="12"
                        max="120"
                        value={selectedLayer.fontSize || 32}
                        onChange={(e) => updateSelectedLayer({ fontSize: parseInt(e.target.value) })}
                        className="w-full accent-emerald-500 h-1 bg-slate-800 rounded cursor-pointer"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <span className="text-slate-400 block mb-1">Cor do Texto</span>
                      <div className="flex items-center gap-1.5">
                        <input
                          type="color"
                          value={selectedLayer.color || '#ffffff'}
                          onChange={(e) => updateSelectedLayer({ color: e.target.value })}
                          className="w-7 h-7 rounded border border-[#1E2638] bg-transparent cursor-pointer p-0"
                        />
                        <input
                          type="text"
                          value={selectedLayer.color || '#ffffff'}
                          onChange={(e) => updateSelectedLayer({ color: e.target.value })}
                          className="w-full bg-[#0B0E14] border border-[#1E2638] rounded px-1.5 py-1 text-white text-[11px] font-mono"
                        />
                      </div>
                    </div>

                    <div>
                      <span className="text-slate-400 block mb-1">Contorno ({selectedLayer.strokeWidth || 0}px)</span>
                      <div className="flex items-center gap-1.5">
                        <input
                          type="color"
                          value={selectedLayer.strokeColor || '#000000'}
                          onChange={(e) => updateSelectedLayer({ strokeColor: e.target.value })}
                          className="w-7 h-7 rounded border border-[#1E2638] bg-transparent cursor-pointer p-0"
                        />
                        <input
                          type="range"
                          min="0"
                          max="10"
                          value={selectedLayer.strokeWidth || 0}
                          onChange={(e) => updateSelectedLayer({ strokeWidth: parseInt(e.target.value) })}
                          className="w-full accent-emerald-500 h-1 bg-slate-800 rounded cursor-pointer"
                        />
                      </div>
                    </div>
                  </div>

                  <div>
                    <span className="text-slate-400 block mb-1">Alinhamento</span>
                    <div className="flex rounded-lg border border-[#1E2638] overflow-hidden bg-[#0B0E14]">
                      {(['left', 'center', 'right'] as const).map((align) => {
                        const currentAlign = (selectedLayer as any).textAlign || 'center';
                        return (
                          <button
                            key={align}
                            onClick={() => updateSelectedLayer({ textAlign: align } as any)}
                            className={`flex-1 py-1 flex items-center justify-center transition-colors ${
                              currentAlign === align ? 'bg-emerald-500/20 text-emerald-400 font-bold' : 'text-slate-400 hover:text-white'
                            }`}
                          >
                            {align === 'left' && <AlignLeft className="w-3.5 h-3.5" />}
                            {align === 'center' && <AlignCenter className="w-3.5 h-3.5" />}
                            {align === 'right' && <AlignRight className="w-3.5 h-3.5" />}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}

              {/* Controles Específicos para Camadas de Imagem e Adesivo */}
              {(selectedLayer.type === 'image' || selectedLayer.type === 'sticker') && (
                <div className="space-y-2 pt-2 border-t border-[#1E2638] text-xs">
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <span className="text-slate-400 block mb-1">Largura ({selectedLayer.width}px)</span>
                      <input
                        type="range"
                        min="20"
                        max="800"
                        value={selectedLayer.width}
                        onChange={(e) => updateSelectedLayer({ width: parseInt(e.target.value) })}
                        className="w-full accent-emerald-500 h-1 bg-slate-800 rounded cursor-pointer"
                      />
                    </div>
                    <div>
                      <span className="text-slate-400 block mb-1">Altura ({selectedLayer.height}px)</span>
                      <input
                        type="range"
                        min="20"
                        max="800"
                        value={selectedLayer.height}
                        onChange={(e) => updateSelectedLayer({ height: parseInt(e.target.value) })}
                        className="w-full accent-emerald-500 h-1 bg-slate-800 rounded cursor-pointer"
                      />
                    </div>
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-slate-400">Rotação ({selectedLayer.rotation || 0}°)</span>
                      <button
                        onClick={() => updateSelectedLayer({ rotation: 0 })}
                        className="text-[10px] text-emerald-400 hover:underline flex items-center gap-0.5"
                      >
                        <RotateCcw className="w-2.5 h-2.5" /> Resetar 0°
                      </button>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="360"
                      value={selectedLayer.rotation || 0}
                      onChange={(e) => updateSelectedLayer({ rotation: parseInt(e.target.value) })}
                      className="w-full accent-emerald-500 h-1 bg-slate-800 rounded cursor-pointer"
                    />
                  </div>
                </div>
              )}

              {/* Controles Específicos para Presets de RP */}
              {selectedLayer.type === 'preset' && selectedLayer.presetData && (
                <div className="space-y-2 pt-2 border-t border-[#1E2638] text-xs">
                  <span className="text-emerald-400 font-bold block mb-1">Dados do Preset de RP</span>

                  {selectedLayer.presetType === 'bodycam' && (
                    <>
                      <div>
                        <span className="text-slate-400 block mb-0.5">Nome e Distintivo do Oficial</span>
                        <input
                          type="text"
                          value={selectedLayer.presetData.officerName || ''}
                          onChange={(e) => updatePresetDataField('officerName', e.target.value)}
                          className="w-full bg-[#0B0E14] border border-[#1E2638] rounded px-2 py-1 text-white"
                        />
                      </div>
                      <div>
                        <span className="text-slate-400 block mb-0.5">Departamento / Lotação</span>
                        <input
                          type="text"
                          value={selectedLayer.presetData.department || ''}
                          onChange={(e) => updatePresetDataField('department', e.target.value)}
                          className="w-full bg-[#0B0E14] border border-[#1E2638] rounded px-2 py-1 text-white"
                        />
                      </div>
                      <div className="flex items-center justify-between pt-1">
                        <label className="flex items-center gap-1.5 text-slate-300 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={!!selectedLayer.presetData.showDate}
                            onChange={(e) => updatePresetDataField('showDate', e.target.checked)}
                            className="accent-emerald-500 rounded"
                          />
                          <span>Exibir Data/Hora (UTC)</span>
                        </label>
                        <label className="flex items-center gap-1.5 text-slate-300 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={!!selectedLayer.presetData.recDot}
                            onChange={(e) => updatePresetDataField('recDot', e.target.checked)}
                            className="accent-emerald-500 rounded"
                          />
                          <span>Ponto ● REC</span>
                        </label>
                      </div>
                    </>
                  )}

                  {selectedLayer.presetType === 'weazel' && (
                    <>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <span className="text-slate-400 block mb-0.5">Tag GC</span>
                          <input
                            type="text"
                            value={selectedLayer.presetData.tag || ''}
                            onChange={(e) => updatePresetDataField('tag', e.target.value)}
                            className="w-full bg-[#0B0E14] border border-[#1E2638] rounded px-2 py-1 text-white"
                          />
                        </div>
                        <div>
                          <span className="text-slate-400 block mb-0.5">Localidade</span>
                          <input
                            type="text"
                            value={selectedLayer.presetData.location || ''}
                            onChange={(e) => updatePresetDataField('location', e.target.value)}
                            className="w-full bg-[#0B0E14] border border-[#1E2638] rounded px-2 py-1 text-white"
                          />
                        </div>
                      </div>
                      <div>
                        <span className="text-slate-400 block mb-0.5">Manchete Principal</span>
                        <textarea
                          rows={2}
                          value={selectedLayer.presetData.headline || ''}
                          onChange={(e) => updatePresetDataField('headline', e.target.value)}
                          className="w-full bg-[#0B0E14] border border-[#1E2638] rounded px-2 py-1 text-white"
                        />
                      </div>
                      <div>
                        <span className="text-slate-400 block mb-0.5">Sub-Manchete / Ticker</span>
                        <textarea
                          rows={2}
                          value={selectedLayer.presetData.subHeadline || ''}
                          onChange={(e) => updatePresetDataField('subHeadline', e.target.value)}
                          className="w-full bg-[#0B0E14] border border-[#1E2638] rounded px-2 py-1 text-white"
                        />
                      </div>
                    </>
                  )}

                  {selectedLayer.presetType === 'flir' && (
                    <>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <span className="text-slate-400 block mb-0.5">Unidade / Callsign</span>
                          <input
                            type="text"
                            value={selectedLayer.presetData.unitName || ''}
                            onChange={(e) => updatePresetDataField('unitName', e.target.value)}
                            className="w-full bg-[#0B0E14] border border-[#1E2638] rounded px-2 py-1 text-white"
                          />
                        </div>
                        <div>
                          <span className="text-slate-400 block mb-0.5">Velocidade Alvo</span>
                          <input
                            type="text"
                            value={selectedLayer.presetData.targetSpeed || ''}
                            onChange={(e) => updatePresetDataField('targetSpeed', e.target.value)}
                            className="w-full bg-[#0B0E14] border border-[#1E2638] rounded px-2 py-1 text-white"
                          />
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <span className="text-slate-400 block mb-0.5">Altitude</span>
                          <input
                            type="text"
                            value={selectedLayer.presetData.altitude || ''}
                            onChange={(e) => updatePresetDataField('altitude', e.target.value)}
                            className="w-full bg-[#0B0E14] border border-[#1E2638] rounded px-2 py-1 text-white"
                          />
                        </div>
                        <div>
                          <span className="text-slate-400 block mb-0.5">Rumo / Bússola</span>
                          <input
                            type="text"
                            value={selectedLayer.presetData.heading || ''}
                            onChange={(e) => updatePresetDataField('heading', e.target.value)}
                            className="w-full bg-[#0B0E14] border border-[#1E2638] rounded px-2 py-1 text-white"
                          />
                        </div>
                      </div>
                    </>
                  )}

                  {selectedLayer.presetType === 'dashcam' && (
                    <>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <span className="text-slate-400 block mb-0.5">Agência Policial</span>
                          <input
                            type="text"
                            value={selectedLayer.presetData.agency || ''}
                            onChange={(e) => updatePresetDataField('agency', e.target.value)}
                            className="w-full bg-[#0B0E14] border border-[#1E2638] rounded px-2 py-1 text-white"
                          />
                        </div>
                        <div>
                          <span className="text-slate-400 block mb-0.5">Prefixo da Viatura</span>
                          <input
                            type="text"
                            value={selectedLayer.presetData.patrolUnit || ''}
                            onChange={(e) => updatePresetDataField('patrolUnit', e.target.value)}
                            className="w-full bg-[#0B0E14] border border-[#1E2638] rounded px-2 py-1 text-white"
                          />
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <span className="text-slate-400 block mb-0.5">Velocidade Viatura</span>
                          <input
                            type="text"
                            value={selectedLayer.presetData.patrolSpeed || ''}
                            onChange={(e) => updatePresetDataField('patrolSpeed', e.target.value)}
                            className="w-full bg-[#0B0E14] border border-[#1E2638] rounded px-2 py-1 text-white"
                          />
                        </div>
                        <div>
                          <span className="text-slate-400 block mb-0.5">Velocidade Alvo</span>
                          <input
                            type="text"
                            value={selectedLayer.presetData.targetSpeed || ''}
                            onChange={(e) => updatePresetDataField('targetSpeed', e.target.value)}
                            className="w-full bg-[#0B0E14] border border-[#1E2638] rounded px-2 py-1 text-white"
                          />
                        </div>
                      </div>
                    </>
                  )}

                  {selectedLayer.presetType === 'cctv' && (
                    <>
                      <div>
                        <span className="text-slate-400 block mb-0.5">Identificação da Câmera</span>
                        <input
                          type="text"
                          value={selectedLayer.presetData.camName || ''}
                          onChange={(e) => updatePresetDataField('camName', e.target.value)}
                          className="w-full bg-[#0B0E14] border border-[#1E2638] rounded px-2 py-1 text-white"
                        />
                      </div>
                      <label className="flex items-center gap-1.5 text-slate-300 cursor-pointer pt-1">
                        <input
                          type="checkbox"
                          checked={!!selectedLayer.presetData.showDate}
                          onChange={(e) => updatePresetDataField('showDate', e.target.checked)}
                          className="accent-emerald-500 rounded"
                        />
                        <span>Exibir Data/Hora no Topo</span>
                      </label>
                    </>
                  )}

                  {selectedLayer.presetType === 'mugshot' && (
                    <>
                      <div>
                        <span className="text-slate-400 block mb-0.5">Departamento Policial</span>
                        <input
                          type="text"
                          value={selectedLayer.presetData.policeDept || ''}
                          onChange={(e) => updatePresetDataField('policeDept', e.target.value)}
                          className="w-full bg-[#0B0E14] border border-[#1E2638] rounded px-2 py-1 text-white"
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <span className="text-slate-400 block mb-0.5">Nome do Suspeito</span>
                          <input
                            type="text"
                            value={selectedLayer.presetData.suspectName || ''}
                            onChange={(e) => updatePresetDataField('suspectName', e.target.value)}
                            className="w-full bg-[#0B0E14] border border-[#1E2638] rounded px-2 py-1 text-white"
                          />
                        </div>
                        <div>
                          <span className="text-slate-400 block mb-0.5">Booking ID</span>
                          <input
                            type="text"
                            value={selectedLayer.presetData.bookingId || ''}
                            onChange={(e) => updatePresetDataField('bookingId', e.target.value)}
                            className="w-full bg-[#0B0E14] border border-[#1E2638] rounded px-2 py-1 text-white"
                          />
                        </div>
                      </div>
                      <div>
                        <span className="text-slate-400 block mb-0.5">Artigos Penais / Enquadramento</span>
                        <textarea
                          rows={2}
                          value={selectedLayer.presetData.charges || ''}
                          onChange={(e) => updatePresetDataField('charges', e.target.value)}
                          className="w-full bg-[#0B0E14] border border-[#1E2638] rounded px-2 py-1 text-white"
                        />
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
          ) : (
            <p className="text-xs text-slate-500 italic py-2">
              Nenhuma camada selecionada. Clique em um elemento no canvas ou na lista abaixo para editar.
            </p>
          )}
        </div>

        {/* Gerenciador de Camadas */}
        <div className="p-4 rounded-2xl bg-[#121722] border border-[#1E2638] shadow-md space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-emerald-400 flex items-center gap-1.5">
              <Layers className="w-3.5 h-3.5" /> Elementos de RP ({layers.length})
            </span>
          </div>

          <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
            {[...layers].reverse().map((layer) => {
              const isSelected = layer.id === selectedLayerId;
              return (
                <div
                  key={layer.id}
                  onClick={() => setSelectedLayerId(layer.id)}
                  className={`flex items-center justify-between p-2 rounded-lg text-xs cursor-pointer transition-all border ${
                    isSelected
                      ? 'bg-emerald-500/10 border-emerald-500/50 text-white font-medium'
                      : 'bg-[#0B0E14] border-[#1E2638] text-slate-400 hover:bg-slate-800/40'
                  }`}
                >
                  <span className="truncate max-w-[140px]">{layer.name}</span>

                  <div className="flex items-center gap-1">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setLayers(prev => prev.map(l => l.id === layer.id ? { ...l, visible: !l.visible } : l));
                      }}
                      className="p-1 hover:text-white"
                      title={layer.visible ? 'Ocultar' : 'Exibir'}
                    >
                      {layer.visible ? <Eye className="w-3.5 h-3.5 text-emerald-400" /> : <EyeOff className="w-3.5 h-3.5 text-slate-600" />}
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); moveLayer(layer.id, 'up'); }}
                      className="p-1 hover:text-white"
                      title="Subir Camada"
                    >
                      <ArrowUp className="w-3 h-3" />
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); moveLayer(layer.id, 'down'); }}
                      className="p-1 hover:text-white"
                      title="Descer Camada"
                    >
                      <ArrowDown className="w-3 h-3" />
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); deleteLayer(layer.id); }}
                      className="p-1 hover:text-red-400"
                      title="Excluir Camada"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
    </>
  );
};
