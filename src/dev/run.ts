// 개발용: 처음부터 엔딩까지 자동으로 플레이하고 '난이도 곡선 보고서'를 만든다.
// 금빛 별(안내)을 따라가고, 전투는 강한 봇, 장비는 가진 재료로 가장 좋은 조합을 바로 만든다.
// 사용: const r = await import('/src/dev/run.ts'); r.startRun(app); … window.__run 으로 진행 확인, r.report()
import type { App } from '../game/app';
import { G, curSlot, emit, loadout, newGame, save, setSlot, spendMats, matHave, baseRules } from '../core/state';
import { MIN_CORE, SLOTS, Slot, Mats, computeItem, itemStats, mergeMats } from '../core/items';
import { MATS, MAT_ORDER, MatId } from '../data/materials';
import { AREAS } from '../data/areas';
import { fx } from '../render/fx';
import { newSquares } from '../ui/forge';
import { qStart } from '../game/quests';
import { strongTurn } from './bot2';
import { botTurn } from './sim';
import { makePlayer } from './play';

interface Rec { i: number; area: string; region: number; enc: string; r: string; turns: number; hp0: number; hp1: number; mh: number; gear: number; promo: number }
interface RunState { running: boolean; recs: Rec[]; notes: string[]; steps: number; stop?: string; slot: number; snaps: Record<string, unknown> }

declare global { interface Window { __run?: RunState } }

let weak = false;
const promoLv = () => (G.flags.promoted3 ? 3 : G.promoted2 ? 2 : G.promoted ? 1 : 0);
const FORGE_AREAS = ['town', 'camp', 'frostpost', 'margin'];

/** 장비 점수: 새로 생기는 행마 칸 + 특성 + 능력 */
function gearScore(slot: Slot, mats: Mats, others: ReturnType<typeof baseRules>) {
  const s = computeItem(slot, mats, 0);
  const t = Object.values(s.traits).reduce((a, b) => a + (b ?? 0), 0);
  return newSquares(others, s.rules) + t * 3 + (s.ability ? 5 : 0) + (s.rules.some((r) => r.gun) ? 30 : 0);
}

/** 가진 재료로 가장 좋은 장비를 골라 바로 만든다 (지금 장비보다 좋을 때만) */
function autoCraft(st: RunState) {
  const pool = MAT_ORDER.filter((m) => !MATS[m].key && !MATS[m].binder && matHave(m) > 0);
  const fiber = Math.min(2, matHave('fiber'));
  for (const slot of SLOTS) {
    const cur = G.items.find((i) => i.id === G.equip[slot]);
    const others = loadout().rules.filter((r) => !(cur ? itemStats(cur).rules : []).some((x) => JSON.stringify(x) === JSON.stringify(r)));
    const curScore = cur ? gearScore(slot, cur.mats, others) : -1;
    let best: { mats: Mats; score: number } | null = null;
    const need = MIN_CORE[slot];
    for (const a of pool) {
      for (let na = 1; na <= Math.min(5, matHave(a)); na++) {
        const opts: Mats[] = [{ [a]: na }];
        for (const b of pool) if (b !== a) for (let nb = 1; nb <= Math.min(3, matHave(b)); nb++) {
          opts.push({ [a]: na, [b]: nb });
          // 세 가지 섞기 (방어구·각인·유물처럼 재료가 많이 필요한 부위)
          if (na + nb < need) for (const c of pool) if (c !== a && c !== b) opts.push({ [a]: na, [b]: nb, [c]: Math.min(matHave(c), need - na - nb) });
        }
        for (const o of opts) {
          const core = Object.values(o).reduce((x, y) => x + (y ?? 0), 0);
          if (core < need) continue;
          const m: Mats = fiber ? { ...o, fiber } : o;
          const sc = gearScore(slot, m, others);
          if (!best || sc > best.score) best = { mats: m, score: sc };
        }
      }
    }
    if (best && best.score > curScore + 2 && spendMats(best.mats)) {
      const it = { id: G.nextId++, slot, mats: { ...best.mats }, quality: 0, level: 0 };
      G.items.push(it);
      G.equip[slot] = it.id;
      emit('craft', it);
      st.notes.push(`#${st.recs.length} 제작 ${slot}: ${itemStats(it).name} (점수 ${best.score})`);
    }
  }
  save();
}

/** 강화: 장착 장비에 주 재료를 하나 더 넣어 점수가 떨어지지 않으면 강화 (골드가 되는 만큼) */
function autoEnhance(st: RunState) {
  for (const slot of SLOTS) {
    const it = G.items.find((i) => i.id === G.equip[slot]);
    if (!it || it.level >= 3) continue;
    const cost = 15 * (it.level + 1);
    if (G.gold < cost + 20) continue;
    const top = itemStats(it).shares[0]?.id;
    if (!top || matHave(top) < 1) continue;
    const others = loadout().rules.filter((r) => !itemStats(it).rules.some((x) => JSON.stringify(x) === JSON.stringify(r)));
    const before = gearScore(slot, it.mats, others);
    const next = mergeMats(it.mats, { [top]: 1 });
    if (gearScore(slot, next, others) < before) continue;
    if (!spendMats({ [top]: 1 })) continue;
    G.gold -= cost;
    it.mats = next;
    it.level++;
    emit('enhance', it.level);
    st.notes.push(`#${st.recs.length} 강화 ${slot} +${it.level}`);
  }
  save();
}

export function startRun(app: App, opts: { diff?: 'easy' | 'normal' | 'hard'; maxFights?: number; job?: string; bot?: 'weak' | 'strong' } = {}) {
  weak = opts.bot === 'weak';
  const st: RunState = { running: true, recs: [], notes: [], steps: 0, slot: curSlot(), snaps: {} };
  window.__run = st;
  setSlot(3); // 사용자의 저장(1·2)을 건드리지 않도록 3번 슬롯에서
  fx.instant = true;
  newGame('pawn', opts.diff ?? 'normal');
  qStart('main_job', true);
  app.begin(false);
  void loop(app, st, opts.maxFights ?? 450, opts.job ?? 'wanderer');
  return st;
}

async function loop(app: App, st: RunState, maxFights: number, job: string) {
  const P = makePlayer(app);
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
  let lastArea = '';
  let farm = 0;
  let idle = 0;
  try {
    while (st.running && st.recs.length < maxFights) {
      st.steps++;
      document.querySelectorAll<HTMLElement>('.cutin').forEach((c) => c.click());
      // 엔딩에 닿으면 끝
      if (document.querySelector('.ending') || G.flags.author_dead) { st.stop = '엔딩 도달'; break; }
      // 직업 고르기
      const jobBtn = [...document.querySelectorAll<HTMLButtonElement>('.job')].find((b) => b.textContent!.includes(job === 'wanderer' ? '방랑자' : job)) ?? document.querySelector<HTMLButtonElement>('.job');
      if (jobBtn) { jobBtn.click(); await sleep(200); continue; }
      if (app.mode === 'battle' && app.battle) {
        const b = app.battle;
        // 고정 전투에 처음 도착했을 때의 힘을 기록 (나중에 같은 조건으로 여러 번 시뮬레이션)
        if (!/조우/.test(b.enc.name) && !st.snaps[b.enc.name]) {
          const flags: Record<string, boolean | string> = {};
          for (const [k, v] of Object.entries(G.flags)) if (/^perk_|^branch$|^promoted3$/.test(k)) flags[k] = v as boolean | string;
          st.snaps[b.enc.name] = { piece: 'pawn', promoted: G.promoted, promoted2: G.promoted2, progress: G.progress, bonusHp: G.bonusHp, flags, items: SLOTS.map((s) => G.items.find((i) => i.id === G.equip[s])).filter(Boolean).map((i) => [i!.slot, i!.mats]) };
        }
        const rec: Rec = { i: st.recs.length, area: G.area, region: AREAS[G.area].region, enc: b.enc.name, r: '', turns: 0, hp0: b.hero.hp, hp1: 0, mh: b.hero.maxHp, gear: Object.values(G.equip).filter(Boolean).length, promo: promoLv() };
        let n = 0;
        while (!b.over && n < 90) { await (weak ? botTurn(b) : strongTurn(b)); n++; }
        if (!b.over && !b.enc.noFlee) b.flee();
        else if (!b.over) { b.hero.hp = 0; G.hp = 0; } // 보스전 시간 초과는 패배로 친다
        await sleep(30);
        rec.turns = b.turn;
        rec.hp1 = b.hero.hp;
        rec.r = b.hero.hp <= 0 ? 'lose' : b.enemies().length ? 'flee' : 'win';
        st.recs.push(rec);
        // 고정 전투(보스·엘리트)에서 지면 파밍 모드: 일반 전투 6번 더 하고 재도전
        if (rec.r === 'lose' && !/조우/.test(rec.enc)) { farm = 6; st.notes.push(`#${st.recs.length} 막힘: ${rec.enc} → 파밍`); }
        if (app.mode === 'battle' && app.battle === b && !b.over) { b.over = true; app.endBattle('lose', []); }
        await sleep(30);
        P.closeAll();
        continue;
      }
      if (FORGE_AREAS.includes(G.area)) { autoCraft(st); autoEnhance(st); }
      // 막혔으면 파밍: 이 지역 몹을 먼저 친다
      if (farm > 0 && app.explore.mobs.length) {
        const m = app.explore.mobs[0];
        await P.click(m.x, m.y);
        if (app.mode === 'battle') { farm--; continue; }
      }
      const before = `${G.area}${G.pos}`;
      const r = await P.star();
      // 대화·창 처리
      for (let k = 0; k < 3; k++) {
        const ch = await P.autoChoose('neutral');
        if (!ch) break;
      }
      if (document.querySelector('.qboard')) {
        for (const bt of [...document.querySelectorAll<HTMLButtonElement>('.qboard button')]) if (/보고|받기/.test(bt.textContent!)) { bt.click(); await sleep(50); }
      }
      if (document.querySelector('.inn')) [...document.querySelectorAll<HTMLButtonElement>('.inn button')].find((x) => x.textContent!.includes('쉬기'))?.click();
      P.closeAll();
      if (G.area !== lastArea) { lastArea = G.area; st.notes.push(`#${st.recs.length} → ${AREAS[G.area].name} (승급${promoLv()}, 장비${Object.values(G.equip).filter(Boolean).length})`); }
      if (r === 'no-guide') {
        // 안내가 없으면 가까운 몹을 쳐서 재료를 모은다
        const m = app.explore.mobs[0];
        if (m) await P.click(m.x, m.y);
        else { st.stop = `안내 없음 @${G.area}`; break; }
      }
      idle = `${G.area}${G.pos}` === before && app.mode !== 'battle' ? idle + 1 : 0;
      if (idle > 25) { st.stop = `제자리 걸음 @${G.area} ${P.guideText()}`; break; }
      await sleep(5);
    }
  } catch (e) {
    st.stop = `오류: ${(e as Error).message}`;
  } finally {
    st.running = false;
    if (!st.stop) st.stop = `전투 ${st.recs.length}회 한도`;
    fx.instant = false;
  }
}

export function stopRun() {
  if (window.__run) window.__run.running = false;
}

/** 보고서: 지역·구간별 난이도 곡선 */
export function report(): string {
  const st = window.__run;
  if (!st) return '실행 기록 없음';
  const L: string[] = [];
  L.push(`[자동 플레이 보고서 · ${weak ? '약한' : '강한'} 봇] 전투 ${st.recs.length} · 패배 ${st.recs.filter((r) => r.r === 'lose').length} · 종료: ${st.stop ?? '진행 중'}`);
  L.push('지역 | 전투 | 승/패/도망 | 평균턴 | 평균 체력손실% | 승급·장비');
  const areas: string[] = [];
  for (const r of st.recs) if (!areas.includes(r.area)) areas.push(r.area);
  for (const a of areas) {
    const fs = st.recs.filter((r) => r.area === a);
    const w = fs.filter((f) => f.r === 'win').length;
    const l = fs.filter((f) => f.r === 'lose').length;
    const f = fs.filter((x) => x.r === 'flee').length;
    const t = (fs.reduce((s, x) => s + x.turns, 0) / fs.length).toFixed(1);
    const loss = Math.round((fs.reduce((s, x) => s + Math.max(0, x.hp0 - x.hp1) / x.mh, 0) / fs.length) * 100);
    L.push(`${AREAS[a as keyof typeof AREAS]?.name ?? a} | ${fs.length} | ${w}/${l}/${f} | ${t} | ${loss} | ${fs[0].promo}·${fs[0].gear}→${fs[fs.length - 1].gear}`);
  }
  L.push('고정 전투 | 시도 | 첫 승까지 | 승리 턴 | 남은 체력');
  const named = new Map<string, Rec[]>();
  for (const r of st.recs) if (!/조우/.test(r.enc)) named.set(r.enc, [...(named.get(r.enc) ?? []), r]);
  for (const [e, fs] of named) {
    const k = fs.findIndex((x) => x.r === 'win');
    L.push(`${e} | ${fs.length} | ${k < 0 ? '못 이김' : k + 1} | ${k < 0 ? '-' : fs[k].turns} | ${k < 0 ? '-' : `${fs[k].hp1}/${fs[k].mh}`}`);
  }
  L.push('— 흐름 —', ...st.notes.slice(-40));
  return L.join('\n');
}

export function restoreSlot() {
  if (window.__run) setSlot(window.__run.slot);
}
