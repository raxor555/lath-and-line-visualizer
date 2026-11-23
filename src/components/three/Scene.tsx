"use client";

import * as THREE from "three";
import { Suspense, use, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { create } from "zustand";
import { Canvas, useFrame, useLoader, useThree, type RootState, type ThreeEvent } from "@react-three/fiber";
import { HDRLoader } from "three/examples/jsm/loaders/HDRLoader.js";
import { Environment, useGLTF, useTexture } from "@react-three/drei";
import { EffectComposer, Bloom, BrightnessContrast, ToneMapping } from "@react-three/postprocessing";
import { ToneMappingMode } from "postprocessing";
import { FINISHES, WALL_HEIGHT as IH, type WallId } from "@/lib/finishes";
import { tour, useTour } from "@/lib/tour-store";
/** front door opening, matching the Blender model */
const DOOR = { hingeX: -1.0, z: -0.12, width: 1.2, height: 2.62 };
import { buildPanels, disposeTree } from "./panels";
import { LITE, lite, materials, setAnisotropy, setOnTextureLoad } from "./materials";
import { GROUPS, LIGHTS, applyInteriorEnv, bakeUV1, bakeWall, houseMaterials, loadManifest, setLightmapReady } from "./baked";

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
const smooth = (a: number, b: number, v: number) => { const t = clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/* Golden-hour sky (Poly Haven dikhololo_sunset). Blender's world is rotated -60.8° about Z; three.js's equirect
   convention sits 180° from Blender's, so the same view needs -60.8° + 180° about Y. The live sun (for the plants
   and the door) matches the baked sun lamp: 9° up, from the front-left, warm. */
const SKY_ROT = new THREE.Euler(0, THREE.MathUtils.degToRad(-81.4), 0);
// the visible backdrop shows the panorama's warm, cloudy sunset side behind the house, as a photographer would frame it
const BACKDROP_ROT = new THREE.Euler(0, THREE.MathUtils.degToRad(-81.4 + 180), 0);
// 45° front-left, 14° up: rakes across the facade so the trees throw long shadows on it
const SUN_POS = new THREE.Vector3(-0.702 * Math.cos(0.244), Math.sin(0.244), 0.712 * Math.cos(0.244)).multiplyScalar(30);

/* Design view: standing back about 6.4 m, so the whole fitted wall, floor to ceiling, is in frame with the room around it. */
export const VIEWS: Record<WallId, { pos: [number, number, number]; look: [number, number, number] }> = {
  feature: { pos: [0, 1.5, -3.35], look: [0, 1.42, -9.75] },
  side: { pos: [-1.3, 1.5, -5.0], look: [-7.75, 1.42, -5.0] },
};
export const OVERVIEW_VIEWS: Record<WallId, { pos: [number, number, number]; look: [number, number, number] }> = {
  feature: { pos: [0, 1.42, -1.75], look: [0, 1.36, -9.75] },
  side: { pos: [1.6, 1.42, -5.0], look: [-7.75, 1.36, -5.2] },
};
const KP = [0, 0.2, 0.4, 0.6, 0.84];
const V = (a: number[]) => new THREE.Vector3(a[0], a[1], a[2]);
// the hero frames the house the way an architectural photographer would: close, at eye height, front-right
const posCurve = new THREE.CatmullRomCurve3([[8.6, 1.55, 16.5], [4.2, 1.85, 10.5], [-0.4, 1.66, 4.6], [-0.4, 1.58, -0.6], VIEWS.feature.pos].map(V), false, "centripetal");
const lookCurve = new THREE.CatmullRomCurve3([[0.2, 2.55, -3], [-0.4, 1.8, -1], [-0.4, 1.56, -3], [-0.15, 1.45, -9.75], VIEWS.feature.look].map(V), false, "centripetal");
const mapP = (p: number) => { if (p >= KP[KP.length - 1]) return 1; let i = 0; while (p > KP[i + 1]) i++; return (i + (p - KP[i]) / (KP[i + 1] - KP[i])) / (KP.length - 1); };

const doorRef: { current: THREE.Group | null } = { current: null };
const landscapeRef: { current: THREE.Group | null } = { current: null };
/* once the camera is inside, the walls hide every tree and shrub, but frustum culling can't know that */
const INSIDE_FROM = 0.6;

/* Lighting is baked in Blender Cycles, so there are no shadow maps and no real-time lights on the house.
   The manifest (each lightmap's range) must be in before any baked shader compiles. */
let manifestP: Promise<unknown> | null = null;
const manifestReady = () => (manifestP ??= loadManifest());

/* ---------- render resolution (anti-shimmer) ----------
   From across the room a slat gap, a flute joint or a jaali bar is about one pixel wide. With one sample per
   pixel it lands on a pixel in one frame and between pixels in the next, and that is the shimmer. So the scene is
   drawn with 4× MSAA always, and supersampled (up to 2× the screen's resolution each way) on GPUs that can afford
   it: up to 16 coverage samples a pixel, which turns those sub-pixel lines into steady, correctly weighted tones.
   tier 3: 2× · 2: 1.6× · 1: 1.3× · 0: the screen's own density. Every visit starts one tier above the one this
   device settled on last time; while the camera moves, ~20 frames are timed and, below 45 fps, the tier drops
   straight to the one the measured frame time says will hold 55 fps. Phones stay at native density (memory). */
const SCALES = [1, 1.3, 1.6, 2];
const TOP = SCALES.length - 1;
// ?msaa=N overrides the sample count (for testing)
export const MSAA = typeof window === "undefined" ? 4 : +(new URLSearchParams(window.location.search).get("msaa") ?? 4);
const QKEY = "ll-res-tier-v1";
const nativeDpr = () => (typeof window === "undefined" ? 1 : Math.min(window.devicePixelRatio || 1, 2));
export const dprFor = (tier: number) => (LITE ? nativeDpr() : Math.max(nativeDpr(), SCALES[tier]));
// ?q=0..3 pins a tier (for testing) and turns the automatic drop off
const pinned = typeof window === "undefined" ? null : new URLSearchParams(window.location.search).get("q");
const readTier = () => {
  if (pinned !== null) return Math.max(0, Math.min(TOP, +pinned));
  try { const s = localStorage.getItem(QKEY); if (s !== null) return Math.min(TOP, +s + 1); } catch {}
  return TOP;
};
export const useQuality = create<{ tier: number; settle: (tier: number) => void }>((set) => ({
  tier: typeof window === "undefined" ? TOP : readTier(),
  settle: (tier) => { set({ tier }); try { localStorage.setItem(QKEY, String(tier)); } catch {} },
}));
/** applies the tier's resolution to the canvas */
function Resolution() {
  const setDpr = useThree((s) => s.setDpr);
  const tier = useQuality((q) => q.tier);
  useEffect(() => { setDpr(dprFor(tier)); }, [setDpr, tier]);
  return null;
}
const perf = { sum: 0, n: 0, skip: 8, kept: false };
function samplePerf(dt: number) {
  if (LITE || pinned !== null || dt > 0.5) return; // dt > 0.5: first frame after idle
  if (perf.skip > 0) { perf.skip--; return; }
  perf.sum += dt; perf.n++;
  if (perf.n < 20) return;
  const fps = perf.n / perf.sum; perf.sum = 0; perf.n = 0;
  const q = useQuality.getState();
  if (fps >= 45) { if (!perf.kept) { perf.kept = true; q.settle(q.tier); } return; }
  if (q.tier === 0) return;
  // frame time scales with pixel count (dpr²): pick the largest scale expected to hold 55 fps
  const want = dprFor(q.tier) * Math.sqrt(fps / 55);
  let t = q.tier - 1;
  while (t > 0 && dprFor(t) > want) t--;
  perf.skip = 8; perf.kept = false;
  q.settle(t);
}

/* The sky photo is drawn on a camera-centred sphere instead of scene.background: three.js converts an equirect
   background into a cubemap as tall as the image (a 3072 px cube, ~300 MB of GPU memory on desktop, 1536 px on
   phones), which is what pushed mobile browsers into killing the tab. The lookup matches three's background shader
   (equirectUv of the rotated view direction), so it looks the same. No mipmaps: the sky is shown near 1:1. */
const skyUniforms = { map: { value: null as THREE.Texture | null }, intensity: { value: 0.62 }, rot: { value: new THREE.Matrix3() } };
function skyDome(sky: THREE.Texture) {
  sky.generateMipmaps = false; sky.minFilter = THREE.LinearFilter;
  skyUniforms.map.value = sky;
  const e = new THREE.Euler(-BACKDROP_ROT.x, -BACKDROP_ROT.y, -BACKDROP_ROT.z, BACKDROP_ROT.order);
  skyUniforms.rot.value.setFromMatrix4(new THREE.Matrix4().makeRotationFromEuler(e));
  const mat = new THREE.ShaderMaterial({
    uniforms: skyUniforms, side: THREE.BackSide, depthTest: false, depthWrite: false, fog: false,
    vertexShader: `varying vec3 vDir;
      void main() { vDir = (modelMatrix * vec4(position, 0.0)).xyz; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `#include <common>
      uniform sampler2D map; uniform float intensity; uniform mat3 rot; varying vec3 vDir;
      void main() {
        vec3 d = normalize(rot * vDir);
        vec2 uv = vec2(atan(d.z, d.x) * RECIPROCAL_PI2 + 0.5, asin(clamp(d.y, -1.0, 1.0)) * RECIPROCAL_PI + 0.5);
        gl_FragColor = vec4(texture2D(map, uv).rgb * intensity, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const dome = new THREE.Mesh(new THREE.SphereGeometry(100, 48, 24), mat);
  dome.renderOrder = -1000; dome.frustumCulled = false; dome.name = "sky";
  dome.onBeforeRender = (_r, _s, cam) => { dome.position.copy(cam.position); dome.updateMatrixWorld(); };
  return dome;
}

/* Imperative three.js setup lives in plain functions: R3F objects are mutable by design. */
function configureScene(gl: THREE.WebGLRenderer, scene: THREE.Scene, sky: THREE.Texture, invalidate: () => void) {
  setAnisotropy(gl.capabilities.getMaxAnisotropy());
  // upload each texture to the GPU the moment it arrives, instead of mid-scroll when it first comes into view
  setOnTextureLoad((t) => { gl.initTexture(t); invalidate(); });
  setLightmapReady((t) => { gl.initTexture(t); invalidate(); });
  // realistic interior architectural exposure: AgX balanced, matte highlights without blown-out glare
  gl.toneMappingExposure = 1.25;
  tour.invalidate = invalidate;
  sky.mapping = THREE.EquirectangularReflectionMapping;
  sky.colorSpace = THREE.SRGBColorSpace;
  scene.background = null;
  scene.getObjectByName("sky")?.removeFromParent();
  scene.add(skyDome(sky));
  // the sky jpg is already tone-mapped, so it is dimmed before the composer's tone-mapping pass to keep its colour
  skyUniforms.intensity.value = 0.62;
  // warm horizon haze so the far ground melts into the photographed veld
  scene.fog = new THREE.Fog(0xb9a88f, 60, 210);
  invalidate();
}

function Setup() {
  const { gl, invalidate, scene, camera } = useThree();
  const sky = useTexture(LITE ? "/hdri/sky_golden_m.jpg" : "/hdri/sky_golden.jpg");
  useLayoutEffect(() => configureScene(gl, scene, sky, () => invalidate()), [gl, invalidate, scene, sky]);
  // ?debug exposes the renderer for memory checks in the console: __ll.gl.info
  useEffect(() => { if (flags.has("debug")) Object.assign(window, { __ll: { gl, scene, camera } }); }, [gl, scene, camera]);
  return null;
}

type RigCtx = { side: number; mouse: { x: number; y: number; tx: number; ty: number }; tp: THREE.Vector3; tl: THREE.Vector3; sp: THREE.Vector3; sl: THREE.Vector3 };

function stepRig(state: RootState, dt: number, c: RigCtx) {
  const cam = state.camera as THREE.PerspectiveCamera;
  const k = 1 - Math.pow(0.0008, Math.min(dt, 0.05));
  let moving = false;
  // Lenis already smooths the scroll, so the camera only needs a light, frame-rate independent follow
  const follow = 1 - Math.exp(-Math.min(dt, 0.1) * 16);
  const d = tour.target - tour.current;
  if (Math.abs(d) > 0.00003) { tour.current = Math.abs(d) < 0.0003 ? tour.target : tour.current + d * follow; moving = true; }
  const sideT = useTour.getState().active === "side" ? 1 : 0;
  if (Math.abs(sideT - c.side) > 0.001) { c.side += (sideT - c.side) * k * 0.4; moving = true; } else c.side = sideT;
  const m = c.mouse;
  if (Math.abs(m.tx - m.x) + Math.abs(m.ty - m.y) > 0.0005) { m.x += (m.tx - m.x) * k * 0.3; m.y += (m.ty - m.y) * k * 0.3; moving = true; }

  const overview = useTour.getState().roomOverview;
  const currentSide = overview ? OVERVIEW_VIEWS.side : VIEWS.side;
  c.sp.set(currentSide.pos[0], currentSide.pos[1], currentSide.pos[2]);
  c.sl.set(currentSide.look[0], currentSide.look[1], currentSide.look[2]);

  const p = tour.current, u = mapP(p);
  posCurve.getPoint(u, c.tp); lookCurve.getPoint(u, c.tl);
  if (overview && p > 0.84) {
    const ovW = smooth(0.84, 0.98, p);
    c.tp.lerp(V(OVERVIEW_VIEWS.feature.pos), ovW);
    c.tl.lerp(V(OVERVIEW_VIEWS.feature.look), ovW);
  }
  const b = c.side * smooth(0.84, 0.92, p);
  if (b > 0) { c.tp.lerp(c.sp, b); c.tl.lerp(c.sl, b); }
  // gentle parallax on the hero and in design mode
  const par = (1 - smooth(0.02, 0.12, p)) + smooth(0.86, 0.95, p) * 0.4;
  c.tl.x += m.x * 1.2 * par; c.tl.y += m.y * 0.5 * par;
  cam.position.copy(c.tp); cam.lookAt(c.tl);
  const narrow = state.size.width < state.size.height ? 1.45 : 1;
  cam.fov = lerp(40, 47, smooth(0.45, 0.8, p)) * narrow; cam.updateProjectionMatrix();
  if (doorRef.current) doorRef.current.rotation.y = smooth(0.24, 0.4, p) * 1.62;
  const outside = p < INSIDE_FROM;
  if (landscapeRef.current && landscapeRef.current.visible !== outside) landscapeRef.current.visible = outside;
  // light switches fade rather than snap; at night the sky and its reflections go dark too
  const on = useTour.getState().lights;
  const glow = lerp(2.2, 1, smooth(0.3, 0.6, p));
  for (const g of GROUPS) {
    const t = on[g] ? (g === "day" ? 1 : glow) : 0, w = LIGHTS[g];
    if (Math.abs(t - w.value) > 0.002) { w.value += (t - w.value) * (1 - Math.exp(-Math.min(dt, 0.1) * 7)); moving = true; } else w.value = t;
  }
  const day = LIGHTS.day.value;
  skyUniforms.intensity.value = lerp(0.03, 0.5, day);
  if (moving) samplePerf(dt);
  state.scene.environmentIntensity = lerp(0.9, 0.5, smooth(0.42, 0.66, p)) * lerp(0.08, 1, day);
  tour.listeners.forEach((fn) => fn(p));
  if (moving) state.invalidate();
}

function trackPointer(c: RigCtx, invalidate: () => void) {
  const onMove = (e: PointerEvent) => { c.mouse.tx = e.clientX / innerWidth - 0.5; c.mouse.ty = -(e.clientY / innerHeight - 0.5); invalidate(); };
  window.addEventListener("pointermove", onMove);
  const unsub = useTour.subscribe(() => invalidate());
  return () => { window.removeEventListener("pointermove", onMove); unsub(); };
}

function followDaylight(l: THREE.DirectionalLight) { l.intensity = 2.8 * LIGHTS.day.value; }

function Sun() {
  const sun = useMemo(() => {
    const l = new THREE.DirectionalLight(0xfff1e2, 2.8);
    l.position.copy(SUN_POS); l.target.position.set(0, 0, -4);
    l.castShadow = true;
    l.shadow.mapSize.set(2048, 2048);
    l.shadow.bias = -0.0002;
    l.shadow.normalBias = 0.02;
    l.shadow.camera.near = 0.5;
    l.shadow.camera.far = 70;
    l.shadow.camera.left = -16;
    l.shadow.camera.right = 16;
    l.shadow.camera.top = 16;
    l.shadow.camera.bottom = -16;
    return l;
  }, []);
  useFrame(() => followDaylight(sun));
  return <><primitive object={sun} /><primitive object={sun.target} /></>;
}

const nearestKey = (o: THREE.Object3D) => { for (let n: THREE.Object3D | null = o; n; n = n.parent) if (n.userData.lm) return n.userData.lm as string; return null; };
const UNBAKED = new Set(["Glass", "Water", "LampShade", "WarmGlow", "Downlight"]);

function prepareBaked(root: THREE.Object3D, own: boolean) {
  const M = houseMaterials(), cache = new Map<string, THREE.Material>();
  root.traverse((o) => {
    const mesh = o as THREE.Mesh; if (!mesh.isMesh) return;
    const key = nearestKey(mesh); if (!key) return;
    // the two configurable walls are drawn by <Wall>, which also handles drag and drop
    if (key === "wallF" || key === "wallS") { mesh.visible = false; return; }
    const src = mesh.material as THREE.MeshStandardMaterial, name = src?.name ?? "";
    if (name === "modern_wooden_cabinet" || mesh.name.toLowerCase().includes("cabinet")) {
      mesh.visible = false;
      return;
    }
    if (UNBAKED.has(name)) { mesh.material = M[name]; return; }
    const id = `${name}|${key}`;
    let m = cache.get(id) as THREE.MeshStandardMaterial | undefined;
    if (!m) {
      // house materials come from the site's 2K textures by name; furniture keeps its own textures
      m = (own ? src.clone() : (M[name] as THREE.MeshStandardMaterial | undefined)?.clone() ?? src.clone()) as THREE.MeshStandardMaterial;
      bakeUV1(m, key); cache.set(id, m);
    }
    mesh.material = m;
  });
}

/* Interior reflections come from a 360° Cycles render of the room, so the polished marble reflects the room's
   windows and lamps instead of the outdoor sky. Applied to every interior material, including panels built later. */
function InteriorReflections() {
  const hdr = useLoader(HDRLoader, "/hdri/interior.hdr");
  const scene = useThree((s) => s.scene);
  useLayoutEffect(() => applyInteriorEnv(hdr, scene), [hdr, scene]);
  return null;
}

function House() {
  use(manifestReady());
  const house = useGLTF("/models/house.glb", "/draco/");
  const furn = useGLTF(lite("/models/furniture.glb"), "/draco/");
  const obj = useMemo(() => {
    const g = new THREE.Group();
    const h = house.scene.clone(true); prepareBaked(h, false); g.add(h);
    if (!off("furniture")) { const f = furn.scene.clone(true); prepareBaked(f, true); g.add(f); }
    return g;
  }, [house, furn]);
  return <primitive object={obj} />;
}

let teak: THREE.MeshStandardMaterial | null = null;
const teakDoor = () => (teak ??= Object.assign((houseMaterials().Walnut as THREE.MeshStandardMaterial).clone(), { roughness: 0.55 }));

function Door() {
  const g = useMemo(() => {
    const M = materials();
    const pivot = new THREE.Group(); pivot.position.set(DOOR.hingeX, 0, DOOR.z);
    const slab = new THREE.Mesh(new THREE.BoxGeometry(DOOR.width, DOOR.height - 0.02, 0.06), teakDoor());
    slab.position.set(DOOR.width / 2, (DOOR.height - 0.02) / 2, 0); pivot.add(slab);
    for (const z of [0.06, -0.06]) { const h = new THREE.Mesh(new THREE.BoxGeometry(0.022, 1.2, 0.03), M.black); h.position.set(DOOR.width - 0.12, 1.1, z); pivot.add(h); }
    return pivot;
  }, []);
  useEffect(() => { doorRef.current = g; }, [g]);
  return <primitive object={g} />;
}

type ModelProps = { url: string; position: [number, number, number]; rotation?: number; scale?: number; hang?: boolean };
function Model({ url, position, rotation = 0, scale = 1, hang = false }: ModelProps) {
  const { scene } = useGLTF(url);
  const obj = useMemo(() => {
    const c = scene.clone(true);
    const b = new THREE.Box3().setFromObject(c);
    c.position.y = hang ? -b.max.y : -b.min.y;
    const g = new THREE.Group(); g.add(c); return g;
  }, [scene, hang]);
  return <primitive object={obj} position={position} rotation-y={rotation} scale={scale} />;
}

/* Planting from Blender: one decimated model per plant type, drawn as instances at the positions the bake used,
   so every tree stands on its own baked shadow. */
// (the slim Poly Haven shrub is left out: scaled up, its alpha cards cost more than the round bushes and palms)
const PLANTS = ["olive", "shrubB", "grassA", "grassB", "bushRound", "palm"] as const;
// the olive is drawn with the web-optimised copy (125k triangles) of the tree Blender used for the shadows
// Poly Haven ships these two shrubs at seedling size; bring them to garden-bush height (~0.9 m and ~1.3 m)
const PLANT_SCALE: Partial<Record<(typeof PLANTS)[number], number>> = {};
// the olive and the green shrub are drawn with their full-leaf web copies; Blender used thinned ones for the shadows
// phones get the light olive (~28k triangles instead of ~123k) and palm (15k instead of 38k): blender/plants_lite.py
const plantUrl = (k: (typeof PLANTS)[number]) => {
  const url = k === "olive" ? "/models/olive_tree.glb" : `/models/veg_${k}.glb`;
  return k === "olive" || k === "palm" ? lite(url) : url;
};
type Placement = Record<(typeof PLANTS)[number], [number, number, number, number, number][]>;
type Item = Placement[keyof Placement][number];
let plantsP: Promise<Placement> | null = null;
const plantsReady = () => (plantsP ??= fetch("/models/vegetation.json").then((r) => r.json()));

/** Same origin Blender used when it placed the plant: vertex mean across, lowest point on the ground. */
function plantOrigin(scene: THREE.Object3D) {
  const v = new THREE.Vector3(), sum = new THREE.Vector3(); let n = 0, minY = Infinity;
  scene.traverse((o) => {
    const mesh = o as THREE.Mesh; if (!mesh.isMesh) return;
    const pos = mesh.geometry.attributes.position;
    for (let i = 0; i < pos.count; i += 3) { v.fromBufferAttribute(pos, i).applyMatrix4(mesh.matrixWorld); sum.add(v); n++; minY = Math.min(minY, v.y); }
  });
  return new THREE.Matrix4().makeTranslation(-sum.x / n, -minY, -sum.z / n);
}

function instancePlant(scene: THREE.Object3D, items: Placement[keyof Placement]) {
  const g = new THREE.Group(), m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0);
  scene.updateMatrixWorld(true);
  const origin = plantOrigin(scene);
  scene.traverse((o) => {
    const mesh = o as THREE.Mesh; if (!mesh.isMesh) return;
    const mat = (mesh.material as THREE.MeshStandardMaterial).clone();
    // leaves are alpha cards: alpha-test (no sorting) and lit from both sides
    if (mat.map && mat.transparent) { mat.transparent = false; mat.alphaTest = 0.5; }
    if (mat.alphaTest > 0) mat.side = THREE.DoubleSide;
    // foliage is lit by the live sun from behind and the sky; lift the sky fill and keep leaves fresh green
    mat.envMapIntensity = 1.8; mat.color.multiply(new THREE.Color().setRGB(1.12, 1.22, 1.0));
    // one object per plant sharing geometry and material: each is frustum-culled on its own, so plants beside or
    // behind the camera cost nothing (an InstancedMesh draws every copy whenever any one is on screen)
    items.forEach(([x, y, z, s, r]) => {
      q.setFromAxisAngle(up, r);
      m4.compose(new THREE.Vector3(x, y, z), q, new THREE.Vector3(s, s, s)).multiply(origin).multiply(mesh.matrixWorld);
      const m = new THREE.Mesh(mesh.geometry, mat);
      m.matrixAutoUpdate = false; m.matrix.copy(m4); m.matrixWorldNeedsUpdate = true;
      g.add(m);
    });
  });
  return g;
}

/* Extra low planting framing the bottom of the hero shot: a strip along the front of the terrace and clumps at
   both sides of the frame, clear of the walk-in path. Too low to cast shadows that matter, so not in the bake. */
function withForeground(place: Placement): Placement {
  let seed = 11; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  // the thinned tall grass reads as sticks close up; keep it for the distance only
  const out: Placement = { ...place, grassA: [...place.grassA], grassB: place.grassB.filter(([, , z]) => z < 8), bushRound: [], palm: [] };
  // dense round bushes where the camera is close, the light bush further out (it is 96 faces)
  const laneDist = (x: number, z: number) => { const t = Math.min(1, Math.max(0, (16.5 - z) / 12)); return Math.abs(x - (8.6 - 8.8 * t)); };
  const lane = (x: number, z: number) => laneDist(x, z) < 2.6;
  // nothing with big leaf cards within 4 m of the walk-in path: as the camera brushes past, stacked alpha cards
  // fill the screen and the GPU shades every pixel many times over. Low grass lines the path instead.
  const green = ([x, y, z, s, r]: Item) => {
    const d = laneDist(x, z);
    if (z > 10.5 && d > 5 && rnd() < 0.35) out.bushRound.push([x, y, z, s * (0.5 + rnd() * 0.3), r]);
    else rnd(); // keep the sequence; leave the slot empty (more alpha foliage here costs too much)
  };
  // a lush green band along the front of the terrace, thicker towards both edges of the frame
  for (let i = 0; i < 70; i++) {
    const x = -12 + rnd() * 29, z = 8.8 + rnd() * 6.5;
    if (lane(x, z)) continue;
    if (i % 4 === 3) { rnd(); rnd(); rnd(); continue; } // draw three in four, keeping the poster's random sequence
    if (rnd() < 0.55) green([x, -0.32, z, 0.8 + rnd() * 0.7, rnd() * 6.28]);
    else out.grassA.push([x, -0.32, z, 0.8 + rnd() * 0.8, rnd() * 6.28]);
  }
  // bushes hugging the terrace sides and the boundary wall
  // round bushes along both boundary walls (far from the camera, so small on screen)
  for (let i = 0; i < 14; i++) {
    const side = rnd() < 0.5 ? -1 : 1, x = side < 0 ? -13.5 - rnd() * 9 : 15.5 + rnd() * 10, z = -26 + rnd() * 36;
    out.bushRound.push([x, -0.32, z, 0.9 + rnd() * 0.5, rnd() * 6.28]);
  }
  // potted areca palms on the terrace, by the door and the glass
  for (const [x, z, s] of [[-1.75, 0.9, 1.0], [0.85, 0.75, 0.85], [8.25, 0.8, 1.1], [-7.2, 0.9, 0.95]]) out.palm.push([x, 0, z, s, rnd() * 6.28]);
  return out;
}

/** phones: Blender's planting only, every other grass clump */
// phones never plant round bushes, so they never download them
const KINDS = LITE ? PLANTS.filter((k) => k !== "bushRound") : [...PLANTS];

function thinOut(place: Placement): Placement {
  const full = withForeground(place);
  // phones: about a third of the triangles of the desktop planting (round bushes are 27k triangles each)
  return { ...full, grassA: full.grassA.filter((_, i) => i % 3 === 0), grassB: full.grassB.filter((_, i) => i % 8 === 0), shrubB: full.shrubB.filter((_, i) => i % 2 === 0), bushRound: [] };
}

function Landscape() {
  const place = use(plantsReady());
  const lite = useQuality((q) => q.tier < 0);
  const gltfs = useGLTF(KINDS.map(plantUrl), "/draco/");
  const group = useMemo(() => {
    const g = new THREE.Group(), all = lite ? { ...thinOut(place), bushRound: [] } : LITE ? thinOut(place) : withForeground(place);
    // ?no=bushLite,palm skips plant types (for performance testing)
    const skip = new Set((flags.get("no") ?? "").split(",").filter(Boolean));
    KINDS.forEach((k, i) => {
      if (skip.has(k)) return;
      const f = PLANT_SCALE[k] ?? 1;
      if (all[k]?.length) g.add(instancePlant(gltfs[i].scene, all[k].map(([x, y, z, sc, r]) => [x, y, z, sc * f, r] as Item)));
    });
    return g;
  }, [place, gltfs, lite]);
  return <group ref={(g) => { landscapeRef.current = g; }}><primitive object={group} /></group>;
}

/* Phones: the plants load only after the house has drawn, so their downloads, Draco decoding and texture uploads
   do not stack on top of the house's in one memory spike. */
function LateLandscape() {
  const ready = useTour((s) => s.ready);
  const [go, setGo] = useState(false);
  useEffect(() => { if (!ready) return; const t = setTimeout(() => setGo(true), 700); return () => clearTimeout(t); }, [ready]);
  return go ? <Suspense fallback={null}><Landscape /></Suspense> : null;
}

const WALL_DEF: Record<WallId, { pos: [number, number, number]; rot: number; len: number; lining: [number, number, number] }> = {
  feature: { pos: [0, 0, -9.742], rot: 0, len: 15.5, lining: [0, IH / 2, -9.745] },
  side: { pos: [-7.742, 0, -5], rot: Math.PI / 2, len: 9.5, lining: [-7.745, IH / 2, -5] },
};
const localX = (id: WallId, p: THREE.Vector3) => (id === "feature" ? p.x : -(p.z + 5));
const wallMeshes: Partial<Record<WallId, THREE.Mesh>> = {};
let plaster: THREE.MeshStandardMaterial | null = null;
const wallPlaster = () => (plaster ??= bakeWall((houseMaterials().Plaster as THREE.MeshStandardMaterial).clone()));

function Wall({ id }: { id: WallId }) {
  const cfg = useTour((s) => s.walls[id]);
  const def = WALL_DEF[id];
  use(manifestReady());
  const panels = useMemo(() => buildPanels(cfg), [cfg]);
  useEffect(() => { tour.invalidate(); return () => { if (panels) disposeTree(panels); }; }, [panels]);
  const geo = useMemo(() => {
    const g = new THREE.PlaneGeometry(def.len, IH); const uv = g.attributes.uv as THREE.BufferAttribute;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, (uv.getX(i) * def.len) / 3, (uv.getY(i) * IH) / 3);
    return g;
  }, [def.len]);
  const drag = useRef<{ x0: number; c0: number } | null>(null);

  const down = (e: ThreeEvent<PointerEvent>) => {
    const s = useTour.getState();
    if (!s.designOn) return;
    e.stopPropagation();
    if (s.active !== id) { s.setActive(id); return; }
    if (e.pointerType !== "mouse" || !s.walls[id].pid) return;
    drag.current = { x0: localX(id, e.point), c0: s.walls[id].center };
    (e.target as unknown as Element).setPointerCapture?.(e.pointerId);
    document.body.style.cursor = "grabbing";
  };
  const move = (e: ThreeEvent<PointerEvent>) => {
    const s = useTour.getState();
    if (!s.designOn) return;
    if (!drag.current) { document.body.style.cursor = s.active === id ? (s.walls[id].pid ? "grab" : "default") : "pointer"; return; }
    s.update(id, { center: drag.current.c0 + localX(id, e.point) - drag.current.x0 });
  };
  const up = () => { if (drag.current) { drag.current = null; document.body.style.cursor = "grab"; } };

  return (
    <>
      <mesh ref={(m) => { if (m) wallMeshes[id] = m; }} geometry={geo} material={wallPlaster()} position={def.lining} rotation-y={def.rot}
        onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerOut={() => { if (!drag.current) document.body.style.cursor = ""; }} />
      <group position={def.pos} rotation-y={def.rot}>{panels && <primitive object={panels} />}</group>
    </>
  );
}

/* Compile every shader and upload every texture while the loading veil is still up,
   so nothing stalls the first time the camera sees it (or the first time a finish is picked). */
const TEX_KEYS = ["map", "normalMap", "roughnessMap", "metalnessMap", "aoMap", "alphaMap", "emissiveMap"] as const;
/* Compile and upload only what is in the scene now. This used to build every finish in the catalogue up front, which
   loaded and uploaded all their textures in the same burst as the house: the memory spike that crashed phones. */
function prewarm(gl: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera) {
  scene.traverse((o) => {
    const mats = (o as THREE.Mesh).material; if (!mats) return;
    for (const m of Array.isArray(mats) ? mats : [mats]) for (const k of TEX_KEYS) {
      const t = (m as unknown as Record<string, THREE.Texture | null>)[k];
      if (t && t.image) gl.initTexture(t);
    }
  });
  gl.compile(scene, camera);
}
const idle = (cb: () => void) => ("requestIdleCallback" in window ? window.requestIdleCallback(cb, { timeout: 3000 }) : globalThis.setTimeout(cb, 300));
/* Desktop only, well after the page is up: compile the other finishes one at a time while the browser is idle, so the
   first swap in the configurator has no shader hitch. Phones skip this; a finish loads when it is picked. */
function prewarmFinishesLater(gl: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera) {
  let i = 0, stop = false;
  const step = () => {
    if (stop || i >= FINISHES.length) return;
    const f = FINISHES[i++];
    const g = buildPanels({ pid: f.id, width: f.module * 2, center: 0, dir: "v" });
    if (g) { g.position.set(0, -50, 0); scene.add(g); gl.compile(scene, camera); scene.remove(g); disposeTree(g); }
    globalThis.setTimeout(() => idle(step), 400);
  };
  const t = globalThis.setTimeout(() => idle(step), 4000);
  return () => { stop = true; clearTimeout(t); };
}
function Prewarm() {
  const { gl, scene, camera, invalidate } = useThree();
  useEffect(() => {
    prewarm(gl, scene, camera); invalidate();
    // tell the page after the first real frame, so the poster never hands over to a half-drawn scene
    let raf = requestAnimationFrame(() => { raf = requestAnimationFrame(() => useTour.getState().setReady()); });
    const later = LITE ? () => {} : prewarmFinishesLater(gl, scene, camera);
    return () => { cancelAnimationFrame(raf); later(); };
  }, [gl, scene, camera, invalidate]);
  return null;
}

/* Drag-and-drop from the finish strip: find the wall under the pointer and fit the finish centred on that spot. */
function DropTarget() {
  const { camera, gl } = useThree();
  useEffect(() => {
    const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
    tour.drop = (x, y, pid) => {
      const r = gl.domElement.getBoundingClientRect();
      if (x < r.left || x > r.right || y < r.top || y > r.bottom) return false;
      ndc.set(((x - r.left) / r.width) * 2 - 1, -((y - r.top) / r.height) * 2 + 1);
      ray.setFromCamera(ndc, camera);
      const hit = ray.intersectObjects(Object.values(wallMeshes).filter(Boolean) as THREE.Mesh[], false)[0];
      if (!hit) return false;
      const id = (Object.keys(wallMeshes) as WallId[]).find((k) => wallMeshes[k] === hit.object)!;
      const s = useTour.getState();
      s.setActive(id); s.setFinish(id, pid); s.update(id, { center: localX(id, hit.point) });
      return true;
    };
    return () => { tour.drop = () => false; };
  }, [camera, gl]);
  return null;
}

function Rig() {
  const invalidate = useThree((s) => s.invalidate);
  const ctx = useMemo<RigCtx>(() => ({ side: 0, mouse: { x: 0, y: 0, tx: 0, ty: 0 }, tp: new THREE.Vector3(), tl: new THREE.Vector3(), sp: V(VIEWS.side.pos), sl: V(VIEWS.side.look) }), []);
  useEffect(() => trackPointer(ctx, invalidate), [ctx, invalidate]);
  useFrame((state, dt) => stepRig(state, dt, ctx));
  return null;
}

const flags = typeof window === "undefined" ? new URLSearchParams() : new URLSearchParams(window.location.search);
const off = (k: string) => flags.has("no" + k);

export default function Scene() {
  const fx = !off("fx");
  return (
    <Canvas
      dpr={dprFor(useQuality.getState().tier)}
      frameloop="demand"
      camera={{ fov: 40, near: 0.05, far: 600, position: [8.6, 1.55, 16.5] }}
      // with post-processing on, the composer's own multisampled target does the anti-aliasing; a multisampled
      // canvas on top of it would only cost memory
      gl={{ antialias: !fx, powerPreference: "high-performance", stencil: false, toneMapping: THREE.AgXToneMapping }}
      style={{ position: "absolute", inset: 0, touchAction: "pan-y" }}
    >
      <Suspense fallback={null}>
        <Setup />
        {!off("env") && <Environment files="/hdri/env_golden.hdr" environmentIntensity={0.9} environmentRotation={SKY_ROT} />}
        <Sun />
        <House />
        {!off("probe") && <InteriorReflections />}
        <Door />
        <Wall id="feature" />
        <Wall id="side" />
        {!off("trees") && !LITE && <Landscape />}
        <Prewarm />
      </Suspense>
      {!off("trees") && LITE && <LateLandscape />}
      <Rig />
      <Resolution />
      <DropTarget />
      {fx && <Effects />}
    </Canvas>
  );
}

function Effects() {
  // ambient occlusion and bounce light are in the bake; only bloom on the lamps and AgX remain.
  // Anti-aliasing is real geometry sampling (MSAA × supersampling, see SCALES), not an edge-blur pass,
  // so wood grain and marble veins stay sharp.
  return (
    <EffectComposer multisampling={MSAA} enableNormalPass={false}>
      <Bloom luminanceThreshold={1.25} luminanceSmoothing={0.3} intensity={0.08} mipmapBlur />
      <ToneMapping mode={ToneMappingMode.AGX} />
      {/* AgX alone is flatter than Blender's "AgX - Base Contrast" look the bake was judged with */}
      <BrightnessContrast brightness={-0.01} contrast={0.12} />
    </EffectComposer>
  );
}

if (!LITE) useGLTF.preload(["/models/olive_tree.glb", "/models/veg_shrubB.glb", "/models/veg_grassA.glb", "/models/veg_grassB.glb", "/models/veg_bushRound.glb", "/models/veg_palm.glb"], "/draco/");
useGLTF.preload("/models/house.glb", "/draco/");
useGLTF.preload(lite("/models/furniture.glb"), "/draco/");
