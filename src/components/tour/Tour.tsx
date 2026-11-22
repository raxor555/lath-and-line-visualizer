"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";
import gsap from "gsap";
import { ArrowRight, Sparkles } from "lucide-react";
import { tour, useTour } from "@/lib/tour-store";
import { FINISHES } from "@/lib/finishes";
import DesignPanel from "./DesignPanel";
import HouseLoader from "./HouseLoader";
import SceneGuard from "./SceneGuard";

const FINISH_IDS = new Set(FINISHES.map((f) => f.id));
const Scene = dynamic(() => import("../three/Scene"), { ssr: false });

export default function Tour() {
  const section = useRef<HTMLElement>(null);
  const [p, setP] = useState(0);

  useEffect(() => {
    // Start at the house (0)
    tour.current = 0;
    tour.target = 0;
    tour.invalidate();
    useTour.getState().setDesignOn(false);

    const fn = (progress: number) => {
      setP(progress);
      const on = progress > 0.88;
      const st = useTour.getState();
      if (on !== st.designOn) st.setDesignOn(on);
    };

    tour.listeners.add(fn);
    fn(0);

    // If finish parameter is present in URL, automatically enter room and pick finish
    const id = new URLSearchParams(window.location.search).get("finish");
    if (id && FINISH_IDS.has(id)) {
      const s = useTour.getState();
      s.setActive("feature");
      s.setFinish("feature", id);
      const timer = setTimeout(() => enterRoom(), 800);
      return () => clearTimeout(timer);
    }

    return () => {
      tour.listeners.delete(fn);
    };
  }, []);

  const enterRoom = () => {
    gsap.killTweensOf(tour);
    gsap.to(tour, {
      target: 1,
      duration: 2.8,
      ease: "power2.inOut",
      onUpdate: () => tour.invalidate(),
    });
  };

  const stepOutside = () => {
    gsap.killTweensOf(tour);
    gsap.to(tour, {
      target: 0,
      duration: 2.5,
      ease: "power2.inOut",
      onUpdate: () => tour.invalidate(),
    });
  };

  return (
    <section ref={section} id="tour" aria-label="3D Interior Studio" className="relative h-svh w-full overflow-hidden select-none">
      <div className="h-full w-full">
        <div className="absolute inset-0 overflow-hidden bg-[#181412]">
          <SceneGuard>
            <Scene />
          </SceneGuard>

          {/* Skeleton house loader while WebGL compiles */}
          <HouseLoader />

          {/* Vignette overlay */}
          <div aria-hidden className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_52%,rgb(0_0_0/0.38)_100%)]" />

          {/* Outdoor Welcome CTA when standing at the house */}
          <div
            className={`absolute inset-x-0 bottom-8 sm:bottom-12 z-30 flex flex-col items-center gap-3 transition-all duration-700 pointer-events-none ${
              p < 0.25 ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8 pointer-events-none"
            }`}
          >
            <div className="flex flex-col items-center text-center px-4">
              <span className="font-mono text-[10.5px] uppercase tracking-widest text-[#e06d3b] bg-[#181412]/80 px-3 py-1 rounded-full border border-white/10 backdrop-blur-md shadow-md">
                3D Interactive Showroom
              </span>
              <h1 className="mt-2 text-[clamp(1.6rem,3.2vw,2.4rem)] font-light text-white tracking-tight drop-shadow-lg">
                Walls, finished in a day.
              </h1>
            </div>

            <button
              onClick={enterRoom}
              className="pointer-events-auto flex items-center gap-2.5 rounded-full bg-white px-7 py-3 text-[14px] font-medium text-[#181412] shadow-2xl transition hover:bg-[#e3dbd1] hover:scale-105 active:scale-95 cursor-pointer border border-white/30"
            >
              <Sparkles className="size-4 text-[#e06d3b]" />
              <span>Enter Living Room</span>
              <ArrowRight className="size-4 text-[#e06d3b]" />
            </button>

            <span className="font-mono text-[11px] text-white/70 drop-shadow">
              Tap to walk in &amp; try panels in 3D
            </span>
          </div>

          {/* Inside Living Room: Minimalist, Sleek Design Dock & Drawer */}
          <DesignPanel onStepOutside={stepOutside} />
        </div>
      </div>
    </section>
  );
}
