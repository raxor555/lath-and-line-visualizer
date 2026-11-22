// Writes public/visualizer-assets.json: every file the 3D visualizer loads, for desktop and for phones, with sizes
// and a content version. The visualizer's one-time download reads it, and the service worker (public/sw.js) uses the
// version to drop an old cache when the 3D files change. Runs before every build (npm "prebuild").
import { createHash } from "node:crypto";
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const PUB = join(import.meta.dirname, "..", "public");
const walk = (dir) => readdirSync(join(PUB, dir), { withFileTypes: true }).flatMap((e) =>
  e.isDirectory() ? walk(`${dir}/${e.name}`) : [`${dir}/${e.name}`]);
const isLite = (p) => /_m\.(jpg|webp|glb)$/.test(p);
const liteOf = (p) => p.replace(/\.(jpg|webp|glb)$/, "_m.$1");

const PLANTS = ["olive_tree", "veg_shrubB", "veg_grassA", "veg_grassB", "veg_bushRound", "veg_palm"];
const common = ["draco/draco_decoder.wasm", "draco/draco_wasm_wrapper.js", "draco/draco_decoder.js",
  "lightmaps/lightmaps.json", "hdri/env_golden.hdr", "hdri/interior.hdr", "models/house.glb"];
// textures: everything the visualizer uses (including 4K walnut_veneer and marble normal/rough maps)
const textures = walk("textures").filter((p) => /\.(jpg|png|webp)$/.test(p));
const lightmaps = walk("lightmaps").filter((p) => p.endsWith(".webp"));

const desktop = [...common, "hdri/sky_golden.jpg", "models/furniture.glb",
  ...PLANTS.map((k) => `models/${k}.glb`),
  ...textures.filter((p) => !isLite(p)), ...lightmaps.filter((p) => !isLite(p))];
const exists = (p) => { try { statSync(join(PUB, p)); return true; } catch { return false; } };
// phones: the _m copy wherever one exists; no round bushes (see Scene.tsx KINDS)
const mobile = [...common, "hdri/sky_golden_m.jpg", liteOf("models/furniture.glb"),
  ...PLANTS.filter((k) => k !== "veg_bushRound").map((k) => (exists(liteOf(`models/${k}.glb`)) ? liteOf(`models/${k}.glb`) : `models/${k}.glb`)),
  ...textures.filter((p) => !isLite(p)).map((p) => (exists(liteOf(p)) ? liteOf(p) : p)),
  ...lightmaps.filter((p) => !isLite(p)).map((p) => (exists(liteOf(p)) ? liteOf(p) : p))];

const hash = createHash("sha1");
const entries = (list) => [...new Set(list)].map((p) => {
  const s = statSync(join(PUB, p)).size;
  hash.update(p + ":" + s + ":" + createHash("sha1").update(readFileSync(join(PUB, p))).digest("hex"));
  return { u: "/" + p, s };
});
const out = { desktop: entries(desktop), mobile: entries(mobile) };
out.version = hash.digest("hex").slice(0, 10);
writeFileSync(join(PUB, "visualizer-assets.json"), JSON.stringify(out));
const mb = (l) => (l.reduce((a, e) => a + e.s, 0) / 1e6).toFixed(1);
console.log(`visualizer-assets.json v${out.version}: desktop ${out.desktop.length} files ${mb(out.desktop)} MB, mobile ${out.mobile.length} files ${mb(out.mobile)} MB`);
