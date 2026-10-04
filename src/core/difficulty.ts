// 난이도: 보상·편의·적 세기, 그리고 '안 맞는 사이클'을 깨는 장치(따라붙기·협공·흐린 예고·기습·초읽기)의
// 빈도와 존재 여부가 함께 바뀐다. (협공은 역효과가 많아 뺐다) 화면에는 중요한 일부(shown)만 알려 준다.
export type Diff = 'story' | 'easy' | 'normal' | 'hard' | 'master';

export interface DiffDef {
  name: string;
  /** 난이도 선택 화면에 보이는 설명 (전부가 아니다) */
  shown: string[];
  /** 전투 골드·퀘스트 골드 배율 */
  gold: number;
  /** 희귀 재료 확률 배율 */
  rare: number;
  /** 몹마다 기본 재료를 하나 더 줄 확률 */
  extra: number;
  /** 몹의 기본 재료가 떨어질 확률 (1 = 항상) */
  drop: number;
  /** 쓰러졌을 때 잃는 가방 재료 비율 */
  loss: number;
  /** 재련(장비 분해)으로 돌려받는 재료 비율. 0이면 재련 불가 */
  refund: number;
  /** 용사의 의지가 전투마다 다시 차오르는가 (아니면 쉬어야 차오름) */
  willEachBattle: boolean;
  /** 엘리트·보스 추가 체력 (음수면 줄어듦, 최소 1) */
  bossHp: number;
  /** 일반 몹 추가 체력 (음수면 줄어듦, 최소 1) */
  mobHp: number;
  /** 도망칠 때 체력 손실 */
  fleeCost: number;
  /** 빛나는 개체가 나올 확률 */
  shiny: number;
  // ---- 숨은 전투 장치 ----
  /** 공격이 빗나간 적이 한 칸 따라붙는가 */
  chase: boolean;
  /** 숨 고르는 적: 이 횟수마다 한 번 쉰다 (2 = 공격·쉬기, 3 = 공격·공격·쉬기) */
  breath: number;
  /** 3지역부터 엘리트 일부가 예고 없이 덮칠 확률 (공격 한 번마다) */
  ambush: number;
  /** 3지역부터 일반 몹 예고가 정확한 칸 대신 '이 근처'로만 보일 확률 */
  blur: number;
  /** 초읽기: 이 턴을 넘기면 적이 사나워진다 (0 = 없음, 보스전은 1.6배 길게) */
  clock: number;
  /** 적이 움직일 때 주인공의 행마(칠 수 있는 칸)를 따져 볼 확률 — 칠 수 없는 채로 주인공 사정거리에 들어가길 피한다 */
  aware: number;
  /** 한 번 더 움직이기: 숨은 빠르기(몹마다 0~2) × 이 값 = 이동한 뒤 한 번 더 움직일 확률 */
  haste: number;
  /** 세 턴 동안 건드리지 않은 적이 반격 태세를 갖출 확률 */
  retaliate: number;
}

// 전투 세기는 한 칸씩 올렸다 (베타 테스터: 어려움을 보통으로, 보통을 쉬움으로). 보상·편의는 이름 그대로
export const DIFFS: Record<Diff, DiffDef> = {
  story: {
    name: '입문',
    shown: ['적이 약하고, 쓰러져도 재료를 잃지 않아요', '이야기를 편하게 즐기고 싶은 분께'],
    gold: 0.5, rare: 0.45, extra: 0, drop: 0.9, loss: 0, refund: 1, willEachBattle: true, bossHp: -2, mobHp: -1, fleeCost: 0, shiny: 0.05,
    chase: false, breath: 2, ambush: 0, blur: 0, clock: 0, aware: 0, haste: 0, retaliate: 0,
  },
  easy: {
    name: '쉬움',
    shown: ['장비를 재련하면 재료를 모두 돌려받아요', '전투가 아직 낯설다면 여기서'],
    gold: 0.6, rare: 0.5, extra: 0, drop: 0.85, loss: 0.25, refund: 1, willEachBattle: true, bossHp: 0, mobHp: 0, fleeCost: 0, shiny: 0.05,
    chase: true, breath: 3, ambush: 0.05, blur: 0.1, clock: 32, aware: 0.4, haste: 0.09, retaliate: 0.08,
  },
  normal: {
    name: '보통',
    shown: ['장비를 재련하면 재료를 절반 돌려받아요', '처음 하는 분께 추천해요'],
    gold: 1, rare: 0.8, extra: 0, drop: 0.8, loss: 0.5, refund: 0.5, willEachBattle: false, bossHp: 1, mobHp: 0, fleeCost: 1, shiny: 0.07,
    chase: true, breath: 3, ambush: 0.09, blur: 0.25, clock: 24, aware: 0.65, haste: 0.13, retaliate: 0.14,
  },
  hard: {
    name: '어려움',
    shown: ['재련할 수 없어요', '예고 없이 덮치는 적이 있어요', '보상이 훨씬 많아요'],
    gold: 1.5, rare: 1.6, extra: 0.22, drop: 0.8, loss: 1, refund: 0, willEachBattle: false, bossHp: 2, mobHp: 1, fleeCost: 1, shiny: 0.1,
    chase: true, breath: 4, ambush: 0.15, blur: 0.4, clock: 18, aware: 0.9, haste: 0.18, retaliate: 0.22,
  },
  master: {
    name: '그랜드마스터',
    shown: ['적이 내 움직임을 읽어요', '전투를 오래 끌면 적이 사나워져요', '보상이 가장 많아요'],
    gold: 2, rare: 2, extra: 0.32, drop: 0.8, loss: 1, refund: 0, willEachBattle: false, bossHp: 3, mobHp: 1, fleeCost: 2, shiny: 0.12,
    chase: true, breath: 5, ambush: 0.22, blur: 0.55, clock: 14, aware: 1, haste: 0.25, retaliate: 0.3,
  },
};

export const DIFF_ORDER: Diff[] = ['story', 'easy', 'normal', 'hard', 'master'];
/** 어려움 이상 (업적 등) */
export const isHardPlus = (d: Diff) => d === 'hard' || d === 'master';
