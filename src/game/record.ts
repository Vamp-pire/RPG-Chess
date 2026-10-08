import { G } from '../core/state';
import { AREAS, AreaId } from '../data/areas';
import { BASE_LIST } from '../data/gear';
import { MOBS, MobId } from '../data/mobs';
import { qst } from './quests';

/**
 * 지역 기록률: 그 지역을 얼마나 즐겼나. 보스 길은 기록률 60% 이상이어야 열린다 (사용자 결정 G1).
 * 몹(이번 생에 잡은 종류) · 지역 의뢰(끝낸 것) · 장비(본 밑판)로 채운다. 무엇을 하든 진행으로 쳐 준다.
 */
export const RECORD_NEED = 60;

/** 지역마다 보스가 있는 곳과 쓰러뜨렸다는 표시 */
const BOSS: Record<number, { area: AreaId; dead: string }> = {
  1: { area: 'throne', dead: 'boss_dead' },
  2: { area: 'tower', dead: 'queen_dead' },
  3: { area: 'kingpeak', dead: 'king_dead' },
  4: { area: 'lastpage', dead: 'author_dead' },
};

/** 지역 의뢰 (길을 여는 데 꼭 필요한 퀘스트는 빼지 않는다 — 어차피 하게 되니 덤) */
const QUESTS: Record<number, string[]> = {
  1: ['sq_sheep', 'sq_rook', 'sq_shrine', 'sq_puzzle', 'sq_merchant', 'sq_dex', 'sq_smith'],
  2: ['sq_scout', 'sq_witch', 'sq_ghost', 'sq_puzzle2', 'sq_dex2'],
  3: ['sq_wolves', 'sq_puzzle3', 'sq_hermit'],
  4: [],
};

const regionMobs = (r: number): MobId[] => {
  const s = new Set<MobId>();
  for (const a of Object.values(AREAS)) {
    if (a.region !== r) continue;
    for (const t of a.random?.table ?? []) for (const p of t.party) for (const m of p) if (MOBS[m]?.dex) s.add(m);
  }
  return [...s];
};

/** 몹이 떨어뜨리는 그 지역 장비 (상점·시작·보스·의식 장비는 빼고) */
const regionGear = (r: number) => BASE_LIST.filter((b) => b.region === r && !b.unique && b.from.some((f) => f !== 'shop' && f !== 'starter' && f !== 'boss' && f !== 'ritual'));

export interface RecordPart { label: string; have: number; total: number; weight: number }

export function regionRecord(r: number): { pct: number; parts: RecordPart[] } {
  const mobs = regionMobs(r);
  const quests = QUESTS[r] ?? [];
  const gear = regionGear(r);
  const parts: RecordPart[] = [
    { label: '몹', have: mobs.filter((m) => G.flags[`lk_${m}`]).length, total: mobs.length, weight: quests.length ? 40 : 55 },
    { label: '의뢰', have: quests.filter((id) => qst(id) === 'done').length, total: quests.length, weight: quests.length ? 30 : 0 },
    { label: '장비', have: gear.filter((b) => G.flags[`seen_${b.id}`]).length, total: gear.length, weight: quests.length ? 30 : 45 },
  ].filter((p) => p.total > 0);
  const wsum = parts.reduce((s, p) => s + p.weight, 0) || 1;
  const pct = Math.round(parts.reduce((s, p) => s + (p.have / p.total) * p.weight, 0) / wsum * 100);
  return { pct, parts };
}

/** 이 출구가 보스 지역으로 가는데 기록률이 모자라면 그 지역 번호 (아니면 0) */
export function recordBlocks(to: AreaId | undefined): number {
  if (!to || !G) return 0;
  for (const [r, b] of Object.entries(BOSS)) {
    if (b.area !== to) continue;
    if (G.flags[b.dead]) return 0;
    return regionRecord(Number(r)).pct < RECORD_NEED ? Number(r) : 0;
  }
  return 0;
}

/** 아직 보스를 안 잡은 지역이면 기록률을 보여 준다 */
export const showRecord = (r: number) => r >= 1 && r <= 4 && !!G && !G.flags[BOSS[r].dead];

export const recordText = (r: number) => {
  const { pct, parts } = regionRecord(r);
  return { pct, detail: parts.map((p) => `${p.label} ${p.have}/${p.total}`).join(' · ') };
};
