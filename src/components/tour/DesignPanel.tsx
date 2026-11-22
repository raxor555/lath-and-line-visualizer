"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Hand,
  Lamp,
  Layers,
  Lightbulb,
  Minus,
  MoveHorizontal,
  Plus,
  Share2,
  Sparkles,
  Sun,
  X,
} from "lucide-react";
import { tour, useTour, type LightGroup } from "@/lib/tour-store";
import {
  FINISHES,
  WALLS,
  WALL_HEIGHT,
  estimate,
  finishById,
  money,
  supportsDirection,
  type WallId,
} from "@/lib/finishes";

interface DesignPanelProps {
  onStepOutside?: () => void;
}

export default function DesignPanel({ onStepOutside }: DesignPanelProps) {
  const designOn = useTour((s) => s.designOn);
  const active = useTour((s) => s.active);
  const roomOverview = useTour((s) => s.roomOverview);
  const cfg = useTour((s) => s.walls[s.active]);
  const { setActive, update, setFinish } = useTour.getState();
  const lights = useTour((s) => s.lights);

  const [isEstimateOpen, setIsEstimateOpen] = useState(false);
  // Which slot are we picking swatches for when in combo mode: "center" or "wings"
  const [comboSlot, setComboSlot] = useState<"center" | "wings">("center");

  const f = finishById(cfg.pid);
  const wf = finishById(cfg.wingsPid ?? null);
  const est = estimate(cfg);

  const len = WALLS[active].length;
  const wingsW = cfg.combo && cfg.wingsPid ? (cfg.wingsWidth ?? 0.6) * 2 : 0;
  const lim = Math.max(0, (len - (cfg.width + wingsW)) / 2);
  const maxW = f ? Math.max(f.module, Math.floor((len - 0.02 - wingsW) / f.module) * f.module) : len;

  const collections = useMemo(() => [...new Set(FINISHES.map((x) => x.collection))], []);
  const [tab, setTab] = useState<string | null>(null);
  const shown = tab ? FINISHES.filter((x) => x.collection === tab) : FINISHES;

  /* drag a swatch onto a wall */
  const [drag, setDrag] = useState<{ pid: string; bg: string; x: number; y: number } | null>(null);
  const press = useRef<{ pid: string; bg: string; x0: number; y0: number; moved: boolean } | null>(null);

  useEffect(() => {
    const move = (e: PointerEvent) => {
      const p = press.current;
      if (!p) return;
      if (!p.moved && Math.hypot(e.clientX - p.x0, e.clientY - p.y0) > 8) p.moved = true;
      if (p.moved) setDrag({ pid: p.pid, bg: p.bg, x: e.clientX, y: e.clientY });
    };
    const up = (e: PointerEvent) => {
      const p = press.current;
      press.current = null;
      if (!p) return;
      setDrag(null);
      if (!p.moved) {
        handleSwatchSelect(p.pid);
        return;
      }
      if (!tour.drop(e.clientX, e.clientY, p.pid)) {
        handleSwatchSelect(p.pid);
      }
    };
    const cancel = () => {
      press.current = null;
      setDrag(null);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", cancel);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", cancel);
    };
  }, [cfg.combo, comboSlot, active]);

  const handleSwatchSelect = (pid: string | null) => {
    if (cfg.combo && comboSlot === "wings") {
      update(active, { wingsPid: pid });
    } else {
      setFinish(active, pid);
    }
  };

  const grab = (pid: string, bg: string) => (e: React.PointerEvent) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    press.current = { pid, bg, x0: e.clientX, y0: e.clientY, moved: false };
  };

  const LIGHT_UI: [LightGroup, string, typeof Sun][] = [
    ["day", "Daylight", Sun],
    ["spots", "Spotlights", Lightbulb],
    ["lamps", "Lamps", Lamp],
  ];

  const applyPresetCombo = (centerPid: string, wingsPid: string, centerWidth = 2.44, wingsWidth = 0.6) => {
    update(active, {
      pid: centerPid,
      combo: true,
      wingsPid,
      width: centerWidth,
      wingsWidth,
      center: 0,
    });
  };

  return (
    <div
      className={`absolute inset-0 transition-opacity duration-500 pointer-events-none ${
        designOn ? "opacity-100" : "opacity-0"
      }`}
      aria-hidden={!designOn}
    >
      {/* TOP CONTROL BAR: Minimal, floating sleek pills */}
      <div className="fixed top-14 sm:top-16 inset-x-0 px-3 sm:px-6 flex items-center justify-between z-30 pointer-events-none">
        {/* Left: House button + Wall Picker + Mode Toggle + Lights */}
        <div className="pointer-events-auto flex items-center gap-1.5 flex-wrap">
          {onStepOutside && (
            <button
              onClick={onStepOutside}
              className="glass flex items-center gap-1 rounded-full h-7 sm:h-8 px-2.5 text-[11px] sm:text-[12px] font-medium text-ink-2 hover:text-ink transition hover:bg-white shadow-sm cursor-pointer"
              title="Step outside to the house"
            >
              <ChevronLeft className="size-3.5" />
              <span>House</span>
            </button>
          )}

          {/* Wall Switcher */}
          <div className="glass inline-flex gap-0.5 rounded-full p-0.5 shadow-sm" role="group" aria-label="Wall">
            {(Object.keys(WALLS) as WallId[]).map((id) => (
              <button
                key={id}
                onClick={() => setActive(id)}
                aria-pressed={active === id}
                className={`h-6 sm:h-7 rounded-full px-2.5 text-[11px] sm:text-[12px] font-medium transition cursor-pointer ${
                  active === id ? "bg-ink text-paper shadow-xs" : "text-ink-2 hover:bg-white/60"
                }`}
              >
                {WALLS[id].label}
              </button>
            ))}
          </div>

          {/* Wall Focus vs Room View Toggle */}
          <button
            onClick={() => useTour.getState().toggleRoomOverview()}
            className="glass flex items-center gap-1 rounded-full h-7 sm:h-8 px-2.5 text-[11px] sm:text-[12px] font-medium text-ink-2 hover:text-ink transition hover:bg-white shadow-sm cursor-pointer"
            title="Toggle between close-up wall focus and wide room overview"
          >
            <span>{roomOverview ? "🛋️ Wide Room" : "🔍 Wall Focus"}</span>
          </button>

          {/* Combo Wall Quick Toggle */}
          <button
            onClick={() => {
              if (cfg.combo) {
                update(active, { combo: false });
              } else {
                update(active, {
                  combo: true,
                  wingsPid: cfg.wingsPid || (cfg.pid === "slat-walnut" ? "marble-statuario" : "slat-walnut"),
                  wingsWidth: cfg.wingsWidth || 0.6,
                });
              }
            }}
            className={`flex items-center gap-1.5 rounded-full h-7 sm:h-8 px-3 text-[11px] sm:text-[12px] font-medium transition cursor-pointer shadow-sm ${
              cfg.combo
                ? "bg-clay text-white shadow-md ring-2 ring-clay/30"
                : "glass text-ink-2 hover:text-ink hover:bg-white"
            }`}
            title="Toggle Multi-Finish Combination Wall"
          >
            <Layers className="size-3.5" />
            <span>Combo Wall {cfg.combo ? "ON" : "OFF"}</span>
          </button>

          {/* Lights Switcher */}
          <div className="glass inline-flex gap-0.5 rounded-full p-0.5 shadow-sm" role="group" aria-label="Lights">
            {LIGHT_UI.map(([g, label, Icon]) => (
              <button
                key={g}
                onClick={() => useTour.getState().toggleLight(g)}
                aria-pressed={lights[g]}
                className={`flex size-6 sm:size-7 items-center justify-center rounded-full transition cursor-pointer ${
                  lights[g] ? "bg-white text-ink shadow-xs" : "text-ink-2/60 hover:bg-white/50"
                }`}
                title={label}
              >
                <Icon className={`size-3 sm:size-3.5 ${lights[g] ? "text-clay" : ""}`} />
              </button>
            ))}
          </div>
        </div>

        {/* Right: Collapsible Minimal Estimate Badge */}
        <div className="pointer-events-auto">
          {!isEstimateOpen ? (
            <button
              onClick={() => setIsEstimateOpen(true)}
              className="glass flex items-center gap-2 rounded-full h-7 sm:h-8 px-3 text-[11.5px] sm:text-[12px] font-medium text-ink shadow-md transition hover:bg-white hover:scale-105 active:scale-95 cursor-pointer border border-white/40"
              title="View Spec & Estimate"
            >
              <span className="font-mono font-semibold text-clay">{f ? money(est?.total || 0) : "Spec & Cost"}</span>
              <span className="text-[10px] text-muted">Details ▾</span>
            </button>
          ) : (
            /* Open Sidebar Drawer */
            <aside
              className="glass fixed right-3 sm:right-6 top-14 sm:top-16 z-50 w-[300px] sm:w-[340px] max-w-[calc(100vw-24px)] max-h-[calc(100vh-80px)] overflow-y-auto no-scrollbar rounded-3xl p-4 sm:p-5 shadow-2xl backdrop-blur-xl border border-white/40 animate-in fade-in slide-in-from-right duration-200"
              aria-label="Finish specification and estimate"
            >
              {/* Header */}
              <div className="flex items-center justify-between pb-2.5 border-b border-line">
                <div>
                  <p className="font-mono text-[10px] text-clay uppercase tracking-wider">
                    {cfg.combo ? "Multi-Finish Wall System" : f ? f.collection : WALLS[active].label}
                  </p>
                  <h3 className="text-[16px] sm:text-[18px] font-light text-ink leading-tight">
                    {cfg.combo ? `${f?.name || "Center"} + ${wf?.name || "Wings"}` : f ? f.name : "Plain plaster"}
                  </h3>
                  <p className="font-mono text-[11px] text-muted mt-0.5">
                    {cfg.combo
                      ? `Combination: ${(cfg.width + wingsW).toFixed(2)} m total`
                      : f ? `${f.size} · ${money(f.price)} / ${f.unit}` : "Pick a finish below"}
                  </p>
                </div>
                <button
                  onClick={() => setIsEstimateOpen(false)}
                  className="size-7 rounded-full bg-black/5 hover:bg-black/10 flex items-center justify-center text-ink text-sm cursor-pointer transition"
                  title="Close sidebar"
                >
                  <X className="size-4" />
                </button>
              </div>

              {/* Mode Switcher Tabs inside drawer */}
              <div className="mt-3 grid grid-cols-2 gap-1 rounded-xl bg-black/5 p-1">
                <button
                  type="button"
                  onClick={() => update(active, { combo: false })}
                  className={`h-7 rounded-lg text-[11px] font-medium transition cursor-pointer ${
                    !cfg.combo ? "bg-white text-ink shadow-xs" : "text-ink-2 hover:text-ink"
                  }`}
                >
                  Single Finish
                </button>
                <button
                  type="button"
                  onClick={() =>
                    update(active, {
                      combo: true,
                      wingsPid: cfg.wingsPid || (cfg.pid === "slat-walnut" ? "marble-statuario" : "slat-walnut"),
                      wingsWidth: cfg.wingsWidth || 0.6,
                    })
                  }
                  className={`h-7 rounded-lg text-[11px] font-medium transition cursor-pointer flex items-center justify-center gap-1 ${
                    cfg.combo ? "bg-clay text-white shadow-xs" : "text-ink-2 hover:text-ink"
                  }`}
                >
                  <Sparkles className="size-3" /> Combo Wall
                </button>
              </div>

              {/* COMBO PRESETS */}
              {cfg.combo && (
                <div className="mt-2.5">
                  <span className="text-[10px] uppercase font-mono tracking-wider text-muted block mb-1">
                    Popular Designer Combos
                  </span>
                  <div className="grid grid-cols-1 gap-1">
                    <button
                      type="button"
                      onClick={() => applyPresetCombo("marble-statuario", "slat-walnut", 2.44, 0.6)}
                      className="text-left px-2.5 py-1.5 rounded-lg bg-white/70 hover:bg-white text-[11px] text-ink transition cursor-pointer border border-white/50 flex items-center justify-between"
                    >
                      <span className="font-medium">Statuario Marble + Walnut Slat</span>
                      <span className="text-[9.5px] font-mono text-clay">DHA Favorite</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => applyPresetCombo("marble-nero", "slat-oak", 2.44, 0.6)}
                      className="text-left px-2.5 py-1.5 rounded-lg bg-white/70 hover:bg-white text-[11px] text-ink transition cursor-pointer border border-white/50 flex items-center justify-between"
                    >
                      <span className="font-medium">Nero Marble + Natural Oak</span>
                      <span className="text-[9.5px] font-mono text-muted">Contrast</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => applyPresetCombo("marble-statuario", "fluted-charcoal", 2.44, 0.64)}
                      className="text-left px-2.5 py-1.5 rounded-lg bg-white/70 hover:bg-white text-[11px] text-ink transition cursor-pointer border border-white/50 flex items-center justify-between"
                    >
                      <span className="font-medium">Statuario + Fluted Charcoal</span>
                      <span className="text-[9.5px] font-mono text-muted">Sleek Modern</span>
                    </button>
                  </div>
                </div>
              )}

              {/* Slot Target Selector when Combo is Active */}
              {cfg.combo && (
                <div className="mt-2.5 p-2 rounded-xl bg-white/60 border border-white/40">
                  <span className="text-[10px] uppercase font-mono tracking-wider text-muted block mb-1">
                    Choose Swatch For:
                  </span>
                  <div className="grid grid-cols-2 gap-1.5">
                    <button
                      type="button"
                      onClick={() => setComboSlot("center")}
                      className={`py-1.5 px-2 rounded-lg text-[11px] font-medium transition cursor-pointer text-left flex flex-col ${
                        comboSlot === "center"
                          ? "bg-ink text-paper shadow-xs"
                          : "bg-white/80 text-ink-2 hover:bg-white"
                      }`}
                    >
                      <span className="text-[9.5px] opacity-75">1. Center Accent</span>
                      <span className="truncate font-semibold">{f?.name || "Select"}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setComboSlot("wings")}
                      className={`py-1.5 px-2 rounded-lg text-[11px] font-medium transition cursor-pointer text-left flex flex-col ${
                        comboSlot === "wings"
                          ? "bg-clay text-white shadow-xs"
                          : "bg-white/80 text-ink-2 hover:bg-white"
                      }`}
                    >
                      <span className="text-[9.5px] opacity-75">2. Flanking Wings</span>
                      <span className="truncate font-semibold">{wf?.name || "Select"}</span>
                    </button>
                  </div>
                </div>
              )}

              {f && (
                <div className="mt-3 grid gap-3">
                  {/* Width slider & Quick Presets */}
                  <div>
                    <div className="flex items-baseline justify-between text-[11.5px] text-ink-2">
                      <span>{cfg.combo ? "Center Width" : "Wall Coverage"}</span>
                      <span className="font-mono text-[11px] font-medium">{cfg.width.toFixed(2)} m</span>
                    </div>

                    {/* Quick Coverage Presets */}
                    <div className="mt-1 flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => update(active, { width: Math.max(f.module, Math.round(2.4 / f.module) * f.module), center: 0 })}
                        className={`h-6 rounded-md px-2 text-[10px] font-medium transition cursor-pointer ${
                          Math.abs(cfg.width - 2.4) < 0.3 ? "bg-ink text-paper" : "bg-white/80 text-ink-2 hover:bg-white"
                        }`}
                      >
                        Accent (2.4m)
                      </button>
                      <button
                        type="button"
                        onClick={() => update(active, { width: Math.max(f.module, Math.round(3.6 / f.module) * f.module), center: 0 })}
                        className={`h-6 rounded-md px-2 text-[10px] font-medium transition cursor-pointer ${
                          Math.abs(cfg.width - 3.6) < 0.3 ? "bg-ink text-paper" : "bg-white/80 text-ink-2 hover:bg-white"
                        }`}
                      >
                        Media Wall (3.6m)
                      </button>
                      <button
                        type="button"
                        onClick={() => update(active, { width: maxW, center: 0 })}
                        className={`h-6 rounded-md px-2 text-[10px] font-medium transition cursor-pointer ${
                          Math.abs(cfg.width - maxW) < 0.1 ? "bg-ink text-paper" : "bg-white/80 text-ink-2 hover:bg-white"
                        }`}
                      >
                        Max Wall
                      </button>
                    </div>

                    <div className="mt-1.5 flex items-center gap-1.5">
                      <button
                        aria-label="Narrower"
                        onClick={() => update(active, { width: cfg.width - f.module })}
                        className="grid size-6.5 shrink-0 place-items-center rounded-full bg-white/80 hover:bg-white text-xs cursor-pointer"
                      >
                        <Minus className="size-3" />
                      </button>
                      <input
                        className="range"
                        type="range"
                        aria-label="Width"
                        min={f.module}
                        max={maxW}
                        step={f.module}
                        value={cfg.width}
                        onChange={(e) => update(active, { width: +e.target.value })}
                      />
                      <button
                        aria-label="Wider"
                        onClick={() => update(active, { width: cfg.width + f.module })}
                        className="grid size-6.5 shrink-0 place-items-center rounded-full bg-white/80 hover:bg-white text-xs cursor-pointer"
                      >
                        <Plus className="size-3" />
                      </button>
                    </div>
                  </div>

                  {/* Wings Width Control if Combo is active */}
                  {cfg.combo && wf && (
                    <div>
                      <div className="flex items-baseline justify-between text-[11.5px] text-ink-2">
                        <span>Wings Width (Each Side)</span>
                        <span className="font-mono text-[11px] font-medium">
                          {(cfg.wingsWidth ?? 0.6).toFixed(2)} m
                        </span>
                      </div>
                      <div className="mt-1 flex items-center gap-1.5">
                        {[0.32, 0.6, 0.96, 1.2].map((wVal) => (
                          <button
                            key={wVal}
                            type="button"
                            onClick={() => update(active, { wingsWidth: wVal })}
                            className={`flex-1 h-6.5 rounded-lg text-[10.5px] font-medium transition cursor-pointer ${
                              Math.abs((cfg.wingsWidth ?? 0.6) - wVal) < 0.05
                                ? "bg-clay text-white shadow-xs"
                                : "bg-white/80 text-ink-2 hover:bg-white"
                            }`}
                          >
                            {wVal.toFixed(2)}m
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Position slider */}
                  <div>
                    <div className="flex items-baseline justify-between text-[11.5px] text-ink-2">
                      <span>Position</span>
                      <span className="inline-flex items-center gap-1 text-[10.5px] text-muted">
                        <MoveHorizontal className="size-3" /> Drag on wall
                      </span>
                    </div>
                    <input
                      className="range mt-1"
                      type="range"
                      aria-label="Position on wall"
                      min={-1}
                      max={1}
                      step={0.01}
                      disabled={lim <= 0.001}
                      value={lim > 0 ? cfg.center / lim : 0}
                      onChange={(e) => update(active, { center: +e.target.value * lim })}
                    />
                  </div>

                  {/* Orientation */}
                  <div className="inline-flex w-max gap-1 rounded-xl bg-white/70 p-0.5">
                    {(["v", "h"] as const).map((d) => (
                      <button
                        key={d}
                        disabled={!supportsDirection(f)}
                        onClick={() => update(active, { dir: d })}
                        aria-pressed={cfg.dir === d}
                        className={`h-6.5 rounded-lg px-2.5 text-[11px] font-medium transition disabled:opacity-40 cursor-pointer ${
                          cfg.dir === d ? "bg-ink text-paper" : "text-ink-2"
                        }`}
                      >
                        {d === "v" ? "Vertical" : "Horizontal"}
                      </button>
                    ))}
                  </div>

                  {/* Detailed Estimate calculation */}
                  {est && (
                    <div className="rounded-xl bg-white/70 p-3 text-[11.5px]">
                      <dl className="grid grid-cols-[1fr_auto] gap-y-1.5">
                        <dt className="text-muted">Total Wall Width</dt>
                        <dd className="text-right font-mono font-medium">
                          {(cfg.width + wingsW).toFixed(2)} × {WALL_HEIGHT.toFixed(2)} m
                        </dd>

                        {/* Center Section Breakdown */}
                        <dt className="text-ink font-medium mt-1">Center ({f.name})</dt>
                        <dd className="text-right font-mono font-medium text-ink mt-1">
                          {money(est.centerTotal)}
                        </dd>
                        <dt className="text-[10.5px] text-muted pl-2">
                          {est.qty} × {f.unit} ({cfg.width.toFixed(2)}m)
                        </dt>
                        <dd className="text-right font-mono text-[10.5px] text-muted">
                          @ {money(f.price)}
                        </dd>

                        {/* Wings Breakdown if Combo */}
                        {est.wings && (
                          <>
                            <dt className="text-ink font-medium mt-1">
                              Flanking Wings ({est.wings.finish.name})
                            </dt>
                            <dd className="text-right font-mono font-medium text-ink mt-1">
                              {money(est.wings.total)}
                            </dd>
                            <dt className="text-[10.5px] text-muted pl-2">
                              {est.wings.qty} × {est.wings.finish.unit} (2 × {est.wings.widthPerSide.toFixed(2)}m)
                            </dt>
                            <dd className="text-right font-mono text-[10.5px] text-muted">
                              @ {money(est.wings.finish.price)}
                            </dd>

                            <dt className="text-muted">Dividing Trims</dt>
                            <dd className="text-right font-mono">2 × Black T-profiles</dd>
                          </>
                        )}

                        <dt className="text-muted">End Profiles</dt>
                        <dd className="text-right font-mono">2 × Edge trims</dd>
                      </dl>

                      <div className="mt-2.5 flex items-baseline justify-between border-t border-line pt-2">
                        <span className="text-[11.5px] font-medium text-muted">Grand Total (PKR)</span>
                        <strong className="text-[20px] font-light text-clay tracking-tight">
                          {money(est.total)}
                        </strong>
                      </div>
                    </div>
                  )}

                  <a
                    href={`https://wa.me/923177139658?text=${encodeURIComponent(
                      cfg.combo && wf
                        ? `Salam! I designed a Combination Wall on Lath & Line Studio: Center: ${f.name} (${cfg.width.toFixed(2)}m) + Wings: ${wf.name} (${(cfg.wingsWidth ?? 0.6).toFixed(2)}m each side). Estimated price: ${money(est?.total || 0)}. Please share catalog & final quote.`
                        : `Salam! I created a room design on Lath & Line Studio with ${f.name} (${cfg.width.toFixed(2)}m width). Estimated price: ${money(est?.total || 0)}. Please share catalog & final quote.`
                    )}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex h-9.5 items-center justify-center gap-1.5 rounded-xl bg-[#25D366] text-[12.5px] font-medium text-white transition hover:bg-[#20bd5a] shadow-md cursor-pointer"
                  >
                    <Share2 className="size-3.5" />
                    <span>Share Design on WhatsApp</span>
                  </a>
                </div>
              )}
            </aside>
          )}
        </div>
      </div>

      {/* BOTTOM CONTROLS: Ultra-compact, clean dock */}
      <div className="fixed inset-x-0 bottom-2 sm:bottom-3 z-30 pointer-events-none flex flex-col items-center gap-1.5 px-3">
        {/* Status Indicator when in combo mode */}
        {cfg.combo && (
          <div className="pointer-events-auto flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#181412]/85 text-white backdrop-blur-md text-[10.5px] shadow-lg border border-white/10">
            <span className="text-[#e06d3b] font-medium">Combo Wall Mode:</span>
            <span>Assigning swatches to:</span>
            <button
              onClick={() => setComboSlot("center")}
              className={`px-2 py-0.5 rounded-md font-medium transition cursor-pointer ${
                comboSlot === "center" ? "bg-white text-black" : "text-white/70 hover:text-white"
              }`}
            >
              Center ({f?.name || "None"})
            </button>
            <span className="text-white/40">|</span>
            <button
              onClick={() => setComboSlot("wings")}
              className={`px-2 py-0.5 rounded-md font-medium transition cursor-pointer ${
                comboSlot === "wings" ? "bg-clay text-white" : "text-white/70 hover:text-white"
              }`}
            >
              Wings ({wf?.name || "None"})
            </button>
          </div>
        )}

        {/* Category Tabs */}
        <div
          data-lenis-prevent
          className="pointer-events-auto no-scrollbar flex items-center gap-1 overflow-x-auto max-w-full px-2 py-0.5"
          role="tablist"
        >
          {[null, ...collections].map((c) => (
            <button
              key={c ?? "all"}
              role="tab"
              aria-selected={tab === c}
              onClick={() => setTab(c)}
              className={`h-6 shrink-0 rounded-full px-2.5 text-[10.5px] font-medium transition cursor-pointer backdrop-blur-md ${
                tab === c ? "bg-ink text-paper shadow-sm" : "glass text-ink-2 hover:text-ink"
              }`}
            >
              {c ?? "All"}
            </button>
          ))}
          <span className="hidden sm:inline-flex items-center gap-1 text-[10.5px] text-white/80 drop-shadow ml-1">
            <Hand className="size-3" /> Tap to apply
          </span>
        </div>

        {/* Swatch Strip */}
        <div
          data-lenis-prevent
          className="pointer-events-auto no-scrollbar flex gap-2 overflow-x-auto max-w-full px-2 py-1"
          role="group"
          aria-label="Finishes"
        >
          <Swatch
            label="Plain Plaster"
            sub="Remove"
            bg="linear-gradient(135deg,#f3efe9,#e2dbd1)"
            on={cfg.combo && comboSlot === "wings" ? !cfg.wingsPid : !cfg.pid}
            onClick={() => handleSwatchSelect(null)}
          />
          {shown.map((x) => {
            const isSelected =
              cfg.combo && comboSlot === "wings" ? cfg.wingsPid === x.id : cfg.pid === x.id;
            return (
              <Swatch
                key={x.id}
                label={x.name}
                sub={x.collection}
                bg={x.swatch}
                on={isSelected}
                onPointerDown={grab(x.id, x.swatch)}
                onClick={(e) => {
                  if (e.detail === 0) handleSwatchSelect(x.id);
                }}
              />
            );
          })}
        </div>
      </div>

      {/* Dragging swatch ghost */}
      {drag && (
        <span
          className="pointer-events-none fixed z-50 size-16 -translate-x-1/2 -translate-y-1/2 rounded-xl border-2 border-white shadow-2xl"
          style={{ left: drag.x, top: drag.y, background: drag.bg, backgroundSize: "cover" }}
        />
      )}
    </div>
  );
}

function Swatch({
  label,
  sub,
  bg,
  on,
  onClick,
  onPointerDown,
}: {
  label: string;
  sub: string;
  bg: string;
  on: boolean;
  onClick?: (e: React.MouseEvent) => void;
  onPointerDown?: (e: React.PointerEvent) => void;
}) {
  return (
    <button
      onClick={onClick}
      onPointerDown={onPointerDown}
      aria-pressed={on}
      style={{ touchAction: onPointerDown ? "pan-x" : undefined }}
      className={`glass group w-[88px] sm:w-[96px] shrink-0 rounded-xl p-1 text-left transition duration-200 hover:-translate-y-0.5 cursor-pointer backdrop-blur-md ${
        on ? "ring-2 ring-clay" : ""
      }`}
    >
      <span className="block h-[44px] rounded-lg" style={{ background: bg, backgroundSize: "cover" }} />
      <span className="mt-1 block truncate px-0.5 text-[10.5px] font-medium leading-tight text-ink">
        {label}
      </span>
      <span className="block truncate px-0.5 text-[9px] leading-tight text-muted">
        {sub}
      </span>
    </button>
  );
}