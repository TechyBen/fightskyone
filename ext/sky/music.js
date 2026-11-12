// Background music, 130 BPM in F minor, generated live.
//
// A syncopated bass line (3-3-2 groupings, roots, fifths and a flat seventh)
// follows a chord progression, i - VI - III - VII (Fm, Db, Ab, Eb, two bars
// each), as an FM pluck. Around it: a soft pad, off-beat hats, a
// gentle kick and a sparse bell line. Sections bring parts in and out so it
// drifts rather than loops: pad alone, bass in, full, a breakdown, full.
// Everything is scheduled a little ahead on the audio clock.

const BPM = 130, STEP = 60 / BPM / 4;   // sixteenths
// The bass line, 32 sixteenths: [step, interval above the chord root, velocity].
// 'third' is the chord's third (minor or major).
const LOOP = [
  [0, 0, 100], [3, 0, 72], [6, 7, 84], [8, 12, 90], [11, 0, 70], [14, 10, 80],
  [16, 0, 100], [19, 0, 72], [22, 7, 84], [24, 'third', 88], [26, 7, 74], [28, 12, 92], [30, 10, 70],
];
// Chords, two bars each: root (MIDI, bass octave) and whether minor.
const CHORDS = [[41, true], [37, false], [44, false], [39, false]];   // F2m, Db2, Ab2, Eb2
// Sections, in bars, and which parts play.
const SECTIONS = [
  { bars: 8, pad: 1 },
  { bars: 8, pad: 1, bass: 1 },
  { bars: 16, pad: 1, bass: 1, hats: 1, kick: 1 },
  { bars: 8, pad: 1, arp: 1 },
  { bars: 16, pad: 1, bass: 1, hats: 1, kick: 1, arp: 1 },
  { bars: 8, pad: 1, bass: 1, arp: 1 },
];
const TOTAL = SECTIONS.reduce((s, x) => s + x.bars, 0);
const hz = m => 440 * 2 ** ((m - 69) / 12);

export class Music {
  constructor(ctx, out, noise) {
    this.ctx = ctx;
    this.out = out;
    this.noise = noise;
    this.step = 0;
    this.next = 0;
    this.playing = false;
    // A little space: a feedback delay on the pad and bells.
    this.wet = ctx.createGain(); this.wet.gain.value = 0.25;
    const dl = ctx.createDelay(1); dl.delayTime.value = STEP * 3;
    const fb = ctx.createGain(); fb.gain.value = 0.35;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2400;
    this.wet.connect(dl).connect(lp).connect(fb).connect(dl);
    lp.connect(out);
    this.timer = setInterval(() => this.schedule(), 25);
  }

  schedule() {
    const ctx = this.ctx;
    if (!this.playing || ctx.state !== 'running') { this.next = 0; return; }
    if (!this.next || this.next < ctx.currentTime) this.next = ctx.currentTime + 0.05;
    while (this.next < ctx.currentTime + 0.15) {
      this.play(this.step, this.next);
      this.step++;
      this.next += STEP;
    }
  }

  section(bar) {
    let b = bar % TOTAL;
    for (const s of SECTIONS) { if (b < s.bars) return s; b -= s.bars; }
    return SECTIONS[0];
  }

  play(step, t) {
    const bar = Math.floor(step / 16), s16 = step % 16, s32 = step % 32;
    const sec = this.section(bar);
    const [root, minor] = CHORDS[Math.floor(bar / 2) % CHORDS.length];
    if (sec.pad && s32 === 0) this.pad(root, minor, t, 32 * STEP);
    if (sec.bass) {
      for (const [st, iv, v] of LOOP) {
        if (st !== s32) continue;
        const semis = iv === 'third' ? (minor ? 15 : 16) : iv;
        this.pluck(hz(root + 12 + semis - 12), t, v / 127);
      }
    }
    if (sec.kick && s16 % 8 === 0) this.kick(t);
    if (sec.hats && s16 % 4 === 2) this.hat(t, 0.5 + 0.5 * Math.random());
    // Bells: a short line over the chord (fifth, third, octave, seventh),
    // two octaves up, sparse, resting every third bar.
    if (sec.arp && bar % 3 !== 2) {
      const line = [7, minor ? 3 : 4, 12, 10];
      if (s16 % 6 === 3) this.bell(hz(root + 24 + line[(step / 6 | 0) % line.length]), t);
    }
  }

  // FM pluck: a sine carrier with a sine modulator at 2x whose depth decays
  // fast: bright at the attack, round after.
  pluck(f, t, v) {
    const ctx = this.ctx;
    const car = ctx.createOscillator(), mod = ctx.createOscillator(), mg = ctx.createGain(), g = ctx.createGain();
    car.frequency.value = f; mod.frequency.value = f * 2;
    mg.gain.setValueAtTime(f * 2.5, t);
    mg.gain.exponentialRampToValueAtTime(f * 0.15, t + 0.18);
    mod.connect(mg).connect(car.frequency);
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 900;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.22 * v, t + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, t + STEP * 1.7);
    car.connect(lp).connect(g).connect(this.out);
    car.start(t); mod.start(t); car.stop(t + STEP * 2); mod.stop(t + STEP * 2);
  }

  // Pad: the chord as detuned saws through a slowly opening lowpass.
  pad(root, minor, t, dur) {
    const ctx = this.ctx;
    const notes = [root + 24, root + 24 + (minor ? 3 : 4), root + 31, root + 36];
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.Q.value = 0.5;
    lp.frequency.setValueAtTime(380, t);
    lp.frequency.linearRampToValueAtTime(900, t + dur * 0.5);
    lp.frequency.linearRampToValueAtTime(420, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.05, t + 1.2);
    g.gain.setValueAtTime(0.05, t + dur - 0.6);
    g.gain.linearRampToValueAtTime(0.0001, t + dur + 0.4);
    lp.connect(g);
    g.connect(this.out);
    g.connect(this.wet);
    for (const m of notes) for (const det of [-6, 6]) {
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = hz(m);
      o.detune.value = det;
      o.connect(lp);
      o.start(t); o.stop(t + dur + 0.5);
    }
  }

  kick(t) {
    const ctx = this.ctx, o = ctx.createOscillator(), g = ctx.createGain();
    o.frequency.setValueAtTime(110, t);
    o.frequency.exponentialRampToValueAtTime(42, t + 0.12);
    g.gain.setValueAtTime(0.28, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
    o.connect(g).connect(this.out);
    o.start(t); o.stop(t + 0.32);
  }

  hat(t, v) {
    const ctx = this.ctx, s = ctx.createBufferSource();
    s.buffer = this.noise;
    const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 7000;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.035 * v, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
    s.connect(hp).connect(g).connect(this.out);
    s.start(t, Math.random()); s.stop(t + 0.06);
  }

  bell(f, t) {
    const ctx = this.ctx;
    const car = ctx.createOscillator(), mod = ctx.createOscillator(), mg = ctx.createGain(), g = ctx.createGain();
    car.frequency.value = f; mod.frequency.value = f * 3.5;
    mg.gain.setValueAtTime(f * 1.2, t);
    mg.gain.exponentialRampToValueAtTime(f * 0.05, t + 0.8);
    mod.connect(mg).connect(car.frequency);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.035, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 1.4);
    car.connect(g);
    g.connect(this.out);
    g.connect(this.wet);
    car.start(t); mod.start(t); car.stop(t + 1.5); mod.stop(t + 1.5);
  }
}
