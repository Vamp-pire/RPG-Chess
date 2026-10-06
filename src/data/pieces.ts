import { DIAG, KING, KNIGHT, ORTH, RING2 } from '../core/geom';
import { MoveRule } from '../core/rules';

export type PieceId = 'pawn' | 'knight' | 'bishop';

export interface PieceDef {
  id: PieceId;
  name: string;
  img: string;
  hp: number;
  rules: MoveRule[];
  desc: string;
  promo: { name: string; rules: MoveRule[]; hp: number; desc: string };
  promo2: { name: string; rules: MoveRule[]; hp: number; desc: string };
  /** 두 번째 승급의 갈래 (고르면 promo2 대신 쓴다) */
  branches?: Record<BranchId, { name: string; rules: MoveRule[]; hp: number; desc: string }>;
}

export type BranchId = 'knight' | 'priest' | 'wall';

/** 세 번째 승급 (얼어붙은 왕관): 모든 말 공통 */
export const PROMO3 = { name: '왕관 쓴 용사', rules: [{ kind: 'leap', dirs: RING2, range: 1, mode: 'move' }] as MoveRule[], hp: 3, desc: '두 칸 떨어진 곳 어디로든 뛰어 옮길 수 있다 (이동만).' };

export const PIECES: Record<PieceId, PieceDef> = {
  pawn: {
    id: 'pawn', name: '폰 (용사)', img: 'wp', hp: 7,
    rules: [{ kind: 'step', dirs: KING, range: 1, mode: 'both' }],
    desc: '킹처럼 8방향으로 1칸. 어느 쪽이든 붙은 적을 칠 수 있고, 쓰러질 피해를 한 번 버틴다 (용사의 의지 — 여관·모닥불에서 쉬면 다시 차오른다).',
    promo: { name: '돌격 용사', rules: [{ kind: 'slide', dirs: ORTH, range: 2, mode: 'both' }], hp: 2, desc: '상하좌우 2칸 돌격이 추가된다.' },
    promo2: { name: '기보의 용사', rules: [{ kind: 'slide', dirs: DIAG, range: 2, mode: 'both' }], hp: 2, desc: '대각선 2칸 돌격이 추가된다.' },
    branches: {
      knight: { name: '기사 용사', rules: [{ kind: 'leap', dirs: KNIGHT, range: 1, mode: 'both' }], hp: 2, desc: 'L자로 뛰어넘어 이동하고 공격한다. 막힌 판에 강하다.' },
      priest: { name: '사제 용사', rules: [{ kind: 'slide', dirs: DIAG, range: 3, mode: 'both' }], hp: 2, desc: '대각선 3칸 돌격. 전투에서 이길 때마다 체력 1 회복.' },
      wall: { name: '성벽 용사', rules: [{ kind: 'slide', dirs: ORTH, range: 3, mode: 'move' }], hp: 4, desc: '상하좌우 3칸 이동(공격은 안 됨). 최대 체력 +4, 견고 +1.' },
    },
  },
  knight: {
    id: 'knight', name: '나이트', img: 'wn', hp: 7,
    rules: [{ kind: 'leap', dirs: KNIGHT, range: 1, mode: 'both' }, { kind: 'step', dirs: DIAG, range: 1, mode: 'move' }],
    desc: 'L자로 뛰어넘는다. 막힌 판도 문제없다. 대각선 1칸 발걸음(이동만)으로 공격 자리를 잡는다.',
    promo: { name: '기사단장', rules: [{ kind: 'step', dirs: KING, range: 1, mode: 'both' }], hp: 2, desc: '8방향 1칸 이동이 추가된다.' },
    promo2: { name: '성전 기사', rules: [{ kind: 'slide', dirs: ORTH, range: 3, mode: 'both' }], hp: 2, desc: '상하좌우 3칸 돌진이 추가된다.' },
  },
  bishop: {
    id: 'bishop', name: '비숍', img: 'wb', hp: 6,
    rules: [{ kind: 'slide', dirs: DIAG, range: 7, mode: 'both' }, { kind: 'step', dirs: ORTH, range: 1, mode: 'move' }],
    desc: '대각선 끝까지 달린다. 사거리가 길지만 체력이 낮다. 상하좌우 1칸 발걸음(이동만)으로 칸 색을 바꿀 수 있다.',
    promo: { name: '대사제', rules: [{ kind: 'step', dirs: ORTH, range: 1, mode: 'both' }], hp: 3, desc: '상하좌우 1칸으로도 공격할 수 있게 된다.' },
    promo2: { name: '대주교', rules: [{ kind: 'leap', dirs: KNIGHT, range: 1, mode: 'both' }], hp: 3, desc: 'L자 점프가 추가된다.' },
  },
};

// ---------- 동료 (후반, 드물고 묵직하게) ----------
export type CompanionId = 'soldier' | 'ghostknight' | 'priest';
export interface CompanionDef {
  id: CompanionId;
  name: string;
  img: string;
  hp: number;
  rules: MoveRule[];
  passive: string;
  desc: string;
}

export const COMPANIONS: Record<CompanionId, CompanionDef> = {
  soldier: {
    id: 'soldier', name: '폰 병사', img: 'wp', hp: 6,
    rules: [{ kind: 'step', dirs: ORTH, range: 1, mode: 'move' }, { kind: 'step', dirs: DIAG, range: 1, mode: 'attack' }, { kind: 'slide', dirs: ORTH, range: 2, mode: 'move' }],
    passive: '방진: 주인공과 붙어 있으면 둘 다 받는 피해 -1',
    desc: '기보를 기다리던 병사. 곧게 걷고 대각선으로 찌른다.',
  },
  ghostknight: {
    id: 'ghostknight', name: '망령 기사', img: 'wn', hp: 5,
    rules: [{ kind: 'leap', dirs: KNIGHT, range: 1, mode: 'both' }, { kind: 'slide', dirs: ORTH, range: 2, mode: 'both', pierce: true }],
    passive: '망령: 공격한 적이 살아남으면 다음 행동을 못 한다',
    desc: '무너진 성채를 지키던 기사의 영혼.',
  },
  priest: {
    id: 'priest', name: '사제 비숍', img: 'wb', hp: 4,
    rules: [{ kind: 'slide', dirs: DIAG, range: 3, mode: 'both' }],
    passive: '축복: 행동하는 대신 인접 아군을 2 회복할 수 있다',
    desc: '대각선의 가호를 지닌 사제.',
  },
};

export type Align = 'light' | 'dark' | 'neutral';
export type JobId =
  | 'paladin' | 'healer' | 'pilgrim' | 'judge'
  | 'thief' | 'contractor' | 'necro' | 'assassin'
  | 'wanderer' | 'alchemist' | 'hunter' | 'scholar';

export interface JobDef { id: JobId; name: string; align: Align; desc: string }

export const ALIGN_NAMES: Record<Align, string> = { light: '빛', dark: '어둠', neutral: '중립' };

export const JOBS: JobDef[] = [
  { id: 'paladin', name: '성기사', align: 'light', desc: '설득이 통한다. 막아선 이를 말로 비키게 할 수 있다.' },
  { id: 'healer', name: '치유사', align: 'light', desc: '지역을 옮길 때마다 체력 1 회복.' },
  { id: 'pilgrim', name: '순례자', align: 'light', desc: '성소와 기도에서 받는 보상이 늘어난다.' },
  { id: 'judge', name: '심판관', align: 'light', desc: '퀘스트 보상 골드 +50%.' },
  { id: 'thief', name: '도적', align: 'dark', desc: '상자와 약탈에서 재료를 1개 더 얻는다.' },
  { id: 'contractor', name: '계약자', align: 'dark', desc: '계약 선택지를 쓸 수 있고, 판매가 +25%.' },
  { id: 'necro', name: '사령술사', align: 'dark', desc: '쓰러뜨린 몹에게서 가끔 재료를 더 거둔다.' },
  { id: 'assassin', name: '암살자', align: 'dark', desc: '움직이지 않는 몹을 기습하면 그 적이 약해진 채 시작한다.' },
  { id: 'wanderer', name: '방랑자', align: 'neutral', desc: '탐험할 때 대각선 1칸 걸음도 쓸 수 있다.' },
  { id: 'alchemist', name: '연금술사', align: 'neutral', desc: '조합 품질 +1.' },
  { id: 'hunter', name: '사냥꾼', align: 'neutral', desc: '희귀 재료가 더 잘 나온다.' },
  { id: 'scholar', name: '학자', align: 'neutral', desc: '적의 정보를 읽고, 퍼즐·도감 보상이 늘어난다.' },
];

export const jobDef = (id: JobId | null) => JOBS.find((j) => j.id === id) ?? null;
