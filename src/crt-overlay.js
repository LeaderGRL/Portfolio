import { VERT } from './crt.js'

/* ========================================================================== *
 * Shared CRT overlay
 *
 * Native DOM/iframe/video surfaces remain interactive below this transparent
 * pass. Pixel-dependent optics (bloom and RGB separation) are handled by the
 * SVG filter on #display-surface; this shader supplies the screen-space effects
 * that do not need to sample the underlying content.
 * ========================================================================== */

const FRAG_OVERLAY = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 outColor;

uniform vec2 uOut;
uniform vec2 uCss;
uniform float uTime;
uniform float uStrength;
uniform float uStatic;
uniform float uDegauss;

float hash(vec2 p){
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}

void main(){
  float strength = clamp(uStrength, 0.0, 1.0);
  if (strength <= 0.001) {
    outColor = vec4(0.0);
    return;
  }

  vec2 uv = vUv;
  vec2 px = uv * max(uCss, vec2(1.0));

  // Match the visible terminal cadence rather than treating scanlines as a
  // decorative texture. CSS-pixel locking keeps the pitch stable across DPRs.
  float scanWave = 0.5 + 0.5 * cos(px.y / 2.05 * 6.2831853);
  float scan = pow(scanWave, 7.0);
  float dark = scan * 0.205;

  // A clearly visible but still restrained RGB grille. The terminal shader
  // modulates source pixels directly; on native DOM this transparent pass is
  // the closest physically coherent equivalent without flattening controls.
  float stripe = mod(px.x, 3.0);
  vec3 grille = stripe < 1.0 ? vec3(1.0, 0.18, 0.16)
              : stripe < 2.0 ? vec3(0.16, 1.0, 0.24)
                             : vec3(0.18, 0.28, 1.0);
  float grilleAlpha = 0.062;

  // Curved-face falloff. The photographic shade above remains the real glass
  // illumination, so this only supplies the electronic beam falloff.
  vec2 edge = abs(uv * 2.0 - 1.0);
  float radial = dot(uv - 0.5, uv - 0.5);
  float vignette = smoothstep(0.50, 1.02, max(edge.x, edge.y));
  dark += vignette * 0.145 + smoothstep(0.16, 0.44, radial) * 0.050;

  // Slow vertical brightness drift / retrace band.
  float beamY = fract(uTime * 0.047);
  float beam = exp(-pow((uv.y - beamY) * 21.0, 2.0));
  vec3 beamTint = vec3(0.20, 1.0, 0.42) * beam;
  float beamAlpha = beam * 0.034;

  // Fine analogue grain and occasional stronger route-change static.
  float grain = hash(floor(px) + floor(uTime * 52.0));
  float grainAlpha = (0.018 + uStatic * 0.105) * abs(grain - 0.5) * 2.0;
  vec3 grainTint = mix(vec3(0.015), vec3(0.30, 1.0, 0.48), grain);

  // A sparse horizontal interference line makes still screenshots read as a
  // live display instead of a green-themed webpage.
  float lineSeed = hash(vec2(floor(uTime * 12.0), 3.7));
  float lineY = fract(lineSeed * 7.13 + uTime * 0.19);
  float interference = exp(-abs(uv.y - lineY) * 380.0);
  float interferenceAlpha = interference * (0.014 + uStatic * 0.08);

  float wave = sin(uv.y * 54.0 + uTime * 32.0 + sin(uv.x * 19.0) * 2.0);
  float degaussAlpha = abs(wave) * 0.060 * uDegauss * uDegauss;
  vec3 degaussTint = vec3(0.18, 0.96, 0.44);

  float tintAlpha = grilleAlpha + beamAlpha + grainAlpha
                  + interferenceAlpha + degaussAlpha;
  float alpha = clamp((dark + tintAlpha) * strength, 0.0, 0.48);

  vec3 tint = grille * grilleAlpha
            + beamTint * beamAlpha
            + grainTint * grainAlpha
            + vec3(0.25, 1.0, 0.50) * interferenceAlpha
            + degaussTint * degaussAlpha;
  vec3 color = tintAlpha > 0.0001 ? tint / tintAlpha : vec3(0.0);

  float tintShare = tintAlpha / max(dark + tintAlpha, 0.0001);
  color *= clamp(tintShare * 1.22, 0.0, 1.0);

  outColor = vec4(color, alpha);
}`

export class CRTOverlay {
  constructor(canvas) {
    this.canvas = canvas
    this.ok = false
    this.strength = 0
    this.targetStrength = 0
    this.static = 0
    this.degauss = 0
    this.cssWidth = 1
    this.cssHeight = 1

    const gl = canvas?.getContext?.('webgl2', {
      alpha: true,
      antialias: false,
      premultipliedAlpha: false,
      powerPreference: 'low-power',
    })
    if (!gl) return

    this.gl = gl
    try {
      this._init()
      this.ok = true
    } catch (error) {
      console.warn('Shared CRT overlay init failed', error)
    }
  }

  _compile(type, source) {
    const gl = this.gl
    const shader = gl.createShader(type)
    gl.shaderSource(shader, source)
    gl.compileShader(shader)
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      throw new Error(gl.getShaderInfoLog(shader))
    }
    return shader
  }

  _init() {
    const gl = this.gl
    const program = gl.createProgram()
    gl.attachShader(program, this._compile(gl.VERTEX_SHADER, VERT))
    gl.attachShader(program, this._compile(gl.FRAGMENT_SHADER, FRAG_OVERLAY))
    gl.bindAttribLocation(program, 0, 'aPos')
    gl.linkProgram(program)
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      throw new Error(gl.getProgramInfoLog(program))
    }
    this.program = program

    const vao = gl.createVertexArray()
    gl.bindVertexArray(vao)
    const buffer = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer)
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW)
    gl.enableVertexAttribArray(0)
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0)
    this.vao = vao

    this.uniforms = {}
    for (const name of ['uOut', 'uCss', 'uTime', 'uStrength', 'uStatic', 'uDegauss']) {
      this.uniforms[name] = gl.getUniformLocation(program, name)
    }

    gl.enable(gl.BLEND)
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA)
  }

  resize(cssWidth, cssHeight, dpr = 1) {
    this.cssWidth = Math.max(1, cssWidth)
    this.cssHeight = Math.max(1, cssHeight)
    const scale = Math.min(Math.max(dpr || 1, 1), 1.5)
    const width = Math.max(1, Math.round(this.cssWidth * scale))
    const height = Math.max(1, Math.round(this.cssHeight * scale))
    if (this.canvas.width === width && this.canvas.height === height) return
    this.canvas.width = width
    this.canvas.height = height
  }

  setEnabled(enabled) {
    this.targetStrength = enabled ? 1 : 0
  }

  burstStatic(amount = 0.7) {
    this.static = Math.max(this.static, amount)
  }

  triggerDegauss() {
    this.degauss = 1
  }

  render(timeSeconds, dt) {
    if (!this.ok) return false

    const response = 1 - Math.pow(0.001, Math.max(0, dt) * 3.2)
    this.strength += (this.targetStrength - this.strength) * response
    this.static = Math.max(0, this.static - dt * 2.9)
    this.degauss = Math.max(0, this.degauss - dt * 1.15)

    if (this.strength < 0.001 && this.targetStrength === 0) {
      this.strength = 0
      const gl = this.gl
      gl.viewport(0, 0, this.canvas.width, this.canvas.height)
      gl.clearColor(0, 0, 0, 0)
      gl.clear(gl.COLOR_BUFFER_BIT)
      return false
    }

    const gl = this.gl
    gl.viewport(0, 0, this.canvas.width, this.canvas.height)
    gl.clearColor(0, 0, 0, 0)
    gl.clear(gl.COLOR_BUFFER_BIT)
    gl.useProgram(this.program)
    gl.bindVertexArray(this.vao)
    gl.uniform2f(this.uniforms.uOut, this.canvas.width, this.canvas.height)
    gl.uniform2f(this.uniforms.uCss, this.cssWidth, this.cssHeight)
    gl.uniform1f(this.uniforms.uTime, timeSeconds)
    gl.uniform1f(this.uniforms.uStrength, this.strength)
    gl.uniform1f(this.uniforms.uStatic, this.static)
    gl.uniform1f(this.uniforms.uDegauss, this.degauss)
    gl.drawArrays(gl.TRIANGLES, 0, 3)
    return true
  }
}
