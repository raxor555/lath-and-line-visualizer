import * as THREE from "three";
import { LITE } from "@/lib/device";

/** Phones and small tablets: load the half-size `_m` copies of every texture, lightmap and the furniture model.
 *  Full-size assets need ~740 MB of GPU memory, past the point where mobile browsers kill the tab. */
export { LITE };
export const lite = (path: string) => (LITE ? path.replace(/\.(jpg|webp|glb)$/, "_m.$1") : path);

const loader = new THREE.TextureLoader();
const cache = new Map<string, THREE.Texture>();
let aniso = 16;
export const setAnisotropy = (n: number) => { aniso = Math.min(16, n); };
export const getAnisotropy = () => aniso;
let onLoad: (t: THREE.Texture) => void = () => {};
export const setOnTextureLoad = (fn: (t: THREE.Texture) => void) => { onLoad = fn; };

export function tex(path: string, { srgb = false, rot = 0 }: { srgb?: boolean; rot?: number } = {}) {
  const key = `${path}|${srgb}|${rot}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const t = loader.load(lite(`/textures/${path}`), (l) => onLoad(l));
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = aniso;
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.magFilter = THREE.LinearFilter;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  if (rot) { t.center.set(0.5, 0.5); t.rotation = rot; }
  cache.set(key, t);
  return t;
}

export function pbr(
  id: string,
  opts: THREE.MeshStandardMaterialParameters = {},
  { normal = true, rough = true, ns = 1, rot = 0 }: { normal?: boolean; rough?: boolean; ns?: number; rot?: number } = {},
) {
  const m = new THREE.MeshStandardMaterial({ map: tex(`${id}/diff.jpg`, { srgb: true, rot }), ...opts });
  if (normal) { m.normalMap = tex(`${id}/nor.jpg`, { rot }); m.normalScale.set(ns, ns); }
  if (rough) m.roughnessMap = tex(`${id}/rough.jpg`, { rot });
  return m;
}

const rgb = <T extends THREE.MeshStandardMaterial>(m: T, r: number, g: number, b: number) => { m.color.setRGB(r, g, b); return m; };

let M: ReturnType<typeof createMaterials> | null = null;
export const materials = () => (M ??= createMaterials());

/* Only what the live (non-baked) parts still need: panel trims, slat felt and marble backing, the door handle.
   Everything else comes baked from Blender (see baked.ts); creating more here would download unused textures. */
function createMaterials() {
  return {
    black: new THREE.MeshStandardMaterial({ color: 0x141413, roughness: 0.35, metalness: 0.7 }),
    felt: new THREE.MeshStandardMaterial({ color: 0x2c2a28, roughness: 0.95, envMapIntensity: 0.25 }),
    backing: new THREE.MeshStandardMaterial({ color: 0x22201e, roughness: 0.8 }),
  };
}

/* ---------- geometry helpers ---------- */
export function scaleBoxUV(g: THREE.BoxGeometry, w: number, h: number, d: number, tile: number) {
  const uv = g.attributes.uv as THREE.BufferAttribute;
  const dims = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
  for (let f = 0; f < 6; f++) for (let i = 0; i < 4; i++) { const k = f * 4 + i; uv.setXY(k, (uv.getX(k) * dims[f][0]) / tile, (uv.getY(k) * dims[f][1]) / tile); }
  uv.needsUpdate = true;
  return g;
}

type BoxOpts = { tile?: number; cast?: boolean; receive?: boolean };
export function box(parent: THREE.Object3D, w: number, h: number, d: number, mat: THREE.Material, x: number, y: number, z: number, { tile = 2, cast = true, receive = true }: BoxOpts = {}) {
  const m = new THREE.Mesh(scaleBoxUV(new THREE.BoxGeometry(w, h, d), w, h, d, tile), mat);
  m.position.set(x, y, z); m.castShadow = cast; m.receiveShadow = receive; parent.add(m); return m;
}
export const boxB = (parent: THREE.Object3D, x0: number, x1: number, y0: number, y1: number, z0: number, z1: number, mat: THREE.Material, o?: BoxOpts) =>
  box(parent, x1 - x0, y1 - y0, z1 - z0, mat, (x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2, o);

export function plane(parent: THREE.Object3D, w: number, h: number, mat: THREE.Material, tile = 2) {
  const g = new THREE.PlaneGeometry(w, h); const uv = g.attributes.uv as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, (uv.getX(i) * w) / tile, (uv.getY(i) * h) / tile);
  const m = new THREE.Mesh(g, mat); m.receiveShadow = true; parent.add(m); return m;
}
