"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useEffect, useRef } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useGSAP } from "@gsap/react";
import { useLenis } from "lenis/react";
import { ArrowDown, ArrowUpRight } from "lucide-react";
import { tour, useTour } from "@/lib/tour-store";
import { designScrollY } from "../SmoothScroll";
import { FINISHES } from "@/lib/finishes";

const FINISH_IDS = new Set(FINISHES.map((f) => f.id));
import DesignPanel from "./DesignPanel";
import HouseLoader from "./HouseLoader";
import SceneGuard from "./SceneGuard";

gsap.registerPlugin(ScrollTrigger, useGSAP);

const Scene = dynamic(() => import("../three/Scene"), { ssr: false });

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
const smooth = (a: number, b: number, v: number) => { const t = clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const CHAPTERS = ["Arrive", "Open", "Enter", "Design"];

export default function Tour({ startInDesign = false }: { startInDesign?: boolean }) {
  const section = useRef<HTMLElement>(null);
  const frame = useRef<HTMLDivElement>(null);
  const hero = useRef<HTMLDivElement>(null);
  const chOpen = useRef<HTMLDivElement>(null);
  const chEnter = useRef<HTMLDivElement>(null);
  const rail = useRef<HTMLDivElement>(null);
  const bar = useRef<HTMLSpanElement>(null);
  const chapters = useRef<(HTMLLIElement | null)[]>([]);
  const lenis = useLenis();

  useGSAP(() => {
    if (startInDesign) {
      tour.target = 1;
      tour.current = 1;
      tour.invalidate();
      useTour.getState().setDesignOn(true);
      return;
    }
    ScrollTrigger.create({
      trigger: section.current, start: "top top", end: () => "+=" + innerHeight * 5, invalidateOnRefresh: true,
      onUpdate: (s) => { tour.target = s.progress; tour.invalidate(); },
      onRefresh: (s) => { tour.target = s.progress; tour.invalidate(); },
    });
  }, { scope: section, dependencies: [startInDesign] });

  useEffect(() => {
    if (startInDesign) {
      tour.target = 1;
      tour.current = 1;
      tour.invalidate();
      useTour.getState().setDesignOn(true);
      return;
    }
    const show = (el: HTMLElement | null, o: number, y = 0) => { if (!el) return; el.style.opacity = String(o); el.style.visibility = o < 0.01 ? "hidden" : "visible"; el.style.transform = `translate3d(0,${y}px,0)`; };
    const fn = (p: number) => {
      const e = smooth(0, 0.07, p);
      if (frame.current) frame.current.style.clipPath = `inset(${(1 - e) * 12}px round ${(1 - e) * 28}px)`;
      const h = 1 - smooth(0.03, 0.12, p);
      show(hero.current, h, (1 - h) * -36);
      show(chOpen.current, smooth(0.19, 0.24, p) * (1 - smooth(0.36, 0.41, p)), (1 - smooth(0.19, 0.24, p)) * 18);
      show(chEnter.current, smooth(0.49, 0.54, p) * (1 - smooth(0.68, 0.74, p)), (1 - smooth(0.49, 0.54, p)) * 18);
      show(rail.current, smooth(0.1, 0.16, p));
      if (bar.current) bar.current.style.transform = `scaleX(${p})`;
      const idx = p < 0.19 ? 0 : p < 0.47 ? 1 : p < 0.8 ? 2 : 3;
      chapters.current.forEach((li, i) => li?.setAttribute("data-on", String(i === idx)));
      const on = p > 0.88, st = useTour.getState();
      if (on !== st.designOn) st.setDesignOn(on);
    };
    tour.listeners.add(fn); fn(tour.current);

    return () => { tour.listeners.delete(fn); };
  }, [startInDesign]);

  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("finish");
    if (!id || !FINISH_IDS.has(id)) return;
    const s = useTour.getState(); s.setActive("feature"); s.setFinish("feature", id);
    if (!startInDesign) {
      const t = setTimeout(() => { if (lenis) lenis.scrollTo(designScrollY(), { duration: 2.2 }); else window.scrollTo({ top: designScrollY() }); }, 900);
      return () => clearTimeout(t);
    }
  }, [lenis, startInDesign]);

  const skip = (e: React.MouseEvent) => {
    e.preventDefault();
    if (lenis) lenis.scrollTo(designScrollY(), { duration: 2.6 });
    else window.scrollTo({ top: designScrollY() });
  };

  return (
    <section ref={section} id="tour" aria-label="Walk into the house" className={startInDesign ? "relative h-svh w-full overflow-hidden [--dp-top:64px]" : "relative h-[720svh]"}>
      <div className={startInDesign ? "h-full w-full" : "sticky top-0 h-svh"}>
        <div ref={frame} className="absolute inset-0 overflow-hidden bg-sand" style={{ clipPath: startInDesign ? "none" : "inset(12px round 28px)" }}>
          <SceneGuard><Scene /></SceneGuard>
          {/* skeleton: the house draws itself while the 3D loads; the headline stays readable on top */}
          <HouseLoader />
          {/* vignette as a static CSS layer: free for the compositor, unlike a full-screen GPU pass */}
          <div aria-hidden className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_52%,rgb(0_0_0/0.34)_100%)]" />

          {/* hero: only shown in full home tour */}
          {!startInDesign && (
            <div ref={hero} className="pointer-events-none absolute inset-0">
              <div className="absolute inset-x-0 bottom-0 h-[55%] bg-gradient-to-t from-[#120d0a]/60 via-[#120d0a]/20 to-transparent" />
              <div className="pointer-events-auto absolute inset-x-0 bottom-0 mx-auto flex max-w-[1400px] flex-col gap-8 px-6 pb-[calc(env(safe-area-inset-bottom)+40px)] text-white sm:px-10 lg:flex-row lg:items-end lg:justify-between lg:pb-14">
                <div className="max-w-[760px]">
                  <p className="font-mono text-[12px] text-white/75">Wall panels · Karachi · Delivery all over Pakistan</p>
                  <h1 className="mt-4 text-[clamp(2.8rem,5.4vw,5.8rem)] font-light leading-[0.95] tracking-[-0.05em] [text-wrap:balance]">Walls, finished in a day.</h1>
                  <p className="mt-5 max-w-[32rem] text-[17px] leading-relaxed text-white/80">PVC and WPC panels, UV marble sheets and jaali, fitted over the wall you already have. Scroll to walk in and try them.</p>
                </div>
                <div className="flex flex-wrap gap-3">
                  <Link href="/shop" className="inline-flex h-[52px] items-center gap-2 rounded-2xl bg-white pl-5 pr-4 text-[15px] font-medium text-ink transition hover:bg-paper">
                    Shop all products <ArrowUpRight className="size-4" />
                  </Link>
                  <a href="#visualizer" onClick={skip} className="inline-flex h-[52px] items-center gap-2 rounded-2xl border border-white/60 px-5 text-[15px] font-medium text-white transition hover:bg-white/15">
                    Try it on a wall <ArrowDown className="size-4" />
                  </a>
                </div>
              </div>
            </div>
          )}

          {/* chapter captions */}
          {!startInDesign && (
            <>
              <div ref={chOpen} className="glass pointer-events-none invisible absolute right-6 top-1/2 w-[min(380px,calc(100%-48px))] -translate-y-1/2 rounded-3xl p-6 opacity-0 max-sm:bottom-24 max-sm:top-auto">
                <p className="font-mono text-[12px] text-clay">02 Open</p>
                <h2 className="mt-2 text-[30px] font-light leading-[1.05] tracking-[-0.03em]">Fitted over the wall you already have.</h2>
                <p className="mt-3 text-[15px] text-ink-2">No demolition, no plaster, no drying time. Most rooms are finished the same day they start.</p>
              </div>
              <div ref={chEnter} className="glass pointer-events-none invisible absolute right-6 top-1/2 w-[min(380px,calc(100%-48px))] -translate-y-1/2 rounded-3xl p-6 opacity-0 max-sm:bottom-24 max-sm:top-auto">
                <p className="font-mono text-[12px] text-clay">03 Enter</p>
                <h2 className="mt-2 text-[30px] font-light leading-[1.05] tracking-[-0.03em]">Every finish at true scale.</h2>
                <p className="mt-3 text-[15px] text-ink-2">26 mm flutes, 600 mm slat boards, 4 × 8 ft sheets, and our Mughal-pattern jaali on the side wall. What you see here is what gets fitted.</p>
              </div>
            </>
          )}

          <DesignPanel />

          {/* chapter rail */}
          {!startInDesign && (
            <div ref={rail} className="pointer-events-none invisible absolute inset-x-0 bottom-0 px-6 pb-[calc(env(safe-area-inset-bottom)+16px)] opacity-0 sm:px-10">
              <div className="mx-auto max-w-[1400px]">
                <div className="flex items-end justify-between">
                  <ol className="flex gap-5">
                    {CHAPTERS.map((c, i) => (
                      <li key={c} ref={(el) => { chapters.current[i] = el; }} data-on={i === 0} className="font-mono text-[12px] text-white/55 transition-colors data-[on=true]:text-white [text-shadow:0_1px_8px_rgb(0_0_0/0.4)]">
                        0{i + 1} {c}
                      </li>
                    ))}
                  </ol>
                  <span className="hidden font-mono text-[12px] text-white/60 [text-shadow:0_1px_8px_rgb(0_0_0/0.4)] sm:block">Rendered live in your browser</span>
                </div>
                <div className="mt-3 h-px bg-white/25"><span ref={bar} className="block h-full origin-left scale-x-0 bg-clay" /></div>
              </div>
            </div>
          )}
        </div>
      </div>
      {!startInDesign && <div id="visualizer" className="absolute left-0 h-px w-px" style={{ top: "500svh" }} aria-hidden />}
    </section>
  );
}
