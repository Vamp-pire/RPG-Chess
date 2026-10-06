import { ALFIL, DIAG, JUMP2, KING, KNIGHT, ORTH, RING2, RING3, Vec } from '../core/geom';
import { RuleKind } from '../core/rules';

export type TraitId = 'sticky' | 'sharp' | 'light' | 'sturdy' | 'counter' | 'kibo' | 'bind' | 'undying';
export type AbilityId = 'push' | 'hop' | 'swap' | 'terrain' | 'trap' | 'pull' | 'blink';
export type MatId =
  | 'gel' | 'tooth' | 'wing' | 'moss' | 'thorn' | 'fiber'
  | 'pearl' | 'silver' | 'crack' | 'shard' | 'fang' | 'crown'
  | 'skin' | 'silk' | 'bone' | 'ecto' | 'mirror' | 'blunder' | 'qcrown' | 'fogkey' | 'trigger'
  | 'fur' | 'frost' | 'ice' | 'tusk' | 'kcrown'
  | 'ink' | 'page' | 'quill' | 'lastword'
  | 'leg' | 'claw' | 'feather';

export interface MatDef {
  id: MatId;
  name: string;
  short: string;
  desc: string;
  color: string;
  rare?: boolean;
  key?: boolean; // 조합 불가 핵심 아이템
  /** 설명과 달리 처음부터 보이는 짧은 귀띔 */
  hint?: string;
  binder?: boolean; // 비율 계산에서 빠지는 결합제
  phase?: boolean; // 비율 25% 이상이면 장비의 슬라이드가 관통 이동이 된다
  frag?: { kind: RuleKind; dirs: Vec[]; range: number };
  trait?: TraitId;
  ability?: AbilityId;
  price: number;
}

export const MATS: Record<MatId, MatDef> = {
  gel: { id: 'gel', name: '슬라임 젤', short: '젤', desc: '말랑하고 끈적하다. 슬라임은 기보의 빈칸에 고인 망설임이 굳어 생긴다고 한다.', color: '#7ccf6b', frag: { kind: 'step', dirs: DIAG, range: 1 }, trait: 'sticky', price: 4 },
  tooth: { id: 'tooth', name: '쥐 이빨', short: '이빨', desc: '작지만 날카롭다. 들쥐들은 버려진 기보 종이를 갉아 먹으며 이빨을 간다.', color: '#e9dcc0', frag: { kind: 'step', dirs: ORTH, range: 1 }, trait: 'sharp', price: 4 },
  wing: { id: 'wing', name: '박쥐 날개', short: '날개', desc: '가볍고 질기다. 박쥐는 나이트의 L자 길을 흉내 내다 날개를 얻었다고 한다.', color: '#8a6fa8', frag: { kind: 'leap', dirs: KNIGHT, range: 1 }, trait: 'light', price: 6 },
  moss: { id: 'moss', name: '이끼 돌', short: '이끼돌', desc: '묵직하게 굴러간다. 룩이 지나간 곧은 길에만 자라는 이끼가 돌을 감싸고 있다.', color: '#7d9a62', frag: { kind: 'slide', dirs: ORTH, range: 2 }, trait: 'sturdy', ability: 'push', price: 6 },
  thorn: { id: 'thorn', name: '가시 덩굴', short: '가시', desc: '건드리면 되찌른다. 아무도 두지 않은 수를 지키려고 자라난 가시다.', color: '#a07a44', trait: 'counter', ability: 'trap', price: 5 },
  fiber: { id: 'fiber', name: '들풀 섬유', short: '섬유', desc: '들판 어디서나 자라는 풀. 무엇과 섞여도 제 모양을 고집하지 않는다.', color: '#d8c77e', binder: true, price: 2 },
  pearl: { id: 'pearl', name: '진주빛 젤', short: '진주젤', desc: '빛을 머금은 젤. 오래 고인 슬라임 속에서 아주 드물게 맺힌다. 들여다보면 대각선이 끝없이 이어진다.', color: '#bfe6f2', rare: true, frag: { kind: 'slide', dirs: DIAG, range: 3 }, trait: 'sticky', price: 30 },
  silver: { id: 'silver', name: '은빛 날개', short: '은날개', desc: '바람보다 가볍다. 달빛 아래에서 두 번 뛴 박쥐만 이런 날개를 가진다. 무기에 30% 이상 넣으면 L자 공격이 멱에 막히지 않는다.', color: '#d6d6e6', rare: true, frag: { kind: 'leap', dirs: KNIGHT, range: 1 }, trait: 'light', ability: 'hop', price: 30 },
  crack: { id: 'crack', name: '균열 이끼', short: '균열이끼', desc: '돌을 가르고 자란다. 칸과 칸 사이, 원래 없던 틈에서 핀다.', color: '#5f8796', rare: true, trait: 'sturdy', ability: 'terrain', price: 30 },
  shard: { id: 'shard', name: '기보 파편', short: '파편', desc: '무언가의 기록이 새겨진 조각. 읽으려 하면 글자가 한 칸씩 자리를 바꾼다.', color: '#e6c25a', rare: true, trait: 'kibo', ability: 'swap', price: 50 },
  fang: { id: 'fang', name: '사냥개 송곳니', short: '송곳니', desc: '먼 곳까지 물고 늘어진다. 무리에서 떨어진 사냥개는 혼자서 더 멀리 달리는 법을 배웠다.', color: '#c96a5a', rare: true, frag: { kind: 'slide', dirs: ORTH, range: 3 }, trait: 'sharp', price: 25 }, // 8방향 2칸 → 상하좌우 3칸 (1지역 재료만으로 퀸 무기가 나오던 것, 베타 제보)
  crown: { id: 'crown', name: '밀짚 왕관', short: '왕관', desc: '승급 의식에 쓰인다.', color: '#f0d27a', key: true, price: 0 },
  skin: { id: 'skin', name: '두꺼비 가죽', short: '가죽', desc: '탄력이 좋아 멀리 튄다. 늪의 두꺼비는 물이 싫어서 두 칸씩 건너뛴다.', color: '#8fa05a', frag: { kind: 'leap', dirs: JUMP2, range: 1 }, trait: 'light', price: 7 },
  silk: { id: 'silk', name: '안개 거미줄', short: '거미줄', desc: '끈끈하고 질기다. 안개 거미는 길 잃은 수들을 이 줄로 붙잡아 둔다.', color: '#dfe4ea', frag: { kind: 'slide', dirs: DIAG, range: 2 }, trait: 'bind', ability: 'pull', price: 7 },
  bone: { id: 'bone', name: '해골 조각', short: '뼈', desc: '쓰러져도 다시 일어서던 뼈. 잡히고도 판을 떠나지 못한 기사의 것이다.', color: '#e8e2cf', frag: { kind: 'step', dirs: KING, range: 1 }, trait: 'undying', price: 8 },
  ecto: { id: 'ecto', name: '망령 정수', short: '정수', desc: '막힌 것을 스르륵 지나간다. 판에서 잡혀 나간 말들이 남긴 미련이다.', color: '#9fd8d0', frag: { kind: 'slide', dirs: ORTH, range: 2 }, phase: true, price: 9 },
  mirror: { id: 'mirror', name: '거울 파편', short: '거울', desc: '비친 곳으로 건너갈 수 있을 것 같다. 퀸이 제 모습을 비춰 보던 거울이었다는 소문이 있다.', color: '#c9d6f0', rare: true, frag: { kind: 'slide', dirs: KING, range: 3 }, trait: 'kibo', ability: 'blink', price: 60 },
  blunder: { id: 'blunder', name: '블런더 조각', short: '블런더', desc: '있어서는 안 될 수의 조각. 누군가 크게 후회한 한 수가 모양을 얻었다.', color: '#d86ad8', rare: true, frag: { kind: 'leap', dirs: RING3, range: 1 }, trait: 'sharp', ability: 'blink', price: 80 },
  qcrown: { id: 'qcrown', name: '뒤집힌 왕관', short: '왕관', desc: '두 번째 승급 의식에 쓰인다.', color: '#b9a0e0', key: true, price: 0 },
  trigger: { id: 'trigger', name: '녹슨 방아쇠', short: '방아쇠', desc: '체스판 어디에도 없는 물건의 부품. 기보 바깥에서 흘러들어 왔다.', hint: '거울과 기록을 물리면 무언가가 될 것 같다.', color: '#8a6a4a', rare: true, price: 0 },
  // ---- 3지역: 종반의 설원 ----
  fur: { id: 'fur', name: '늑대 털', short: '털', desc: '눈보라 속에서도 식지 않는다. 설원의 늑대는 나이트처럼 뛰고 킹처럼 다가온다.', color: '#c9ced6', frag: { kind: 'leap', dirs: KNIGHT, range: 1 }, trait: 'light', price: 10 },
  frost: { id: 'frost', name: '서리 결정', short: '서리', desc: '닿는 것마다 멈춰 세운다. 종반에는 모든 수가 얼어붙은 듯 느려진다.', color: '#a8d8ef', frag: { kind: 'slide', dirs: ORTH, range: 3 }, trait: 'bind', price: 11 },
  ice: { id: 'ice', name: '얼음 비늘', short: '비늘', desc: '두껍고 미끄럽다. 얼음 정령이 벗어 둔 껍질이다.', color: '#d8eef8', frag: { kind: 'step', dirs: DIAG, range: 1 }, trait: 'sturdy', ability: 'terrain', price: 10 },
  tusk: { id: 'tusk', name: '거인의 엄니', short: '엄니', desc: '한 번 찌르면 판 끝까지 밀어붙인다. 서리 거인은 종반의 룩이었다고 한다.', color: '#efe6d2', rare: true, frag: { kind: 'slide', dirs: KING, range: 3 }, trait: 'sharp', ability: 'push', price: 70 },
  kcrown: { id: 'kcrown', name: '얼어붙은 왕관', short: '왕관', desc: '세 번째 승급 의식에 쓰인다.', color: '#bfe3f2', key: true, price: 0 },
  // ---- 4지역: 기보의 끝 ----
  ink: { id: 'ink', name: '잉크 방울', short: '잉크', desc: '마르지 않는 검은 방울. 떨어진 자리마다 새 칸이 생긴다.', color: '#3a3a4a', frag: { kind: 'leap', dirs: RING2, range: 1 }, trait: 'kibo', price: 14 },
  page: { id: 'page', name: '찢긴 페이지', short: '페이지', desc: '어느 대국의 한가운데가 찢겨 나갔다. 넘기면 다른 칸으로 건너간다.', color: '#efe6cf', trait: 'undying', ability: 'blink', price: 14 },
  quill: { id: 'quill', name: '깃펜', short: '깃펜', desc: '모든 수를 적어 온 펜. 쥐는 순간 무엇이든 쓸 수 있을 것만 같다.', color: '#8a7ab8', rare: true, frag: { kind: 'slide', dirs: KING, range: 4 }, trait: 'kibo', ability: 'swap', price: 90 },
  lastword: { id: 'lastword', name: '마지막 수', short: '마지막 수', desc: '기보의 마지막 줄. 어떻게 끝낼지는 아직 비어 있다.', color: '#f0d27a', key: true, price: 0 },
  // ---- 1지역 새 몹 (장비 개편) ----
  leg: { id: 'leg', name: '메뚜기 다리', short: '다리', desc: '튕겨 오르는 힘이 남아 있다. 들판의 메뚜기는 앞에 놓인 말을 디딤돌 삼아 넘는다.', color: '#9cc25a', frag: { kind: 'hop', dirs: KING, range: 3 }, trait: 'light', price: 6 },
  claw: { id: 'claw', name: '두더지 발톱', short: '발톱', desc: '흙을 파던 두툼한 발톱. 두더지는 칸 밑으로 숨었다가 엉뚱한 칸에서 튀어나온다.', color: '#a88a6a', frag: { kind: 'step', dirs: ORTH, range: 1 }, trait: 'counter', price: 6 },
  feather: { id: 'feather', name: '까마귀 깃', short: '깃', desc: '검고 윤이 난다. 까마귀는 대각선으로 두 칸씩 뛰며 반짝이는 것을 물어 간다.', color: '#4a4a5e', frag: { kind: 'leap', dirs: ALFIL, range: 1 }, trait: 'light', price: 6 },
  fogkey: { id: 'fogkey', name: '안개 열쇠', short: '열쇠', desc: '마을 북쪽의 안개가 떠오른다.', color: '#cfd6d6', key: true, price: 0 },
};

export const MAT_ORDER: MatId[] = [
  'gel', 'tooth', 'wing', 'moss', 'thorn', 'fiber', 'skin', 'silk', 'bone', 'ecto',
  'leg', 'claw', 'feather',
  'fur', 'frost', 'ice', 'ink', 'page',
  'pearl', 'silver', 'crack', 'fang', 'shard', 'mirror', 'tusk', 'quill', 'blunder', 'trigger', 'crown', 'qcrown', 'kcrown', 'lastword', 'fogkey',
];

export const TRAITS: Record<TraitId, { name: string; desc: (lv: number) => string }> = {
  sticky: { name: '점착', desc: (lv) => `밀려나지 않고, 무너지는 바닥 피해를 ${lv >= 2 ? '무시' : '1회 무시'}한다.` },
  sharp: { name: '날카로움', desc: (lv) => `전투마다 처음 ${lv}번의 공격이 피해 +1.` },
  light: { name: '경량', desc: (lv) => `전투마다 공격을 ${lv}번 회피한다.` },
  sturdy: { name: '견고', desc: (lv) => `전투마다 처음 ${lv}번 받는 피해 -1.` },
  counter: { name: '반격', desc: (lv) => `인접한 적에게 맞으면 1 피해로 되받는다 (전투마다 ${lv + 1}번).` },
  kibo: { name: '기보 이탈', desc: (lv) => `능력 재사용 대기 -${lv}.` },
  bind: { name: '속박', desc: (lv) => `전투마다 ${lv}번, 공격한 적이 살아남으면 다음 행동을 못 한다.` },
  undying: { name: '불굴', desc: () => '전투마다 한 번, 쓰러질 피해를 받아도 1로 버틴다.' },
};

export type SpecialSlot = 'engrave' | 'relic';

export const ABILITIES: Record<AbilityId, { name: string; slot: SpecialSlot; cd: number; need: number; desc: (lv: number) => string }> = {
  push: { name: '밀치기', slot: 'engrave', cd: 3, need: 1, desc: (lv) => `인접한 적을 ${lv}칸 밀어낸다. 막히면 1 피해, 구멍으로 밀리면 추락.` },
  hop: { name: '타넘기', slot: 'engrave', cd: 2, need: 1, desc: (lv) => `인접한 적을 뛰어넘어 너머 빈칸에 착지${lv >= 2 ? '하며 1 피해' : ''}.` },
  swap: { name: '기보 교환', slot: 'engrave', cd: 4, need: 1, desc: (lv) => `거리 ${2 + lv} 안의 적과 자리를 바꾼다.` },
  terrain: { name: '지형 조작', slot: 'relic', cd: 3, need: 2, desc: (lv) => `거리 ${lv >= 2 ? 2 : 1} 안의 벽을 부수거나 빈칸에 벽을 세운다.` },
  trap: { name: '가시 덫', slot: 'relic', cd: 3, need: 3, desc: (lv) => `거리 2 안 빈칸에 덫을 놓는다. 밟은 적 ${1 + lv} 피해.` },
  pull: { name: '끌어오기', slot: 'engrave', cd: 3, need: 1, desc: (lv) => `일직선 ${2 + lv}칸 안의 적을 바로 앞으로 끌어온다.` },
  blink: { name: '순간이동', slot: 'engrave', cd: 4, need: 1, desc: (lv) => `거리 ${1 + lv} 안의 빈칸으로 순간이동한다.` },
};
