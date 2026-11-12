// The land from above: one big grid that follows the camera (dense near the
// middle, coarse at the edge), heights from noise.js in the vertex shader,
// coloured per pixel with the sky's ramps (patchwork fields, forest, rock,
// snow, beaches), a sea at y = 0, and near the ground, real playtreeone trees
// as baked impostor billboards so a low pass over the forest still reads as
// the forest. Cloud shadows come from the shared shadow map (clouds.js).

import * as THREE from './vendor/three.module.js';
import { makePs1Material, makeImpostorMaterial, makeBranchMaterial, makeLeafMaterial, dataTexture } from './ps1/materials.js';
import { SPECIES, generateTree } from './ps1/treegen.js';
import { buildBranchGeometry, buildLeafGeometry, buildImpostorQuad } from './ps1/treemesh.js';
import { makeLeafAtlas, makeBarkTexture } from './ps1/leafgen.js';
import { bakeImpostor } from './ps1/impostor.js';
import { NOISE_GLSL, heightAt, fbm, vnoise, smoothstep } from './noise.js';
import { W } from './skies.js';

export { heightAt };

const R = 26000;     // grid half-width, metres
const N = 176;       // vertices per side
const SNAP = 200;    // the grid moves in steps this big

// Forest cover, the same in JS (tree placement) and GLSL (ground colour).
export function forestAt(x, z) {
  return fbm(x / 2400, z / 2400, 4, 61) + (vnoise(x / 260, z / 260, 67) - 0.5) * 0.08;
}
const FOREST_GLSL = /* glsl */ `
float forestAt(vec2 w) { return n_fbm(w / 2400.0, 4, 61.0) + (n_value(w / 260.0, 67.0) - 0.5) * 0.08; }
`;
export const TREELINE = 1500;
const FOREST_MIN = 0.53;

function gridGeometry() {
  const map = u => R * (0.08 * u + 0.92 * u * u * u);
  const pos = new Float32Array(N * N * 3), idx = [];
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const o = (j * N + i) * 3;
    pos[o] = map(i / (N - 1) * 2 - 1);
    pos[o + 2] = map(j / (N - 1) * 2 - 1);
  }
  for (let j = 0; j < N - 1; j++) for (let i = 0; i < N - 1; i++) {
    const a = j * N + i, b = a + 1, c = a + N, d = c + 1;
    idx.push(a, c, b, b, c, d);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setIndex(idx);
  return g;
}

function landMaterial() {
  return makePs1Material({ uCenter: { value: new THREE.Vector2() }, ...W }, NOISE_GLSL + /* glsl */ `
uniform vec2 uCenter;
varying vec3 vWorld;
varying vec3 vN;
void main() {
  vec2 w = uCenter + position.xz;
  float h = heightAt(w);
  float e = 25.0;
  vec3 n = normalize(vec3(heightAt(w - vec2(e, 0.0)) - heightAt(w + vec2(e, 0.0)), 2.0 * e,
                          heightAt(w - vec2(0.0, e)) - heightAt(w + vec2(0.0, e))));
  vWorld = vec3(w.x, h, w.y);
  vN = n;
  gl_Position = psx(projectionMatrix * viewMatrix * vec4(vWorld, 1.0));
}`, NOISE_GLSL + FOREST_GLSL + /* glsl */ `
uniform vec3 uSnow;
varying vec3 vWorld;
varying vec3 vN;
void main() {
  if (isShadowPass()) { gl_FragColor = vec4(1.0); return; }
  vec3 n = normalize(vN);
  vec2 w = vWorld.xz;
  float h = vWorld.y;
  float sunT = max(dot(n, uSunDir), 0.0) * mix(1.0 - uShadowDark, 1.0, shadowAt(vWorld));
  float tone = n_value(w / 90.0, 71.0) * 0.5 + n_value(w / 23.0, 73.0) * 0.5;
  float row = 4.0, idx = tone * 0.5 + sunT * 0.4;

  // Patchwork fields on gentle lowland, in two slightly turned grids.
  float a = n_value(w / 9000.0, 79.0) * 1.2;
  vec2 q = mat2(cos(a), sin(a), -sin(a), cos(a)) * w / vec2(230.0, 160.0);
  vec2 cell = floor(q), fq = fract(q);
  float pick = n_hash(cell.x, cell.y, 83.0);
  float farm = (1.0 - smoothstep(250.0, 520.0, h)) * smoothstep(0.92, 0.97, n.y) * smoothstep(0.35, 0.55, n_value(w / 5200.0, 89.0));
  if (farm > 0.5) {
    row = pick < 0.55 ? 1.0 : pick < 0.8 ? 4.0 : 2.0;
    idx = 0.25 + pick * 0.45 + sunT * 0.3 + tone * 0.15;
    float edge = min(min(fq.x, 1.0 - fq.x) * 230.0, min(fq.y, 1.0 - fq.y) * 160.0);
    if (edge < 7.0) { row = 0.0; idx = 0.2 + sunT * 0.3; }   // hedgerows
  }
  float forest = forestAt(w) - ${FOREST_MIN.toFixed(3)} + smoothstep(${TREELINE.toFixed(1)} - 300.0, ${TREELINE.toFixed(1)}, h) * -0.3;
  if (forest > 0.0 && h > 6.0 && n.y > 0.7) { row = 0.0; idx = 0.15 + tone * 0.35 + sunT * 0.35; }
  if (n.y < 0.78 || h > 1400.0 + tone * 300.0) { row = 3.0; idx = tone * 0.4 + sunT * 0.5; }   // rock
  if (h < 7.0) { row = 4.0; idx = 0.7 + tone * 0.2 + sunT * 0.1; }                          // beach
  vec3 c = ramp(row, idx) * lightTint(sunT);
  float snow = smoothstep(1800.0, 1950.0, h + (tone - 0.5) * 500.0) * smoothstep(0.55, 0.75, n.y);
  if (snow > bayer4(gl_FragCoord.xy)) c = uSnow * (0.55 + 0.5 * sunT) * lightTint(sunT) * 0.85;
  gl_FragColor = vec4(applyFog(c, vWorld), 1.0);
}`);
}

function waterMaterial() {
  return makePs1Material({ uCenter: { value: new THREE.Vector2() }, ...W }, /* glsl */ `
uniform vec2 uCenter;
varying vec3 vWorld;
void main() {
  vWorld = vec3(uCenter.x + position.x, 0.0, uCenter.y + position.z);
  gl_Position = psx(projectionMatrix * viewMatrix * vec4(vWorld, 1.0));
}`, NOISE_GLSL + /* glsl */ `
uniform vec3 uWater[3];
uniform vec3 uSkyHorizon;
varying vec3 vWorld;
void main() {
  if (isShadowPass()) { gl_FragColor = vec4(1.0); return; }
  float depth = -heightAt(vWorld.xz);
  if (depth < -2.0) discard;
  vec2 w = vWorld.xz;
  float wave = n_value(w / 40.0 + vec2(uTime * 0.3, 0.0), 91.0) * 0.6 + n_value(w / 13.0 - vec2(0.0, uTime * 0.5), 93.0) * 0.4;
  vec3 n = normalize(vec3((wave - 0.5) * 0.25, 1.0, (n_value(w / 31.0 + uTime * 0.2, 95.0) - 0.5) * 0.25));
  vec3 v = normalize(cameraPosition - vWorld);
  float b = bayer4(gl_FragCoord.xy);
  float d = smoothstep(0.0, 60.0, depth + (b - 0.5) * 12.0);
  vec3 c = mix(uWater[2], mix(uWater[1], uWater[0], smoothstep(60.0, 400.0, depth)), d);
  float sh = mix(1.0 - uShadowDark * 0.7, 1.0, shadowAt(vWorld));
  c *= (uAmbient * 0.9 + uSunColor * uSunStrength * 0.35 * sh);
  float spec = pow(max(dot(reflect(-v, n), uSunDir), 0.0), 60.0) * sh;
  c += uSunColor * uSunStrength * step(b * 0.8 + 0.1, spec) * 0.7;
  float fres = pow(1.0 - max(v.y, 0.0), 4.0);
  c = mix(c, uSkyHorizon * 0.9, fres * 0.6);
  // Surf on the shore.
  if (depth < 4.0 && wave > 0.45 + depth * 0.08) c = mix(c, vec3(0.9), 0.6);
  gl_FragColor = vec4(applyFog(c, vWorld), 1.0);
}`);
}

// ---------------------------------------------------------------- trees
const SPECIES_USED = [['fir', 3], ['beech', 2], ['larch', 1]];
const TREE_R = 1300, TREE_CELL = 22, TREE_MAX = 9000;

function hashf(i, j, s) {
  let h = Math.imul(i, 374761393) ^ Math.imul(j, 668265263) ^ Math.imul(s, 2246822519);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

export class Land {
  constructor(renderer, scene) {
    this.renderer = renderer;
    this.group = new THREE.Group();
    scene.add(this.group);
    this.land = new THREE.Mesh(gridGeometry(), landMaterial());
    this.water = new THREE.Mesh(gridGeometry(), waterMaterial());
    for (const m of [this.land, this.water]) { m.frustumCulled = false; this.group.add(m); }
    this.center = new THREE.Vector2(1e9, 1e9);
    this.variants = [];
    this.treeAt = new THREE.Vector2(1e9, 1e9);
    this.treesOn = false;
  }

  // Trees: a few variants per species, near meshes are only used to bake.
  buildTrees(seed = 7) {
    for (const v of this.variants) { v.mesh.removeFromParent(); v.mesh.dispose(); v.imp.rt.dispose(); }
    this.variants = [];
    const bark = makeBranchMaterial(dataTexture(makeBarkTexture(3), true));
    for (const [sid, count] of SPECIES_USED) {
      const sp = SPECIES[sid];
      const atlas = dataTexture(makeLeafAtlas(sp.leaf, { tile: 32, seed: seed * 31 + sid.length }));
      const leafMat = makeLeafMaterial(atlas, sp.ramp);
      for (let i = 0; i < count; i++) {
        const tree = generateTree(sid, seed * 1000 + i * 17 + sid.length);
        const v = { species: sid, tree, branchGeo: buildBranchGeometry(tree, 1), leafGeo: tree.clusters.length ? buildLeafGeometry(tree, 32) : null, branchMat: bark, leafMat };
        v.imp = bakeImpostor(this.renderer, v, { views: 8, cellH: 48 });
        const geo = buildImpostorQuad();
        geo.setAttribute('aFade', new THREE.InstancedBufferAttribute(new Float32Array(TREE_MAX).fill(1), 1));
        v.mat = makeImpostorMaterial(v.imp);
        v.mesh = new THREE.InstancedMesh(geo, v.mat, TREE_MAX);
        v.mesh.frustumCulled = false;
        v.mesh.count = 0;
        this.group.add(v.mesh);
        this.variants.push(v);
      }
    }
    this.treeAt.set(1e9, 1e9);
  }

  rebake() {
    for (const v of this.variants) {
      v.imp.rt.dispose();
      v.imp = bakeImpostor(this.renderer, v, { views: 8, cellH: 48 });
      v.mat.uniforms.uAtlas.value = v.imp.texture;
    }
  }

  placeTrees(cx, cz) {
    this.treeAt.set(cx, cz);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
    const counts = this.variants.map(() => 0);
    const n = Math.ceil(TREE_R / TREE_CELL), gi = Math.round(cx / TREE_CELL), gj = Math.round(cz / TREE_CELL);
    for (let j = -n; j <= n; j++) for (let i = -n; i <= n; i++) {
      if (i * i + j * j > n * n) continue;
      const ci = gi + i, cj = gj + j;
      const x = (ci + hashf(ci, cj, 1)) * TREE_CELL, z = (cj + hashf(ci, cj, 2)) * TREE_CELL;
      const f = forestAt(x, z) - FOREST_MIN;
      if (f < hashf(ci, cj, 3) * 0.05) continue;
      const h = heightAt(x, z);
      if (h < 7 || h > TREELINE - hashf(ci, cj, 4) * 300) continue;
      if (Math.abs(heightAt(x + 25, z) - h) > 16 || Math.abs(heightAt(x, z + 25) - h) > 16) continue;   // too steep
      const k = Math.floor(hashf(ci, cj, 5) * this.variants.length);
      if (counts[k] >= TREE_MAX) continue;
      const sc = 0.8 + hashf(ci, cj, 6) * 0.6;
      q.setFromAxisAngle(up, hashf(ci, cj, 7) * 6.28);
      this.variants[k].mesh.setMatrixAt(counts[k]++, m.compose(p.set(x, h - 0.5, z), q, s.set(sc, sc, sc)));
    }
    this.variants.forEach((v, i) => { v.mesh.count = counts[i]; v.mesh.instanceMatrix.needsUpdate = true; });
  }

  update(camPos) {
    const cx = Math.round(camPos.x / SNAP) * SNAP, cz = Math.round(camPos.z / SNAP) * SNAP;
    if (cx !== this.center.x || cz !== this.center.y) {
      this.center.set(cx, cz);
      this.land.material.uniforms.uCenter.value.set(cx, cz);
      this.water.material.uniforms.uCenter.value.set(cx, cz);
    }
    // Trees only when low enough to see them; re-placed every few hundred metres.
    const agl = camPos.y - heightAt(camPos.x, camPos.z);
    const on = agl < 1800 && this.variants.length > 0;
    if (on !== this.treesOn) { this.treesOn = on; for (const v of this.variants) v.mesh.visible = on; }
    if (on && Math.hypot(camPos.x - this.treeAt.x, camPos.z - this.treeAt.y) > 280) this.placeTrees(camPos.x, camPos.z);
  }
}
