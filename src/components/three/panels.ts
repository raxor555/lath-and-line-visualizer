import * as THREE from "three";
import { WALL_HEIGHT as IH, finishById, supportsDirection, type Finish, type WallConfig } from "@/lib/finishes";
import { getAnisotropy, materials, pbr, scaleBoxUV, tex } from "./materials";
import { bakeWall } from "./baked";
import { jaaliAlpha } from "./patterns";

/* one star repeat every 450 mm; panel UVs are in 0.9 m units (the wood texture's scale), so the lattice repeats twice per unit */
let jaaliCut: THREE.Texture | null = null;
const jaaliTex = () => { if (!jaaliCut) { jaaliCut = jaaliAlpha(getAnisotropy()); jaaliCut.repeat.set(2, 2); } return jaaliCut; };

const matCache = new Map<string, THREE.Material>();
/* everything fitted on a wall takes its light from the wall's lightmap; shared materials get their own copy */
const onWall = new Map<string, THREE.Material>();
const wallCopy = (k: "felt" | "backing" | "black") => {
  let m = onWall.get(k);
  if (!m) { m = bakeWall((materials()[k] as THREE.MeshStandardMaterial).clone()); onWall.set(k, m); }
  return m;
};
function finishMaterial(f: Finish) {
  const hit = matCache.get(f.id);
  if (hit) return hit;
  let m: THREE.Material;
  if (f.kind === "fluted") {
    // Matte architectural PVC flute, authentic interior finish without harsh plastic glints
    m = new THREE.MeshStandardMaterial({
      color: f.color,
      roughness: 0.82,
      metalness: 0.04,
      envMapIntensity: 0.12,
    });
  } else if (f.kind === "slat") {
    // Real acoustic timber slat: warm, matte wood texture, zero shimmer on edges
    const s = pbr(f.tex!, { roughness: 0.88, metalness: 0.02, envMapIntensity: 0.12 }, { rot: f.texRotation ?? 0, ns: 0.35 });
    if (f.tint) s.color.set(f.tint);
    m = s;
  } else if (f.kind === "marble") {
    // Satin architectural UV marble: gentle diffused interior reflection, not a mirror
    m = new THREE.MeshPhysicalMaterial({
      map: tex(`${f.tex}/diff.jpg`, { srgb: true }),
      roughness: 0.36,
      clearcoat: 0.18,
      clearcoatRoughness: 0.35,
      envMapIntensity: 0.22,
      metalness: 0.04,
    });
  } else if (f.kind === "jaali") {
    m = new THREE.MeshStandardMaterial({
      color: f.tint ?? f.color ?? 0xffffff,
      roughness: 0.78,
      metalness: 0.04,
      envMapIntensity: 0.14,
      alphaMap: jaaliTex(),
      alphaTest: 0.5,
    });
    if (f.tex) (m as THREE.MeshStandardMaterial).map = tex(`${f.tex}/diff.jpg`, { srgb: true, rot: Math.PI / 2 });
  } else if (f.tex) {
    m = new THREE.MeshStandardMaterial({
      map: tex(`${f.tex}/diff.jpg`, { srgb: true }),
      roughness: 0.82,
      metalness: 0.03,
      envMapIntensity: 0.15,
    });
  } else {
    m = new THREE.MeshStandardMaterial({
      color: f.color,
      roughness: 0.95,
      metalness: 0.02,
      envMapIntensity: 0.12,
      normalMap: tex("wool_boucle/nor.jpg"),
      normalScale: new THREE.Vector2(0.2, 0.2),
    });
  }
  bakeWall(m as THREE.MeshStandardMaterial);
  matCache.set(f.id, m);
  return m;
}

/** Half-round flutes, 26 mm wide, 11 mm deep, with a panel seam every 6 flutes (160 mm). */
function fluted(across: number, along: number, mat: THREE.Material) {
  const fw = 0.026, depth = 0.011, seg = 10, perPanel = 6;
  const n = Math.max(1, Math.round(across / fw)), cols = n * seg;
  const xs: number[] = [], zs: number[] = [];
  for (let i = 0; i <= cols; i++) {
    const f = i / seg, fi = Math.floor(f), fr = f - fi, s = (fr - 0.5) * 2;
    let z = depth * Math.sqrt(Math.max(0, 1 - s * s * 0.94));
    if ((fi % perPanel === 0 && fr < 0.05) || i === cols) z = -0.0015;
    xs.push((i / cols) * across - across / 2); zs.push(z);
  }
  const pos: number[] = [], nor: number[] = [], uv: number[] = [], idx: number[] = [];
  const nv = new THREE.Vector3();
  for (let i = 0; i <= cols; i++) {
    const a = Math.max(0, i - 1), b = Math.min(cols, i + 1);
    nv.set(-(zs[b] - zs[a]) / (xs[b] - xs[a] || 1), 0, 1).normalize();
    pos.push(xs[i], 0, zs[i], xs[i], along, zs[i]);
    nor.push(nv.x, nv.y, nv.z, nv.x, nv.y, nv.z);
    uv.push(xs[i], 0, xs[i], along);
    if (i < cols) { const k = i * 2; idx.push(k, k + 2, k + 1, k + 1, k + 2, k + 3); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("normal", new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  const m = new THREE.Mesh(g, mat); m.castShadow = m.receiveShadow = true;
  return m;
}

/** 27 mm slats on a 40 mm pitch over black acoustic felt. */
function slats(across: number, along: number, mat: THREE.Material) {
  const g = new THREE.Group(), pitch = 0.04, sw = 0.027, d = 0.021, n = Math.floor(across / pitch), mt = new THREE.Matrix4();
  for (let k = 0; k < 4; k++) {
    const geo = scaleBoxUV(new THREE.BoxGeometry(sw, along, d), sw, along, d, 0.9);
    const uv = geo.attributes.uv as THREE.BufferAttribute;
    for (let i = 0; i < uv.count; i++) uv.setX(i, uv.getX(i) + k * 0.217 + 0.05);
    const ids: number[] = []; for (let i = k; i < n; i += 4) ids.push(i);
    const im = new THREE.InstancedMesh(geo, mat, ids.length);
    ids.forEach((i, j) => { mt.makeTranslation(-across / 2 + pitch * (i + 0.5), along / 2, d / 2 + 0.003); im.setMatrixAt(j, mt); });
    im.castShadow = im.receiveShadow = true; g.add(im);
  }
  const felt = new THREE.Mesh(new THREE.PlaneGeometry(across, along), wallCopy("felt"));
  felt.position.set(0, along / 2, 0.002); felt.receiveShadow = true; g.add(felt);
  return g;
}

/** 1220 × 2440 mm sheets, book-matched on alternate columns, with a cut sheet above. */
function marble(w: number, mat: THREE.Material) {
  const g = new THREE.Group(), sw = 1.22, sh = 2.44, gap = 0.0025;
  const back = new THREE.Mesh(new THREE.PlaneGeometry(w, IH), wallCopy("backing")); back.position.set(0, IH / 2, 0.001); g.add(back);
  const cols = Math.max(1, Math.round(w / sw));
  for (let c = 0; c < cols; c++) {
    ([[0, sh], [sh, IH]] as const).forEach(([y0, y1], r) => {
      const h = y1 - y0, geo = new THREE.BoxGeometry(sw - gap, h - gap, 0.005), uv = geo.attributes.uv as THREE.BufferAttribute;
      const flip = c % 2 === 1, v0 = r === 0 ? 0 : 0.12, v1 = r === 0 ? 1 : 0.12 + h / sh;
      for (let i = 16; i < 20; i++) { let u = uv.getX(i); if (flip) u = 1 - u; uv.setXY(i, u, v0 + uv.getY(i) * (v1 - v0)); }
      const m = new THREE.Mesh(geo, mat); m.position.set(-w / 2 + sw * (c + 0.5), (y0 + y1) / 2, 0.0035); m.receiveShadow = true; g.add(m);
    });
  }
  return g;
}

/** Jaali sheets 25 mm off a warm, softly lit backing. The lit backing behind the cut-outs carries the depth. */
const glowCache = new Map<number, THREE.Material>();
function jaali(w: number, f: Finish, mat: THREE.Material) {
  const g = new THREE.Group(), glow = f.glow ?? 0xffd9a8;
  let back = glowCache.get(glow);
  if (!back) { back = bakeWall(new THREE.MeshStandardMaterial({ color: glow, roughness: 0.9, emissive: glow, emissiveIntensity: 0.75, envMapIntensity: 0.2 })); glowCache.set(glow, back); }
  const b = new THREE.Mesh(new THREE.PlaneGeometry(w, IH), back); b.position.set(0, IH / 2, 0.002); b.receiveShadow = true; g.add(b);
  const geo = new THREE.PlaneGeometry(w, IH), uv = geo.attributes.uv as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, (uv.getX(i) * w) / 0.9, (uv.getY(i) * IH) / 0.9);
  // a single cut-out layer: alpha-tested surfaces defeat early depth rejection, so each extra layer costs a full re-shade
  const m = new THREE.Mesh(geo, mat); m.position.set(0, IH / 2, 0.025); m.castShadow = m.receiveShadow = true; g.add(m);
  return g;
}

function adhesive(w: number, mat: THREE.Material) {
  const g = new THREE.Group(), geo = new THREE.PlaneGeometry(w, IH), uv = geo.attributes.uv as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, (uv.getX(i) * w) / 0.9, (uv.getY(i) * IH) / 0.9);
  const m = new THREE.Mesh(geo, mat); m.position.set(0, IH / 2, 0.0015); m.receiveShadow = true; g.add(m);
  const seam = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.12 });
  for (let x = -w / 2 + 0.6; x < w / 2 - 0.01; x += 0.6) { const s = new THREE.Mesh(new THREE.PlaneGeometry(0.0015, IH), seam); s.position.set(x, IH / 2, 0.0018); g.add(s); }
  return g;
}

export function buildPanels(cfg: WallConfig) {
  const f = finishById(cfg.pid);
  if (!f) return null;
  const mat = finishMaterial(f), horiz = cfg.dir === "h" && supportsDirection(f);
  const outer = new THREE.Group(); outer.position.x = cfg.center;
  let inner: THREE.Object3D;
  if (f.kind === "fluted" || f.kind === "slat") {
    const across = horiz ? IH : cfg.width, along = horiz ? cfg.width : IH;
    inner = new THREE.Group();
    inner.add(f.kind === "fluted" ? fluted(across, along, mat) : slats(across, along, mat));
    // built vertically; rotating +90° about z maps x∈[-IH/2,IH/2], y∈[0,w] to x∈[-w,0], y∈[-IH/2,IH/2]
    if (horiz) { inner.rotation.z = Math.PI / 2; inner.position.set(cfg.width / 2, IH / 2, 0); }
  } else inner = f.kind === "marble" ? marble(cfg.width, mat) : f.kind === "jaali" ? jaali(cfg.width, f, mat) : adhesive(cfg.width, mat);
  outer.add(inner);
  for (const x of [-cfg.width / 2 - 0.006, cfg.width / 2 + 0.006]) {
    const t = new THREE.Mesh(new THREE.BoxGeometry(0.012, IH, 0.024), wallCopy("black"));
    t.position.set(x, IH / 2, 0.012); t.castShadow = true; outer.add(t);
  }
  return outer;
}

export function disposeTree(o: THREE.Object3D) { o.traverse((c) => { const m = c as THREE.Mesh; if (m.geometry) m.geometry.dispose(); }); }
