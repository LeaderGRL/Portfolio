/**
 * Interaction pass: drives every control, shortcut and scroll path the panel
 * exposes, with WebGL mocked so the real pipeline runs, and fails on any
 * uncaught error.
 */
import { JSDOM, VirtualConsole } from 'jsdom'
import fs from 'node:fs'
const html = fs.readFileSync('dist/index.html', 'utf8')
// jsdom has no media pipeline; the video integration that mounts once a
// project detail sits open long enough calls HTMLMediaElement.load, which
// jsdom reports as "not implemented". That is expected here and not a
// runtime error, so keep it out of the log while still surfacing anything else.
const virtualConsole = new VirtualConsole()
virtualConsole.sendTo(console, { omitJSDOMErrors: true })
virtualConsole.on('jsdomError', e => { if (!/Not implemented/.test(String(e?.message))) console.error(e) })
const dom = new JSDOM(html, { runScripts: 'outside-only', pretendToBeVisual: true, url: 'http://localhost/', virtualConsole })
const w = dom.window
w.matchMedia = () => ({ matches: false, addEventListener(){}, removeEventListener(){}, addListener(){}, removeListener(){} })
w.devicePixelRatio = 1
w.scrollBy = () => {}
w.scrollTo = () => {}
w.HTMLElement.prototype.scrollBy = function scrollBy(optionsOrX, y) {
  if (typeof optionsOrX === 'object') this.scrollTop += Number(optionsOrX?.top || 0)
  else this.scrollTop += Number(y || 0)
}
w.HTMLElement.prototype.scrollTo = function scrollTo(optionsOrX, y) {
  if (typeof optionsOrX === 'object') this.scrollTop = Number(optionsOrX?.top || 0)
  else this.scrollTop = Number(y || 0)
}
Object.defineProperty(w,'innerWidth',{value:1440,configurable:true})
Object.defineProperty(w,'innerHeight',{value:900,configurable:true})
const obj=t=>({__t:t})
const gl=new Proxy({FRAMEBUFFER_COMPLETE:36053,createShader:()=>obj('s'),createProgram:()=>obj('p'),
 createBuffer:()=>obj('b'),createTexture:()=>obj('t'),createFramebuffer:()=>obj('f'),createVertexArray:()=>obj('v'),
 getShaderParameter:()=>true,getProgramParameter:()=>true,checkFramebufferStatus:()=>36053,
 getShaderInfoLog:()=>'',getProgramInfoLog:()=>'',getUniformLocation:(_,n)=>({n}),getAttribLocation:()=>0,
 NO_ERROR:0,getError:()=>0,
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

setTimeout(async()=>{
  const d=w.document
  const slider=d.getElementById('volume')
  Object.defineProperty(slider,'clientWidth',{value:180,configurable:true})
  Object.defineProperty(slider,'offsetWidth',{value:180,configurable:true})
  slider.getBoundingClientRect=()=>({left:0,right:180,top:0,bottom:24,width:180,height:24,x:0,y:0,toJSON(){}})

  const step=(name,fn)=>{ const b=errors.length; try{fn()}catch(e){errors.push(e.message)}
    console.log('  '+name.padEnd(32), errors.length>b ? 'THREW '+errors[b].slice(0,80) : 'ok') }
  // Same contract for steps that must observe a MutationObserver or history
  // settling: those resolve on a later task in jsdom, as in browsers.
  const tick=()=>new Promise(r=>setTimeout(r,20))
  const astep=async(name,fn)=>{ const b=errors.length; try{await fn()}catch(e){errors.push(e.message)}
    console.log('  '+name.padEnd(32), errors.length>b ? 'THREW '+errors[b].slice(0,80) : 'ok') }
  const click=el=>el&&el.dispatchEvent(new w.MouseEvent('click',{bubbles:true}))
  const key=k=>w.document.dispatchEvent(new w.KeyboardEvent('keydown',{key:k,bubbles:true,cancelable:true}))
  const targetKey=(el,k)=>el.dispatchEvent(new w.KeyboardEvent('keydown',{key:k,bubbles:true,cancelable:true}))
  const fit=()=>Number(d.documentElement.style.getPropertyValue('--fit'))
  const near=(actual,expected,epsilon=0.0002)=>Math.abs(actual-expected)<=epsilon

  step('CRT effects switch off', ()=>click(d.getElementById('crt-switch')))
  step('CRT effects switch on',  ()=>click(d.getElementById('crt-switch')))
  step('power initially on',     ()=>{const p=d.getElementById('power');if(!p.classList.contains('is-on')||p.getAttribute('aria-pressed')!=='true') throw new Error('power visual state is not initially on')})
  step('first click powers off', ()=>{const p=d.getElementById('power');click(p);if(p.classList.contains('is-on')||p.getAttribute('aria-pressed')!=='false') throw new Error('first click did not move rocker off')})
  step('second click powers on', ()=>{const p=d.getElementById('power');click(p);if(!p.classList.contains('is-on')||p.getAttribute('aria-pressed')!=='true') throw new Error('second click did not restore rocker on')})
  step('volume drag', ()=>{slider.dispatchEvent(new w.MouseEvent('pointerdown',{bubbles:true,clientX:100}));slider.dispatchEvent(new w.MouseEvent('pointerup',{bubbles:true,clientX:140}))})
  step('digit shortcuts 1-5', ()=>{for(const n of '12345') key(n)})
  step('arrow navigation', ()=>{key('3');key('ArrowDown');key('ArrowDown');key('ArrowUp')})
  step('panel click keeps arrows live', ()=>{
    const projects=[...d.querySelectorAll('#nav-keys .key')].find(el=>el.getAttribute('aria-label')==='PROJECTS')
    if(!projects) throw new Error('projects panel key missing')
    projects.focus(); click(projects)
    if(d.activeElement===projects) throw new Error('projects key kept DOM focus after activation')
    if(w.location.pathname!=='/projects') throw new Error('projects route did not open from panel click')
    key('ArrowDown'); key('Enter')
    if(w.location.pathname==='/projects') throw new Error('ArrowDown was ignored after panel click')
    key('Escape')
  })
  step('interactive key boundary', ()=>{
    key('3')
    if(w.location.pathname!=='/projects') throw new Error('projects route did not open')
    const before=slider.getAttribute('aria-valuenow')
    targetKey(slider,'ArrowDown')
    const after=slider.getAttribute('aria-valuenow')
    if(before===after) throw new Error('volume did not handle its own ArrowDown')
    if(w.location.pathname!=='/projects') throw new Error('slider ArrowDown leaked into terminal navigation')
    targetKey(slider,'Enter')
    if(w.location.pathname!=='/projects') throw new Error('slider Enter leaked into terminal open action')
  })
  step('enter then escape', ()=>{key('Enter');key('Escape')})
  step('scroll keys on detail', ()=>{key('Enter');key('PageDown');key('End');key('Home');key('Escape')})
  step('wheel on tube', ()=>{key('Enter');d.getElementById('tube').dispatchEvent(new w.WheelEvent('wheel',{deltaY:120,bubbles:true,cancelable:true}))})
  step('phone compact contain fit', ()=>{Object.defineProperty(w,'innerWidth',{value:420,configurable:true});Object.defineProperty(w,'innerHeight',{value:900,configurable:true});w.dispatchEvent(new w.Event('resize'));if(!near(fit(),Math.min(420/941,900/1672))) throw new Error('phone compact fit is not contain: '+fit())})
  step('tablet compact contain fit', ()=>{Object.defineProperty(w,'innerWidth',{value:768,configurable:true});Object.defineProperty(w,'innerHeight',{value:1024,configurable:true});w.dispatchEvent(new w.Event('resize'));if(!near(fit(),Math.min(768/941,1024/1672))) throw new Error('tablet compact fit crops the chassis: '+fit())})
  step('resize back', ()=>{Object.defineProperty(w,'innerWidth',{value:1440,configurable:true});Object.defineProperty(w,'innerHeight',{value:900,configurable:true});w.dispatchEvent(new w.Event('resize'))})
  step('desktop cover fit', ()=>{Object.defineProperty(w,'innerWidth',{value:1848,configurable:true});Object.defineProperty(w,'innerHeight',{value:928,configurable:true});w.dispatchEvent(new w.Event('resize'));if(!near(fit(),0.9625,0.0001)) throw new Error('desktop fit is not full-bleed cover: '+fit())})
  step('P toggles power', ()=>{key('p');key('p')})
  step('C toggles crt', ()=>{key('c');key('c')})

  // Full screen: an accessibility mode that hides the chassis and enlarges
  // the raster. It must be reachable from the physical switch, from F, and
  // it must give Escape back to the browser/user before Escape means BACK.
  const fullscreenOn=()=>d.body.classList.contains('is-crt-fullscreen')
  const setNativeFullscreen=(el)=>{Object.defineProperty(d,'fullscreenElement',{value:el,configurable:true});d.dispatchEvent(new w.Event('fullscreenchange'))}
  step('full screen switch on', ()=>{
    const sw=d.getElementById('fullscreen-switch')
    if(!sw||sw.getAttribute('role')!=='switch') throw new Error('full screen switch missing')
    click(sw)
    if(sw.getAttribute('aria-checked')!=='true') throw new Error('switch did not report ON')
    if(!fullscreenOn()) throw new Error('body did not enter full screen layout')
    const tube=d.getElementById('tube')
    for(const name of ['--raster-x','--raster-y','--raster-base-w','--raster-base-h','--raster-k']){
      if(!tube.style.getPropertyValue(name)) throw new Error('raster geometry not published: '+name)
    }
  })
  step('raster layers are tagged', ()=>{
    for(const sel of ['#fallback2d','#article-source','.display-surface','.document-inline-integrations','#media-inspect-hires']){
      const el=d.querySelector(sel)
      if(!el) throw new Error(sel+' missing')
      if(!el.classList.contains('raster-layer')) throw new Error(sel+' is not a raster layer')
    }
    key('5')
    const links=d.querySelector('.terminal-contact-links')
    if(!links||!links.classList.contains('raster-layer')) throw new Error('contact link layer is not a raster layer')
  })
  await astep('softkeys mirror the route', async()=>{
    const soft=d.getElementById('softkeys')
    if(!soft) throw new Error('softkeys missing')
    key('3'); await tick()
    const on=soft.querySelector('.softkeys__key.is-on')
    if(on?.dataset.route!=='projects') throw new Error('softkey did not follow the panel LED: '+on?.dataset.route)
    if(on.getAttribute('aria-current')!=='page') throw new Error('selected softkey lacks aria-current')
  })
  step('softkey navigates', ()=>{
    click(d.querySelector('.softkeys__key[data-route="about"]'))
    if(w.location.pathname!=='/about') throw new Error('ABOUT softkey did not navigate: '+w.location.pathname)
  })
  await astep('escape leaves full screen before BACK', async()=>{
    key('3'); key('Enter')
    const detail=w.location.pathname
    if(!detail.startsWith('/projects/')) throw new Error('project detail did not open')
    key('Escape'); await tick()
    if(fullscreenOn()) throw new Error('Escape did not leave full screen')
    if(w.location.pathname!==detail) throw new Error('Escape also navigated back: '+w.location.pathname)
    if(d.getElementById('fullscreen-switch').getAttribute('aria-checked')!=='false') throw new Error('switch did not report OFF')
    // History traversal is asynchronous; wait for its event, not a 20ms
    // timing assumption that flakes while software-GL tests run alongside it.
    const navigated=new Promise((resolve,reject)=>{
      const done=()=>{clearTimeout(timer); resolve()}
      const timer=setTimeout(()=>{
        w.removeEventListener('popstate',done)
        reject(new Error('second Escape did not emit popstate'))
      },2000)
      w.addEventListener('popstate',done,{once:true})
    })
    key('Escape'); await navigated
    if(w.location.pathname!=='/projects') throw new Error('second Escape did not go back: '+w.location.pathname)
  })
  step('F toggles full screen', ()=>{
    key('f'); if(!fullscreenOn()) throw new Error('f did not enter full screen')
    key('F'); if(fullscreenOn()) throw new Error('F did not leave full screen')
  })
  step('browser exit is followed', ()=>{
    key('f')
    setNativeFullscreen(d.documentElement)
    setNativeFullscreen(null)
    if(fullscreenOn()) throw new Error('layout stayed full screen after the browser left native full screen')
  })
  step('embed exit is not followed', ()=>{
    key('f')
    setNativeFullscreen(d.createElement('iframe'))
    setNativeFullscreen(null)
    if(!fullscreenOn()) throw new Error('an embed leaving its own full screen ejected the reader')
  })
  step('exit softkey', ()=>{
    click(d.querySelector('.softkeys__key--exit'))
    if(fullscreenOn()) throw new Error('EXIT softkey did not leave full screen')
  })
  await astep('late native entry is cancelled', async()=>{
    const root=d.documentElement
    let resolveRequest, exits=0
    root.requestFullscreen=()=>new Promise(resolve=>{resolveRequest=resolve})
    d.exitFullscreen=()=>{exits++; setNativeFullscreen(null); return Promise.resolve()}
    key('f'); key('f')
    setNativeFullscreen(root)
    resolveRequest(); await tick()
    if(fullscreenOn() || d.fullscreenElement || exits!==1) throw new Error('late native request stranded browser in full screen')
    delete root.requestFullscreen; delete d.exitFullscreen
  })
  await astep('void WebKit late entry is cancelled', async()=>{
    const root=d.documentElement
    let exits=0
    const setWebKit=el=>{
      Object.defineProperty(d,'webkitFullscreenElement',{value:el,configurable:true})
      d.dispatchEvent(new w.Event('webkitfullscreenchange'))
    }
    root.webkitRequestFullscreen=()=>undefined
    d.webkitExitFullscreen=()=>{exits++; setWebKit(null)}
    key('f')
    await tick() // A void API must not settle in the Promise microtask queue.
    const video=d.createElement('video')
    d.body.appendChild(video)
    video.dispatchEvent(new w.Event('webkitfullscreenerror',{bubbles:true}))
    video.remove() // An unrelated media request must not settle ours.
    key('f')
    setWebKit(root)
    if(fullscreenOn() || d.webkitFullscreenElement || exits!==1) throw new Error('void WebKit request stranded native full screen')
    delete root.webkitRequestFullscreen; delete d.webkitExitFullscreen
  })
  await astep('void WebKit succeeds and follows exit', async()=>{
    const root=d.documentElement
    root.webkitRequestFullscreen=()=>undefined
    key('f'); await tick()
    Object.defineProperty(d,'webkitFullscreenElement',{value:root,configurable:true})
    d.dispatchEvent(new w.Event('webkitfullscreenchange'))
    if(!fullscreenOn()) throw new Error('WebKit success exited CSS mode')
    Object.defineProperty(d,'webkitFullscreenElement',{value:null,configurable:true})
    d.dispatchEvent(new w.Event('webkitfullscreenchange'))
    if(fullscreenOn()) throw new Error('WebKit system exit left CSS mode active')
    delete root.webkitRequestFullscreen
  })
  await astep('void WebKit error allows retry', async()=>{
    const root=d.documentElement
    let requests=0
    root.webkitRequestFullscreen=()=>{requests++}
    key('f'); await tick()
    d.dispatchEvent(new w.Event('webkitfullscreenerror'))
    if(!fullscreenOn()) throw new Error('native denial removed the accessible CSS layout')
    key('f'); key('f')
    if(requests!==2) throw new Error('WebKit failure prevented retry')
    d.dispatchEvent(new w.Event('webkitfullscreenerror'))
    key('f')
    delete root.webkitRequestFullscreen
  })
  step('unowned native full screen is preserved', ()=>{
    let exits=0
    setNativeFullscreen(d.createElement('iframe'))
    d.exitFullscreen=()=>{exits++; return Promise.resolve()}
    key('f'); key('f')
    if(exits) throw new Error('CSS mode exited a different native full screen owner')
    setNativeFullscreen(null); delete d.exitFullscreen
  })
  step('modified and repeated F are ignored', ()=>{
    for(const options of [{ctrlKey:true},{metaKey:true},{altKey:true},{repeat:true},{isComposing:true}]){
      d.dispatchEvent(new w.KeyboardEvent('keydown',{key:'f',bubbles:true,cancelable:true,...options}))
      if(fullscreenOn()) throw new Error('modified/repeated F toggled full screen')
    }
  })
  step('rows are pointer targets in full screen', ()=>{
    key('4'); key('f')
    const tube=d.getElementById('tube')
    tube.getBoundingClientRect=()=>({left:0,top:0,width:1440,height:1080,right:1440,bottom:1080,x:0,y:0,toJSON(){}})
    const down=new w.MouseEvent('pointerdown',{bubbles:true,clientX:700,clientY:300}); Object.defineProperty(down,'isPrimary',{value:true})
    const up=new w.MouseEvent('pointerup',{bubbles:true,clientX:700,clientY:300}); Object.defineProperty(up,'isPrimary',{value:true})
    tube.dispatchEvent(down); tube.dispatchEvent(up)
    if(!w.location.pathname.startsWith('/articles/')) throw new Error('tapping a listing row in full screen did not open it: '+w.location.pathname)
    key('f')
  })

  console.log('\n  machine class :', d.getElementById('machine').className)
  console.log('  pathname      :', w.location.pathname)
  console.log('  live region   :', d.getElementById('live').textContent.replace(/\s+/g,' ').slice(0,60)+'...')
  console.log(errors.length? '\n  '+errors.length+' ERROR(S):\n   '+[...new Set(errors)].join('\n   ') : '\n  no uncaught errors across any interaction')
  process.exit(errors.length?1:0)
},600)
