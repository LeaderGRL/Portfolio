/**
 * @typedef {Object} DocumentTheme
 * @property {string} bg
 * @property {string} panel
 * @property {string} dim
 * @property {string} mid
 * @property {string} bright
 * @property {string} core
 * @property {string} amber
 * @property {string} glowInner
 * @property {string} glowOuter
 */

/** @type {Readonly<DocumentTheme>} */
const BASE = Object.freeze({
  bg: '#031009',
  panel: '#06170d',
  dim: '#167f45',
  mid: '#2fd06d',
  bright: '#6bf39a',
  core: '#b9ffc9',
  amber: '#ffb347',
  glowInner: 'rgba(16,64,36,.36)',
  glowOuter: 'rgba(2,10,5,0)',
})

/** @type {Readonly<Record<string, Readonly<DocumentTheme>>>} */
const THEMES = Object.freeze({
  default: BASE,
  synthwave: Object.freeze({
    ...BASE,
    bg: '#080713',
    panel: '#0d0b19',
    dim: '#4d4875',
    mid: '#66b7c7',
    bright: '#88e0df',
    core: '#d3fff8',
    amber: '#e86eaa',
    glowInner: 'rgba(76,49,112,.30)',
    glowOuter: 'rgba(8,7,19,0)',
  }),
  horror: Object.freeze({
    ...BASE,
    bg: '#0c0907',
    panel: '#120d0a',
    dim: '#5d4033',
    mid: '#9c684d',
    bright: '#d5a77c',
    core: '#f0d0a8',
    amber: '#c84d38',
    glowInner: 'rgba(92,43,28,.24)',
    glowOuter: 'rgba(12,9,7,0)',
  }),
})

/**
 * @param {unknown} name
 * @returns {Readonly<DocumentTheme>}
 */
export function getDocumentTheme(name) {
  return THEMES[String(name || '').toLowerCase()] || THEMES.default
}

/**
 * @param {unknown} name
 * @returns {boolean}
 */
export function hasDocumentTheme(name) {
  return Object.prototype.hasOwnProperty.call(THEMES, String(name || '').toLowerCase())
}

export { THEMES as DOCUMENT_THEMES }
