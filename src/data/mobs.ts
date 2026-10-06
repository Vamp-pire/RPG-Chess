import { ALFIL, DIAG, JUMP2, KING, KNIGHT, ORTH, RING2, RING3 } from '../core/geom';
import { MoveRule } from '../core/rules';
import { MatId } from './materials';

export type MobId =
  | 'slime' | 'slimelet' | 'rat' | 'bat' | 'golem' | 'thorn' | 'hound' | 'hopper' | 'mole' | 'crow'
  | 'strawking' | 'strawpawn' | 'rook'
  | 'toad' | 'spider' | 'skeleton' | 'wraith' | 'bonelord' | 'misqueen' | 'echo' | 'blunder'
  | 'wolf' | 'icesprite' | 'snowpawn' | 'frostbishop' | 'tower' | 'giant' | 'frozenking'
  | 'inkblot' | 'inkdrop' | 'erased' | 'annot' | 'bookworm' | 'double' | 'author';

export type MobAI = 'basic' | 'charge' | 'static' | 'boss' | 'pawn' | 'queen' | 'turret';
/** burrow = 땅속에 숨었다가 예고한 칸에서 튀어나온다, thief = 골드를 훔쳐 달아난다 */
export type MobTag = 'root' | 'revive' | 'ghost' | 'summoner' | 'breath' | 'burrow' | 'thief';

export interface MobDef {
  id: MobId;
  name: string;
  hp: number;
  atk: number;
  move: MoveRule[];
  attack: MoveRule[];
  ai: MobAI;
  drops: [MatId, number][];
  rare?: [MatId, number];
  desc: string;
  dex?: boolean; // 도감 대상
  color: string;
  tags?: MobTag[];
  region?: 2 | 3 | 4;
  /** summoner가 부르는 몹 (없으면 해골 기사) */
  summon?: MobId;
  /** 쓰러지면 갈라져 나오는 몹 */
  split?: MobId;
}

const step = (dirs = KING): MoveRule => ({ kind: 'step', dirs, range: 1, mode: 'both' });

export const MOBS: Record<MobId, MobDef> = {
  slime: { id: 'slime', name: '슬라임', hp: 3, atk: 1, move: [step(ORTH)], attack: [step(ORTH)], ai: 'basic', drops: [['gel', 1]], rare: ['pearl', 0.06], desc: '상하좌우 1칸. 쓰러지면 작은 슬라임으로 갈라진다.', dex: true, color: '#7ccf6b' },
  slimelet: { id: 'slimelet', name: '꼬마 슬라임', hp: 1, atk: 1, move: [step(ORTH)], attack: [step(ORTH)], ai: 'basic', drops: [], desc: '갈라져 나온 작은 슬라임.', color: '#9ddc8e' },
  rat: { id: 'rat', name: '들쥐', hp: 1, atk: 1, move: [step()], attack: [step()], ai: 'basic', drops: [['tooth', 1]], rare: ['fiber', 0.3], desc: '8방향 1칸. 무리 지어 다닌다.', dex: true, color: '#9a9a9a' },
  bat: { id: 'bat', name: '박쥐', hp: 2, atk: 1, move: [{ kind: 'leap', dirs: KNIGHT, range: 1, mode: 'both' }], attack: [{ kind: 'leap', dirs: KNIGHT, range: 1, mode: 'both' }], ai: 'basic', drops: [['wing', 1]], rare: ['silver', 0.06], desc: 'L자로 날아다니며 공격한다.', dex: true, color: '#8a6fa8' },
  golem: { id: 'golem', name: '이끼 골렘', hp: 4, atk: 2, move: [step(ORTH)], attack: [step(ORTH)], ai: 'charge', drops: [['moss', 2]], rare: ['crack', 0.1], desc: '일직선으로 돌진한다. 돌진 뒤에는 한 턴 굳는다.', dex: true, color: '#7d9a62' },
  thorn: { id: 'thorn', name: '가시덤불', hp: 3, atk: 1, move: [], attack: [step()], ai: 'static', drops: [['thorn', 1], ['fiber', 1]], desc: '움직이지 않는다. 주변 8칸을 매 턴 찌른다.', dex: true, color: '#a07a44' },
  hound: { id: 'hound', name: '낙오 사냥개', hp: 7, atk: 2, move: [{ kind: 'slide', dirs: KING, range: 4, mode: 'both' }], attack: [{ kind: 'slide', dirs: KING, range: 4, mode: 'both' }], ai: 'basic', drops: [['fang', 1], ['moss', 1]], rare: ['shard', 0.25], desc: '엘리트. 8방향 4칸까지 달려든다. 한 번 물고 나면 숨을 고른다.', dex: true, color: '#c96a5a', tags: ['breath'] },
  // 1지역 새 몹 (변형 체스 말에서): 메뚜기 · 두더지 · 까마귀
  hopper: { id: 'hopper', name: '메뚜기', hp: 2, atk: 1, move: [{ kind: 'hop', dirs: KING, range: 7, mode: 'both' }, step(ORTH)], attack: [{ kind: 'hop', dirs: KING, range: 7, mode: 'both' }], ai: 'basic', drops: [['leg', 1]], rare: ['silver', 0.04], desc: '줄을 따라가다 처음 만나는 말을 넘어 바로 뒤 칸에 내려앉는다. 넘을 말이 없으면 한 칸씩 걷는다. 옆에 붙은 말은 치지 못한다.', dex: true, color: '#9cc25a' },
  mole: { id: 'mole', name: '두더지', hp: 3, atk: 1, move: [step(ORTH)], attack: [step()], ai: 'basic', drops: [['claw', 1]], rare: ['crack', 0.08], desc: '땅속으로 숨어 한 턴 동안 맞지 않는다. 튀어나올 칸이 미리 보이니 그 곁에서 비켜서자.', dex: true, color: '#a88a6a', tags: ['burrow'] },
  crow: { id: 'crow', name: '까마귀', hp: 2, atk: 1, move: [{ kind: 'leap', dirs: ALFIL, range: 1, mode: 'both' }, step(DIAG)], attack: [{ kind: 'leap', dirs: ALFIL, range: 1, mode: 'both' }], ai: 'basic', drops: [['feather', 1]], rare: ['shard', 0.05], desc: '대각선으로 두 칸씩 뛰어 쪼아 댄다. 쪼이면 골드를 물어 가고, 잡으면 돌려받는다.', dex: true, color: '#4a4a5e', tags: ['thief'] },
  strawking: { id: 'strawking', name: '밀짚왕', hp: 9, atk: 2, move: [step()], attack: [step()], ai: 'boss', drops: [['crown', 1], ['shard', 1]], desc: '보스.', dex: true, color: '#e8c35a' },
  strawpawn: { id: 'strawpawn', name: '밀짚 폰', hp: 1, atk: 1, move: [], attack: [], ai: 'pawn', drops: [['fiber', 1]], desc: '앞으로 1칸, 대각선 앞을 공격한다.', color: '#e8c35a' },
  rook: { id: 'rook', name: '고집쟁이 룩', hp: 6, atk: 2, move: [{ kind: 'slide', dirs: ORTH, range: 7, mode: 'both' }], attack: [{ kind: 'slide', dirs: ORTH, range: 7, mode: 'both' }], ai: 'basic', drops: [['moss', 2]], desc: '상하좌우 끝까지.', color: '#555' },
  // ---- 2지역: 혼전의 늪 ----
  toad: { id: 'toad', name: '늪 두꺼비', hp: 3, atk: 1, move: [{ kind: 'leap', dirs: JUMP2, range: 1, mode: 'both' }, { kind: 'step', dirs: KING, range: 1, mode: 'move' }], attack: [{ kind: 'leap', dirs: JUMP2, range: 1, mode: 'both' }], ai: 'basic', drops: [['skin', 1]], rare: ['pearl', 0.08], desc: '상하좌우로 2칸씩 뛰어 물을 건넌다. 한 칸씩 기어 다니기도 한다.', dex: true, color: '#8fa05a', region: 2 },
  spider: { id: 'spider', name: '안개 거미', hp: 2, atk: 1, move: [{ kind: 'slide', dirs: DIAG, range: 2, mode: 'move' }, { kind: 'step', dirs: ORTH, range: 1, mode: 'move' }], attack: [{ kind: 'step', dirs: DIAG, range: 1, mode: 'attack' }], ai: 'basic', drops: [['silk', 1]], rare: ['mirror', 0.03], desc: '대각선으로 다니고, 상하좌우로는 한 칸씩 줄을 타고 옮긴다. 물리면 한 턴 묶여 이동할 수 없다.', dex: true, color: '#dfe4ea', tags: ['root'], region: 2 },
  skeleton: { id: 'skeleton', name: '해골 기사', hp: 2, atk: 1, move: [{ kind: 'leap', dirs: KNIGHT, range: 1, mode: 'both' }], attack: [{ kind: 'leap', dirs: KNIGHT, range: 1, mode: 'both' }], ai: 'basic', drops: [['bone', 1]], rare: ['shard', 0.08], desc: 'L자로 뛴다. 한 번 쓰러져도 다시 일어난다.', dex: true, color: '#e8e2cf', tags: ['revive'], region: 2 },
  wraith: { id: 'wraith', name: '망령', hp: 2, atk: 1, move: [{ kind: 'slide', dirs: ORTH, range: 3, mode: 'both', pierce: true }], attack: [{ kind: 'slide', dirs: ORTH, range: 3, mode: 'both', pierce: true }], ai: 'basic', drops: [['ecto', 1]], rare: ['mirror', 0.04], desc: '벽과 말을 통과해 상하좌우 3칸까지.', dex: true, color: '#9fd8d0', tags: ['ghost'], region: 2 },
  bonelord: { id: 'bonelord', name: '뼈 군주', hp: 7, atk: 2, move: [step()], attack: [step(), { kind: 'leap', dirs: KNIGHT, range: 1, mode: 'attack' }], ai: 'basic', drops: [['bone', 2], ['ecto', 1]], rare: ['mirror', 0.35], desc: '엘리트. 8방향 1칸 이동, 주변과 L자 칸을 공격. 체력이 절반이 되면 해골을 부른다. 공격한 다음 턴엔 숨을 고른다.', dex: true, color: '#e8e2cf', tags: ['summoner', 'breath'], region: 2 },
  misqueen: { id: 'misqueen', name: '잘못 둔 퀸', hp: 8, atk: 1, move: [{ kind: 'slide', dirs: KING, range: 3, mode: 'both' }], attack: [{ kind: 'slide', dirs: KING, range: 3, mode: 'both' }], ai: 'queen', drops: [['qcrown', 1], ['mirror', 1]], desc: '보스.', dex: true, color: '#b9a0e0', region: 2 },
  echo: { id: 'echo', name: '퀸의 메아리', hp: 1, atk: 1, move: [{ kind: 'slide', dirs: ORTH, range: 2, mode: 'both' }], attack: [{ kind: 'slide', dirs: ORTH, range: 2, mode: 'both' }], ai: 'basic', drops: [], desc: '퀸이 남긴 잔상.', color: '#b9a0e0' },
  // ---- 3지역: 종반의 설원 ----
  wolf: { id: 'wolf', name: '설원 늑대', hp: 2, atk: 1, move: [{ kind: 'leap', dirs: KNIGHT, range: 1, mode: 'move' }, step(ORTH)], attack: [step()], ai: 'basic', drops: [['fur', 1]], rare: ['tusk', 0.04], desc: 'L자로 뛰어 다가와 8방향으로 문다. 다른 늑대와 붙어 있으면 더 세게 문다.', dex: true, color: '#c9ced6', region: 3 },
  icesprite: { id: 'icesprite', name: '얼음 정령', hp: 2, atk: 1, move: [{ kind: 'slide', dirs: DIAG, range: 2, mode: 'move' }], attack: [{ kind: 'step', dirs: DIAG, range: 1, mode: 'attack' }], ai: 'basic', drops: [['ice', 1]], rare: ['frost', 0.3], desc: '대각선으로 미끄러진다. 물리면 한 턴 얼어 움직일 수 없다.', dex: true, color: '#d8eef8', tags: ['root'], region: 3 },
  snowpawn: { id: 'snowpawn', name: '눈사람 폰', hp: 2, atk: 1, move: [], attack: [], ai: 'pawn', drops: [['frost', 1]], desc: '앞으로 한 칸씩, 대각선 앞을 친다. 판 끝에 닿으면 서리 비숍으로 승급한다!', dex: true, color: '#f4f8fb', region: 3 },
  frostbishop: { id: 'frostbishop', name: '서리 비숍', hp: 3, atk: 1, move: [{ kind: 'slide', dirs: DIAG, range: 3, mode: 'both' }], attack: [{ kind: 'slide', dirs: DIAG, range: 3, mode: 'both' }], ai: 'basic', drops: [['frost', 1], ['ice', 1]], rare: ['mirror', 0.05], desc: '대각선 3칸까지 달려와 찌른다.', dex: true, color: '#a8d8ef', region: 3 },
  tower: { id: 'tower', name: '룩 파수꾼', hp: 4, atk: 2, move: [], attack: [], ai: 'turret', drops: [['ice', 2]], rare: ['crack', 0.2], desc: '움직이지 않는다. 상하좌우 3칸 줄을 매 턴 쏜다. 줄에서 비켜서자.', dex: true, color: '#8a9aa8', region: 3 },
  giant: { id: 'giant', name: '서리 거인', hp: 10, atk: 2, move: [step(ORTH)], attack: [step(ORTH)], ai: 'charge', drops: [['tusk', 1], ['fur', 2]], desc: '엘리트. 일직선으로 돌진하고, 돌진한 뒤엔 한 턴 굳는다.', dex: true, color: '#b8d0e0', region: 3 },
  frozenking: { id: 'frozenking', name: '얼어붙은 킹', hp: 15, atk: 2, move: [step()], attack: [step()], ai: 'boss', drops: [['kcrown', 1], ['tusk', 1]], desc: '보스.', dex: true, color: '#bfe3f2', region: 3 },
  // ---- 4지역: 기보의 끝 ----
  inkblot: { id: 'inkblot', name: '잉크 얼룩', hp: 2, atk: 1, move: [step()], attack: [step()], ai: 'basic', drops: [['ink', 1]], rare: ['quill', 0.02], desc: '8방향 1칸. 쓰러지면 잉크 방울 둘로 튄다.', dex: true, color: '#3a3a4a', split: 'inkdrop', region: 4 },
  inkdrop: { id: 'inkdrop', name: '잉크 방울', hp: 1, atk: 1, move: [step(ORTH)], attack: [step(ORTH)], ai: 'basic', drops: [], desc: '튀어나온 작은 얼룩.', color: '#55556a' },
  erased: { id: 'erased', name: '지워진 말', hp: 3, atk: 1, move: [{ kind: 'leap', dirs: KNIGHT, range: 1, mode: 'both' }], attack: [{ kind: 'leap', dirs: KNIGHT, range: 1, mode: 'both' }, step(ORTH)], ai: 'basic', drops: [['page', 1]], rare: ['shard', 0.1], desc: '반쯤 지워진 나이트. 말과 벽을 뚫고 L자로 뛴다.', dex: true, color: '#e8e8e4', tags: ['ghost'], region: 4 },
  annot: { id: 'annot', name: '주석 ?!', hp: 2, atk: 1, move: [{ kind: 'slide', dirs: KING, range: 2, mode: 'move' }], attack: [{ kind: 'leap', dirs: KNIGHT, range: 1, mode: 'attack' }, { kind: 'step', dirs: DIAG, range: 1, mode: 'attack' }], ai: 'basic', drops: [['ink', 1], ['page', 1]], desc: '"흥미로운 수"라는 뜻의 기호. 8방향 2칸을 떠돌며 L자와 대각선으로 찌른다.', dex: true, color: '#8a7ab8', region: 4 },
  bookworm: { id: 'bookworm', name: '책벌레', hp: 4, atk: 1, move: [{ kind: 'slide', dirs: ORTH, range: 3, mode: 'both', pierce: true }], attack: [{ kind: 'slide', dirs: ORTH, range: 3, mode: 'both', pierce: true }], ai: 'basic', drops: [['page', 2]], rare: ['quill', 0.03], desc: '페이지를 갉아 먹으며 벽을 뚫고 상하좌우 3칸.', dex: true, color: '#c9b58f', tags: ['ghost'], region: 4 },
  double: { id: 'double', name: '겹수', hp: 9, atk: 2, move: [step(), { kind: 'leap', dirs: JUMP2, range: 1, mode: 'move' }], attack: [step(), { kind: 'leap', dirs: KNIGHT, range: 1, mode: 'attack' }], ai: 'basic', drops: [['quill', 1], ['ink', 2]], desc: '엘리트. 한 칸에 두 수가 겹쳐 쓰였다. 체력이 절반이 되면 주석을 부른다. 공격한 다음 턴엔 숨을 고른다.', dex: true, color: '#6a5a9a', tags: ['summoner', 'breath'], summon: 'annot', region: 4 },
  author: { id: 'author', name: '저자', hp: 12, atk: 2, move: [step()], attack: [{ kind: 'slide', dirs: KING, range: 2, mode: 'both' }], ai: 'boss', drops: [['lastword', 1]], desc: '보스.', dex: true, color: '#f0d27a', region: 4 },
  blunder: { id: 'blunder', name: '블런더', hp: 10, atk: 2, move: [{ kind: 'leap', dirs: [...RING2, ...RING3], range: 1, mode: 'move' }], attack: [step(), { kind: 'leap', dirs: KNIGHT, range: 1, mode: 'attack' }], ai: 'basic', drops: [['blunder', 1], ['shard', 1], ['trigger', 1]], desc: '???', dex: true, color: '#d86ad8', tags: ['breath'] },
};
