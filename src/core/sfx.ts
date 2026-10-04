// 효과음: 파일 없이 WebAudio로 짧게 합성한다. 설정에서 끄거나 음량을 바꿀 수 있다.
import { prefs } from './prefs';
import { fx } from '../render/fx';

let ctx: AudioContext | null = null;
function ac(): AudioContext | null {
  if (!prefs().sound) return null;
  try {
    ctx ??= new AudioContext();
    if (ctx.state === 'suspended') void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

type Wave = OscillatorType;
/** 음 하나: 주파수 f에서 f2로 미끄러지며 dur초 동안 */
function tone(f: number, dur: number, type: Wave = 'sine', vol = 0.3, f2 = f, delay = 0) {
  const a = ac();
  if (!a) return;
  const t = a.currentTime + delay;
  const o = a.createOscillator();
  const g = a.createGain();
  o.type = type;
  o.frequency.setValueAtTime(f, t);
  o.frequency.exponentialRampToValueAtTime(Math.max(20, f2), t + dur);
  const v = vol * prefs().volume;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0002, v), t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(a.destination);
  o.start(t);
  o.stop(t + dur + 0.02);
}

/** 짧은 잡음 (타격·총소리) */
function noise(dur: number, vol = 0.3, hp = 800, delay = 0) {
  const a = ac();
  if (!a) return;
  const t = a.currentTime + delay;
  const buf = a.createBuffer(1, Math.floor(a.sampleRate * dur), a.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
  const src = a.createBufferSource();
  src.buffer = buf;
  const f = a.createBiquadFilter();
  f.type = 'highpass';
  f.frequency.value = hp;
  const g = a.createGain();
  g.gain.value = vol * prefs().volume;
  src.connect(f).connect(g).connect(a.destination);
  src.start(t);
}

export type Sfx = 'step' | 'hit' | 'hurt' | 'shot' | 'hammer' | 'perfect' | 'win' | 'lose' | 'ach' | 'coin' | 'open' | 'event' | 'travel' | 'brace' | 'ability' | 'boss';

export function sfx(name: Sfx) {
  if (fx.instant) return; // 시뮬레이션 중엔 조용히
  switch (name) {
    case 'step': return tone(220, 0.06, 'triangle', 0.12, 180);
    case 'hit': noise(0.08, 0.35, 1200); return tone(160, 0.1, 'square', 0.12, 80);
    case 'hurt': tone(300, 0.18, 'sawtooth', 0.18, 90); return noise(0.1, 0.2, 400);
    case 'shot': noise(0.25, 0.6, 300); return tone(120, 0.2, 'square', 0.25, 40);
    case 'hammer': tone(900, 0.12, 'triangle', 0.25, 700); return noise(0.05, 0.3, 2000);
    case 'perfect': tone(1200, 0.15, 'triangle', 0.25, 1200); return tone(1800, 0.3, 'sine', 0.2, 1800, 0.08);
    case 'win': [523, 659, 784, 1046].forEach((f, i) => tone(f, 0.22, 'triangle', 0.22, f, i * 0.09)); return;
    case 'lose': [392, 330, 262].forEach((f, i) => tone(f, 0.35, 'sine', 0.22, f * 0.97, i * 0.18)); return;
    case 'ach': [784, 1046, 1318].forEach((f, i) => tone(f, 0.25, 'sine', 0.2, f, i * 0.07)); return;
    case 'coin': tone(988, 0.07, 'square', 0.12, 988); return tone(1318, 0.18, 'square', 0.12, 1318, 0.06);
    case 'open': return tone(440, 0.12, 'sine', 0.15, 660);
    case 'event': [660, 880].forEach((f, i) => tone(f, 0.15, 'sine', 0.18, f, i * 0.1)); return;
    case 'travel': return noise(0.3, 0.12, 200);
    case 'brace': return tone(200, 0.2, 'triangle', 0.25, 260);
    case 'ability': return tone(500, 0.25, 'sine', 0.2, 1000);
    case 'boss': tone(80, 0.8, 'sawtooth', 0.25, 60); return noise(0.6, 0.15, 100);
  }
}
