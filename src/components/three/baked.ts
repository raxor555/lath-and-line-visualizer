import * as THREE from "three";
import { lite, tex } from "./materials";
import { ajrakTexture, rugTexture } from "./patterns";

/* ---------------------------------------------------------------------------------------------------------------
   Baked lighting. Every static surface was lit in Blender Cycles (bounce light, soft shadows, colour bleeding) and
   the result stored per light group in lightmaps: day (sun + sky), spots (wall washers), lamps (floor lamp,
   pendant, sconce). Here the maps are blended by the light switches and fed to MeshStandardMaterial as irradiance.
   Baked materials ignore real-time lights; only the reflections (env map) are computed live.
   --------------------------------------------------------------------------------------------------------------- */

export type Group = "day" | "spots" | "lamps";
export const GROUPS: Group[] = ["day", "spots", "lamps"];
type Manifest = Record<string, { max: number; size: [number, number] }>;

/** Light switch weights, shared by every baked material (animated by the camera rig). */
export const LIGHTS = { day: { value: 1 }, spots: { value: 1 }, lamps: { value: 1 } };

const loader = new THREE.TextureLoader();
const maps = new Map<string, THREE.Texture>();
let manifest: Manifest = {};
let onReady: (t: THREE.Texture) => void = () => {};
export const setLightmapReady = (fn: (t: THREE.Texture) => void) => { onReady = fn; };

export async function loadManifest() {
  if (Object.keys(manifest).length) return manifest;
  manifest = await fetch("/lightmaps/lightmaps.json").then((r) => r.json());
  return manifest;
}

/** Lightmap texture for `${key}_${group}`; a black 1×1 until (or unless) the file exists. */
function lightmap(key: string, group: Group) {
  const id = `${key}_${group}`;
  let t = maps.get(id);
  if (t) return t;
  if (!manifest[id]) {
    t = new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1); t.needsUpdate = true;
  } else {
    t = loader.load(lite(`/lightmaps/${id}.webp`), (l) => onReady(l));
    // glTF UVs assume images are not flipped
    t.flipY = false;
    t.colorSpace = THREE.NoColorSpace;
    t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
    t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter; t.anisotropy = 4;
  }
  maps.set(id, t);
  return t;
}
const maxOf = (key: string, g: Group) => manifest[`${key}_${g}`]?.max ?? 0;

const DECODE = /* glsl */ `
uniform float lmWDay, lmWSpots, lmWLamps;
vec3 lmDecode(sampler2D t, vec2 uv, float mx) { return mx * pow(texture2D(t, uv).rgb, vec3(2.2)); }
`;

function samplers(prefix: string, key: string, u: Record<string, THREE.IUniform>) {
  let decl = "";
  for (const g of GROUPS) {
    u[`${prefix}_${g}`] = { value: lightmap(key, g) };
    u[`${prefix}_${g}Max`] = { value: maxOf(key, g) };
    decl += `uniform sampler2D ${prefix}_${g}; uniform float ${prefix}_${g}Max;\n`;
  }
  return decl;
}
const sum = (prefix: string, uv: string, relief = "1.0") =>
  `lmDecode(${prefix}_day, ${uv}, ${prefix}_dayMax) * vec3(1.08, 0.98, 0.86) * lmWDay * mix(1.0, ${relief}, 0.35)
   + (lmDecode(${prefix}_spots, ${uv}, ${prefix}_spotsMax) * lmWSpots + lmDecode(${prefix}_lamps, ${uv}, ${prefix}_lampsMax) * lmWLamps) * vec3(2.6, 2.05, 1.45) * ${relief}`;

function strip(shader: THREE.WebGLProgramParametersWithUniforms) {
  // baked surfaces already contain the direct light; skip the real-time light loops and the env's diffuse term
  shader.fragmentShader = shader.fragmentShader
    .replace("#include <lights_fragment_begin>", "#undef RE_Direct\n#include <lights_fragment_begin>");
}

/** Static mesh with a second UV set (`uv1`) for its own lightmap `key`. */
export function bakeUV1(m: THREE.MeshStandardMaterial, key: string) {
  m.onBeforeCompile = (shader) => {
    const u = shader.uniforms;
    u.lmWDay = LIGHTS.day; u.lmWSpots = LIGHTS.spots; u.lmWLamps = LIGHTS.lamps;
    const decl = samplers("lmA", key, u);
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\n#ifndef USE_UV1\nattribute vec2 uv1;\n#endif\nvarying vec2 vLmUv;")
      .replace("#include <uv_vertex>", "#include <uv_vertex>\nvLmUv = uv1;");
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", `#include <common>\nvarying vec2 vLmUv;\n${DECODE}${decl}`)
      .replace("#include <lights_fragment_maps>", `#include <lights_fragment_maps>\nirradiance += PI * (${sum("lmA", "vLmUv")});\niblIrradiance = vec3(0.0);`);
    strip(shader);
    groundPatch(shader, m);
  };
  m.customProgramCacheKey = () => "baked-uv1-" + key;
  m.needsUpdate = true;
  return INTERIOR.has(key) ? markInterior(m) : m;
}

/**
 * Wall panels (and the walls themselves): their lightmap is the wall's, found from world position, so a panel
 * dropped anywhere on a wall picks up exactly the light that falls there. Relief (flutes, slats, jaali) is
 * re-lit from the wall-washer direction so it doesn't read flat.
 */
export function bakeWall(m: THREE.MeshStandardMaterial) {
  m.onBeforeCompile = (shader) => {
    const u = shader.uniforms;
    u.lmWDay = LIGHTS.day; u.lmWSpots = LIGHTS.spots; u.lmWLamps = LIGHTS.lamps;
    const decl = samplers("lmF", "wallF", u) + samplers("lmS", "wallS", u);
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vLmWp;")
      .replace("#include <project_vertex>", `#include <project_vertex>
        vec4 lmWp = vec4(transformed, 1.0);
        #ifdef USE_INSTANCING
          lmWp = instanceMatrix * lmWp;
        #endif
        vLmWp = (modelMatrix * lmWp).xyz;`);
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", `#include <common>\nvarying vec3 vLmWp;\n${DECODE}${decl}`)
      .replace("#include <lights_fragment_maps>", `#include <lights_fragment_maps>
        {
          bool feat = vLmWp.z < -9.2;
          // u along the wall exactly as in Blender, v = height / wall height; images are not flipped
          vec2 luv = feat ? vec2((vLmWp.x + 7.75) / 15.5, 1.0 - vLmWp.y / 2.9) : vec2((-vLmWp.z - 0.25) / 9.5, 1.0 - vLmWp.y / 2.9);
          vec3 n0 = feat ? vec3(0.0, 0.0, 1.0) : vec3(1.0, 0.0, 0.0);
          vec3 L = normalize(feat ? vec3(0.0, 1.0, 0.6) : vec3(0.6, 1.0, 0.0));
          vec3 nw = normalize(inverseTransformDirection(normal, viewMatrix));
          float relief = clamp(mix(1.0, max(dot(nw, L), 0.0) / dot(n0, L), 0.5), 0.75, 1.25);
          vec3 lmE = feat ? (${sum("lmF", "luv", "relief")}) : (${sum("lmS", "luv", "relief")});
          irradiance += PI * lmE;
        }
        iblIrradiance = vec3(0.0);`);
    strip(shader);
  };
  m.customProgramCacheKey = () => "baked-wall";
  m.needsUpdate = true;
  return markInterior(m);
}

/* ---------------------------------------------------------------- materials for the exported house, by name */
const lin = (r: number, g: number, b: number) => new THREE.Color().setRGB(r, g, b);
function pbr(id: string, o: { tint?: THREE.Color; rough?: number; normal?: number; diff?: boolean; metal?: number; colour?: THREE.Color } = {}) {
  const m = new THREE.MeshStandardMaterial({ roughness: o.rough ?? 1, metalness: o.metal ?? 0 });
  if (o.diff !== false) { m.map = tex(`${id}/diff.jpg`, { srgb: true }); if (o.tint) m.color.copy(o.tint); }
  else if (o.colour) m.color.copy(o.colour);
  m.roughnessMap = tex(`${id}/rough.jpg`);
  if ((o.normal ?? 1) > 0) { m.normalMap = tex(`${id}/nor.jpg`); m.normalScale.set(o.normal ?? 1, -(o.normal ?? 1)); }
  return m;
}
const flat = (colour: THREE.Color, rough: number, metal = 0) => new THREE.MeshStandardMaterial({ color: colour, roughness: rough, metalness: metal });
const glow = (hex: number, strength: number) => new THREE.MeshBasicMaterial({ color: new THREE.Color(hex).multiplyScalar(strength), toneMapped: true });

/* Dry earth with patches of withered grass, blended by large-scale noise so the 2.5 m texture never reads as tiles. */
function groundMaterial() {
  const m = pbr("dry_ground_rocks", { tint: lin(0.95, 0.88, 0.8) });
  m.userData.ground = tex("withered_grass/diff.jpg", { srgb: true });
  return m;
}
const GROUND_GLSL = /* glsl */ `
uniform sampler2D groundB;
float gHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float gNoise(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(gHash(i), gHash(i + vec2(1, 0)), f.x), mix(gHash(i + vec2(0, 1)), gHash(i + vec2(1, 1)), f.x), f.y); }
`;
export function groundPatch(shader: THREE.WebGLProgramParametersWithUniforms, m: THREE.MeshStandardMaterial) {
  if (!m.userData.ground) return;
  shader.uniforms.groundB = { value: m.userData.ground };
  shader.fragmentShader = shader.fragmentShader
    .replace("#include <common>", "#include <common>\n" + GROUND_GLSL)
    .replace("#include <map_fragment>", `#include <map_fragment>
      {
        vec2 q = vMapUv * 0.11;
        float n = gNoise(q) * 0.6 + gNoise(q * 2.7 + 13.1) * 0.3 + gNoise(q * 7.3 + 4.2) * 0.1;
        vec4 grass = texture2D(groundB, vMapUv * 0.8 + 0.37);
        // two scales of the same earth break up the repeat; grass takes over where the noise is high
        vec4 earth2 = texture2D(map, vMapUv * 0.23 + 0.61);
        diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * 0.5 + earth2.rgb * diffuse * 0.5, 0.5);
        diffuseColor.rgb = mix(diffuseColor.rgb, grass.rgb * diffuse * 0.95, smoothstep(0.42, 0.68, n));
      }`);
}

let MATS: Record<string, THREE.Material> | null = null;
export function houseMaterials(): Record<string, THREE.Material> {
  if (MATS) return MATS;
  const canvasMap = (t: THREE.Texture) => { const m = new THREE.MeshStandardMaterial({ map: t, roughness: 1 }); return m; };
  MATS = {
    Render: pbr("plastered_wall_04", { tint: lin(1.06, 1.0, 0.92), normal: 0.5 }),
    Plaster: pbr("painted_plaster_wall", { diff: false, colour: lin(0.8, 0.775, 0.735), normal: 0.45 }),
    Ceiling: pbr("painted_plaster_wall", { diff: false, colour: lin(0.84, 0.83, 0.81), normal: 0.2 }),
    MarbleFloor: pbr("marble_01", { tint: lin(1, 0.98, 0.95), rough: 0.45, normal: 0.35 }),
    Terrace: Object.assign(pbr("concrete_floor_02", { tint: lin(1.22, 1.1, 0.95), normal: 0.6 }), { envMapIntensity: 0.35 }),
    // slab edges are thin: the smooth plaster reads as poured concrete there, the floor texture read as rock
    Concrete: pbr("plastered_wall_04", { tint: lin(1.04, 0.99, 0.92), normal: 0.4 }),
    Grass: groundMaterial(),
    // the facade slats, fins and door read as teak: oak grain, warmed
    Walnut: pbr("oak_veneer_01", { tint: lin(0.72, 0.53, 0.38), rough: 0.75, normal: 0.6 }),
    Oak: pbr("oak_veneer_01", { rough: 0.8, normal: 0.5 }),
    Frame: flat(lin(0.018, 0.017, 0.016), 0.38, 0.7),
    BlackMetal: flat(lin(0.015, 0.014, 0.013), 0.45, 0.5),
    WhitePlastic: flat(lin(0.85, 0.85, 0.84), 0.3),
    PoolLining: flat(lin(0.42, 0.62, 0.64), 0.5),
    Boucle: Object.assign(flat(lin(0.72, 0.66, 0.58), 1), { normalMap: tex("wool_boucle/nor.jpg"), normalScale: new THREE.Vector2(1.2, 1.2) }),
    BoucleDark: Object.assign(flat(lin(0.62, 0.56, 0.49), 1), { normalMap: tex("wool_boucle/nor.jpg"), normalScale: new THREE.Vector2(1.2, 1.2) }),
    Ajrak: canvasMap(ajrakTexture(8)),
    Rug: flat(lin(0.3, 0.08, 0.06), 1),
    RugFace: canvasMap(rugTexture(8)),
    LampShade: glow(0xffd29a, 2.2),
    WarmGlow: glow(0xffc88f, 4),
    Downlight: glow(0xffdcae, 6),
    // low reflection, so the warm room reads through the glass at golden hour
    Glass: new THREE.MeshStandardMaterial({ color: 0x9fb0b2, roughness: 0.03, metalness: 0.1, transparent: true, opacity: 0.12, envMapIntensity: 0.55, depthWrite: false }),
    Water: new THREE.MeshPhysicalMaterial({ color: 0x3f6264, roughness: 0.02, metalness: 0.05, envMapIntensity: 1.6, clearcoat: 1, clearcoatRoughness: 0.02 }),
  };
  // the rug face's UVs are in metres (x -2.28..2.28, flipped v -8.38..-5.02): stretch the canvas over it exactly once
  const rug = (MATS.RugFace as THREE.MeshStandardMaterial).map!;
  rug.repeat.set(1 / 4.56, 1 / 3.36); rug.offset.set(0.5, 8.38 / 3.36);
  return MATS;
}

/** Surfaces inside the house reflect the interior probe (rendered in Blender from the middle of the room). */
export const INTERIOR = new Set(["int", "wallF", "wallS", "furn"]);
let interiorEnv: THREE.Texture | null = null;
const markInterior = (m: THREE.MeshStandardMaterial) => {
  m.userData.interior = true;
  if (interiorEnv) { m.envMap = interiorEnv; m.envMapIntensity = 1; }
  return m;
};
export function applyInteriorEnv(hdr: THREE.Texture, scene: THREE.Object3D) {
  hdr.mapping = THREE.EquirectangularReflectionMapping;
  interiorEnv = hdr;
  scene.traverse((o) => {
    const mats = (o as THREE.Mesh).material; if (!mats) return;
    for (const m of (Array.isArray(mats) ? mats : [mats]) as THREE.MeshStandardMaterial[])
      if (m.userData?.interior && m.envMap !== hdr) { m.envMap = hdr; m.envMapIntensity = 1; m.needsUpdate = true; }
  });
}
