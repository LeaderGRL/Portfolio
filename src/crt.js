import { SRC_H, SRC_W } from './core.js'
import {
  CRT_CURSOR_SHAPE,
  DEFAULT_CRT_CURSOR_GPU_STATE,
  normalizeCrtCursorGpuState,
  rasterizeCrtCursorShape,
} from './crt-cursor-shape.js'
import {
  DEFAULT_CRT_GLASS_REACTION_STATE,
  normalizeCrtGlassReactionState,
} from './crt-cursor-reaction.js'

/* ==========================================================================
 * 6. CRT — WebGL2 phosphor persistence + composite
 * ======================================================================== */
export const VERT = `#version 300 es
in vec2 aPos;
out vec2 vUv;
void main(){ vUv = aPos * 0.5 + 0.5; gl_Position = vec4(aPos, 0.0, 1.0); }`;

/* Pass 1 — phosphor decay. Bright pixels linger, exactly like P1 green. */
export const FRAG_PERSIST = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 outColor;
uniform sampler2D uCur;
uniform sampler2D uPrev;
uniform float uDecay;
void main(){
  vec3 cur  = texture(uCur, vUv).rgb;
  vec3 prev = texture(uPrev, vUv).rgb * uDecay;
  outColor = vec4(max(cur, prev), 1.0);
}`;

/* Pass 2 — the tube itself. */
export const FRAG_CRT = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 outColor;

uniform sampler2D uTex;
uniform sampler2D uCursorTex;
uniform vec2  uOut;
uniform vec2  uSrc;
uniform float uTime;
uniform float uPower;
uniform float uCrt;
uniform float uDegauss;
uniform float uStatic;
uniform float uWarm;
uniform float uScanlines;
uniform float uCursorVisible;
uniform vec2  uCursorHotspot;
uniform float uCursorAngle;
uniform float uCursorSizePx;
uniform float uCursorCompression;
uniform float uCursorHover;
uniform float uCursorClick;
uniform float uCursorRecompose;
uniform vec2  uReactionHotspot;
uniform vec2  uReactionDirection;
uniform float uReactionStrength;
uniform float uReactionSubmerged;
uniform float uReactionRecoil;
uniform float uReactionRadiusPx;

const vec4 CURSOR_BOUNDS = vec4(
  ${CRT_CURSOR_SHAPE.bounds.minX},
  ${CRT_CURSOR_SHAPE.bounds.maxX},
  ${CRT_CURSOR_SHAPE.bounds.minY},
  ${CRT_CURSOR_SHAPE.bounds.maxY}
);

vec2 gCursorSignalHotspot;
vec2 gReactionSignalHotspot;

// ===========================================================================
// This shader got considerably smaller in this revision, and that is the
// point. It used to carry the tube's silhouette, its specular, its Fresnel
// rim and its surround, all derived by hand. None of that is here now:
//
//   the silhouette   is the alpha channel of the bezel render sitting on top
//   the shading      is a map extracted from the glass render, multiplied
//   the specular     is a map extracted from the same render, screened
//
// What remains is the part no render can supply, because it has to be
// computed every frame from live content: beam, phosphor, geometry, and the
// behaviour of the tube as it is switched on and off.
// ===========================================================================

float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123); }

float noise(vec2 p){
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1,0)), f.x),
             mix(hash(i + vec2(0,1)), hash(i + vec2(1,1)), f.x), f.y);
}

// Barrel distortion. Real tubes are spherical sections, not planes, and this
// still has to happen here: the glass maps are static, so only the sampling
// can make the picture follow the bulge.
vec2 curve(vec2 uv){
  uv = uv * 2.0 - 1.0;
  vec2 o = abs(uv.yx) / vec2(5.4, 4.2);
  uv += uv * o * o * uCrt;
  return uv * 0.5 + 0.5;
}

// One mapping function owns the live tube transform for display sampling,
// cursor hotspot and local glass reaction.
vec2 signalUv(vec2 uv){
  float vS = smoothstep(0.22, 1.0, uPower);
  float hS = smoothstep(0.0, 0.22, uPower);
  vec2 c = uv - 0.5;
  c.y /= max(vS, 1e-4);
  c.x /= max(hS, 1e-4);
  uv = c + 0.5;

  if (uDegauss > 0.001){
    float d = uDegauss;
    uv.x += sin(uv.y * 46.0 + uTime * 34.0) * 0.016 * d * d;
    uv.y += cos(uv.x * 31.0 + uTime * 26.0) * 0.010 * d * d;
  }
  uv.y += sin(uTime * 0.35) * 0.0006 * uCrt;
  return curve(uv);
}

float reactionWeight(vec2 suv){
  vec2 deltaPx = (suv - gReactionSignalHotspot) * uOut;
  float radiusPx = max(uReactionRadiusPx, 1.0);
  float q = dot(deltaPx, deltaPx) / (radiusPx * radiusPx);
  return exp(-q * 3.25);
}

vec2 reactionWarp(vec2 suv){
  float weight = reactionWeight(suv);
  vec2 deltaPx = (suv - gReactionSignalHotspot) * uOut;
  float distancePx = length(deltaPx);
  vec2 radial = distancePx > 0.001 ? deltaPx / distancePx : vec2(0.0);
  float inwardPx = uReactionStrength * 1.85 + uReactionRecoil * 1.10;
  vec2 displacementPx = uReactionDirection * inwardPx * weight
    + radial * uReactionSubmerged * 0.45 * weight;
  return suv - displacementPx / max(uOut, vec2(1.0));
}

vec2 cursorLocalPx(vec2 suv){
  vec2 p = (suv - gCursorSignalHotspot) * uOut;
  float c = cos(uCursorAngle);
  float s = sin(uCursorAngle);
  vec2 local = vec2(c * p.x + s * p.y, -s * p.x + c * p.y);

  float recomposeScale = 1.0 + uCursorRecompose * 0.08;
  vec2 squash = vec2(
    max(0.68, 1.0 - uCursorCompression * 0.18 - uCursorClick * 0.08),
    max(0.76, 1.0 - uCursorCompression * 0.08 - uCursorClick * 0.10)
  );
  return local / (max(uCursorSizePx, 1.0) * recomposeScale * squash);
}

vec3 cursorEmission(vec2 suv){
  vec2 local = cursorLocalPx(suv);
  vec2 shapeUv = vec2(
    (local.x - CURSOR_BOUNDS.x) / (CURSOR_BOUNDS.y - CURSOR_BOUNDS.x),
    (local.y - CURSOR_BOUNDS.z) / (CURSOR_BOUNDS.w - CURSOR_BOUNDS.z)
  );
  if (shapeUv.x <= 0.0 || shapeUv.x >= 1.0 || shapeUv.y <= 0.0 || shapeUv.y >= 1.0) {
    return vec3(0.0);
  }

  vec4 shape = texture(uCursorTex, shapeUv);
  float energy = 1.0
    + uCursorHover * 0.22
    + uCursorClick * 0.46
    + uCursorRecompose * 0.24;
  return shape.rgb * shape.a * energy;
}

// Reaction bends only the persisted source under the glass. Cursor emission
// stays unwarped so the visible arrow tip remains the exact browser hotspot.
vec3 src(vec2 suv){
  vec3 base = texture(uTex, reactionWarp(suv)).rgb;
  if (uCursorVisible < 0.5) return base;
  return base + cursorEmission(suv);
}

vec3 bloom(vec2 suv, float r){
  vec3 s = vec3(0.0);
  const int N = 10;
  for (int i = 0; i < N; i++){
    float a = (float(i) + 0.5) / float(N) * 6.2831853;
    vec2 d = vec2(cos(a), sin(a));
    s += src(suv + d * r);
    s += src(suv + d * r * 0.45);
  }
  return s / float(N * 2);
}

void main(){
  float vS = smoothstep(0.22, 1.0, uPower);
  float hS = smoothstep(0.0, 0.22, uPower);

  // Display pixels, cursor hotspot and reaction share signal-space mapping.
  vec2 suv = signalUv(vUv);
  gCursorSignalHotspot = signalUv(uCursorHotspot);
  gReactionSignalHotspot = signalUv(uReactionHotspot);

  // ---- chromatic aberration, stronger toward the edges -------------------
  vec2 off = suv - 0.5;
  float ab = (0.0015 + dot(off, off) * 0.010) * uCrt;
  vec3 col;
  col.r = src(suv + off * ab).r;
  col.g = src(suv).g;
  col.b = src(suv - off * ab).b;

  // A real electron beam loses focus progressively toward the rim. Smear
  // along the tube radius rather than applying a uniform blur, preserving the
  // crisp centre and avoiding the flat, digitally sharp corners of a canvas.
  float rr = dot(off, off);
  float defocus = smoothstep(0.05, 0.30, rr) * uCrt;
  if (defocus > 0.001) {
    vec2 dir = normalize(off + vec2(1e-5)) * (0.0022 + rr * 0.006) * defocus;
    vec3 smear = src(suv + dir)
               + src(suv - dir)
               + src(suv + dir * 2.0)
               + src(suv - dir * 2.0);
    col = mix(col, smear * 0.25, defocus * 0.62);
  }

  // Horizontal overshoot gives bright glyph edges the slight analogue ring
  // produced by the video amplifier without shifting the underlying layout.
  float lead  = src(suv - vec2(1.35 / uSrc.x, 0.0)).g;
  float trail = src(suv + vec2(1.35 / uSrc.x, 0.0)).g;
  col += vec3(0.72, 1.0, 0.82) * (col.g - lead) * 0.30 * uCrt;
  col -= vec3(0.55, 0.80, 0.62) * max(trail - col.g, 0.0) * 0.16 * uCrt;

  // ---- glow --------------------------------------------------------------
  col += bloom(suv, 0.006 + 0.004 * uCrt) * (0.55 + 0.35 * uCrt);
  col += bloom(suv, 0.020) * 0.28 * uCrt;
  col += bloom(suv, 0.055) * vec3(0.30, 0.40, 0.34) * 0.55 * uCrt;

  // Keep the original tube's beam count independently of source resolution.
  // The radial term curves scanlines even for left/right entries where the
  // physical inward normal has no vertical component.
  float reactionMask = reactionWeight(suv);
  vec2 reactionDeltaPx = (suv - gReactionSignalHotspot) * uOut;
  float reactionVertical = clamp(reactionDeltaPx.y / max(uReactionRadiusPx, 1.0), -1.0, 1.0);
  float scanBendPx = reactionMask
    * (uReactionStrength * 1.25 + uReactionRecoil * 0.70)
    * (reactionVertical + uReactionDirection.y * 0.35);
  float scanY = suv.y + scanBendPx / max(uOut.y, 1.0);
  float scanWave = 0.5 + 0.5 * cos(scanY * uScanlines * 6.2831853);
  float scan = pow(scanWave, 7.0);
  col *= mix(1.0, 1.0 - scan * 0.20, uCrt);

  // Tiny directional cues suggest the glass surface indenting while preserving
  // the authored shade/gloss stack above this canvas.
  float normalCoord = dot(reactionDeltaPx, uReactionDirection) / max(uReactionRadiusPx, 1.0);
  float lightSide = max(-normalCoord, 0.0) * reactionMask;
  float shadowSide = max(normalCoord, 0.0) * reactionMask;
  col += vec3(0.10, 0.28, 0.15) * lightSide * uReactionStrength * 0.16;
  col *= 1.0 - shadowSide * uReactionStrength * 0.055;
  col *= 1.0 + reactionMask * uReactionStrength * 0.050;
  col *= 1.0 - reactionMask * uReactionSubmerged * 0.075;

  // ---- aperture grille ---------------------------------------------------
  float m = mod(vUv.x * uOut.x, 3.0);
  vec3 grille = m < 1.0 ? vec3(1.06, 0.72, 0.72)
              : m < 2.0 ? vec3(0.72, 1.06, 0.72)
                        : vec3(0.72, 0.72, 1.06);
  col *= mix(vec3(1.0), grille, uCrt * 0.32);

  col *= 1.0 + (sin(uTime * 100.0) * 0.008 + noise(vec2(uTime * 8.0, 0.0)) * 0.02) * uCrt;

  if (uStatic > 0.001){
    float n = hash(vUv * uOut + uTime * 60.0);
    float band = step(0.965, hash(vec2(floor(vUv.y * 40.0), floor(uTime * 22.0))));
    col = mix(col, vec3(n) * vec3(0.55, 1.0, 0.7), uStatic * (0.35 + band * 0.5));
  }

  col += (hash(vUv * uOut + uTime) - 0.5) * 0.020 * uCrt;

  col *= mix(1.6, 1.0, uWarm);
  col = mix(col, col * vec3(0.7, 1.0, 0.8), 1.0 - uWarm);

  // Shallow beam falloff only. The glass render's own shading supplies the
  // real edge darkening on the layer above, so doing it again here would
  // double the vignette and crush the corners. It follows the raster, not the
  // glass: beyond the picture the beam never lands, so the falloff simply
  // holds its edge value there and the surround reads as unlit phosphor.
  vec2 ruv = clamp(suv, 0.0, 1.0);
  vec2 vg = ruv * (1.0 - ruv.yx);
  col *= mix(1.0, pow(clamp(vg.x * vg.y * 90.0, 0.0, 1.0), 0.10), 0.35 * uCrt + 0.10);

  // ---- collapse flash: the line and dot a tube leaves behind --------------
  float lineGlow = (1.0 - vS) * hS * exp(-abs(vUv.y - 0.5) * 220.0) * 1.2;
  float dotGlow  = (1.0 - hS) * exp(-length((vUv - 0.5) * vec2(uOut.x / uOut.y, 1.0)) * 90.0) * 1.6;
  col += vec3(0.75, 1.0, 0.85) * (lineGlow + dotGlow);

  outColor = vec4(max(col, 0.0), 1.0);
}`;

const REACTIVE_SRC_BLOCK = `vec3 src(vec2 suv){
  vec3 base = texture(uTex, reactionWarp(suv)).rgb;
  if (uCursorVisible < 0.5) return base;
  return base + cursorEmission(suv);
}`;
const BASE_SCAN_BLOCK = `  float scanWave = 0.5 + 0.5 * cos(suv.y * uScanlines * 6.2831853);
  float scan = pow(scanWave, 7.0);
  col *= mix(1.0, 1.0 - scan * 0.20, uCrt);`;
const REACTION_SCAN_BLOCK = `  float reactionMask = reactionWeight(suv);
  vec2 reactionDeltaPx = (suv - gReactionSignalHotspot) * uOut;
  float reactionVertical = clamp(reactionDeltaPx.y / max(uReactionRadiusPx, 1.0), -1.0, 1.0);
  float scanBendPx = reactionMask
    * (uReactionStrength * 1.25 + uReactionRecoil * 0.70)
    * (reactionVertical + uReactionDirection.y * 0.35);
  float scanY = suv.y + scanBendPx / max(uOut.y, 1.0);
  float scanWave = 0.5 + 0.5 * cos(scanY * uScanlines * 6.2831853);
  float scan = pow(scanWave, 7.0);
  col *= mix(1.0, 1.0 - scan * 0.20, uCrt);

  // Tiny directional cues suggest the glass surface indenting while preserving
  // the authored shade/gloss stack above this canvas.
  float normalCoord = dot(reactionDeltaPx, uReactionDirection) / max(uReactionRadiusPx, 1.0);
  float lightSide = max(-normalCoord, 0.0) * reactionMask;
  float shadowSide = max(normalCoord, 0.0) * reactionMask;
  col += vec3(0.10, 0.28, 0.15) * lightSide * uReactionStrength * 0.16;
  col *= 1.0 - shadowSide * uReactionStrength * 0.055;
  col *= 1.0 + reactionMask * uReactionStrength * 0.050;
  col *= 1.0 - reactionMask * uReactionSubmerged * 0.075;`;
const CURSOR_HOTSPOT_LINE = '  gCursorSignalHotspot = signalUv(uCursorHotspot);\n';
const REACTION_HOTSPOT_LINE = '  gReactionSignalHotspot = signalUv(uReactionHotspot);\n';

// Keep ordinary CRT frames on a program with no reachable cursor/reaction
// sampling. Chromium software WebGL pays measurable cost for work inside every
// bloom/defocus source sample even when the corresponding strength is zero.
export const FRAG_CRT_BASE = FRAG_CRT
  .replace(REACTIVE_SRC_BLOCK, 'vec3 src(vec2 suv){ return texture(uTex, suv).rgb; }')
  .replace(REACTION_SCAN_BLOCK, BASE_SCAN_BLOCK)
  .replace(CURSOR_HOTSPOT_LINE, '')
  .replace(REACTION_HOTSPOT_LINE, '');

export class CRT {
  constructor(canvas, source) {
    this.canvas = canvas;
    this.source = source;
    this.ok = false;
    this.cursorState = DEFAULT_CRT_CURSOR_GPU_STATE;
    this.reactionState = DEFAULT_CRT_GLASS_REACTION_STATE;
    this.cursorResourceInitCount = 0;
    this.outputDensity = 1;
    this.maxDimension = 4096; // Canvas-only fallback keeps the application cap.
    const gl = canvas.getContext("webgl2", {
      alpha: false, antialias: false, premultipliedAlpha: false,
      powerPreference: "high-performance",
    });
    if (!gl) return;
    this.gl = gl;
    try {
      const limit = value => Number.isFinite(value) && value > 0 ? value : 2048;
      const viewport = gl.getParameter(gl.MAX_VIEWPORT_DIMS);
      this.maxDimension = Math.min(4096,
        limit(gl.getParameter(gl.MAX_TEXTURE_SIZE)),
        limit(gl.getParameter(gl.MAX_RENDERBUFFER_SIZE)),
        limit(viewport?.[0]), limit(viewport?.[1]));
      this._init();
      this.ok = true;
    } catch (e) { this._fail(e); }
  }

  setCursorState(value = {}) {
    this.cursorState = normalizeCrtCursorGpuState(value, this.cursorState);
    return this.cursorState;
  }

  getCursorState() {
    return this.cursorState;
  }

  setReactionState(value = {}) {
    this.reactionState = normalizeCrtGlassReactionState(value, this.reactionState);
    return this.reactionState;
  }

  getReactionState() {
    return this.reactionState;
  }

  _syncOutputDensity(fallbackDensity = 1) {
    const cssW = Number(this.canvas.offsetWidth);
    const cssH = Number(this.canvas.offsetHeight);
    const xDensity = cssW > 0 ? this.canvas.width / cssW : Number.NaN;
    const yDensity = cssH > 0 ? this.canvas.height / cssH : Number.NaN;
    const measured = [xDensity, yDensity].filter(value => Number.isFinite(value) && value > 0);
    this.outputDensity = measured.length ? Math.min(...measured) : fallbackDensity;
  }

  _fail(error) {
    this.ok = false;
    const gl = this.gl;
    for (const target of [this.a, this.b]) this._deleteTarget(target);
    this.a = this.b = null;
    if (this.srcTex) gl.deleteTexture(this.srcTex);
    if (this.cursorTex) gl.deleteTexture(this.cursorTex);
    this.srcTex = this.cursorTex = null;
    if (this.buf) gl.deleteBuffer(this.buf);
    if (this.vao) gl.deleteVertexArray(this.vao);
    if (this.progPersist) gl.deleteProgram(this.progPersist);
    if (this.progCrtBase) gl.deleteProgram(this.progCrtBase);
    if (this.progCrt) gl.deleteProgram(this.progCrt);
    console.warn('CRT unavailable; using the live 2D source', error);
  }

  _deleteTarget(target) {
    if (!target) return;
    this.gl.deleteFramebuffer(target.fb);
    this.gl.deleteTexture(target.tex);
  }

  _compile(type, src) {
    const gl = this.gl, s = gl.createShader(type);
    gl.shaderSource(s, src); gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
      const message = gl.getShaderInfoLog(s);
      gl.deleteShader(s);
      throw new Error(message);
    }
    return s;
  }

  _program(vs, fs) {
    const gl = this.gl, p = gl.createProgram();
    const shaders = [];
    try {
      shaders.push(this._compile(gl.VERTEX_SHADER, vs));
      shaders.push(this._compile(gl.FRAGMENT_SHADER, fs));
      for (const shader of shaders) gl.attachShader(p, shader);
      gl.bindAttribLocation(p, 0, "aPos");
      gl.linkProgram(p);
      if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
      return p;
    } catch (error) {
      gl.deleteProgram(p);
      throw error;
    } finally {
      for (const shader of shaders) gl.deleteShader(shader);
    }
  }

  _target(w, h) {
    const gl = this.gl;
    if (w > this.maxDimension || h > this.maxDimension) throw new Error('CRT texture exceeds GPU limit');
    const tex = gl.createTexture();
    if (!tex) throw new Error('CRT texture allocation failed');
    let fb;
    try {
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      fb = gl.createFramebuffer();
      if (!fb) throw new Error('CRT framebuffer allocation failed');
      gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
      if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE || gl.getError() !== gl.NO_ERROR) {
        throw new Error('CRT framebuffer is incomplete');
      }
      return { tex, fb };
    } catch (error) {
      if (fb) gl.deleteFramebuffer(fb);
      gl.deleteTexture(tex);
      throw error;
    } finally {
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    }
  }

  _initCursorTexture() {
    const gl = this.gl;
    const tex = gl.createTexture();
    if (!tex) throw new Error('CRT cursor texture allocation failed');
    try {
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
      gl.texImage2D(
        gl.TEXTURE_2D,
        0,
        gl.RGBA,
        CRT_CURSOR_SHAPE.textureSize,
        CRT_CURSOR_SHAPE.textureSize,
        0,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        rasterizeCrtCursorShape(),
      );
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      if (gl.getError() !== gl.NO_ERROR) throw new Error('CRT cursor texture allocation failed');
      this.cursorResourceInitCount += 1;
      return tex;
    } catch (error) {
      gl.deleteTexture(tex);
      throw error;
    }
  }

  _uniforms(program, names) {
    const uniforms = {};
    for (const name of names) uniforms[name] = this.gl.getUniformLocation(program, name);
    return uniforms;
  }

  _init() {
    const gl = this.gl;

    this.progPersist = this._program(VERT, FRAG_PERSIST);
    this.progCrtBase = this._program(VERT, FRAG_CRT_BASE);
    this.progCrt = this._program(VERT, FRAG_CRT);

    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);
    const buf = gl.createBuffer();
    this.buf = buf;
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    this.vao = vao;

    this.cursorTex = this._initCursorTexture();

    // source texture: NEAREST magnification is what makes the pixels square
    this.srcTex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.srcTex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);

    this.a = this._target(SRC_W, SRC_H);
    this.b = this._target(SRC_W, SRC_H);
    this.sourceWidth = SRC_W;
    this.sourceHeight = SRC_H;
    this.sourceUploaded = false;

    this.uPersist = {
      cur: gl.getUniformLocation(this.progPersist, "uCur"),
      prev: gl.getUniformLocation(this.progPersist, "uPrev"),
      decay: gl.getUniformLocation(this.progPersist, "uDecay"),
    };
    const commonUniforms = [
      "uTex","uOut","uSrc","uTime","uPower","uCrt","uDegauss","uStatic","uWarm","uScanlines",
    ];
    this.uBase = this._uniforms(this.progCrtBase, commonUniforms);
    this.u = this._uniforms(this.progCrt, [
      ...commonUniforms,
      "uCursorTex","uCursorVisible","uCursorHotspot","uCursorAngle","uCursorSizePx","uCursorCompression","uCursorHover","uCursorClick","uCursorRecompose",
      "uReactionHotspot","uReactionDirection","uReactionStrength","uReactionSubmerged","uReactionRecoil","uReactionRadiusPx",
    ]);
  }

  resize(cssW, cssH, dpr) {
    const density = Math.min(dpr, this.maxDimension / Math.max(cssW, cssH));
    const w = Math.max(1, Math.floor(cssW * density));
    const h = Math.max(1, Math.floor(cssH * density));
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w; this.canvas.height = h;
    }
    this._syncOutputDensity(density);
  }

  render(state, sourceDirty) {
    if (!this.ok) return false;
    const gl = this.gl;
    gl.bindVertexArray(this.vao);

    const sw = this.source.width || SRC_W, sh = this.source.height || SRC_H;
    const resized = this.sourceWidth !== sw || this.sourceHeight !== sh;
    try {
      if (resized) {
        const a = this._target(sw, sh);
        let b;
        try { b = this._target(sw, sh); }
        catch (error) { this._deleteTarget(a); throw error; }
        this._deleteTarget(this.a);
        this._deleteTarget(this.b);
        this.a = a;
        this.b = b;
        this.sourceWidth = sw;
        this.sourceHeight = sh;
        sourceDirty = true;
      }

      if (sourceDirty || !this.sourceUploaded) {
        gl.bindTexture(gl.TEXTURE_2D, this.srcTex);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, this.source);
        // Check actual allocation, not every video frame (getError can stall).
        if ((resized || !this.sourceUploaded) && gl.getError() !== gl.NO_ERROR) {
          throw new Error('CRT source texture allocation failed');
        }
        this.sourceUploaded = true;
      }
    } catch (error) {
      this._fail(error);
      return false;
    }

    // --- persistence pass: b = max(src, a * decay) ---
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.b.fb);
    gl.viewport(0, 0, sw, sh);
    gl.useProgram(this.progPersist);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, this.srcTex);
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, this.a.tex);
    gl.uniform1i(this.uPersist.cur, 0);
    gl.uniform1i(this.uPersist.prev, 1);
    gl.uniform1f(this.uPersist.decay, state.crt > 0.5 ? 0.72 : 0.0);
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    const tmp = this.a; this.a = this.b; this.b = tmp;   // ping-pong

    // --- composite pass ---
    const cursor = this.cursorState;
    const reaction = this.reactionState;
    const cursorVisible = Boolean(cursor.visible);
    const reactionActive = Boolean(reaction.active);
    const effectsActive = cursorVisible || reactionActive;
    const program = effectsActive ? this.progCrt : this.progCrtBase;
    const u = effectsActive ? this.u : this.uBase;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.useProgram(program);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, this.a.tex);
    gl.uniform1i(u.uTex, 0);
    gl.uniform2f(u.uOut, this.canvas.width, this.canvas.height);
    gl.uniform2f(u.uSrc, sw, sh);
    gl.uniform1f(u.uScanlines, SRC_H);
    gl.uniform1f(u.uTime, state.time);
    gl.uniform1f(u.uPower, state.power);
    gl.uniform1f(u.uCrt, state.crt);
    gl.uniform1f(u.uDegauss, state.degauss);
    gl.uniform1f(u.uStatic, state.static);
    gl.uniform1f(u.uWarm, state.warm);

    if (effectsActive) {
      gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, this.cursorTex);
      gl.uniform1i(u.uCursorTex, 2);
      gl.uniform1f(u.uCursorVisible, cursorVisible ? 1 : 0);
      gl.uniform2f(u.uCursorHotspot, cursor.hotspotUv.x, cursor.hotspotUv.y);
      gl.uniform1f(u.uCursorAngle, cursor.angle);
      gl.uniform1f(u.uCursorSizePx, cursor.sizePx * this.outputDensity);
      gl.uniform1f(u.uCursorCompression, cursor.compression);
      gl.uniform1f(u.uCursorHover, cursor.hoverIntensity);
      gl.uniform1f(u.uCursorClick, cursor.clickImpulse);
      gl.uniform1f(u.uCursorRecompose, cursor.recompositionStrength);

      gl.uniform2f(u.uReactionHotspot, reaction.hotspotUv.x, reaction.hotspotUv.y);
      gl.uniform2f(u.uReactionDirection, reaction.direction.x, reaction.direction.y);
      gl.uniform1f(u.uReactionStrength, reactionActive ? reaction.strength : 0);
      gl.uniform1f(u.uReactionSubmerged, reactionActive ? reaction.submergedStrength : 0);
      gl.uniform1f(u.uReactionRecoil, reactionActive ? reaction.recoilStrength : 0);
      gl.uniform1f(u.uReactionRadiusPx, reaction.radiusPx * this.outputDensity);
    }

    gl.drawArrays(gl.TRIANGLES, 0, 3);
    return true;
  }
}
