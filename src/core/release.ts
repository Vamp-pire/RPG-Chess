// 출시 정보: 버전·채널, 패치 노트, 크레딧, 그리고 베타 → 정식 출시 때의 저장 초기화.
//
// ▶ 정식 출시할 때 할 일
//   1) CHANNEL = 'release', VERSION = '1.0.0'
//   2) SAVE_GEN 을 1 올린다 → 베타 저장(슬롯·엔딩 기록)이 한 번 초기화되고 안내 창이 뜬다
//      (지우기 전에 통째로 cf_beta_backup 에 남겨 두므로 문제가 생겨도 되살릴 수 있다)
//   3) PATCH_NOTES 맨 앞에 1.0.0 항목을 추가한다
//   설정(cf_prefs)·업적은 아니고 '저장 슬롯과 엔딩 기록'만 지운다.
//   이때 베타 저장이 있던 사람에게는 cf_beta_gift = 'pending' 이 남아, 새 게임을 시작할 때
//   '첫 수를 둔 자' 칭호(업적)와 환생 보너스만큼의 재화(100G + 희귀 재료 2개)를 한 번 받는다.

export type Channel = 'beta' | 'release';
export const CHANNEL: Channel = 'beta';
export const VERSION = '1.1';
/** 저장 세대. 올리면 이전 세대의 저장을 한 번 초기화한다 */
export const SAVE_GEN = 1;

/** 베타 단계. 오픈 베타는 클로즈드 베타 저장을 그대로 이어 간다 (초기화는 정식 출시 때 한 번) */
export const BETA_STAGE: 'closed' | 'open' = 'open';
export const betaName = () => (BETA_STAGE === 'open' ? '오픈 베타' : '클로즈드 베타');
export const versionLabel = () => (CHANNEL === 'beta' ? `베타 ${VERSION}` : `v${VERSION}`);

/**
 * 오픈 베타 첫 실행 때 한 번: 이미 저장이나 엔딩 기록이 있으면 클로즈드 베타 테스터로 표시한다.
 * 표시된 사람은 슬롯을 불러올 때마다(아직 없으면) 칭호 「첫 수를 둔 자」를 받는다. 재화는 주지 않는다.
 */
export function markClosedTesters(store: Pick<Storage, 'getItem' | 'setItem'> = localStorage) {
  try {
    if (BETA_STAGE !== 'open' || store.getItem('cf_ob_mark')) return;
    if (SAVE_KEYS.some((k) => k !== 'cf_slot' && store.getItem(k) !== null)) store.setItem('cf_closed_tester', '1');
    store.setItem('cf_ob_mark', '1');
  } catch { /* */ }
}
export const isClosedTester = () => { try { return localStorage.getItem('cf_closed_tester') === '1'; } catch { return false; } };

export interface PatchNote { ver: string; date: string; title: string; items: string[] }

/** 최신이 맨 앞. 스포일러(보스 정체·숨은 무기·비밀 지역·엔딩)는 쓰지 않는다 */
export const PATCH_NOTES: PatchNote[] = [
  {
    ver: '1.1',
    date: '2026-10-05',
    title: '판이 적의 편을 들기 시작했어요',
    items: [
      '전투: 세 턴 동안 건드리지 않은 일반 적은 한 턴 동안 주황빛 「반격 태세 N%」가 돼요. 그 적을 쳤는데 살아남으면 N% 확률로 같은 방식으로 되받아쳐요. 한 턴 기다리면 풀려요.',
      '전투: 수풀과 고지를 적도 똑같이 써요. 수풀 속 적은 멀리서 칠 수 없고, 고지 위의 적은 피해가 1 늘어요.',
      '전투: 일반 전투를 시작할 때 난이도에 따라 적에게 유리한 지형이 몇 칸 깔려요.',
      '난이도: 단계별 전투 세기를 다시 맞췄어요. 이제 쉬움에서도 빗나간 적이 한 칸 따라붙어요. 입문에도 새 장치가 아주 약하게 붙고, 그랜드마스터는 한층 더 사나워졌어요.',
      '퍼즐: 여러 수 체크메이트 퍼즐이 생겼어요. 틀리면 처음 배치로 돌아가요. 돌판 퍼즐 하나가 두 수 문제로 바뀌었어요.',
      '퍼즐: 떠돌이 기보사의 명국이 14문제로 늘었어요. 예전에 다 풀었던 분께도 다시 찾아가요.',
      '화면: 붙어서 칠 수 있는 적에 ×2 표시가 붙고, 붙어서 친 피해는 크게 주황색으로 떠요.',
      '화면: 아군과 적 머리 위에 체력 숫자가 늘 보여요. 내 차례가 오면 판 테두리가 잠깐 빛나요.',
      '화면: 퀘스트를 마치면 금빛 띠가 지나가요. 창 닫기 옆에 Esc 안내가 붙었어요. 불러오는 동안 팁이 한 줄 보여요.',
      '대장간: 새 장비가 지금 장비보다 닿는 칸이 몇 칸 늘고 줄어드는지 보여 줘요. 완성할 때 모루를 세 번 두드리는 연출이 생겼어요.',
      '환생: 판 규칙 카드가 뒤집히며 이번 판의 규칙을 알려 줘요.',
      '전투: 잘못 둔 퀸이 공격하지 않은 턴에 곁으로 오는 일이 줄었어요.',
      '판 곳곳에 누군가 몰래 남긴 낙서가 숨어 있다는 소문이 있어요.',
      '기보에 아직 아무도 적지 못한 끝이 하나 더 생겼다는 이야기도 들려요.',
      '저장: 예전에 저장이 초기화된 브라우저라면 남아 있던 백업을 찾아 되살려 드려요. 지금 진행 중인 저장이 있으면 어느 쪽을 쓸지 먼저 물어봐요.',
      '방문 수 통계를 모으기 시작했어요. 쿠키 없이 익명으로 집계해요.',
    ],
  },
  {
    ver: '1.0',
    date: '2026-10-03',
    title: '오픈 베타 시작',
    items: [
      // 새로운 것
      '오픈 베타를 시작해요. 클로즈드 베타 저장은 그대로 이어지고, 참여해 주신 분은 칭호 「첫 수를 둔 자」를 받아요.',
      '엔딩이 7개가 됐어요. 어떤 길을 걸었는지(직업 성향, 부탁을 들어준 방식, 함께한 동료)에 따라 마지막에 고를 수 있는 끝이 달라져요. 엔딩을 본 뒤 못 본 끝의 힌트를 볼 수 있어요.',
      '난이도가 다섯 단계(입문·쉬움·보통·어려움·그랜드마스터)가 됐어요. 높을수록 적이 더 영리하게 움직여요. 무엇이 달라지는지는 일부만 알려 드려요.',
      '환생: 1장을 건너뛰고 시작할 수 있어요. 환생할 때마다 판 규칙 카드가 하나 붙어 판이 조금씩 달라져요.',
      '기록의 벽에서 누구나 직업(성향)을 다시 정할 수 있어요. 중립은 20G, 그 밖은 80G예요.',
      '동료를 셋까지 데리고 다닐 수 있어요.',
      // 전투
      '전투: 모든 체력이 2배가 됐어요. 대신 바로 옆에 붙어서 치면 피해가 2배, 떨어져서 치면 1배예요. 적도 똑같아요.',
      '전투: 재빠른 몹은 가끔 한 번 더 움직여요. 늪·설원·여백의 몹은 지나간 자리에 물웅덩이·빙판·번진 잉크를 남겨요.',
      '전투: 적이 벽을 돌아서 다가와요. 보스도 공격이 빗나가면 한 칸 따라붙어요.',
      '전투: 잘못 둔 퀸은 공격한 다음 또 잘못 놓아 내 곁으로 넘어져 와요. 그 한 턴이 붙어서 칠 기회예요.',
      '전투: 첫 보스는 조금 약해지고, 두 번째·세 번째 보스는 조금 강해졌어요.',
      '전투: 늪 두꺼비와 안개 거미가 한 칸씩 걸을 수도 있어요. 2지역 몹 체력도 조금 올렸어요.',
      '전투: 방진과 견고는 한 번 맞을 때 겹쳐 쓰이지 않아요. 숨겨진 장비 하나가 조금 약해졌어요.',
      '전투: 능력·축복·턴 넘기기·후퇴 버튼이 판 바로 아래로 옮겨졌어요.',
      // 대장간·경제
      '대장간: 숙련 제작을 없애고 부위는 늘 직접 골라요. 추천 조합은 균형·멀리·특성 세 가지예요.',
      '대장간: 비율이 모자란 재료는 "몇 개 더 넣으면 붙는지" 알려 줘요. 강화 탭 안내도 보강했어요.',
      '대장간: 망치질이 달구기 + 세 번 두드리기 미니게임이 됐어요.',
      '대장간: 사냥개 송곳니가 8방향 2칸에서 상하좌우 3칸이 됐어요.',
      '상점: 날마다 바뀌는 희귀 재료 특가가 생겼어요. 대신 퀘스트 골드와 몹이 떨어뜨리는 재료가 조금 줄었어요.',
      // 편의·이야기
      '설정에 "연출 생략"이 생겼어요. 움직임 애니메이션을 건너뛰고 결과만 보여 줘요.',
      '탐험: 몹 곁 칸이 옅게 표시되고, 자동 이동이 멈추면 이유를 알려 줘요.',
      '새 게임을 시작할 때 말을 고르는 창 없이 바로 난이도를 골라요.',
      '이야기: 판이 왜 망가지는지, 보스를 쓰러뜨리면 무엇이 돌아오는지가 중간중간 보여요. 대사도 전체적으로 다듬었어요.',
      // 고친 것
      '고침: 대화 사이에 판을 눌러 수를 둘 수 있던 문제, 매복 이벤트를 ✕로 닫아 빠져나가던 문제.',
      '고침: 자동 이동 중 몹과 겹치던 문제, 보스 왕관이 여러 개 나오던 문제.',
      '고침: 선택지 끝 괄호가 안 닫히던 문제, 정찰병이 퀸에 대해 대답하지 않던 문제, 마을 소문이 늦게 나오던 문제.',
      '고침: 체력이 많은 적의 체력 막대, 인벤토리 칸이 길어지거나 삐져나가던 문제, 좁은 화면의 업적 탭.',
    ],
  },
  {
    ver: '0.5',
    date: '2026-10-02',
    title: '베타 테스터 의견 반영',
    items: [
      '이야기: 장마다 시작과 끝을 알리는 장면이 생기고, 보스와 싸우기 전에 대화를 나눠요. 쉬는 동안 동료가 말을 걸고, 마을 사람들의 이야기도 장마다 달라져요.',
      '보스와 몬스터 그림이 원래 화질로 선명해졌어요.',
      '오른쪽 메뉴(지도·장비·도감·업적·도움말·설정)를 한곳에 모았어요. 지도는 장마다 다른 땅이 보이는 한 장의 그림이 됐어요.',
      '전투: 적이 공격할 칸에 받을 피해 숫자가 보여요.',
      '전투: 적의 예고 공격을 피하면 그 적이 한 칸 따라붙어요. 치고 빠지기만으로는 쉽지 않아요. (쉬움 난이도와 보스는 그대로)',
      '전투: 무기의 L자 공격에 장기의 마처럼 "멱"이 생겼어요. 치려는 쪽 바로 옆 칸이 막혀 있으면 그쪽으로는 못 쳐요. 은빛 날개를 30% 이상 넣은 무기는 멱을 넘어요.',
      '전투: 엘리트는 보통·어려움에서 두 번 공격한 뒤 숨을 골라요.',
      '전투: 첫 보스가 조금 순해졌어요. 사라지는 칸과 부하가 덜 자주 나와요.',
      '전투: 보스가 순간 이동하거나 부하를 부를 칸을 한 턴 앞서 판 위에 보여 줘요. 보스 규칙은 전투 내내 옆 패널에 남아요.',
      '전투: 보스전에서 [포기]할 수 있어요 (쓰러졌을 때와 같이 처리).',
      '대장간: 한 재료가 30% 이상이어야 행마가 붙어요. 같은 재료를 더 넣을 때 늘어나는 칸은 2개당 1칸이에요. (기존 장비도 다시 계산돼요)',
      '대장간: 재료가 마인크래프트풍 인벤토리 칸이 됐어요. 누르면 넣고, 미리보기 아래 [넣은 재료]를 누르면 빼요. 추천 조합은 위로, 제작 버튼은 창 아래에 고정.',
      '가방·여관 창고·상점도 같은 인벤토리 칸이에요. 상점은 바구니에 담아 [모두 팔기].',
      '탐험: 칸에 마우스를 올리면 실제로 걸어갈 길과 걸음 수를 미리 보여 줘요. 안내 화살표도 그 길을 따라가요.',
      '탐험: 지도에서 가 본 지역을 누르면 목적지로 안내해요. 지역 이동 확인창은 없앴어요.',
      '퀘스트 안내에 보상이 보여요. 장비 안내는 만든 횟수로 세요.',
      '대화: 선택지를 고르면 주인공이 그 말을 하는 연출이 나와요.',
      '처음 안내가 실제로 누를 곳을 손가락과 금빛 테두리로 짚어 줘요.',
      '배경 음악이 생겼어요 (설정에서 끄거나 음량 조절). 글자 크기 설정도 생겼어요.',
      '전리품 창에 새 재료·희귀 표시가 붙어요.',
      '도박 좌판의 배당과 문구를 바로잡았어요. 환생한 뒤 도감 의뢰가 바로 끝나던 문제도 고쳤어요.',
      '엔딩을 본 뒤에도 [기록의 벽]에서 환생할 수 있어요.',
    ],
  },
  {
    ver: '0.4',
    date: '2026-10-01',
    title: '클로즈드 베타 시작',
    items: [
      '네 지역, 대장간 조합·강화, 승급, 동료, 업적, 도감까지 처음부터 끝까지 플레이할 수 있어요.',
      '전투의 [버티기]가 사라졌어요. 대신 둘 수 있는 수가 하나도 없을 때만 [턴 넘기기]가 나타나요. 버거운 적은 장비를 강화해서 넘어서세요.',
      '바위 세트는 견고 +2, 성벽 용사는 견고 +1로 바뀌었어요.',
      '대화창 인물 그림이 크게 보여도 선명해졌어요.',
      '첫 화면이 더 빨리 뜨고, 불러오는 동안 시작 화면이 보여요.',
      '베타 기간의 저장은 정식 출시 때 초기화돼요. 그동안 마음껏 실험해 보세요!',
    ],
  },
];

export interface CreditLine { role: string; name: string; note?: string }

/** 제작자 이름 (비워 두면 표시하지 않는다) */
export const AUTHOR = 'Vamp_nickname (Discord)';

export const CREDITS: CreditLine[] = [
  { role: '체스 말 그림', name: 'Cburnett 세트 — Colin M.L. Burnett', note: 'Wikimedia Commons, BSD 라이선스로 사용' },
  { role: '몬스터·재료·건물 그림', name: 'Canva로 제작' },
  { role: '글꼴', name: '고운바탕 — 류양희', note: 'SIL Open Font License 1.1' },
  { role: '글꼴', name: 'IBM Plex Sans KR · IBM Plex Mono — IBM', note: 'SIL Open Font License 1.1' },
  { role: '음악·효과음', name: '코드로 직접 합성 (Web Audio)' },
];

// ---------- 저장 세대 확인 (베타 → 정식 초기화) ----------
const GEN_KEY = 'cf_save_gen';
const SAVE_KEYS = ['chessforge_save_v1', 'chessforge_save_v1_s2', 'chessforge_save_v1_s3', 'cf_slot', 'cf_meta'];

/**
 * 저장된 세대가 지금보다 낮으면 백업 후 저장을 지운다.
 * 세대 기록이 없으면 베타(1)로 친다. 저장이 없으면 지울 것 없이 기록만 한다.
 * 반환: 초기화했으면 true (안내 창을 띄우라는 뜻)
 */
export function checkSaveGen(store: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> = localStorage, cur = SAVE_GEN): boolean {
  try {
    // 기록이 없으면 베타 세대(1)로 본다: 이 기록이 생기기 전부터 베타를 한 사람도 출시 때 초기화되도록.
    // 저장이 없는 새로 온 사람은 아래에서 지울 것이 없으니 기록만 남긴다.
    const raw = store.getItem(GEN_KEY);
    const gen = raw === null ? 1 : Number(raw);
    if (gen >= cur) {
      if (raw === null) store.setItem(GEN_KEY, String(cur));
      return false;
    }
    const backup: Record<string, string> = {};
    for (const k of SAVE_KEYS) {
      const v = store.getItem(k);
      if (v !== null) backup[k] = v;
    }
    if (!Object.keys(backup).length) {
      store.setItem(GEN_KEY, String(cur));
      return false;
    }
    store.setItem('cf_beta_backup', JSON.stringify({ gen, at: Date.now(), data: backup }));
    // 베타에 참여한 사람: 다음 새 게임에서 '첫 수를 둔 자' 칭호와 선물을 한 번 받는다
    if (store.getItem('cf_beta_gift') === null) store.setItem('cf_beta_gift', 'pending');
    for (const k of SAVE_KEYS) store.removeItem(k);
    store.setItem(GEN_KEY, String(cur));
    return true;
  } catch {
    return false;
  }
}

/** 베타 참여자 선물이 남아 있으면 true를 돌려주고 '받음'으로 바꾼다 (새 게임 시작 때 한 번) */
export function takeBetaGift(): boolean {
  try {
    if (localStorage.getItem('cf_beta_gift') !== 'pending') return false;
    localStorage.setItem('cf_beta_gift', 'given');
    return true;
  } catch {
    return false;
  }
}

// ---------- 백업 되살리기 ----------
// 저장 세대를 한때 올렸다가 되돌린 경우처럼, 지금 세대인데도 브라우저에 백업(cf_beta_backup)만 남은 사람의 저장을 되살린다.
// 백업 세대가 지금 SAVE_GEN 보다 낮으면(= 정식 출시 때의 정상 초기화) 되살리지 않는다. 한 번 처리하면 다시 묻지 않는다.
type Store = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
interface Backup { gen: number; at: number; data: Record<string, string> }
const DONE_KEY = 'cf_backup_done';

function readBackup(store: Store): Backup | null {
  try {
    if (store.getItem(DONE_KEY)) return null;
    const raw = store.getItem('cf_beta_backup');
    if (!raw) return null;
    const b = JSON.parse(raw) as Backup;
    if (!b?.data || !SAVE_KEYS.some((k) => k !== 'cf_slot' && b.data[k] != null)) return null;
    return Number(b.gen) >= SAVE_GEN ? b : null;
  } catch {
    return null;
  }
}

/** 되살릴 백업이 있는가: 'none' 없음 / 'empty' 지금 저장이 비어 있어 바로 되살려도 됨 / 'conflict' 지금 진행이 있어 물어봐야 함 */
export function backupState(store: Store = localStorage): 'none' | 'empty' | 'conflict' {
  try {
    if (!readBackup(store)) return 'none';
    return SAVE_KEYS.some((k) => k !== 'cf_slot' && store.getItem(k) !== null) ? 'conflict' : 'empty';
  } catch {
    return 'none';
  }
}

/** 백업을 되살린다. 지금 저장은 cf_restore_prev 에 남겨 둔다. 되살렸으면 true */
export function restoreBackup(store: Store = localStorage): boolean {
  try {
    const b = readBackup(store);
    if (!b) return false;
    const prev: Record<string, string> = {};
    for (const k of SAVE_KEYS) {
      const v = store.getItem(k);
      if (v !== null) prev[k] = v;
      store.removeItem(k);
    }
    if (Object.keys(prev).length) store.setItem('cf_restore_prev', JSON.stringify({ at: Date.now(), data: prev }));
    for (const [k, v] of Object.entries(b.data)) if (SAVE_KEYS.includes(k)) store.setItem(k, v);
    store.setItem(GEN_KEY, String(SAVE_GEN));
    // 초기화 때 걸어 둔 베타 선물은 저장을 되찾았으니 거둔다 (나중에 정식 출시로 초기화되면 다시 걸린다)
    if (store.getItem('cf_beta_gift') === 'pending') store.removeItem('cf_beta_gift');
    store.setItem(DONE_KEY, '1');
    return true;
  } catch {
    return false;
  }
}

/** 되살리지 않고 지금 진행을 유지한다 (다시 묻지 않음) */
export function keepCurrentSave(store: Store = localStorage) {
  try {
    store.setItem(GEN_KEY, String(SAVE_GEN));
    store.setItem(DONE_KEY, '1');
  } catch { /* */ }
}

// ---------- 새 버전 안내 ----------
const SEEN_KEY = 'cf_seen_ver';
/** 이 버전의 패치 노트를 아직 안 봤는가. 처음 온 사람은 보여 주지 않고 본 것으로 친다 */
export function unseenNote(isNewPlayer: boolean): PatchNote | null {
  try {
    const seen = localStorage.getItem(SEEN_KEY);
    localStorage.setItem(SEEN_KEY, VERSION);
    if (seen === VERSION || isNewPlayer) return null;
    return PATCH_NOTES.find((n) => n.ver === VERSION) ?? null;
  } catch {
    return null;
  }
}
