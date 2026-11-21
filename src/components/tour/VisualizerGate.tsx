"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { ArrowLeft, Download, RotateCw } from "lucide-react";
import { LITE } from "@/lib/device";

/* The visualizer is its own experience: its 3D files download once, stay on the device, and every later visit opens
   straight into the room. The files go into Cache Storage, and public/sw.js serves them from there.
   If the browser can't keep files (no service worker, private mode), it skips this step and loads from the network. */

type Entry = { u: string; s: number };
type Manifest = { version: string; desktop: Entry[]; mobile: Entry[] };
type Phase = { k: "checking" } | { k: "ask"; missing: Entry[]; bytes: number; update: boolean }
  | { k: "downloading"; done: number; total: number } | { k: "failed"; missing: Entry[]; bytes: number } | { k: "ready" };

const mb = (b: number) => (b / 1e6 < 10 ? (b / 1e6).toFixed(1) : Math.round(b / 1e6).toString()) + " MB";
const DONE_KEY = "ll-3d-ready";

async function prepare(): Promise<{ manifest: Manifest; cache: Cache } | null> {
  if (!("serviceWorker" in navigator) || !("caches" in window)) return null;
  try {
    const manifest: Manifest = await fetch("/visualizer-assets.json", { cache: "no-store" }).then((r) => r.json());
    await navigator.serviceWorker.register(`/sw.js?v=${manifest.version}`, { scope: "/" });
    const cache = await caches.open("ll-3d-" + manifest.version);
    return { manifest, cache };
  } catch { return null; }
}

async function missingFrom(cache: Cache, list: Entry[]) {
  const have = new Set((await cache.keys()).map((r) => new URL(r.url).pathname));
  return list.filter((e) => !have.has(e.u));
}

export default function VisualizerGate({ children }: { children: ReactNode }) {
  const [phase, setPhase] = useState<Phase>({ k: "checking" });
  const ctx = useRef<{ manifest: Manifest; cache: Cache } | null>(null);

  useEffect(() => {
    let live = true;
    (async () => {
      const c = await prepare();
      if (!live) return;
      if (!c) { setPhase({ k: "ready" }); return; }
      ctx.current = c;
      const missing = await missingFrom(c.cache, LITE ? c.manifest.mobile : c.manifest.desktop);
      if (!live) return;
      // "updated" only when an earlier download was of a different version of the 3D files
      let prev: string | null = null; try { prev = localStorage.getItem(DONE_KEY); } catch {}
      const update = !!prev && prev !== c.manifest.version;
      setPhase(missing.length === 0 ? { k: "ready" } : { k: "ask", missing, bytes: missing.reduce((a, e) => a + e.s, 0), update });
    })();
    return () => { live = false; };
  }, []);

  const download = useCallback(async (missing: Entry[]) => {
    const c = ctx.current; if (!c) return;
    const total = missing.reduce((a, e) => a + e.s, 0);
    let done = 0, shown = 0;
    setPhase({ k: "downloading", done: 0, total });
    // ask the browser to keep these files instead of clearing them under storage pressure
    navigator.storage?.persist?.().catch(() => {});
    const queue = [...missing];
    const failed: Entry[] = [];
    const worker = async () => {
      for (let e = queue.shift(); e; e = queue.shift()) {
        try {
          const res = await fetch(e.u, { cache: "no-cache" });
          if (!res.ok || !res.body) throw new Error(String(res.status));
          // count bytes as they arrive (on a copy of the stream) while the original goes into the cache
          const reader = res.clone().body!.getReader();
          const put = c.cache.put(e.u, res);
          for (let r = await reader.read(); !r.done; r = await reader.read()) {
            done += r.value.byteLength;
            const now = performance.now();
            if (now - shown > 120) { shown = now; setPhase({ k: "downloading", done, total }); } // a few updates a second
          }
          await put;
        } catch { failed.push(e); }
      }
    };
    await Promise.all([worker(), worker(), worker(), worker()]);
    if (failed.length) { setPhase({ k: "failed", missing: failed, bytes: failed.reduce((a, e) => a + e.s, 0) }); return; }
    try { localStorage.setItem(DONE_KEY, c.manifest.version); } catch {}
    setPhase({ k: "ready" });
  }, []);

  if (phase.k === "ready") return <>{children}</>;

  const pct = phase.k === "downloading" ? Math.min(100, Math.round((phase.done / Math.max(1, phase.total)) * 100)) : 0;
  return (
    <section aria-label="3D visualizer download" className="relative h-svh w-full overflow-hidden bg-[#1c1916]">
      {/* still WPC slat wall: the visualizer's theme, no animation competing with the download */}
      <div aria-hidden className="absolute inset-0 flex gap-[0.6%] px-[0.6%] opacity-90">
        {Array.from({ length: 24 }, (_, i) => (
          <span key={i} className="h-full flex-1" style={{ background: ["linear-gradient(90deg,#8a5a37,#b07a4e 45%,#7a4c2d)", "linear-gradient(90deg,#b88a5c,#d6aa77 45%,#a87a4d)", "linear-gradient(90deg,#2b2724,#3d3733 45%,#24201d)"][[0, 1, 0, 1, 1, 0, 2, 0][i % 8]] }} />
        ))}
      </div>
      <div aria-hidden className="absolute inset-0 bg-[radial-gradient(ellipse_at_50%_45%,rgb(26_20_16/0.15)_0%,rgb(26_20_16/0.7)_100%)]" />

      <div className="absolute left-1/2 top-1/2 w-[min(440px,calc(100%-32px))] -translate-x-1/2 -translate-y-1/2 rounded-3xl bg-paper px-6 py-7 text-center shadow-[0_30px_80px_-30px_rgb(0_0_0/0.7)] sm:px-8">
        <p className="font-mono text-[11px] text-clay">Lath &amp; Line · 3D visualizer</p>
        <h1 className="mt-2 text-[28px] font-light leading-[1.05] tracking-[-0.03em] text-ink">Try every panel on a real wall</h1>

        {phase.k === "checking" && <p className="mt-4 text-[14px] text-ink-2">Getting the showroom ready…</p>}

        {(phase.k === "ask" || phase.k === "failed") && (
          <>
            <p className="mt-3 text-[15px] leading-relaxed text-ink-2">
              {phase.k === "failed" ? "Some files didn't arrive. Check your connection and try again; what already downloaded is kept."
                : phase.update ? "The showroom has been updated. Download the new files once and it opens instantly again."
                : "The photoreal 3D room downloads once and stays on this device, so every visit after this opens instantly."}
            </p>
            <button onClick={() => download(phase.missing)} className="mt-5 inline-flex h-[52px] w-full items-center justify-center gap-2 rounded-2xl bg-ink text-[15px] font-medium text-paper transition hover:bg-black cursor-pointer">
              {phase.k === "failed" ? <RotateCw className="size-4" /> : <Download className="size-4" />}
              {phase.k === "failed" ? "Try again" : "Download and open"} · {mb(phase.bytes)}
            </button>
            <p className="mt-3 font-mono text-[11px] text-muted">{LITE ? "Phone version: lighter files, same room." : "Full 4K quality version for this computer."} One time only.</p>
          </>
        )}

        {phase.k === "downloading" && (
          <>
            <p className="mt-3 text-[15px] text-ink-2">Downloading the showroom. Keep this page open.</p>
            <div className="mt-5 h-[6px] overflow-hidden rounded-full bg-ink/10" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Download progress">
              <span className="block h-full origin-left rounded-full bg-clay transition-transform duration-300 ease-out" style={{ transform: `scaleX(${Math.max(0.02, pct / 100)})` }} />
            </div>
            <p className="mt-2 flex justify-between font-mono text-[11px] text-muted"><span>{mb(phase.done)} of {mb(phase.total)}</span><span>{pct}%</span></p>
          </>
        )}

        <a href="https://lath-and-line-studio.vercel.app" target="_blank" rel="noopener noreferrer" className="mt-5 inline-flex items-center gap-1.5 text-[13px] text-ink-2 hover:text-ink">
          <ArrowLeft className="size-3.5" /> Visit Main Shop
        </a>
      </div>
    </section>
  );
}
