
/* ==========================================================================
 * 2. AUDIO — everything below is synthesized at runtime
 * ======================================================================== */
export class Foley {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.hum = null;
    this.volume = 0.35;
    this.enabled = true;
  }

  /** Lazily boot the graph on the first real user gesture. */
  ensure() {
    if (this.ctx) { if (this.ctx.state === "suspended") this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.volume;
    this.master.connect(this.ctx.destination);
    this._buildHum();
  }

  setVolume(v) {
    this.volume = v;
    if (this.master) this.master.gain.setTargetAtTime(v, this.ctx.currentTime, 0.05);
  }

  /** Mains hum + flyback whine, the sound a tube makes just by being on. */
  _buildHum() {
    const g = this.ctx.createGain();
    g.gain.value = 0;
    g.connect(this.master);

    const mains = this.ctx.createOscillator();       // 50 Hz in France
    mains.type = "sine"; mains.frequency.value = 50;
    const mg = this.ctx.createGain(); mg.gain.value = 0.05;
    mains.connect(mg).connect(g);

    const harm = this.ctx.createOscillator();
    harm.type = "sine"; harm.frequency.value = 100;
    const hg = this.ctx.createGain(); hg.gain.value = 0.02;
    harm.connect(hg).connect(g);

    const fly = this.ctx.createOscillator();         // line frequency whine
    fly.type = "sine"; fly.frequency.value = 15625;
    const fg = this.ctx.createGain(); fg.gain.value = 0.006;
    fly.connect(fg).connect(g);

    mains.start(); harm.start(); fly.start();
    this.hum = g;
  }

  humOn(on) {
    if (!this.hum) return;
    this.hum.gain.setTargetAtTime(on ? 0.35 : 0, this.ctx.currentTime, on ? 0.25 : 0.12);
  }

  _noise(dur) {
    const n = Math.floor(this.ctx.sampleRate * dur);
    const buf = this.ctx.createBuffer(1, n, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    const s = this.ctx.createBufferSource();
    s.buffer = buf;
    return s;
  }

  /** Mechanical key: a filtered noise transient plus a body resonance. */
  key(down = true) {
    if (!this.ctx || !this.enabled) return;
    const t = this.ctx.currentTime;
    const src = this._noise(0.05);
    const bp = this.ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = down ? 2600 : 3800;
    bp.Q.value = 1.1;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(down ? 0.55 : 0.28, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + (down ? 0.045 : 0.03));
    src.connect(bp).connect(g).connect(this.master);
    src.start(t); src.stop(t + 0.06);

    const body = this.ctx.createOscillator();
    body.type = "triangle";
    body.frequency.setValueAtTime(down ? 180 : 240, t);
    body.frequency.exponentialRampToValueAtTime(80, t + 0.05);
    const bg = this.ctx.createGain();
    bg.gain.setValueAtTime(down ? 0.22 : 0.1, t);
    bg.gain.exponentialRampToValueAtTime(0.0001, t + 0.06);
    body.connect(bg).connect(this.master);
    body.start(t); body.stop(t + 0.07);
  }

  /** Heavier throw for the rocker and the slide switch. */
  clunk(pitch = 1) {
    if (!this.ctx || !this.enabled) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    o.type = "square";
    o.frequency.setValueAtTime(140 * pitch, t);
    o.frequency.exponentialRampToValueAtTime(48 * pitch, t + 0.08);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.4, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.1);
    const lp = this.ctx.createBiquadFilter();
    lp.type = "lowpass"; lp.frequency.value = 1400;
    o.connect(lp).connect(g).connect(this.master);
    o.start(t); o.stop(t + 0.11);
  }

  /** Degauss coil: the "boing" a tube makes when it wakes up. */
  degauss() {
    if (!this.ctx || !this.enabled) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    o.type = "sine";
    o.frequency.setValueAtTime(58, t);
    o.frequency.exponentialRampToValueAtTime(210, t + 0.06);
    o.frequency.exponentialRampToValueAtTime(42, t + 0.9);
    const lfo = this.ctx.createOscillator();
    lfo.type = "sine"; lfo.frequency.value = 46;
    const lg = this.ctx.createGain(); lg.gain.value = 26;
    lfo.connect(lg).connect(o.frequency);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.5, t + 0.03);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 1.0);
    o.connect(g).connect(this.master);
    o.start(t); lfo.start(t);
    o.stop(t + 1.05); lfo.stop(t + 1.05);
  }

  /** Static burst when the picture changes. */
  sweep() {
    if (!this.ctx || !this.enabled) return;
    const t = this.ctx.currentTime;
    const src = this._noise(0.22);
    const hp = this.ctx.createBiquadFilter();
    hp.type = "highpass"; hp.frequency.value = 1200;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.16, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.2);
    src.connect(hp).connect(g).connect(this.master);
    src.start(t); src.stop(t + 0.24);
  }

  /** Per-character teletype blip, deliberately almost inaudible. */
  blip() {
    if (!this.ctx || !this.enabled || this.volume < 0.02) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    o.type = "square";
    o.frequency.value = 1800 + Math.random() * 900;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.02, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.012);
    o.connect(g).connect(this.master);
    o.start(t); o.stop(t + 0.014);
  }
}
export const foley = new Foley();
