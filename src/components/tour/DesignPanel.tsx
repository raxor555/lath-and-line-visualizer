"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Hand,
  Lamp,
  Lightbulb,
  Minus,
  MoveHorizontal,
  Plus,
  Share2,
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
  const cfg = useTour((s) => s.walls[s.active]);
  const { setActive, update, setFinish } = useTour.getState();
  const lights = useTour((s) => s.lights);

  const [isEstimateOpen, setIsEstimateOpen] = useState(false);
  const f = finishById(cfg.pid);
  const est = estimate(cfg);
  const len = WALLS[active].length;
  const lim = (len - cfg.width) / 2;
  const maxW = f ? Math.floor((len - 0.02) / f.module) * f.module : len;

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
        setFinish(useTour.getState().active, p.pid);
        return;
      }
      if (!tour.drop(e.clientX, e.clientY, p.pid)) setFinish(useTour.getState().active, p.pid);
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
  }, [setFinish]);

  const grab = (pid: string, bg: string) => (e: React.PointerEvent) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    press.current = { pid, bg, x0: e.clientX, y0: e.clientY, moved: false };
  };

  const LIGHT_UI: [LightGroup, string, typeof Sun][] = [
    ["day", "Daylight", Sun],
    ["spots", "Spotlights", Lightbulb],
    ["lamps", "Lamps", Lamp],
  ];

  return (
    <div
      className={`absolute inset-0 transition-opacity duration-500 pointer-events-none ${
        designOn ? "opacity-100" : "opacity-0"
      }`}
      aria-hidden={!designOn}
    >
      {/* TOP CONTROL BAR: Minimal, floating sleek pills */}
      <div className="fixed top-14 sm:top-16 inset-x-0 px-3 sm:px-6 flex items-center justify-between z-30 pointer-events-none">
        {/* Left: House button + Wall Picker + Lights */}
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
              className="glass fixed right-3 sm:right-6 top-14 sm:top-16 z-50 w-[290px] sm:w-[320px] max-w-[calc(100vw-24px)] rounded-3xl p-4 sm:p-5 shadow-2xl backdrop-blur-xl border border-white/40 animate-in fade-in slide-in-from-right duration-200"
              aria-label="Finish specification and estimate"
            >
              <div className="flex items-center justify-between pb-2.5 border-b border-line">
                <div>
                  <p className="font-mono text-[10px] text-clay uppercase tracking-wider">
                    {f ? f.collection : WALLS[active].label}
                  </p>
                  <h3 className="text-[16px] sm:text-[18px] font-light text-ink leading-tight">
                    {f ? f.name : "Plain plaster"}
                  </h3>
                  <p className="font-mono text-[11px] text-muted mt-0.5">
                    {f ? `${f.size} · ${money(f.price)} / ${f.unit}` : "Pick a finish below"}
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

              {f && (
                <div className="mt-3 grid gap-3">
                  {/* Width slider & Quick Presets */}
                  <div>
                    <div className="flex items-baseline justify-between text-[11.5px] text-ink-2">
                      <span>Wall Coverage</span>
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
                        Full Wall
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

                  {/* Estimate calculation */}
                  {est && (
                    <div className="rounded-xl bg-white/70 p-3 text-[11.5px]">
                      <dl className="grid grid-cols-[1fr_auto] gap-y-1">
                        <dt className="text-muted">Covered area</dt>
                        <dd className="text-right font-mono">
                          {cfg.width.toFixed(2)} × {WALL_HEIGHT.toFixed(2)} m
                        </dd>
                        <dt className="text-muted">You need</dt>
                        <dd className="text-right font-mono">
                          {est.qty} {est.finish.unit}
                          {est.qty === 1 ? "" : "s"}
                        </dd>
                        <dt className="text-muted">Trims</dt>
                        <dd className="text-right font-mono">2 end profiles</dd>
                      </dl>
                      <div className="mt-2.5 flex items-baseline justify-between border-t border-line pt-2">
                        <span className="text-[11.5px] text-muted">Estimate</span>
                        <strong className="text-[20px] font-light text-ink tracking-tight">
                          {money(est.total)}
                        </strong>
                      </div>
                    </div>
                  )}

                  <a
                    href={`https://wa.me/923177139658?text=${encodeURIComponent(
                      `Salam! I created a room design on Lath & Line Studio with ${f.name} (${cfg.width.toFixed(
                        2
                      )}m width). Estimated price: ${money(est?.total || 0)}. Please share catalog & final quote.`
                    )}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex h-9.5 items-center justify-center gap-1.5 rounded-xl bg-[#25D366] text-[12.5px] font-medium text-white transition hover:bg-[#20bd5a] shadow-md cursor-pointer"
                  >
                    <Share2 className="size-3.5" />
                    <span>Share on WhatsApp</span>
                  </a>
                </div>
              )}
            </aside>
          )}
        </div>
      </div>

      {/* BOTTOM CONTROLS: Ultra-compact, clean dock */}
      <div className="fixed inset-x-0 bottom-2 sm:bottom-3 z-30 pointer-events-none flex flex-col items-center gap-1.5 px-3">
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
            <Hand className="size-3" /> Drag on wall
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
            on={!cfg.pid}
            onClick={() => setFinish(active, null)}
          />
          {shown.map((x) => (
            <Swatch
              key={x.id}
              label={x.name}
              sub={x.collection}
              bg={x.swatch}
              on={cfg.pid === x.id}
              onPointerDown={grab(x.id, x.swatch)}
              onClick={(e) => {
                if (e.detail === 0) setFinish(active, x.id);
              }}
            />
          ))}
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
