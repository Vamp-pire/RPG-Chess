// 개발 전용 비밀키: 게임 중 키보드로 admingoooo 를 치면 현재 슬롯의 모든 것을 해금한다.
// main.ts의 import.meta.env.DEV 블록에서만 불러오므로 배포판(dist)에는 들어가지 않는다.
import type { App } from '../game/app';
import { G, addBag, maxHp, save } from '../core/state';
import { AREAS } from '../data/areas';
import { MOBS } from '../data/mobs';
import { MATS, MatId } from '../data/materials';
import { JOBS } from '../data/pieces';
import { QUESTS, q, qStart } from '../game/quests';
import { ACHS, syncAchievements } from '../game/achievements';
import { loreNeed } from '../ui/lore';
import { toast } from '../ui/dom';

const CODE = 'admingoooo';

export function unlockAll(app: App) {
  if (!G) return;
  // 진행: 직업·승급 3단계·보스/관문 플래그 (마지막 보스 저자는 직접 싸울 수 있게 남겨 둔다)
  if (!G.job) G.job = JOBS[0].id;
  G.promoted = true;
  G.mastery = true;
  G.promoted2 = true;
  if (!G.flags.branch) G.flags.branch = 'knight';
  G.flags.promoted3 = true;
  for (const f of ['boss_dead', 'queen_dead', 'king_dead', 'bonelord_dead', 'blunder_dead', 'giant_dead', 'double_dead', 'towers_done', 'rook_gone', 'fogOpen', 'gate_hills', 'gate_marsh']) G.flags[f] = true;
  for (const id of Object.keys(QUESTS)) if (QUESTS[id].main && id !== 'main_r4') q(id).st = 'done';
  qStart('main_r4', true);
  G.progress = Math.max(G.progress, 20);
  // 지도: 모든 지역 발견
  for (const a of Object.keys(AREAS)) G.flags[`v_${a}`] = true;
  // 도감·재료 설명
  for (const m of Object.keys(MOBS)) {
    if (!MOBS[m as keyof typeof MOBS].dex) continue;
    G.dex[m] = Math.max(G.dex[m] ?? 0, 1);
    G.flags[`seen_${m}`] = true;
    G.flags[`lk_${m}`] = true;
  }
  for (const id of Object.keys(MATS) as MatId[]) G.matUse[id] = Math.max(G.matUse[id] ?? 0, loreNeed(id));
  // 업적 전부 (보상도 함께 받는다)
  for (const a of ACHS) if (!G.ach[a.id]) G.ach[a.id] = Date.now();
  syncAchievements();
  // 골드·재료
  G.gold = Math.max(G.gold, 9999);
  for (const id of Object.keys(MATS) as MatId[]) addBag(id, 20);
  G.hp = maxHp();
  save();
  app.explore.enter(G.area);
  app.refreshAll();
  toast('🔓 관리자 해금: 진행·지도·도감·업적·골드·재료', 'rare');
}

/** 키보드로 친 글자를 모아 비밀키와 맞으면 해금 (입력칸에 쓰는 중이면 무시) */
export function installCheat(app: App) {
  let buf = '';
  window.addEventListener('keydown', (e) => {
    const t = e.target as HTMLElement | null;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
    if (e.key.length !== 1) return;
    buf = (buf + e.key.toLowerCase()).slice(-CODE.length);
    if (buf === CODE) {
      buf = '';
      if (G) unlockAll(app);
      else toast('게임을 시작한 뒤에 입력하세요', 'info');
    }
  });
}
