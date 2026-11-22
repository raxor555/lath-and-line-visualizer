export type FinishKind = "fluted" | "slat" | "marble" | "adhesive" | "jaali";

export type Finish = {
  id: string;
  collection: string;
  name: string;
  kind: FinishKind;
  /** width of one panel / sheet / roll in metres; the visualizer snaps to this */
  module: number;
  unit: "panel" | "sheet" | "roll";
  size: string;
  price: number;
  color?: number;
  tex?: string;
  texRotation?: number;
  tint?: number;
  /** jaali only: colour of the backlit wall seen through the cut-outs */
  glow?: number;
  /** CSS background for the swatch chip */
  swatch: string;
};

/** CSS for the jaali swatch chip in the finish strip (same star lattice, as an SVG). */
function jaaliSwatch(wood: string, glow: string) {
  const ri = 50 * Math.cos(Math.PI / 4) / Math.cos(Math.PI / 8);
  const pts = (ro: number, r2: number, rot: number) => Array.from({ length: 16 }, (_, i) => { const r = i % 2 ? r2 : ro, a = rot + (i * Math.PI) / 8; return `${(50 + Math.cos(a) * r).toFixed(1)},${(50 + Math.sin(a) * r).toFixed(1)}`; }).join(" ");
  const tile = `<g fill='none' stroke='${wood}' stroke-linejoin='miter'><polygon points='${pts(50, ri, 0)}' stroke-width='4'/><polygon points='${pts(24, 18.5, Math.PI / 8)}' stroke-width='2.4'/><path d='M85 85L100 100M15 85L0 100M85 15L100 0M15 15L0 0' stroke-width='3'/></g>`;
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 400 240'><defs><pattern id='j' width='100' height='100' patternUnits='userSpaceOnUse'>${tile}</pattern></defs><rect width='400' height='240' fill='${glow}'/><rect width='400' height='240' fill='url(#j)'/></svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}") center/cover`;
}

export const WALL_HEIGHT = 2.9;

export const FINISHES: Finish[] = [
  { id: "fluted-chalk", collection: "PVC Fluted Panel", name: "Chalk White", kind: "fluted", color: 0xf6f3ed, module: 0.16, unit: "panel", size: "160 × 2900 mm", price: 1450, swatch: "repeating-linear-gradient(90deg,#f5f2ec 0 5px,#d6d0c6 8px,#f5f2ec 11px)" },
  { id: "fluted-charcoal", collection: "PVC Fluted Panel", name: "Charcoal", kind: "fluted", color: 0x2e2f2e, module: 0.16, unit: "panel", size: "160 × 2900 mm", price: 1550, swatch: "repeating-linear-gradient(90deg,#4b4c4b 0 5px,#1f201f 8px,#4b4c4b 11px)" },
  { id: "fluted-sand", collection: "PVC Fluted Panel", name: "Sand", kind: "fluted", color: 0xc8b59e, module: 0.16, unit: "panel", size: "160 × 2900 mm", price: 1450, swatch: "repeating-linear-gradient(90deg,#d8c5ac 0 5px,#a68f77 8px,#d8c5ac 11px)" },
  { id: "slat-oak", collection: "WPC Acoustic Slat", name: "Natural Oak", kind: "slat", tex: "oak_veneer_01", module: 0.6, unit: "panel", size: "600 × 3000 mm", price: 6900, swatch: "repeating-linear-gradient(90deg,transparent 0 9px,#1d1b19 9px 13px),url(/textures/oak_veneer_01/diff.jpg) center/180%" },
  { id: "slat-walnut", collection: "WPC Acoustic Slat", name: "Smoked Walnut", kind: "slat", tex: "walnut_veneer", texRotation: 0, tint: 0xa8846c, module: 0.6, unit: "panel", size: "600 × 3000 mm", price: 7400, swatch: "repeating-linear-gradient(90deg,transparent 0 9px,#1d1b19 9px 13px),url(/textures/walnut_veneer/diff.jpg) center/180%" },
  { id: "marble-statuario", collection: "UV Marble Sheet", name: "Statuario", kind: "marble", tex: "marble_statuario", module: 1.22, unit: "sheet", size: "1220 × 2440 mm (4 × 8 ft)", price: 5800, swatch: "url(/textures/marble_statuario/diff.jpg) center/cover" },
  { id: "marble-nero", collection: "UV Marble Sheet", name: "Nero Marquina", kind: "marble", tex: "marble_nero", module: 1.22, unit: "sheet", size: "1220 × 2440 mm (4 × 8 ft)", price: 6200, swatch: "url(/textures/marble_nero/diff.jpg) center/cover" },
  { id: "jaali-shalimar", collection: "CNC Jaali Panel", name: "Shalimar Walnut", kind: "jaali", tex: "walnut_veneer", tint: 0x907058, glow: 0xffd9a8, module: 1.22, unit: "sheet", size: "1220 × 2440 mm · 12 mm MDF", price: 14500, swatch: jaaliSwatch("#5b3d2b", "#f3cf9c") },
  { id: "jaali-ivory", collection: "CNC Jaali Panel", name: "Mughal Ivory", kind: "jaali", color: 0xefe8dc, glow: 0xe9c79a, module: 1.22, unit: "sheet", size: "1220 × 2440 mm · 12 mm MDF", price: 12900, swatch: jaaliSwatch("#f4eee4", "#b98a5c") },
  { id: "adh-terrazzo", collection: "Adhesive Sheet", name: "Terrazzo", kind: "adhesive", tex: "terrazzo", module: 0.6, unit: "roll", size: "0.6 × 3 m roll", price: 950, swatch: "url(/textures/terrazzo/diff.jpg) center/160%" },
  { id: "adh-sage", collection: "Adhesive Sheet", name: "Sage Linen", kind: "adhesive", color: 0x98a38a, module: 0.6, unit: "roll", size: "0.6 × 3 m roll", price: 850, swatch: "linear-gradient(135deg,#a3ae95,#8b977e)" },
];

export const finishById = (id: string | null) => FINISHES.find((f) => f.id === id) ?? null;
export const supportsDirection = (f: Finish | null) => !!f && (f.kind === "fluted" || f.kind === "slat");

export type WallId = "feature" | "side";
export type WallConfig = {
  pid: string | null;
  width: number;
  center: number;
  dir: "v" | "h";
  combo?: boolean;
  wingsPid?: string | null;
  wingsWidth?: number;
};

export const WALLS: Record<WallId, { label: string; length: number }> = {
  feature: { label: "Feature wall", length: 15.5 },
  side: { label: "Side wall", length: 9.5 },
};

function calcQty(f: Finish, w: number, dir: "v" | "h") {
  const horiz = dir === "h" && supportsDirection(f);
  if (f.kind === "fluted") return horiz ? Math.ceil(WALL_HEIGHT / 0.16) * Math.ceil(w / 2.9) : Math.max(1, Math.round(w / 0.16));
  if (f.kind === "slat") return horiz ? Math.ceil(WALL_HEIGHT / 0.6) * Math.ceil(w / 3) : Math.max(1, Math.round(w / 0.6));
  if (f.kind === "marble" || f.kind === "jaali") return Math.max(2, Math.round(w / 1.22) * 2);
  return Math.max(1, Math.round(w / 0.6));
}

export function estimate(cfg: WallConfig) {
  const f = finishById(cfg.pid);
  if (!f) return null;
  
  const centerQty = calcQty(f, cfg.width, cfg.dir);
  const centerTotal = centerQty * f.price;

  let wingsEstimate = null;
  if (cfg.combo && cfg.wingsPid) {
    const wf = finishById(cfg.wingsPid);
    if (wf) {
      const ww = (cfg.wingsWidth ?? 0.6) * 2; // both left & right wings combined
      const wingsQty = calcQty(wf, ww, "v");
      wingsEstimate = {
        finish: wf,
        widthPerSide: cfg.wingsWidth ?? 0.6,
        qty: wingsQty,
        total: wingsQty * wf.price,
      };
    }
  }

  const grandTotal = centerTotal + (wingsEstimate ? wingsEstimate.total : 0);

  return {
    finish: f,
    area: cfg.width * WALL_HEIGHT,
    qty: centerQty,
    centerTotal,
    wings: wingsEstimate,
    total: grandTotal,
  };
}

export const money = (n: number) => "Rs " + Math.round(n).toLocaleString("en-US");
