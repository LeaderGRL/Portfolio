/**
 * Interaction pass: drives every control, shortcut and scroll path the panel
 * exposes, with WebGL mocked so the real pipeline runs, and fails on any
 * uncaught error.
 *
 * smoke.mjs proves the page boots and every route renders. This proves the
 * controls do not throw once someone actually uses them — the volume drag
 * calling an unguarded setPointerCapture would never have shown up otherwise.
 *
 *   npm run build && node tools/interactions.mjs
 */
import { JSDOM } from 'jsdom'
import fs from 'node:fs'
const html = fs.readFileSync('dist/index.html', 'utf8')
const dom = new JSDOM(html, { runScripts: 'outside-only', pretendToBeVisual: true, url: 'http://localhost/' })
const w = dom.window
w.matchMedia = () => ({ matches: false, addEventListener(){}, removeEventListener(){}, addListener(){}, removeListener(){} })
w.devicePixelRatio = 1
Object.defineProperty(w,'innerWidth',{value:1440,configurable:true})
Object.defineProperty(w,'innerHeight',{value:900,configurable:true})
const obj=t=>({__t:t})
const gl=new Proxy({FRAMEBUFFER_COMPLETE:36053,createShader:()=>obj('s'),createProgram:()=>obj('p'),
 createBuffer:()=>obj('b'),createTexture:()=>obj('t'),createFramebuffer:()=>obj('f'),createVertexArray:()=>obj('v'),
 getShaderParameter:()=>true,getProgramParameter:()=>true,checkFramebufferStatus:()=>36053,
 getShaderInfoLog:()=>'',getProgramInfoLog:()=>'',getUniformLocation:(_,n)=>({n}),getAttribLocation:()=>0,
 getExtension:()=>null,getParameter:()=>4096},
 {get:(t,k)=>k in t?t[k]:(typeof k==='string'&&/^[A-Z0-9_]+$/.test(k)?1:()=>{})})
w.HTMLCanvasElement.prototype.getContext=function(t){
  if(t==='webgl2') return gl
  if(t==='webgl') return null
  const noop=()=>{}
  return new Proxy({},{get:(_,k)=>{
    if(k==='measureText')return()=>({width:6})
    if(k==='createRadialGradient'||k==='createLinearGradient')return()=>({addColorStop:noop})
    if(k==='getImageData')return()=>({data:new Uint8ClampedArray(4),width:1,height:1})
    if(k==='canvas')return{width:480,height:360}
    return noop},set:()=>true})
}
w.AudioContext=w.webkitAudioContext=undefined
const errors=[]
w.addEventListener('error',e=>errors.push(e.message)); w.onerror=m=>{errors.push(String(m));return true}
try{ w.eval(html.match(/<script type="module">([\s\S]*?)<\/script>/)[1]) }catch(e){ errors.push(e.message) }

setTimeout(()=>{
  const d=w.document
  const step=(name,fn)=>{ const b=errors.length; try{fn()}catch(e){errors.push(e.message)}
    console.log('  '+name.padEnd(26), errors.length>b ? 'THREW '+errors[b].slice(0,80) : 'ok') }
  const click=el=>el&&el.dispatchEvent(new w.MouseEvent('click',{bubbles:true}))
  const key=k=>w.document.dispatchEvent(new w.KeyboardEvent('keydown',{key:k,bubbles:true}))

  step('CRT effects switch off', ()=>click(d.getElementById('crt-switch')))
  step('CRT effects switch on',  ()=>click(d.getElementById('crt-switch')))
  step('power initially on',     ()=>{const p=d.getElementById('power')
      if(!p.classList.contains('is-on')||p.getAttribute('aria-pressed')!=='true') throw new Error('power visual state is not initially on')})
  step('first click powers off', ()=>{const p=d.getElementById('power');click(p)
      if(p.classList.contains('is-on')||p.getAttribute('aria-pressed')!=='false') throw new Error('first click did not move rocker off')})
  step('second click powers on', ()=>{const p=d.getElementById('power');click(p)
      if(!p.classList.contains('is-on')||p.getAttribute('aria-pressed')!=='true') throw new Error('second click did not restore rocker on')})
  step('volume drag',            ()=>{const s=d.getElementById('volume')
      s.dispatchEvent(new w.MouseEvent('pointerdown',{bubbles:true,clientX:100}))
      s.dispatchEvent(new w.MouseEvent('pointerup',{bubbles:true,clientX:140}))})
  step('digit shortcuts 1-5',    ()=>{for(const n of '12345') key(n)})
  step('arrow navigation',       ()=>{key('ArrowDown');key('ArrowDown');key('ArrowUp')})
  step('enter then escape',      ()=>{key('Enter');key('Escape')})
  step('scroll keys on detail',  ()=>{key('Enter');key('PageDown');key('End');key('Home');key('Escape')})
  step('wheel on tube',          ()=>{key('Enter')
      d.getElementById('tube').dispatchEvent(new w.WheelEvent('wheel',{deltaY:120,bubbles:true,cancelable:true}))})
  step('resize to compact',      ()=>{Object.defineProperty(w,'innerWidth',{value:420,configurable:true})
      Object.defineProperty(w,'innerHeight',{value:900,configurable:true}); w.dispatchEvent(new w.Event('resize'))})
  step('resize back',            ()=>{Object.defineProperty(w,'innerWidth',{value:1440,configurable:true})
      w.dispatchEvent(new w.Event('resize'))})
  step('desktop cover fit',      ()=>{Object.defineProperty(w,'innerWidth',{value:1848,configurable:true})
      Object.defineProperty(w,'innerHeight',{value:928,configurable:true}); w.dispatchEvent(new w.Event('resize'))
      const fit=Number(d.documentElement.style.getPropertyValue('--fit'))
      if(Math.abs(fit-0.9625)>0.0001) throw new Error('desktop fit is not full-bleed cover: '+fit)})
  step('P toggles power',        ()=>{key('p');key('p')})
  step('C toggles crt',          ()=>{key('c');key('c')})

  console.log('\n  compact class :', d.getElementById('machine').className)
  console.log('  live region   :', d.getElementById('live').textContent.replace(/\s+/g,' ').slice(0,60)+'...')
  console.log(errors.length? '\n  '+errors.length+' ERROR(S):\n   '+[...new Set(errors)].join('\n   ')
                           : '\n  no uncaught errors across any interaction')
  process.exit(errors.length?1:0)
},600)
