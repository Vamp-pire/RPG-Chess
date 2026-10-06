import { Vec } from '../core/geom';
import { DIFFS } from '../core/difficulty';
import { G, QSt, QState, addBag, emit, hasJob, log, matHave, on } from '../core/state';
import { AreaId } from '../data/areas';
import { MatId, MATS } from '../data/materials';
import { MOBS, MobId } from '../data/mobs';
import { questBanner, toast } from '../ui/dom';

export interface QuestDef {
  name: string;
  main?: boolean;
  board?: boolean; // 의뢰 게시판에서 받고 반납
  secret?: boolean; // 시작 전에는 목록에 없음
  recruit?: boolean;
  desc: string;
  target?: number;
}

export const QUESTS: Record<string, QuestDef> = {
  main_job: { name: '기록 밖의 이름', main: true, desc: '마을의 [기록의 벽]에 가서 나의 길(직업)을 정하자.' },
  main_boss: { name: '밀짚왕', main: true, desc: '들판 → 언덕을 지나 [밀짚 옥좌]의 주인을 쓰러뜨리자.' },
  main_promo: { name: '첫 승급', main: true, desc: '밀짚 왕관을 촌장 킹에게 가져가자.' },
  main_r2: { name: '거꾸로 탑의 퀸', main: true, desc: '마을 남쪽 → 야영지 → 서쪽 안개 늪 → 남쪽 [거꾸로 탑]의 퀸을 쓰러뜨리자.' },
  main_promo2: { name: '두 번째 승급', main: true, desc: '뒤집힌 왕관을 촌장 킹에게 가져가자.' },
  main_r3: { name: '얼어붙은 킹', main: true, desc: '야영지 남쪽 → [서리 초소] → 남쪽 [룩의 요새] → [왕의 봉우리]의 킹을 쓰러뜨리자.' },
  main_promo3: { name: '세 번째 승급', main: true, desc: '얼어붙은 왕관을 서리 초소의 늙은 룩 은자에게 가져가자.' },
  main_r4: { name: '마지막 장', main: true, desc: '판을 멈춘 건 펜을 놓은 저자였다. 왕의 봉우리 동쪽 → [여백] → [접힌 페이지]나 [잉크 샘] → [마지막 장]의 저자를 만나자.' },
  cq_soldier: { name: '폰 병사의 꿈', desc: '폰 병사와 함께 전투에서 8번 이기자. 병사가 더 강해진다.', target: 8 },
  cq_ghost: { name: '망령 기사의 안식', desc: '망령 기사와 함께 각성한 보스 하나를 쓰러뜨리자.' },
  cq_priest: { name: '사제의 순례길', desc: '사제 비숍과 함께 여관·모닥불에서 5번 쉬자.', target: 5 },
  sq_hermit: { name: '은자의 부탁', desc: '룩의 요새의 파수꾼들을 쓰러뜨리고 늙은 룩 은자에게 돌아가자.' },
  sq_wolves: { name: '늑대에 쫓기는 폰', desc: '얼어붙은 파일의 길 잃은 폰을 위해 설원 늑대 4마리를 쓰러뜨리자.', target: 4 },
  sq_puzzle3: { name: '얼음 속 돌판', desc: '빙하 협곡의 얼어붙은 돌판 퍼즐(한 수 메이트)을 풀자.' },
  sq_smith: { name: '대장장이의 첫 제자', board: true, desc: '대장간에서 장비를 한 번 개조하자. 개조 칸에 재료를 넣으면 행마나 특성이 붙는다.', target: 1 },
  sq_dex: { name: '몹 도감 채우기', board: true, desc: '서로 다른 몹 5종을 쓰러뜨리자.', target: 5 },
  sq_merchant: { name: '떠돌이 나이트 상인', board: true, desc: '들판을 L자로 뛰어다니는 상인과 같은 칸에 도착하자.' },
  sq_dex2: { name: '늪의 도감', board: true, desc: '늪·성채의 몹 4종(두꺼비·거미·해골 기사·망령)을 쓰러뜨리자.', target: 4 },
  sq_sheep: { name: '잃어버린 양', desc: '들판·숲·언덕에 흩어진 양 3마리를 찾자.', target: 3 },
  sq_rook: { name: '길을 막은 룩', desc: '들판 북쪽 길목을 막은 룩을 비키게 하자.' },
  sq_shrine: { name: '비숍의 성소', desc: '숲 속 성소(북서쪽 구석)에 가서 할 일을 정하자.' },
  sq_puzzle: { name: '광장의 수수께끼', desc: '광장의 체스 퍼즐(한 수 만에 체크메이트)을 풀자.' },
  sq_pawn: { name: '멈춘 폰 병사', desc: '움직이지 않는 폰 병사. 모험을 다녀와서 다시 말을 걸어 보자.', target: 3 },
  sq_scout: { name: '정찰병의 지도', desc: '안개 비석(늪), 부서진 제단(성채), 탑의 문(탑)을 밟아 지도를 채우자.', target: 3 },
  sq_witch: { name: '마녀의 솥', desc: '안개 거미줄 3개와 망령 정수 2개를 늪의 마녀에게 가져가자.' },
  sq_ghost: { name: '망령 기사의 한', desc: '성채의 뼈 군주를 쓰러뜨리고 망령 기사에게 돌아가자.' },
  sq_puzzle2: { name: '금 간 돌판', desc: '성채의 돌판 퍼즐을 풀자.' },
  sq_secret: { name: '안개 낀 북쪽', secret: true, desc: '안개 열쇠가 가리키는 곳: 마을 북쪽 가장자리 너머.' },
  rc_soldier: { name: '폰 병사의 첫 수', recruit: true, desc: '폰 병사와 함께 시험 전투를 치르자. (마을 폰 병사에게 말 걸기)' },
  rc_ghost: { name: '망령 기사의 맹세', recruit: true, desc: '망령 기사와 함께 시험 전투를 치르자. (성채 망령 기사에게 말 걸기)' },
  rc_priest: { name: '사제의 순례', recruit: true, desc: '사제 비숍과 함께 시험 전투를 치르자. (마을 사제에게 말 걸기)' },
};

export const q = (id: string): QState => G.quests[id] ?? (G.quests[id] = { st: 'locked', n: 0 });
export const qst = (id: string): QSt => q(id).st;
export const qOn = (id: string) => ['active', 'ready'].includes(qst(id));

export function qStart(id: string, silent = false) {
  const s = q(id);
  if (s.st === 'active' || s.st === 'ready' || s.st === 'done') return;
  s.st = 'active';
  if (!silent) toast(`퀘스트 시작: ${QUESTS[id].name}`, 'info');
  log(`📜 퀘스트 시작 — ${QUESTS[id].name}`);
  if (!G.flags.track || !qOn(String(G.flags.track))) G.flags.track = id;
  emit('questStart', id);
}

export function qReady(id: string) {
  const s = q(id);
  if (s.st !== 'active') return;
  s.st = 'ready';
  toast(`퀘스트 완료 조건 달성: ${QUESTS[id].name}`, 'good');
}

export interface Reward { gold?: number; mats?: [MatId, number][]; text?: string }

export function qComplete(id: string, r: Reward = {}) {
  const s = q(id);
  if (s.st === 'done') return;
  s.st = 'done';
  G.progress += 1;
  const parts: string[] = [];
  if (r.gold) {
    // 퀘스트 골드는 조금 줄였다 (퀘스트만 해도 1000G가 남아돈다는 베타 의견)
    const gold = Math.round(r.gold * 0.8 * (hasJob('judge') ? 1.5 : 1) * DIFFS[G.diff].gold);
    G.gold += gold;
    parts.push(`${gold}G`);
  }
  for (const [m, n] of r.mats ?? []) {
    if (!n) continue;
    addBag(m, n);
    parts.push(`${MATS[m].name} ×${n}`);
  }
  if (r.text) parts.push(r.text);
  questBanner(QUESTS[id].name, parts.join(', '), !!QUESTS[id].main);
  toast(`퀘스트 완료: ${QUESTS[id].name}${parts.length ? ' — ' + parts.join(', ') : ''}`, 'good');
  log(`✅ ${QUESTS[id].name} 완료 ${parts.join(', ')}`);
  if (G.flags.track === id) G.flags.track = '';
  emit('questDone', id);
}

export function progressText(id: string) {
  const d = QUESTS[id];
  const s = q(id);
  if (s.st === 'ready') return '보고하기';
  if (d.target) return `${Math.min(s.n, d.target)}/${d.target}`;
  return '';
}

const R2_DEX: MobId[] = ['toad', 'spider', 'skeleton', 'wraith'];
/** 대장간에서 개조한 횟수 (옛 저장은 만든 횟수에서 이어서 센다) */
export const craftCount = () => Number(G.flags.crafts ?? 0);

export function initQuestHooks() {
  on('craft', () => {
    G.flags.crafts = Number(G.flags.crafts ?? 0) + 1;
    const s = q('sq_smith');
    if (s.st === 'active') {
      s.n = 1;
      qReady('sq_smith');
    }
  });
  on('kill', (k) => {
    // 도감 퀘스트는 '이번 생에 잡은 몹'으로 센다 (환생하면 도감은 이어받지만 퀘스트가 바로 끝나면 안 된다)
    if (!G.flags.lk_init) {
      G.flags.lk_init = true;
      // 기록이 생기기 전의 1회차 저장: 지금까지 도감을 이번 생의 기록으로 본다
      if (!Number(G.flags.rebirth ?? 0)) for (const m of Object.keys(G.dex)) if (G.dex[m] > 0) G.flags[`lk_${m}`] = true;
    }
    if (typeof k === 'string') G.flags[`lk_${k}`] = true;
    const killedNow = (m: string) => !!G.flags[`lk_${m}`];
    const s = q('sq_dex');
    if (s.st === 'active') {
      s.n = Object.keys(MOBS).filter((m) => MOBS[m as MobId].dex && killedNow(m)).length;
      if (s.n >= 5) qReady('sq_dex');
    }
    const s2 = q('sq_dex2');
    if (s2.st === 'active') {
      s2.n = R2_DEX.filter((m) => killedNow(m)).length;
      if (s2.n >= 4) qReady('sq_dex2');
    }
  });
  // 동료 개인 퀘스트: 조건을 채우면 곧바로 완료 (동료는 파티에 있어 따로 말을 걸 곳이 없다)
  const companionDone = (id: string, c: string, name: string) => {
    qComplete(id, { text: `${name}의 체력 +2, 공격 +1` });
    G.flags[`cup_${c}`] = true;
  };
  on('battleWin', (d) => {
    const s = q('cq_soldier');
    if (s.st === 'active' && G.party.includes('soldier')) {
      s.n++;
      if (s.n >= 8) companionDone('cq_soldier', 'soldier', '폰 병사');
    }
    const w = d as { awake?: boolean };
    if (w.awake && qst('cq_ghost') === 'active' && G.party.includes('ghostknight')) companionDone('cq_ghost', 'ghostknight', '망령 기사');
  });
  on('kill', (m) => {
    const s = q('sq_wolves');
    if (s.st === 'active' && m === 'wolf') {
      s.n++;
      if (s.n >= 4) qReady('sq_wolves');
    }
  });
  on('rest', () => {
    const s = q('cq_priest');
    if (s.st === 'active' && G.party.includes('priest')) {
      s.n++;
      if (s.n >= 5) companionDone('cq_priest', 'priest', '사제 비숍');
    }
  });
  on('recruit', (c) => {
    const id = c === 'soldier' ? 'cq_soldier' : c === 'ghostknight' ? 'cq_ghost' : 'cq_priest';
    qStart(id);
  });
  on('gain', () => {
    const s = q('sq_witch');
    if (s.st === 'active' && matHave('silk') >= 3 && matHave('ecto') >= 2) qReady('sq_witch');
  });
}

export const BOARD_REWARDS: Record<string, Reward> = {
  sq_smith: { gold: 20, mats: [['fiber', 3]] },
  sq_dex: { gold: 30, mats: [['silver', 1], ['fiber', 4]] },
  sq_dex2: { gold: 50, mats: [['mirror', 1], ['skin', 2]] },
};

/**
 * 안내 줄에 보여 줄 보상 요약 (실제 지급은 각 qComplete 호출부). 선택에 따라 달라지는 건 '선택에 따라'.
 * 골드는 숫자만 두고 표시할 때 난이도·직업 배율을 곱한다.
 */
const REWARD_HINT: Record<string, { gold?: number; text?: string }> = {
  main_job: { gold: 10 },
  main_boss: { gold: 50, text: '밀짚 왕관' },
  main_promo: { gold: 30, text: '첫 승급' },
  main_r2: { gold: 100, text: '뒤집힌 왕관' },
  main_promo2: { gold: 60, text: '두 번째 승급' },
  main_r3: { gold: 150, text: '얼어붙은 왕관' },
  main_promo3: { gold: 80, text: '세 번째 승급' },
  main_r4: { gold: 200 },
  sq_smith: { gold: 20, text: '섬유' },
  sq_dex: { gold: 30, text: '은·섬유' },
  sq_dex2: { gold: 50, text: '거울 파편·가죽' },
  sq_merchant: { text: '은·상점 할인 20%' },
  sq_rook: { text: '골드 (선택에 따라)' },
  sq_puzzle: { text: '균열 이끼' },
  sq_puzzle2: { text: '안개 열쇠·균열 이끼' },
  sq_puzzle3: { gold: 60, text: '엄니·서리' },
  sq_sheep: { text: '골드·재료 (선택에 따라)' },
  sq_shrine: { text: '선택에 따라' },
  sq_scout: { gold: 40, text: '거울 파편·가죽' },
  sq_witch: { text: '거울 파편 (선택에 따라)' },
  sq_ghost: { text: '선택에 따라 (동료가 될 수도)' },
  sq_wolves: { gold: 60, text: '털·얼음' },
  sq_hermit: { text: '선택에 따라' },
  sq_pawn: { text: '동료' },
  rc_soldier: { text: '동료 합류' },
  rc_ghost: { text: '동료 합류' },
  rc_priest: { text: '동료 합류' },
  cq_soldier: { text: '동료 강화' },
  cq_ghost: { text: '동료 강화' },
  cq_priest: { text: '동료 강화' },
};
export function rewardHint(id: string): string {
  const r = REWARD_HINT[id];
  if (!r) return '';
  const parts: string[] = [];
  if (r.gold) parts.push(`${Math.round(r.gold * 0.8 * (hasJob('judge') ? 1.5 : 1) * DIFFS[G.diff].gold)}G`);
  if (r.text) parts.push(r.text);
  return parts.join('·');
}

// ---------- 퀘스트 안내 ----------
export interface GuideTarget { area: AreaId; obj?: string; pos?: Vec; text: string }

const SHEEP: [string, AreaId, Vec][] = [['sheep1', 'meadow', [1, 5]], ['sheep2', 'forest', [6, 6]], ['sheep3', 'hills', [6, 6]]];
const WAYPOINTS: [string, AreaId, Vec, string][] = [['wp_marsh', 'marsh', [3, 3], '안개 비석'], ['wp_ruins', 'ruins', [3, 5], '부서진 제단'], ['wp_tower', 'tower', [1, 6], '탑의 문']];

export function guideFor(id: string): GuideTarget | null {
  const st = qst(id);
  const T = (area: AreaId, obj: string, text: string): GuideTarget => ({ area, obj, text });
  switch (id) {
    case 'main_job': return T('town', 'record', '기록의 벽');
    case 'main_boss': return st === 'active' ? { area: 'throne', pos: [4, 2], text: '밀짚왕' } : T('town', 'elder', '촌장 킹');
    case 'main_promo': return T('town', 'elder', '촌장 킹에게 왕관 바치기');
    case 'main_r2': return { area: 'tower', pos: [4, 3], text: '잘못 둔 퀸' };
    case 'main_promo2': return T('town', 'elder', '촌장 킹에게 뒤집힌 왕관 바치기');
    case 'main_r3': return { area: 'kingpeak', pos: [4, 3], text: '얼어붙은 킹' };
    case 'main_promo3': return T('frostpost', 'hermit', '늙은 룩 은자에게 얼어붙은 왕관 바치기');
    case 'main_r4': return { area: 'lastpage', pos: [4, 2], text: '저자' };
    case 'sq_wolves': return st === 'ready' ? T('tundra', 'lostpawn', '길 잃은 폰에게 보고') : { area: 'tundra', text: '설원 늑대 사냥' };
    case 'sq_puzzle3': return T('glacier', 'puzzle3', '얼음 속 돌판');
    case 'sq_hermit': return G.flags.towers_done ? T('frostpost', 'hermit', '은자에게 보고') : { area: 'bastion', pos: [3, 3], text: '요새의 파수꾼' };
    case 'sq_smith': return st === 'ready' ? T('town', 'board', '게시판에 보고') : T('town', 'forge', '대장간에서 장비 개조하기 (장비 → 재료 → 효과 고르기)');
    case 'sq_dex': case 'sq_dex2': return st === 'ready' ? T('town', 'board', '게시판에 보고') : null;
    case 'sq_merchant': return T('meadow', 'merchant', '나이트 상인 (L자로 움직인다)');
    case 'sq_sheep': {
      if (st === 'ready') return T('town', 'shepherd', '양치기에게 보고');
      const next = SHEEP.find(([f]) => !G.flags[f]);
      return next ? { area: next[1], obj: next[0], pos: next[2], text: '길 잃은 양' } : null;
    }
    case 'sq_rook': return T('meadow', 'rook', '고집쟁이 룩');
    case 'sq_shrine': return T('forest', 'shrine', '비숍의 성소');
    case 'sq_puzzle': return T('town', 'puzzle', '광장의 수수께끼');
    case 'sq_pawn': return T('town', 'soldier', '폰 병사 (모험 후 다시)');
    case 'sq_scout': {
      if (st === 'ready') return T('camp', 'scout', '정찰병에게 보고');
      const next = WAYPOINTS.find(([f]) => !G.flags[f]);
      return next ? { area: next[1], obj: next[0], pos: next[2], text: next[3] } : null;
    }
    case 'sq_witch': return st === 'ready' ? T('camp', 'witch', '마녀에게 재료 전달') : null;
    case 'sq_ghost': return G.flags.bonelord_dead ? T('ruins', 'ghostknight', '망령 기사에게 보고') : { area: 'ruins', pos: [4, 1], text: '뼈 군주' };
    case 'sq_puzzle2': return T('ruins', 'puzzle2', '금 간 돌판');
    case 'sq_secret': return { area: 'town', pos: [3, 0], text: '북쪽으로 나가기' };
    case 'rc_soldier': return T('town', 'soldier', '폰 병사');
    case 'rc_ghost': return T('ruins', 'ghostknight', '망령 기사');
    case 'rc_priest': return T('town', 'priest', '사제 비숍');
  }
  return null;
}

/** 지금 안내할 퀘스트: 직접 고른 것 → 보고할 것 → 메인 → 나머지 */
export function trackedQuest(): string | null {
  const t = String(G.flags.track ?? '');
  if (t && qOn(t) && guideFor(t)) return t;
  const on = Object.keys(QUESTS).filter((id) => qOn(id) && guideFor(id));
  return on.find((id) => qst(id) === 'ready') ?? on.find((id) => QUESTS[id].main) ?? on[0] ?? null;
}
