// Sonidos sintetizados con WebAudio (no requiere descargar archivos de audio).

export class Audio {
  constructor(settings) {
    this.settings = settings;
    this.ctx = null;
    this.noise = null;
  }

  unlock() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.connect(this.ctx.destination);
    this.applyVolume();
    const len = this.ctx.sampleRate * 0.4;
    this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  }

  applyVolume() { if (this.master) this.master.gain.value = this.settings.get('volume'); }

  shot(distance = 0) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const vol = Math.max(0.05, 1 - distance / 90);
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise;
    const f = this.ctx.createBiquadFilter();
    f.type = 'lowpass'; f.frequency.setValueAtTime(3200, t); f.frequency.exponentialRampToValueAtTime(400, t + 0.18);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.9 * vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
    src.connect(f); f.connect(g); g.connect(this.master);
    src.start(t); src.stop(t + 0.25);
    const o = this.ctx.createOscillator();
    const og = this.ctx.createGain();
    o.frequency.setValueAtTime(160, t); o.frequency.exponentialRampToValueAtTime(45, t + 0.12);
    og.gain.setValueAtTime(0.6 * vol, t); og.gain.exponentialRampToValueAtTime(0.001, t + 0.14);
    o.connect(og); og.connect(this.master); o.start(t); o.stop(t + 0.15);
  }

  tone(freq, dur = 0.08, type = 'sine', vol = 0.25, delay = 0) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + delay;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(this.master); o.start(t); o.stop(t + dur + 0.02);
  }

  hit() { this.tone(1400, 0.05, 'square', 0.12); }
  cash() { this.tone(880, 0.09, 'triangle', 0.25); this.tone(1320, 0.14, 'triangle', 0.25, 0.08); }
  click() { this.tone(600, 0.03, 'sine', 0.12); }
  reload() { this.tone(300, 0.05, 'square', 0.1); this.tone(450, 0.05, 'square', 0.1, 0.5); }
  hurt() { this.tone(180, 0.15, 'sawtooth', 0.15); }
  bell() { this.tone(1600, 0.06, 'sine', 0.12); this.tone(1900, 0.08, 'sine', 0.1, 0.07); }
}
