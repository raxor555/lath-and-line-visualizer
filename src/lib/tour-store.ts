import { create } from "zustand";
import { WALLS, finishById, type WallConfig, type WallId } from "./finishes";

export type LightGroup = "day" | "spots" | "lamps";

type TourState = {
  active: WallId;
  /** light switches: daylight (sun + sky), the wall-washer spots, the floor lamp + pendant */
  lights: Record<LightGroup, boolean>;
  toggleLight: (g: LightGroup) => void;
  walls: Record<WallId, WallConfig>;
  designOn: boolean;
  roomOverview: boolean;
  toggleRoomOverview: () => void;
  /** the 3D scene has compiled and drawn its first frame; until then the hero shows the rendered poster */
  ready: boolean;
  setReady: () => void;
  setActive: (id: WallId) => void;
  setDesignOn: (on: boolean) => void;
  update: (id: WallId, patch: Partial<WallConfig>) => void;
  setFinish: (id: WallId, pid: string | null) => void;
};

function clampCfg(id: WallId, c: WallConfig): WallConfig {
  const f = finishById(c.pid);
  if (!f) return c;
  const len = WALLS[id].length;
  const wingsW = c.combo && c.wingsPid ? (c.wingsWidth ?? 0.6) * 2 : 0;
  const max = Math.max(f.module, Math.floor((len - 0.02 - wingsW) / f.module) * f.module);
  const width = Math.min(max, Math.max(f.module, Math.round(c.width / f.module) * f.module));
  const totalW = width + wingsW;
  const lim = Math.max(0, (len - totalW) / 2);
  return {
    ...c,
    width,
    center: Math.min(lim, Math.max(-lim, c.center)),
    dir: f.kind === "fluted" || f.kind === "slat" ? c.dir : "v",
  };
}

export const useTour = create<TourState>((set) => ({
  active: "feature",
  designOn: false,
  roomOverview: false,
  toggleRoomOverview: () => set((s) => ({ roomOverview: !s.roomOverview })),
  ready: false,
  setReady: () => set({ ready: true }),
  lights: { day: true, spots: true, lamps: true },
  toggleLight: (g) => set((s) => ({ lights: { ...s.lights, [g]: !s.lights[g] } })),
  walls: {
    feature: { pid: "slat-oak", width: 3.6, center: 0, dir: "v" },
    side: { pid: "jaali-shalimar", width: 3.66, center: 0, dir: "v" },
  },
  setActive: (active) => set({ active }),
  setDesignOn: (designOn) => set({ designOn }),
  update: (id, patch) => set((s) => ({ walls: { ...s.walls, [id]: clampCfg(id, { ...s.walls[id], ...patch }) } })),
  setFinish: (id, pid) => set((s) => ({ walls: { ...s.walls, [id]: clampCfg(id, { ...s.walls[id], pid }) } })),
}));

/** Per-frame values that must not trigger React renders. */
export const tour = {
  target: 0,
  current: 0,
  invalidate: () => {},
  listeners: new Set<(p: number) => void>(),
  /** drop a finish at a screen point; set by the 3D scene, returns false when the point misses both walls */
  drop: (_x: number, _y: number, _pid: string) => false as boolean,
};
