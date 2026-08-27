/**
 * Interaction pass: drives every control, shortcut and scroll path the panel
 * exposes, with WebGL mocked so the real pipeline runs, and fails on any
 * uncaught error.
 *
 * smoke.mjs proves the page boots and every route renders. This proves the
 * controls do not throw once someone actually uses them and guards the mobile
 * fit/keyboard-boundary regressions found during the production audit.
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
    console.log('  '+name.padEnd(32), errors.length>b ? 'THREW '+errors[b].slice(0,80) : 'ok') }
  const click=el=>el&&el.dispatchEvent(new w.MouseEvent('click',{bubbles:true}))
  const key=k=>w.document.dispatchEvent(new w.KeyboardEvent('keydown',{key:k,bubbles:true,cancelable:true}))
  const targetKey=(el,k)=>el.dispatchEvent(new w.KeyboardEvent('keydown',{key:k,bubbles:true,cancelable:true}))
  const fit=()=>Number(d.documentElement.style.getPropertyValue('--fit'))
  const near=(actual,expected,epsilon=0.0002)=>Math.abs(actual-expected)<=epsilon

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
  step('arrow navigation',       ()=>{key('3');key('ArrowDown');key('ArrowDown');key('ArrowUp')})
  step('panel click keeps arrows live', ()=>{
      const projects=[...d.querySelectorAll('#nav-keys .key')].find(el=>el.getAttribute('aria-label')==='PROJECTS')
      if(!projects) throw new Error('projects panel key missing')
      projects.focus()
      click(projects)
      if(d.activeElement===projects) throw new Error('projects key kept DOM focus after activation')
      if(w.location.pathname!=='/projects') throw new Error('projects route did not open from panel click')
      key('ArrowDown')
      key('Enter')
      if(w.location.pathname==='/projects') throw new Error('ArrowDown was ignored after panel click')
      key('Escape')
    })
  step('interactive key boundary', ()=>{
      key('3')
      if(w.location.pathname!=='/projects') throw new Error('projects route did not open')
      const slider=d.getElementById('volume')
      const before=slider.getAttribute('aria-valuenow')
      targetKey(slider,'ArrowDown')
      const after=slider.getAttribute('aria-valuenow')
      if(before===after) throw new Error('volume did not handle its own ArrowDown')
      if(w.location.pathname!=='/projects') throw new Error('slider ArrowDown leaked into terminal navigation')
      targetKey(slider,'Enter')
      if(w.location.pathname!=='/projects') throw new Error('slider Enter leaked into terminal open action')
    })
  step('enter then escape',      ()=>{key('Enter');key('Escape')})
  step('scroll keys on detail',  ()=>{key('Enter');key('PageDown');key('End');key('Home');key('Escape')})
  step('wheel on tube',          ()=>{key('Enter')
      d.getElementById('tube').dispatchEvent(new w.WheelEvent('wheel',{deltaY:120,bubbles:true,cancelable:true}))})
  step('phone compact contain fit', ()=>{
      Object.defineProperty(w,'innerWidth',{value:420,configurable:true})
      Object.defineProperty(w,'innerHeight',{value:900,configurable:true})
      w.dispatchEvent(new w.Event('resize'))
      const expected=Math.min(420/941,900/1672)
      if(!near(fit(),expected)) throw new Error('phone compact fit is not contain: '+fit())
    })
  step('tablet compact contain fit', ()=>{
      Object.defineProperty(w,'innerWidth',{value:768,configurable:true})
      Object.defineProperty(w,'innerHeight',{value:1024,configurable:true})
      w.dispatchEvent(new w.Event('resize'))
      const expected=Math.min(768/941,1024/1672)
      if(!near(fit(),expected)) throw new Error('tablet compact fit crops the chassis: '+fit())
    })
  step('resize back',            ()=>{Object.defineProperty(w,'innerWidth',{value:1440,configurable:true})
      Object.defineProperty(w,'innerHeight',{value:900,configurable:true}); w.dispatchEvent(new w.Event('resize'))})
  step('desktop cover fit',      ()=>{Object.defineProperty(w,'innerWidth',{value:1848,configurable:true})
      Object.defineProperty(w,'innerHeight',{value:928,configurable:true}); w.dispatchEvent(new w.Event('resize'))
      if(!near(fit(),0.9625,0.0001)) throw new Error('desktop fit is not full-bleed cover: '+fit())})
  step('P toggles power',        ()=>{key('p');key('p')})
  step('C toggles crt',          ()=>{key('c');key('c')})

  console.log('\n  machine class :', d.getElementById('machine').className)
  console.log('  pathname      :', w.location.pathname)
  console.log('  live region   :', d.getElementById('live').textContent.replace(/\s+/g,' ').slice(0,60)+'...')
  console.log(errors.length? '\n  '+errors.length+' ERROR(S):\n   '+[...new Set(errors)].join('\n   ')
                           : '\n  no uncaught errors across any interaction')
  process.exit(errors.length?1:0)
},600)