import { SRC_H, SRC_W } from './core.js'
import { CRT, FRAG_CRT, VERT } from './crt.js'
import {
  DEFAULT_CRT_GLASS_REACTION_STATE,
  normalizeCrtGlassReactionState,
} from './crt-cursor-reaction.js'

const COMMON_UNIFORMS = [
  'uTex','uOut','uSrc','uTime','uPower','uCrt','uDegauss','uStatic','uWarm','uScanlines',
]

function replaceRequired(source, needle, replacement) {
  if (!source.includes(needle)) throw new Error(`CRT reaction shader marker missing: ${needle.slice(0, 48)}`)
  return source.replace(needle, replacement)
}

export function buildReactionFragmentShader(baseSource = FRAG_CRT) {
  let source = baseSource
  source = replaceRequired(
    source,
    'uniform float uCursorRecompose;\n',
    `uniform float uCursorRecompose;\nuniform vec2  uReactionHotspot;\nuniform vec2  uReactionDirection;\nuniform float uReactionStrength;\nuniform float uReactionSubmerged;\nuniform float uReactionRecoil;\nuniform float uReactionRadiusPx;\n`,
  )
  source = replaceRequired(
    source,
    'vec2 gCursorSignalHotspot;\n',
    'vec2 gCursorSignalHotspot;\nvec2 gReactionSignalHotspot;\n',
  )
  source = replaceRequired(
    source,
    'vec2 cursorLocalPx(vec2 suv){',
    `float reactionWeight(vec2 suv){\n  vec2 deltaPx = (suv - gReactionSignalHotspot) * uOut;\n  float radiusPx = max(uReactionRadiusPx, 1.0);\n  float q = dot(deltaPx, deltaPx) / (radiusPx * radiusPx);\n  return exp(-q * 3.25);\n}\n\nvec2 reactionWarp(vec2 suv){\n  float weight = reactionWeight(suv);\n  vec2 deltaPx = (suv - gReactionSignalHotspot) * uOut;\n  float distancePx = length(deltaPx);\n  vec2 radial = distancePx > 0.001 ? deltaPx / distancePx : vec2(0.0);\n  float inwardPx = uReactionStrength * 1.85 + uReactionRecoil * 1.10;\n  vec2 displacementPx = uReactionDirection * inwardPx * weight\n    + radial * uReactionSubmerged * 0.45 * weight;\n  return suv - displacementPx / max(uOut, vec2(1.0));\n}\n\nvec2 cursorLocalPx(vec2 suv){`,
  )
  source = replaceRequired(
    source,
    `vec3 src(vec2 suv){\n  vec3 base = texture(uTex, suv).rgb;\n  if (uCursorVisible < 0.5) return base;\n  return base + cursorEmission(suv);\n}`,
    `vec3 src(vec2 suv){\n  vec3 base = texture(uTex, reactionWarp(suv)).rgb;\n  if (uCursorVisible < 0.5) return base;\n  // The source bends under the glass, but the pointer tip remains the exact\n  // browser hotspot. Cursor emission therefore stays in unwarped signal UV.\n  return base + cursorEmission(suv);\n}`,
  )
  source = replaceRequired(
    source,
    '  gCursorSignalHotspot = signalUv(uCursorHotspot);\n',
    '  gCursorSignalHotspot = signalUv(uCursorHotspot);\n  gReactionSignalHotspot = signalUv(uReactionHotspot);\n',
  )
  source = replaceRequired(
    source,
    `  float scanWave = 0.5 + 0.5 * cos(suv.y * uScanlines * 6.2831853);\n  float scan = pow(scanWave, 7.0);\n  col *= mix(1.0, 1.0 - scan * 0.20, uCrt);`,
    `  float reactionMask = reactionWeight(suv);\n  float scanBendPx = reactionMask\n    * (uReactionStrength * 1.25 + uReactionRecoil * 0.70)\n    * uReactionDirection.y;\n  float scanY = suv.y + scanBendPx / max(uOut.y, 1.0);\n  float scanWave = 0.5 + 0.5 * cos(scanY * uScanlines * 6.2831853);\n  float scan = pow(scanWave, 7.0);\n  col *= mix(1.0, 1.0 - scan * 0.20, uCrt);\n\n  // A tiny directional highlight/shadow pair sells local glass indentation.\n  // It stays under the authored shade/gloss layers and never changes hitboxes.\n  vec2 reactionDeltaPx = (suv - gReactionSignalHotspot) * uOut;\n  float normalCoord = dot(reactionDeltaPx, uReactionDirection) / max(uReactionRadiusPx, 1.0);\n  float lightSide = max(-normalCoord, 0.0) * reactionMask;\n  float shadowSide = max(normalCoord, 0.0) * reactionMask;\n  col += vec3(0.10, 0.28, 0.15) * lightSide * uReactionStrength * 0.16;\n  col *= 1.0 - shadowSide * uReactionStrength * 0.055;\n  col *= 1.0 + reactionMask * uReactionStrength * 0.050;\n  col *= 1.0 - reactionMask * uReactionSubmerged * 0.075;`,
  )
  return source
}

export const FRAG_CRT_REACTION = buildReactionFragmentShader()

export class CRTReactive extends CRT {
  _init() {
    super._init()
    this.reactionState = DEFAULT_CRT_GLASS_REACTION_STATE
    this.progCrtReaction = this._program(VERT, FRAG_CRT_REACTION)
    this.uReaction = this._uniforms(this.progCrtReaction, [
      ...COMMON_UNIFORMS,
      'uCursorTex','uCursorVisible','uCursorHotspot','uCursorAngle','uCursorSizePx','uCursorCompression','uCursorHover','uCursorClick','uCursorRecompose',
      'uReactionHotspot','uReactionDirection','uReactionStrength','uReactionSubmerged','uReactionRecoil','uReactionRadiusPx',
    ])
  }

  setReactionState(value = {}) {
    this.reactionState = normalizeCrtGlassReactionState(value, this.reactionState)
    return this.reactionState
  }

  getReactionState() {
    return this.reactionState || DEFAULT_CRT_GLASS_REACTION_STATE
  }

  _fail(error) {
    if (this.progCrtReaction && this.gl) this.gl.deleteProgram(this.progCrtReaction)
    this.progCrtReaction = null
    super._fail(error)
  }

  render(state, sourceDirty) {
    const reaction = this.getReactionState()
    if (!reaction.active) return super.render(state, sourceDirty)
    if (!this.ok) return false

    const gl = this.gl
    gl.bindVertexArray(this.vao)
    const sw = this.source.width || SRC_W
    const sh = this.source.height || SRC_H
    const resized = this.sourceWidth !== sw || this.sourceHeight !== sh

    try {
      if (resized) {
        const a = this._target(sw, sh)
        let b
        try { b = this._target(sw, sh) }
        catch (error) { this._deleteTarget(a); throw error }
        this._deleteTarget(this.a)
        this._deleteTarget(this.b)
        this.a = a
        this.b = b
        this.sourceWidth = sw
        this.sourceHeight = sh
        sourceDirty = true
      }

      if (sourceDirty || !this.sourceUploaded) {
        gl.bindTexture(gl.TEXTURE_2D, this.srcTex)
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, this.source)
        if ((resized || !this.sourceUploaded) && gl.getError() !== gl.NO_ERROR) {
          throw new Error('CRT source texture allocation failed')
        }
        this.sourceUploaded = true
      }
    } catch (error) {
      this._fail(error)
      return false
    }

    // Persistence never sees the reaction or cursor. Both remain final-pass
    // phenomena so neither can leave a phosphor trail or dirty the source.
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.b.fb)
    gl.viewport(0, 0, sw, sh)
    gl.useProgram(this.progPersist)
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, this.srcTex)
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, this.a.tex)
    gl.uniform1i(this.uPersist.cur, 0)
    gl.uniform1i(this.uPersist.prev, 1)
    gl.uniform1f(this.uPersist.decay, state.crt > 0.5 ? 0.72 : 0.0)
    gl.drawArrays(gl.TRIANGLES, 0, 3)

    const tmp = this.a; this.a = this.b; this.b = tmp

    const u = this.uReaction
    const cursor = this.cursorState
    const cursorVisible = Boolean(cursor.visible)
    gl.bindFramebuffer(gl.FRAMEBUFFER, null)
    gl.viewport(0, 0, this.canvas.width, this.canvas.height)
    gl.useProgram(this.progCrtReaction)
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, this.a.tex)
    gl.uniform1i(u.uTex, 0)
    gl.uniform2f(u.uOut, this.canvas.width, this.canvas.height)
    gl.uniform2f(u.uSrc, sw, sh)
    gl.uniform1f(u.uScanlines, SRC_H)
    gl.uniform1f(u.uTime, state.time)
    gl.uniform1f(u.uPower, state.power)
    gl.uniform1f(u.uCrt, state.crt)
    gl.uniform1f(u.uDegauss, state.degauss)
    gl.uniform1f(u.uStatic, state.static)
    gl.uniform1f(u.uWarm, state.warm)

    gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, this.cursorTex)
    gl.uniform1i(u.uCursorTex, 2)
    gl.uniform1f(u.uCursorVisible, cursorVisible ? 1 : 0)
    gl.uniform2f(u.uCursorHotspot, cursor.hotspotUv.x, cursor.hotspotUv.y)
    gl.uniform1f(u.uCursorAngle, cursor.angle)
    gl.uniform1f(u.uCursorSizePx, cursor.sizePx * this.outputDensity)
    gl.uniform1f(u.uCursorCompression, cursor.compression)
    gl.uniform1f(u.uCursorHover, cursor.hoverIntensity)
    gl.uniform1f(u.uCursorClick, cursor.clickImpulse)
    gl.uniform1f(u.uCursorRecompose, cursor.recompositionStrength)

    gl.uniform2f(u.uReactionHotspot, reaction.hotspotUv.x, reaction.hotspotUv.y)
    gl.uniform2f(u.uReactionDirection, reaction.direction.x, reaction.direction.y)
    gl.uniform1f(u.uReactionStrength, reaction.strength)
    gl.uniform1f(u.uReactionSubmerged, reaction.submergedStrength)
    gl.uniform1f(u.uReactionRecoil, reaction.recoilStrength)
    gl.uniform1f(u.uReactionRadiusPx, reaction.radiusPx * this.outputDensity)

    gl.drawArrays(gl.TRIANGLES, 0, 3)
    return true
  }
}

// Keep the composition-root import terse while preserving the public class
// name used throughout the rest of the application.
export { CRTReactive as CRT }
