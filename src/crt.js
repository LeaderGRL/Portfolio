import { SRC_H, SRC_W, clamp, now } from './core.js'

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
uniform vec2  uOut;
uniform vec2  uSrc;
uniform float uTime;
uniform float uPower;
uniform float uCrt;
uniform float uDegauss;
uniform float uStatic;
uniform float uWarm;
uniform float uFullscreen;

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

// Every provider paints the whole glass. Clamping continues its background
// at the very edge of the shallow curvature, without a second picture border.
vec3 src(vec2 suv){ return texture(uTex, suv).rgb; }

// Barrel distortion. Real tubes are spherical sections, not planes, and this
// still has to happen here: the glass maps are static, so only the sampling
// can make the picture follow the bulge.
vec2 curve(vec2 uv){
  uv = uv * 2.0 - 1.0;
  vec2 o = abs(uv.yx) / vec2(5.4, 4.2);
  uv += uv * o * o * uCrt * mix(1.0, 0.12, uFullscreen);
  return uv * 0.5 + 0.5;
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
  vec2 uv = vUv;

  // ---- power collapse: vertical squeeze first, then horizontal to a dot ---
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
  uv.y += sin(uTime * 0.35) * 0.0006 * uCrt * (1.0 - uFullscreen);

  vec2 cuv = curve(uv);

  // The fullscreen source is already laid out at viewport resolution. Its
  // optics use physical pixels so blur never grows with the window size.
  vec2 suv = cuv;

  // ---- chromatic aberration, stronger toward the edges -------------------
  vec2 off = suv - 0.5;
  float ab = mix(0.0015 + dot(off, off) * 0.010, 0.35 / max(uOut.x, 1.0), uFullscreen) * uCrt;
  vec3 col;
  col.r = src(suv + off * ab).r;
  col.g = src(suv).g;
  col.b = src(suv - off * ab).b;

  // A real electron beam loses focus progressively toward the rim. Smear
  // along the tube radius rather than applying a uniform blur, preserving the
  // crisp centre and avoiding the flat, digitally sharp corners of a canvas.
  float rr = dot(off, off);
  float defocus = smoothstep(0.05, 0.30, rr) * uCrt * (1.0 - uFullscreen);
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
  if (uFullscreen > 0.5) {
    // A physical-pixel halo, not a glyph-sized blur. Four neighbouring taps
    // keep full-viewport rendering affordable without sacrificing the source.
    vec2 px = 1.2 / uOut;
    vec3 halo = (src(suv + vec2(px.x, 0.0)) + src(suv - vec2(px.x, 0.0))
               + src(suv + vec2(0.0, px.y)) + src(suv - vec2(0.0, px.y))) * 0.25;
    col += max(halo - vec3(0.12), vec3(0.0)) * 0.14 * uCrt;
  } else {
    col += bloom(suv, 0.006 + 0.004 * uCrt) * (0.55 + 0.35 * uCrt);
    col += bloom(suv, 0.020) * 0.28 * uCrt;
    col += bloom(suv, 0.055) * vec3(0.30, 0.40, 0.34) * 0.55 * uCrt;
  }

  // ---- scanlines locked to the source line count -------------------------
  float scanWave = 0.5 + 0.5 * cos(mix(suv.y * uSrc.y, vUv.y * uOut.y / 3.0, uFullscreen) * 6.2831853);
  float scan = pow(scanWave, 7.0);
  col *= mix(1.0, 1.0 - scan * mix(0.20, 0.075, uFullscreen), uCrt);

  // ---- aperture grille ---------------------------------------------------
  float m = mod(vUv.x * uOut.x, 3.0);
  vec3 grille = m < 1.0 ? vec3(1.06, 0.72, 0.72)
              : m < 2.0 ? vec3(0.72, 1.06, 0.72)
                        : vec3(0.72, 0.72, 1.06);
  col *= mix(vec3(1.0), grille, uCrt * mix(0.32, 0.12, uFullscreen));

  col *= 1.0 + (sin(uTime * 100.0) * 0.008 + noise(vec2(uTime * 8.0, 0.0)) * 0.02) * uCrt;

  if (uStatic > 0.001){
    float n = hash(vUv * uOut + uTime * 60.0);
    float band = step(0.965, hash(vec2(floor(vUv.y * 40.0), floor(uTime * 22.0))));
    col = mix(col, vec3(n) * vec3(0.55, 1.0, 0.7), uStatic * (0.35 + band * 0.5));
  }

  col += (hash(vUv * uOut + uTime) - 0.5) * mix(0.020, 0.004, uFullscreen) * uCrt;

  col *= mix(1.6, 1.0, uWarm);
  col = mix(col, col * vec3(0.7, 1.0, 0.8), 1.0 - uWarm);

  // Shallow beam falloff only. The glass render's own shading supplies the
  // real edge darkening on the layer above, so doing it again here would
  // double the vignette and crush the corners. It follows the raster, not the
  // glass: beyond the picture the beam never lands, so the falloff simply
  // holds its edge value there and the surround reads as unlit phosphor.
  vec2 ruv = clamp(suv, 0.0, 1.0);
  vec2 vg = ruv * (1.0 - ruv.yx);
  col *= mix(1.0, pow(clamp(vg.x * vg.y * 90.0, 0.0, 1.0), 0.10), (0.35 * uCrt + 0.10) * (1.0 - uFullscreen));

  // ---- collapse flash: the line and dot a tube leaves behind --------------
  float lineGlow = (1.0 - vS) * hS * exp(-abs(vUv.y - 0.5) * 220.0) * 1.2;
  float dotGlow  = (1.0 - hS) * exp(-length((vUv - 0.5) * vec2(uOut.x / uOut.y, 1.0)) * 90.0) * 1.6;
  col += vec3(0.75, 1.0, 0.85) * (lineGlow + dotGlow);

  outColor = vec4(max(col, 0.0), 1.0);
}`;

export class CRT {
  constructor(canvas, source) {
    this.canvas = canvas;
    this.source = source;
    this.ok = false;
    const gl = canvas.getContext("webgl2", {
      alpha: false, antialias: false, premultipliedAlpha: false,
      powerPreference: "high-performance",
    });
    if (!gl) return;
    this.gl = gl;
    try { this._init(); this.ok = true; } catch (e) { console.warn("CRT init failed", e); }
  }

  _compile(type, src) {
    const gl = this.gl, s = gl.createShader(type);
    gl.shaderSource(s, src); gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
    return s;
  }

  _program(vs, fs) {
    const gl = this.gl, p = gl.createProgram();
    gl.attachShader(p, this._compile(gl.VERTEX_SHADER, vs));
    gl.attachShader(p, this._compile(gl.FRAGMENT_SHADER, fs));
    gl.bindAttribLocation(p, 0, "aPos");
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
    return p;
  }

  _target(w, h) {
    const gl = this.gl;
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    const fb = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    return { tex, fb };
  }

  _init() {
    const gl = this.gl;

    this.progPersist = this._program(VERT, FRAG_PERSIST);
    this.progCrt = this._program(VERT, FRAG_CRT);

    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    this.vao = vao;

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

    this.uPersist = {
      cur: gl.getUniformLocation(this.progPersist, "uCur"),
      prev: gl.getUniformLocation(this.progPersist, "uPrev"),
      decay: gl.getUniformLocation(this.progPersist, "uDecay"),
    };
    this.u = {};
    for (const n of ["uTex","uOut","uSrc","uTime","uPower","uCrt","uDegauss","uStatic","uWarm","uFullscreen"]) {
      this.u[n] = gl.getUniformLocation(this.progCrt, n);
    }
  }

  resize(cssW, cssH, dpr) {
    const w = Math.max(1, Math.round(cssW * dpr));
    const h = Math.max(1, Math.round(cssH * dpr));
    if (this.canvas.width === w && this.canvas.height === h) return;
    this.canvas.width = w; this.canvas.height = h;
  }

  render(state, sourceDirty) {
    const gl = this.gl;
    gl.bindVertexArray(this.vao);

    const sw = this.source.width || SRC_W, sh = this.source.height || SRC_H;
    if (this.sourceWidth !== sw || this.sourceHeight !== sh) {
      for (const target of [this.a, this.b]) {
        gl.deleteFramebuffer(target.fb);
        gl.deleteTexture(target.tex);
      }
      this.a = this._target(sw, sh);
      this.b = this._target(sw, sh);
      this.sourceWidth = sw;
      this.sourceHeight = sh;
      sourceDirty = true;
    }

    if (sourceDirty) {
      gl.bindTexture(gl.TEXTURE_2D, this.srcTex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, this.source);
    }

    // --- persistence pass: b = max(src, a * decay) ---
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.b.fb);
    gl.viewport(0, 0, sw, sh);
    gl.useProgram(this.progPersist);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, this.srcTex);
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, this.a.tex);
    gl.uniform1i(this.uPersist.cur, 0);
    gl.uniform1i(this.uPersist.prev, 1);
    gl.uniform1f(this.uPersist.decay, state.crt > 0.5 ? (state.fullscreen ? 0.12 : 0.72) : 0.0);
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    const tmp = this.a; this.a = this.b; this.b = tmp;   // ping-pong

    // --- composite pass ---
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.useProgram(this.progCrt);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, this.a.tex);
    gl.uniform1i(this.u.uTex, 0);
    gl.uniform2f(this.u.uOut, this.canvas.width, this.canvas.height);
    gl.uniform2f(this.u.uSrc, sw, sh);
    gl.uniform1f(this.u.uFullscreen, state.fullscreen ? 1 : 0);
    gl.uniform1f(this.u.uTime, state.time);
    gl.uniform1f(this.u.uPower, state.power);
    gl.uniform1f(this.u.uCrt, state.crt);
    gl.uniform1f(this.u.uDegauss, state.degauss);
    gl.uniform1f(this.u.uStatic, state.static);
    gl.uniform1f(this.u.uWarm, state.warm);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }
}
