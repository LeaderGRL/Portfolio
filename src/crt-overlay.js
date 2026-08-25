import { VERT } from './crt.js'

/* ========================================================================== *
 * Shared CRT overlay
 *
 * The terminal raster already owns a full post-process shader. DOM and future
 * interactive surfaces cannot be sampled safely by WebGL without flattening
 * their native controls, so this renderer draws only the optical/noise layer
 * on a transparent canvas above them. It never captures the surface below.
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

  // Fine scanlines remain tied to CSS pixels so DPR changes do not change the
  // perceived pitch of the tube.
  float scanWave = 0.5 + 0.5 * cos(px.y / 2.15 * 6.2831853);
  float scan = pow(scanWave, 8.0);
  float dark = scan * 0.105;

  // Aperture grille. This is intentionally subtle on authored media: it should
  // make the glass feel electronic without hiding screenshots or source code.
  float stripe = mod(px.x, 3.0);
  vec3 grille = stripe < 1.0 ? vec3(1.0, 0.30, 0.28)
              : stripe < 2.0 ? vec3(0.28, 1.0, 0.36)
                             : vec3(0.30, 0.42, 1.0);
  float grilleAlpha = 0.026;

  // Shallow vignette and a slowly drifting beam band sell the curved faceplate
  // while the photographic glass above remains responsible for the real shape.
  vec2 edge = abs(uv * 2.0 - 1.0);
  float vignette = smoothstep(0.56, 1.08, max(edge.x, edge.y));
  dark += vignette * 0.090;

  float beamY = fract(uTime * 0.055);
  float beam = exp(-pow((uv.y - beamY) * 18.0, 2.0));
  vec3 beamTint = vec3(0.22, 1.0, 0.44) * beam;
  float beamAlpha = beam * 0.020;

  // Stable low-level grain, with a short stronger burst when the display mode
  // changes. Static is deliberately procedural so live video/iframes remain
  // untouched and interactive under the effect layer.
  float grain = hash(floor(px) + floor(uTime * 48.0));
  float grainAlpha = (0.010 + uStatic * 0.075) * abs(grain - 0.5) * 2.0;
  vec3 grainTint = mix(vec3(0.0), vec3(0.35, 1.0, 0.52), grain);

  // Degauss cannot warp the DOM beneath this transparent layer, but a brief
  // moving interference pattern keeps power-on visually coherent with the
  // terminal shader until a future capture-capable surface is mounted.
  float wave = sin(uv.y * 54.0 + uTime * 32.0 + sin(uv.x * 19.0) * 2.0);
  float degaussAlpha = abs(wave) * 0.048 * uDegauss * uDegauss;
  vec3 degaussTint = vec3(0.20, 0.95, 0.48);

  float tintAlpha = grilleAlpha + beamAlpha + grainAlpha + degaussAlpha;
  float alpha = clamp((dark + tintAlpha) * strength, 0.0, 0.34);

  vec3 tint = grille * grilleAlpha
            + beamTint * beamAlpha
            + grainTint * grainAlpha
            + degaussTint * degaussAlpha;
  vec3 color = tintAlpha > 0.0001 ? tint / tintAlpha : vec3(0.0);

  // Dark components are represented by black contribution in the same alpha
  // blend. Keeping the overlay in one pass avoids a second full-screen canvas.
  float tintShare = tintAlpha / max(dark + tintAlpha, 0.0001);
  color *= clamp(tintShare * 1.35, 0.0, 1.0);

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
