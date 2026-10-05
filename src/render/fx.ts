// 애니메이션: 트윈, 파티클, 흔들림, 히트스톱, 떠오르는 글자
export type Ease = (t: number) => number;
export const linear: Ease = (t) => t;
export const easeOut: Ease = (t) => 1 - (1 - t) * (1 - t);
export const easeInOut: Ease = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
export const easeOutBack: Ease = (t) => {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
};

interface Tween { el: number; dur: number; fn: (p: number) => void; ease: Ease; done: () => void }
export interface Particle { x: number; y: number; vx: number; vy: number; life: number; max: number; size: number; color: string; grav: number; shape: 'dot' | 'chip' | 'spark' }
export interface FloatText { x: number; y: number; text: string; color: string; life: number; max: number; big?: boolean; /** 글자 크기 (칸 크기 대비, 없으면 big에 따라 0.42 / 0.3) */ size?: number }

class FX {
  tweens: Tween[] = [];
  parts: Particle[] = [];
  texts: FloatText[] = [];
  shakeT = 0;
  shakeMag = 0;
  hitstop = 0;
  time = 0;
  /** 내 차례가 시작된 시각 (판 테두리 반짝) */
  turnAt = -9999;
  /** 밸런스 시뮬레이션용: 모든 연출을 즉시 끝낸다 */
  instant = false;
  /** 연출 속도 배율 (빠르게 = 0.55) */
  speed = 1;
  /** 연출 생략: 움직임·타격 애니메이션을 건너뛰고 결과만 (대화·컷인은 그대로) */
  skip = false;

  tween(dur: number, fn: (p: number) => void, ease: Ease = easeOut): Promise<void> {
    return new Promise((done) => {
      if (dur <= 0 || this.instant || this.skip) { fn(1); done(); return; }
      this.tweens.push({ el: 0, dur: dur * this.speed, fn, ease, done });
    });
  }

  wait(ms: number) {
    return this.tween(ms, () => {}, linear);
  }

  shake(mag: number, dur = 180) {
    this.shakeMag = Math.max(this.shakeMag, mag);
    this.shakeT = Math.max(this.shakeT, dur);
  }

  stop(ms: number) {
    this.hitstop = Math.max(this.hitstop, ms);
  }

  /** x,y: 타일 좌표(중심) */
  burst(x: number, y: number, color: string, n = 10, o: { speed?: number; grav?: number; size?: number; shape?: Particle['shape']; life?: number } = {}) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = (o.speed ?? 3) * (0.4 + Math.random() * 0.8);
      const life = (o.life ?? 500) * (0.6 + Math.random() * 0.6);
      this.parts.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - (o.grav ? 1.5 : 0), life, max: life, size: (o.size ?? 0.08) * (0.6 + Math.random() * 0.8), color, grav: o.grav ?? 0, shape: o.shape ?? 'dot' });
    }
  }

  /** 떠오르는 글씨. life = 보이는 시간(ms), size = 칸 크기 대비 글자 크기 */
  text(x: number, y: number, text: string, color = '#fff', big = false, life = 900, size?: number) {
    this.texts.push({ x, y, text, color, life, max: life, big, size });
  }

  update(dt: number) {
    this.time += dt;
    if (this.shakeT > 0) {
      this.shakeT -= dt;
      if (this.shakeT <= 0) this.shakeMag = 0;
    }
    let tdt = dt;
    if (this.hitstop > 0) {
      this.hitstop -= dt;
      tdt = 0;
    }
    const finished: Tween[] = [];
    for (const t of this.tweens) {
      t.el += tdt;
      const p = Math.min(1, t.el / t.dur);
      t.fn(t.ease(p));
      if (p >= 1) finished.push(t);
    }
    if (finished.length) {
      this.tweens = this.tweens.filter((t) => !finished.includes(t));
      for (const t of finished) t.done();
    }
    const s = dt / 1000;
    for (const p of this.parts) {
      p.life -= dt;
      p.x += p.vx * s;
      p.y += p.vy * s;
      p.vy += p.grav * s * 10;
      p.vx *= 0.96;
      p.vy *= p.grav ? 1 : 0.96;
    }
    this.parts = this.parts.filter((p) => p.life > 0);
    for (const t of this.texts) {
      t.life -= dt;
      t.y -= s * 0.6;
    }
    this.texts = this.texts.filter((t) => t.life > 0);
  }

  shakeOffset(): [number, number] {
    if (this.shakeT <= 0) return [0, 0];
    const m = this.shakeMag * (this.shakeT / 200);
    return [(Math.random() - 0.5) * 2 * m, (Math.random() - 0.5) * 2 * m];
  }

  clear() {
    for (const t of this.tweens) { t.fn(1); t.done(); }
    this.tweens = [];
    this.parts = [];
    this.texts = [];
  }
}

export const fx = new FX();
