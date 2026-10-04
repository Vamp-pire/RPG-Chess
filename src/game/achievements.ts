// 업적: 이벤트 버스(emit)에 붙어서 조건을 검사한다.
// 마인크래프트 발전 과제처럼 분류(탭) · 틀(일반/목표/도전) · 앞 업적(parent)으로 나무 모양을 이룬다.
// secret은 달성 전까지 ???로 보이고, 앞 업적을 못 깬 업적은 이름만 가려진다.
import { isHardPlus } from '../core/difficulty';
import { EGG_TOTAL } from './eggs';
import { sfx } from '../core/sfx';
import { G, on, save } from '../core/state';
import { SLOTS } from '../core/items';
import { prefs } from '../core/prefs';
import { MOBS, MobId } from '../data/mobs';
import { AreaId } from '../data/areas';
import { KIBO } from '../data/kibo';
import { MATS, MAT_ORDER } from '../data/materials';
import { h, modal, toast } from '../ui/dom';
import { loreAll, loreDone } from '../ui/lore';
import { qst } from './quests';
import { meta } from './ending';
import { loadout } from '../core/state';
import { PERKS, Reward, giveReward, rewardText } from './rewards';

/** 업적 보상. 일반은 작게, 목표는 희귀 재료·체력, 도전은 영구 능력 */
export const REWARDS: Record<string, Reward> = {
  // 모험
  job: { gold: 10 }, walk: { mats: [['fiber', 2]] }, explorer: { hp: 1 }, straw: { gold: 30 }, hard_straw: { mats: [['shard', 1]], gold: 30 },
  c_noguide: { mats: [['silver', 1]], gold: 40 }, promo1: { gold: 20 }, queen: { gold: 50 }, hard_queen: { mats: [['mirror', 1]], gold: 50 }, promo2: { gold: 60 },
  ally: { gold: 20 }, sheep: { mats: [['wing', 2]] }, puzzles: { mats: [['crack', 1]] }, kibo1: { gold: 10 }, kibo_all: { perk: 'kibo' },
  // 전투
  first_win: { gold: 10 }, first_death: { mats: [['fiber', 3]] }, flee: { gold: 5 }, win10: { gold: 30 }, win50: { hp: 1 }, shiny: { gold: 20 },
  c_slime5: { mats: [['gel', 3]] }, c_lastgasp: { gold: 30 }, c_will: { perk: 'will' }, c_knight: { mats: [['silver', 1]] }, ability: { gold: 15 },
  c_trap: { mats: [['thorn', 3]] }, c_fall2: { mats: [['crack', 1]] }, c_chaos: { gold: 60, mats: [['shard', 1]] }, c_allways: { hp: 1 },
  c_brace_only: { perk: 'brace' }, c_naked: { perk: 'first' }, c_quick_boss: { gold: 80, mats: [['pearl', 1]] }, c_ally_boss: { perk: 'ally' },
  // 대장간
  first_craft: { mats: [['fiber', 2]] }, perfect: { gold: 15 }, hstreak3: { perk: 'hammer' }, master: { gold: 50 }, reforge: { gold: 10 },
  c_mono: { gold: 20 }, c_rainbow: { mats: [['pearl', 1]] }, recipes10: { mats: [['crack', 1], ['pearl', 1]] }, fullgear: { gold: 60 },
  // 수집
  buy: { gold: 5 }, sell20: { perk: 'trade' }, rich: { mats: [['shard', 1]] }, hoarder: { gold: 20 }, herb10: { mats: [['fiber', 5]] },
  rest10: { perk: 'rest' }, dex10: { gold: 40 }, dexall: { hp: 1 }, lore1: { gold: 10 }, lore5: { gold: 40, mats: [['shard', 1]] },
  // 비밀
  s_nodmg: { mats: [['mirror', 1]] }, s_oneturn: { gold: 30 }, s_fall: { gold: 20 }, s_line: { gold: 20 }, s_elder: { gold: 1 }, s_e4: { gold: 44 },
  s_title: { mats: [['wing', 1]] }, s_room: { gold: 30 }, s_blunder: { mats: [['shard', 1]] }, s_neutral: { gold: 20 }, s_gun_queen: { perk: 'shot' },
  s_wall: { mats: [['bone', 3]] }, s_kibo_wrong: { gold: 15 }, s_iron: { hp: 1 }, s_hard_clean: { hp: 1 }, s_shiny5: { perk: 'shiny' },
  s_lore_all: { mats: [['mirror', 1], ['shard', 1]] }, s_poor: { gold: 25 },
  // 확장
  frost: { gold: 40 }, king: { mats: [['tusk', 1]], gold: 60 }, promo3: { gold: 80 }, margin: { mats: [['ink', 3]] }, ending: { hp: 1 },
  rebirth1: { gold: 100 }, jobgift: { gold: 20 }, cq: { mats: [['pearl', 1]] }, hermit: { gold: 30 },
  awake1: { mats: [['shard', 1]] }, awake3: { gold: 150, mats: [['quill', 1]] }, daily1: { gold: 20 }, set1: { mats: [['crack', 1]] },
  event10: { mats: [['silver', 1]] }, transmute: { gold: 15 }, moblore5: { gold: 40 },
  s_end_all: { hp: 1 }, s_end_seven: { hp: 1, gold: 300 }, s_together: { gold: 100 }, s_pen: { mats: [['blunder', 1]] }, s_stalemate: { hp: 1 }, s_closed: { mats: [['quill', 1]], gold: 200 }, s_rewrite: { mats: [['quill', 1]] }, s_rebirth3: { hp: 1 }, s_daily7: { mats: [['mirror', 1]] },
};

export type AchCat = 'story' | 'battle' | 'forge' | 'collect' | 'secret';
export type AchFrame = 'task' | 'goal' | 'challenge';

export interface Ach {
  id: string;
  name: string;
  desc: string;
  cat: AchCat;
  frame?: AchFrame;
  parent?: string;
  secret?: boolean;
  ev: string; // '*' = 모든 이벤트 뒤에 검사
  test?: (data: unknown) => boolean;
  /** 진행도 [지금, 목표] — 업적 창에 막대로 보인다 */
  progress?: () => [number, number];
}

const CATS: [AchCat, string][] = [['story', '모험'], ['battle', '전투'], ['forge', '대장간'], ['collect', '수집'], ['secret', '비밀']];
const FRAME_NAME: Record<AchFrame, string> = { task: '업적', goal: '목표', challenge: '도전' };

/** battleWin 이벤트 데이터 */
interface Win {
  boss: boolean;
  dmg: number;
  turns: number;
  hows: { mob: MobId; how: string }[];
  acts?: { move: number; attack: number; ability: number };
  hp: number;
  will: boolean;
  kills: MobId[];
}
const W = (d: unknown) => d as Win;

const num = (k: string) => Number(G.flags[k] ?? 0);
const hard = () => isHardPlus(G.diff);
const bagTotal = () => Object.values(G.bag).reduce((a, b) => a + (b ?? 0), 0);
const DEX_MOBS = (Object.keys(MOBS) as MobId[]).filter((m) => MOBS[m].dex && m !== 'blunder');
const kinds = () => DEX_MOBS.filter((m) => (G.dex[m] ?? 0) > 0).length;
const WORLD: AreaId[] = ['town', 'meadow', 'forest', 'hills', 'throne', 'camp', 'marsh', 'ruins', 'tower'];
const visited = () => WORLD.filter((a) => G.flags[`v_${a}`]).length;
const LORE_MATS = MAT_ORDER.filter((id) => !MATS[id].key);
const loreN = () => LORE_MATS.filter(loreDone).length;
/** 적을 쓰러뜨리는 방법들 (동료·체크 라인은 상황을 타서 뺐다) */
const HOWS: [string, string][] = [['melee', '공격'], ['knight', 'L자 공격'], ['shot', '사격'], ['push', '밀치기 충돌'], ['fall', '추락'], ['hop', '타넘기'], ['trap', '덫'], ['counter', '반격 특성']];
const howN = () => HOWS.filter(([k]) => G.flags[`how_${k}`]).length;
const BOSSES: MobId[] = ['strawking', 'misqueen', 'blunder'];
const ELITES: MobId[] = ['hound', 'bonelord'];
const coreKinds = (m: Record<string, number | undefined>) => Object.entries(m).filter(([id, n]) => n && !MATS[id as keyof typeof MATS].binder);

export const ACHS: Ach[] = [
  // ---------- 모험 ----------
  { id: 'job', cat: 'story', name: '이름을 새기다', desc: '기록의 벽에 나의 길을 새겼다.', ev: 'job' },
  { id: 'beta_first', cat: 'story', frame: 'challenge', name: '첫 수를 둔 자', desc: '베타 때 기보 밖의 첫 수를 함께 두었다. (칭호)', ev: 'betaGift' },
  { id: 'walk', cat: 'story', parent: 'job', name: '첫 걸음을 떼다', desc: '처음으로 다른 지역에 발을 디뎠다.', ev: 'travel' },
  { id: 'explorer', cat: 'story', parent: 'walk', frame: 'goal', name: '판 위의 순례자', desc: '두 지역의 모든 곳을 밟았다.', ev: 'travel', test: () => visited() >= WORLD.length, progress: () => [visited(), WORLD.length] },
  { id: 'straw', cat: 'story', parent: 'walk', frame: 'goal', name: '밀짚 수확', desc: '밀짚왕을 쓰러뜨렸다.', ev: 'questDone', test: (id) => id === 'main_boss' },
  { id: 'hard_straw', cat: 'story', parent: 'straw', frame: 'challenge', name: '거친 수확', desc: '어려움 이상 난이도로 밀짚왕을 쓰러뜨렸다.', ev: 'questDone', test: (id) => id === 'main_boss' && hard() },
  { id: 'c_noguide', cat: 'story', parent: 'straw', frame: 'challenge', name: '별 없이 걷는 길', desc: '퀘스트 안내를 끈 채로 밀짚왕을 쓰러뜨렸다.', ev: 'questDone', test: (id) => id === 'main_boss' && !prefs().guide },
  { id: 'promo1', cat: 'story', parent: 'straw', frame: 'goal', name: '틀을 넘어서', desc: '처음으로 승급했다.', ev: 'promote' },
  { id: 'queen', cat: 'story', parent: 'promo1', frame: 'goal', name: '수를 바로잡다', desc: '잘못 둔 퀸을 쓰러뜨렸다.', ev: 'questDone', test: (id) => id === 'main_r2' },
  { id: 'hard_queen', cat: 'story', parent: 'queen', frame: 'challenge', name: '엄격한 교정', desc: '어려움 이상 난이도로 잘못 둔 퀸을 쓰러뜨렸다.', ev: 'questDone', test: (id) => id === 'main_r2' && hard() },
  { id: 'promo2', cat: 'story', parent: 'queen', frame: 'goal', name: '두 번째 틀', desc: '두 번째로 승급했다.', ev: 'promote2' },
  { id: 'frost', cat: 'story', parent: 'promo2', frame: 'goal', name: '눈보라 너머', desc: '서리 초소에 닿았다.', ev: 'travel', test: (a) => a === 'frostpost' },
  { id: 'king', cat: 'story', parent: 'frost', frame: 'goal', name: '얼음을 깨다', desc: '얼어붙은 킹을 쓰러뜨렸다.', ev: 'questDone', test: (id) => id === 'main_r3' },
  { id: 'promo3', cat: 'story', parent: 'king', frame: 'goal', name: '왕관 쓴 용사', desc: '세 번째로 승급했다.', ev: 'promote3' },
  { id: 'margin', cat: 'story', parent: 'promo3', name: '여백에 닿다', desc: '글자가 끝나는 곳에 발을 디뎠다.', ev: 'travel', test: (a) => a === 'margin' },
  { id: 'ending', cat: 'story', parent: 'margin', frame: 'challenge', name: '마지막 줄', desc: '저자 앞에서 기보의 끝을 적었다.', ev: 'ending' },
  { id: 'rebirth1', cat: 'story', parent: 'ending', frame: 'goal', name: '다시, 첫 수부터', desc: '환생했다.', ev: 'rebirth' },
  { id: 'jobgift', cat: 'story', parent: 'margin', name: '여백의 선물', desc: '여백의 기록자에게 직업에 맞는 선물을 받았다.', ev: 'jobGift' },
  { id: 'cq', cat: 'story', parent: 'ally', frame: 'goal', name: '함께 자란 동료', desc: '동료의 개인 퀘스트를 마쳤다.', ev: 'questDone', test: (id) => String(id).startsWith('cq_') },
  { id: 'hermit', cat: 'story', parent: 'frost', name: '은자의 부탁', desc: '늙은 룩 은자의 부탁을 들어주었다.', ev: 'questDone', test: (id) => id === 'sq_hermit' },
  { id: 'ally', cat: 'story', parent: 'job', name: '혼자가 아니다', desc: '첫 동료를 얻었다.', ev: 'recruit' },
  { id: 'sheep', cat: 'story', parent: 'job', name: '양치기의 친구', desc: '잃어버린 양을 모두 찾았다.', ev: 'questDone', test: (id) => id === 'sq_sheep' },
  { id: 'puzzles', cat: 'story', parent: 'job', frame: 'goal', name: '두 개의 메이트', desc: '돌판 퍼즐 두 개를 모두 풀었다.', ev: 'questDone', test: () => qst('sq_puzzle') === 'done' && qst('sq_puzzle2') === 'done' },
  { id: 'kibo1', cat: 'story', parent: 'job', name: '떠돌이의 첫 문제', desc: '떠돌이 기보사의 문제를 처음 풀었다.', ev: 'kibo' },
  { id: 'kibo_all', cat: 'story', parent: 'kibo1', frame: 'goal', name: '기보 순례', desc: '떠돌이 기보사의 문제를 모두 풀었다.', ev: 'kibo', test: (n) => (n as number) >= KIBO.length, progress: () => [num('kibo_n'), KIBO.length] },

  // ---------- 전투 ----------
  { id: 'first_win', cat: 'battle', name: '첫 승리', desc: '전투에서 처음 이겼다.', ev: 'battleWin' },
  { id: 'first_death', cat: 'battle', parent: 'first_win', name: '넘어져도 괜찮아', desc: '처음으로 쓰러졌다.', ev: 'death' },
  { id: 'flee', cat: 'battle', parent: 'first_win', name: '전략적 후퇴', desc: '전투에서 처음 물러났다. 살아야 다음 수가 있다.', ev: 'flee' },
  { id: 'win10', cat: 'battle', parent: 'first_win', name: '열 번의 승리', desc: '전투에서 10번 이겼다.', ev: 'battleWin', test: () => G.battles >= 10, progress: () => [Math.min(G.battles, 10), 10] },
  { id: 'win50', cat: 'battle', parent: 'win10', frame: 'goal', name: '쉰 번의 대국', desc: '전투에서 50번 이겼다.', ev: 'battleWin', test: () => G.battles >= 50, progress: () => [Math.min(G.battles, 50), 50] },
  { id: 'shiny', cat: 'battle', parent: 'first_win', name: '반짝이는 것', desc: '빛나는 개체를 처음 쓰러뜨렸다.', ev: 'shiny' },
  { id: 'c_slime5', cat: 'battle', parent: 'first_win', name: '갈라지고 또 갈라지고', desc: '한 전투에서 슬라임을 다섯 마리 이상 쓰러뜨렸다.', ev: 'battleWin', test: (d) => W(d).kills.filter((m) => m === 'slime' || m === 'slimelet').length >= 5 },
  { id: 'c_lastgasp', cat: 'battle', parent: 'first_win', frame: 'goal', name: '종이 한 장 차이', desc: '체력 1만 남기고 전투에서 이겼다.', ev: 'battleWin', test: (d) => W(d).hp === 1 },
  { id: 'c_will', cat: 'battle', parent: 'c_lastgasp', frame: 'goal', name: '의지로 일어서다', desc: '용사의 의지가 발동한 전투에서 끝내 이겼다.', ev: 'battleWin', test: (d) => W(d).will },
  { id: 'c_knight', cat: 'battle', parent: 'first_win', frame: 'goal', name: 'L자의 복수', desc: 'L자로 뛰어올라 박쥐나 해골 기사를 쓰러뜨렸다.', ev: 'battleWin', test: (d) => W(d).hows.some((x) => x.how === 'knight' && (x.mob === 'bat' || x.mob === 'skeleton')) },
  { id: 'ability', cat: 'battle', parent: 'first_win', name: '기보 밖의 기술', desc: '전투에서 능력을 처음 썼다.', ev: 'ability' },
  { id: 'c_trap', cat: 'battle', parent: 'ability', name: '덫 사냥꾼', desc: '덫으로 적을 쓰러뜨렸다.', ev: 'battleWin', test: (d) => W(d).hows.some((x) => x.how === 'trap') },
  { id: 'c_fall2', cat: 'battle', parent: 'ability', frame: 'goal', name: '중력의 법칙', desc: '한 전투에서 적 둘을 지워진 칸으로 떨어뜨렸다.', ev: 'battleWin', test: (d) => W(d).hows.filter((x) => x.how === 'fall').length >= 2 },
  { id: 'c_chaos', cat: 'battle', parent: 'ability', frame: 'challenge', name: '기보에 없는 한 판', desc: '한 전투에서 서로 다른 세 가지 방법으로 적을 쓰러뜨렸다.', ev: 'battleWin', test: (d) => new Set(W(d).hows.map((x) => x.how).filter((k) => k !== 'other')).size >= 3 },
  { id: 'c_allways', cat: 'battle', parent: 'c_chaos', frame: 'challenge', name: '모든 수를 다 써 봤다', desc: `적을 쓰러뜨리는 방법 ${HOWS.length}가지를 모두 써 봤다: ${HOWS.map(([, n]) => n).join(', ')}.`, ev: 'battleWin', test: () => howN() >= HOWS.length, progress: () => [howN(), HOWS.length] },
  { id: 'c_brace_only', cat: 'battle', parent: 'first_win', frame: 'challenge', name: '제자리의 왕', desc: '한 번도 이동하지 않고 공격과 능력만으로 전투에서 이겼다.', ev: 'battleWin', test: (d) => { const a = W(d).acts; return !!a && a.move === 0 && a.attack + a.ability > 0; } },
  { id: 'c_naked', cat: 'battle', parent: 'first_win', frame: 'challenge', name: '맨몸의 폰', desc: '장비를 하나도 걸치지 않고 엘리트를 쓰러뜨렸다.', ev: 'battleWin', test: (d) => SLOTS.every((s) => !G.equip[s]) && W(d).kills.some((m) => ELITES.includes(m)) },
  { id: 'c_quick_boss', cat: 'battle', parent: 'first_win', frame: 'challenge', name: '최소한의 수', desc: '보스를 10턴 안에 쓰러뜨렸다.', ev: 'battleWin', test: (d) => W(d).boss && W(d).turns <= 10 },
  { id: 'awake1', cat: 'battle', parent: 'first_win', frame: 'goal', name: '깨어난 것을 잠재우다', desc: '각성한 보스를 처음 쓰러뜨렸다.', ev: 'awakeWin' },
  { id: 'awake3', cat: 'battle', parent: 'awake1', frame: 'challenge', name: '세 번의 각성', desc: '각성한 밀짚왕·퀸·킹을 모두 쓰러뜨렸다.', ev: 'awakeWin', test: () => !!(G.flags.boss_awake_dead && G.flags.queen_awake_dead && G.flags.king_awake_dead) },
  { id: 'daily1', cat: 'battle', parent: 'first_win', name: '오늘의 기보', desc: '오늘의 기보를 처음 해냈다.', ev: 'daily' },
  { id: 'set1', cat: 'forge', parent: 'first_craft', frame: 'goal', name: '세트 완성', desc: '같은 계열 장비 세 개로 세트 효과를 켰다.', ev: '*', test: () => loadout().sets.length > 0 },
  { id: 'c_ally_boss', cat: 'battle', parent: 'first_win', frame: 'goal', name: '함께 둔 마지막 수', desc: '동료가 보스에게 마지막 일격을 넣었다.', ev: 'battleWin', test: (d) => W(d).hows.some((x) => x.how === 'ally' && BOSSES.includes(x.mob)) },

  // ---------- 대장간 ----------
  { id: 'first_craft', cat: 'forge', name: '첫 망치질', desc: '장비를 처음 만들었다.', ev: 'craft' },
  { id: 'perfect', cat: 'forge', parent: 'first_craft', name: '완벽한 한 방', desc: '망치질에서 금빛 칸을 맞혔다.', ev: 'hammer', test: (q) => q === 1 },
  { id: 'hstreak3', cat: 'forge', parent: 'perfect', frame: 'challenge', name: '세 번 연속 금빛', desc: '망치질로 세 번 연달아 금빛 칸을 맞혔다.', ev: 'hstreak', test: (n) => (n as number) >= 3, progress: () => [Math.min(3, num('hstreak')), 3] },
  { id: 'master', cat: 'forge', parent: 'first_craft', frame: 'goal', name: '명장', desc: '장비를 +3까지 강화했다.', ev: 'enhance', test: (lv) => lv === 3 },
  { id: 'reforge', cat: 'forge', parent: 'first_craft', name: '녹여서 다시', desc: '장비를 처음 재련했다.', ev: 'reforge' },
  { id: 'c_mono', cat: 'forge', parent: 'first_craft', frame: 'goal', name: '한 가지 재료로', desc: '섬유를 빼고 한 종류의 재료만 4개 이상 넣어 장비를 만들었다.', ev: 'craft', test: (it) => { const k = coreKinds((it as { mats: Record<string, number> })?.mats ?? {}); return k.length === 1 && (k[0][1] ?? 0) >= 4; } },
  { id: 'c_rainbow', cat: 'forge', parent: 'first_craft', frame: 'goal', name: '무지개 합금', desc: '서로 다른 재료 다섯 가지를 섞어 장비를 만들었다.', ev: 'craft', test: (it) => coreKinds((it as { mats: Record<string, number> })?.mats ?? {}).length >= 5 },
  { id: 'recipes10', cat: 'forge', parent: 'first_craft', frame: 'goal', name: '레시피 수집가', desc: '서로 다른 조합 10가지로 장비를 만들었다.', ev: 'craft', test: () => G.recipes.length >= 10, progress: () => [Math.min(10, G.recipes.length), 10] },
  { id: 'fullgear', cat: 'forge', parent: 'first_craft', frame: 'goal', name: '완전 무장', desc: '다섯 부위를 모두 장착했다.', ev: '*', test: () => SLOTS.every((s) => G.equip[s]) },

  // ---------- 수집 ----------
  { id: 'buy', cat: 'collect', name: '첫 장보기', desc: '상점에서 처음 재료를 샀다.', ev: 'buy' },
  { id: 'sell20', cat: 'collect', parent: 'buy', name: '장사꾼 기질', desc: '재료를 20개 팔았다.', ev: 'sell', test: (n) => (n as number) >= 20, progress: () => [Math.min(20, num('sold')), 20] },
  { id: 'rich', cat: 'collect', parent: 'sell20', frame: 'goal', name: '두둑한 주머니', desc: '골드를 500 모았다.', ev: '*', test: () => G.gold >= 500, progress: () => [Math.min(500, G.gold), 500] },
  { id: 'hoarder', cat: 'collect', name: '가방이 터질 듯', desc: '가방에 재료를 40개 넘게 담았다.', ev: 'gain', test: () => bagTotal() >= 40 },
  { id: 'herb10', cat: 'collect', name: '풀 뜯는 용사', desc: '들풀을 열 번 뜯었다.', ev: 'herb', test: (n) => (n as number) >= 10, progress: () => [Math.min(10, num('herbs')), 10] },
  { id: 'rest10', cat: 'collect', name: '여관 단골', desc: '여관이나 모닥불에서 열 번 쉬었다.', ev: 'rest', test: (n) => (n as number) >= 10, progress: () => [Math.min(10, num('rests')), 10] },
  { id: 'dex10', cat: 'collect', frame: 'goal', name: '박물학자', desc: '몹 10종을 쓰러뜨렸다.', ev: 'kill', test: () => kinds() >= 10, progress: () => [Math.min(10, kinds()), 10] },
  { id: 'dexall', cat: 'collect', parent: 'dex10', frame: 'challenge', name: '완성된 도감', desc: '도감에 오르는 몹을 모두 쓰러뜨렸다.', ev: 'kill', test: () => kinds() >= DEX_MOBS.length, progress: () => [kinds(), DEX_MOBS.length] },
  { id: 'event10', cat: 'collect', frame: 'goal', name: '떠도는 사건들', desc: '물음표 칸의 사건을 열 번 겪었다.', ev: 'event', test: (n) => (n as number) >= 10, progress: () => [Math.min(10, num('events')), 10] },
  { id: 'transmute', cat: 'collect', name: '변성 성공', desc: '재료 변성에 처음 성공했다.', ev: 'transmute', test: (ok) => ok === true },
  { id: 'moblore5', cat: 'collect', parent: 'dex10', frame: 'goal', name: '이야기꾼', desc: '몹 이야기 다섯 편을 열었다.', ev: 'mobLore', test: () => Object.keys(G.flags).filter((k) => k.startsWith('mlore_')).length >= 5, progress: () => [Math.min(5, Object.keys(G.flags).filter((k) => k.startsWith('mlore_')).length), 5] },
  { id: 'lore1', cat: 'collect', name: '첫 번째 이야기', desc: '재료 하나의 설명을 끝까지 읽었다.', ev: 'lore' },
  { id: 'lore5', cat: 'collect', parent: 'lore1', frame: 'goal', name: '다섯 가지 이야기', desc: '재료 다섯 가지의 설명을 끝까지 읽었다.', ev: 'lore', test: () => loreN() >= 5, progress: () => [Math.min(5, loreN()), 5] },

  // ---------- 비밀 ----------
  { id: 's_nodmg', cat: 'secret', frame: 'challenge', name: '완벽한 기보', desc: '보스를 피해 없이 쓰러뜨렸다.', secret: true, ev: 'battleWin', test: (d) => W(d).boss && W(d).dmg === 0 },
  { id: 's_oneturn', cat: 'secret', name: '한 수 만에', desc: '전투를 첫 턴에 끝냈다.', secret: true, ev: 'battleWin', test: (d) => W(d).turns === 1 },
  { id: 's_fall', cat: 'secret', name: '밀어서 떨어뜨리기', desc: '적을 지워진 칸으로 밀어 떨어뜨렸다.', secret: true, ev: 'fall' },
  { id: 's_line', cat: 'secret', name: '아군 사격', desc: '퀸의 체크 라인으로 적이 쓰러졌다.', secret: true, ev: 'lineKill' },
  { id: 's_elder', cat: 'secret', name: '촌장님, 촌장님', desc: '촌장 킹을 열 번 귀찮게 했다.', secret: true, ev: 'elderPoke' },
  { id: 's_e4', cat: 'secret', name: '1. e4', desc: '어디선가 첫 수가 두어졌다.', secret: true, ev: 'e4' },
  { id: 's_title', cat: 'secret', name: '대기실의 나이트', desc: '타이틀의 나이트를 계속 건드렸다.', secret: true, ev: 'titleKnight' },
  { id: 's_room', cat: 'secret', frame: 'goal', name: '지워진 칸', desc: '안개 낀 북쪽 너머를 발견했다.', secret: true, ev: 'secretRoom' },
  { id: 's_blunder', cat: 'secret', frame: 'goal', name: '실수를 바로잡다', desc: '블런더를 쓰러뜨렸다.', secret: true, ev: 'kill', test: (m) => m === 'blunder' },
  { id: 's_neutral', cat: 'secret', name: '다시 쓰는 이름', desc: '중립 직업으로 이름을 다시 새겼다.', secret: true, ev: 'jobChange' },
  { id: 's_gun', cat: 'secret', frame: 'goal', name: '기보에 없는 무기', desc: '체스판에 있을 수 없는 것을 벼려 냈다.', secret: true, ev: 'gun' },
  { id: 's_gun_queen', cat: 'secret', frame: 'challenge', name: '체크메이트는 총으로', desc: '잘못 둔 퀸에게 마지막 한 발을 쏘았다.', secret: true, ev: 'battleWin', test: (d) => W(d).hows.some((x) => x.how === 'shot' && x.mob === 'misqueen') },
  { id: 's_wall', cat: 'secret', name: '벽이 된 폰', desc: '적을 다섯 마리 이상 쓰러뜨린 전투를 피해 없이 이겼다.', secret: true, ev: 'battleWin', test: (d) => W(d).dmg === 0 && W(d).kills.length >= 5 },
  { id: 's_kibo_wrong', cat: 'secret', name: '기보사의 한숨', desc: '돌판과 기보사의 문제를 다섯 번 틀렸다.', secret: true, ev: 'pzWrong', test: (n) => (n as number) >= 5 },
  { id: 's_iron', cat: 'secret', frame: 'challenge', name: '꺾이지 않는 수', desc: '어려움 이상에서 난이도를 한 번도 낮추지 않고 두 번째 승급을 했다.', secret: true, ev: 'promote2', test: () => hard() && !G.flags.diffLowered },
  { id: 's_hard_clean', cat: 'secret', frame: 'challenge', name: '한 번도 넘어지지 않고', desc: '어려움 이상에서 한 번도 쓰러지지 않고 밀짚왕을 쓰러뜨렸다.', secret: true, ev: 'questDone', test: (id) => id === 'main_boss' && hard() && !G.flags.deaths },
  { id: 's_shiny5', cat: 'secret', name: '빛 사냥꾼', desc: '빛나는 개체를 다섯 마리 쓰러뜨렸다.', secret: true, ev: 'shiny', test: (n) => (n as number) >= 5 },
  { id: 's_lore_all', cat: 'secret', frame: 'challenge', name: '재료 박물지', desc: '모든 재료의 설명을 끝까지 읽었다.', secret: true, ev: 'lore', test: () => loreAll() },
  { id: 's_end_all', cat: 'secret', frame: 'challenge', name: '세 개의 끝', desc: '서로 다른 엔딩을 셋 보았다.', secret: true, ev: 'ending', test: () => meta().endings.length >= 3 },
  { id: 's_end_seven', cat: 'secret', frame: 'challenge', name: '일곱 개의 끝', desc: '일곱 가지 엔딩을 모두 보았다.', secret: true, ev: 'ending', test: () => meta().endings.length >= 7 },
  { id: 's_together', cat: 'secret', frame: 'challenge', name: '함께 적힌 이름', desc: '동료들과 마지막 줄을 함께 적었다.', secret: true, ev: 'ending', test: (e) => e === 'together' },
  { id: 's_pen', cat: 'secret', frame: 'challenge', name: '펜을 쥔 수', desc: '저자의 펜을 빼앗았다.', secret: true, ev: 'ending', test: (e) => e === 'pen' },
  { id: 's_stalemate', cat: 'secret', frame: 'challenge', name: '스테일메이트', desc: '저자와 싸우지 않고 끝을 맺었다.', secret: true, ev: 'ending', test: (e) => e === 'stalemate' },
  { id: 's_throne', cat: 'secret', frame: 'challenge', name: '다음 보스', desc: '끝을 적지 않고 옥좌로 돌아갔다.', secret: true, ev: 'ending', test: (e) => e === 'throne' },
  { id: 's_closed', cat: 'secret', frame: 'challenge', name: '덮인 기보', desc: '저자가 스스로 끝을 적게 했다.', secret: true, ev: 'ending', test: (e) => e === 'closed' },
  { id: 's_rewrite', cat: 'secret', frame: 'challenge', name: '다시 쓰인 기보', desc: '숨겨진 끝을 적었다.', secret: true, ev: 'ending', test: (e) => e === 'rewrite' },
  { id: 's_rebirth3', cat: 'secret', frame: 'challenge', name: '윤회하는 폰', desc: '세 번 환생했다.', secret: true, ev: 'rebirth', test: (n) => (n as number) >= 3 },
  { id: 's_daily7', cat: 'secret', name: '매일 한 수', desc: '오늘의 기보를 7일 연속 해냈다.', secret: true, ev: 'daily', test: (n) => (n as number) >= 7 },
  { id: 's_egg3', cat: 'secret', name: '여백을 읽는 자', desc: '여백의 낙서를 세 개 찾았다.', secret: true, ev: 'egg', test: (n) => (n as number) >= 3 },
  { id: 's_egg_all', cat: 'secret', frame: 'challenge', name: '낙서의 주인', desc: '여백의 낙서를 모두 찾았다.', secret: true, ev: 'egg', test: (n) => (n as number) >= EGG_TOTAL },
  { id: 's_poor', cat: 'secret', name: '빈털터리 용사', desc: '골드 0으로 전투에서 이겼다.', secret: true, ev: 'battleWin', test: () => G.gold <= 4 },
];

let busy = false;
export function initAchievements() {
  on('*', (e) => {
    if (busy || !G) return;
    const { ev, data } = e as { ev: string; data: unknown };
    busy = true;
    for (const a of ACHS) {
      if (G.ach[a.id]) continue;
      if (a.ev !== ev && a.ev !== '*') continue;
      if (a.test && !a.test(data)) continue;
      G.ach[a.id] = Date.now();
      const f = a.frame ?? 'task';
      const head = a.secret ? '🔓 비밀 업적' : f === 'challenge' ? '⚔ 도전 완료!' : f === 'goal' ? '🎯 목표 달성' : '🏆 업적';
      const r = REWARDS[a.id];
      const got = r ? giveReward(r) : '';
      G.flags[`rw_${a.id}`] = true;
      toast(`${head} — ${a.name}${got ? ` · 보상: ${got}` : ''}`, 'rare');
      sfx('ach');
      save();
    }
    busy = false;
  });
}

/** 이전 저장: 이미 이룬 것(직업·이동·진행도 업적)을 조용히 채운다 */
export function syncAchievements() {
  const grant = (id: string) => { if (!G.ach[id]) G.ach[id] = Date.now(); };
  if (G.job) grant('job');
  if (visited() > 1) grant('walk');
  for (const a of ACHS) {
    if (a.secret || !a.progress || G.ach[a.id] || a.id === 'hstreak3') continue;
    const [n, m] = a.progress();
    if (n >= m) grant(a.id);
  }
  // 보상이 생기기 전에 이룬 업적도 보상을 받는다
  let n = 0;
  for (const a of ACHS) {
    if (!G.ach[a.id] || G.flags[`rw_${a.id}`]) continue;
    G.flags[`rw_${a.id}`] = true;
    const r = REWARDS[a.id];
    if (r) { giveReward(r); n++; }
  }
  if (n) toast(`이미 이룬 업적 ${n}개의 보상을 받았다. (업적 창에서 확인)`, 'rare');
}

// ---------- 업적 창: 분류 탭 + 나무 ----------
let lastTab: AchCat = 'story';

export function openAchievements() {
  const root = h('div', { class: 'achs' });
  modal('업적', root, { wide: true });
  const render = () => {
    root.innerHTML = '';
    const done = ACHS.filter((a) => G.ach[a.id]).length;
    root.append(h('p', { class: 'muted' }, `${done} / ${ACHS.length} 달성 · 앞선 업적을 이루면 다음 업적이 드러나요. 비밀 업적은 이루기 전까지 가려져 있어요.`));
    const tabs = h('div', { class: 'tabs' });
    for (const [c, name] of CATS) {
      const list = ACHS.filter((a) => a.cat === c);
      const got = list.filter((a) => G.ach[a.id]).length;
      const b = h('button', { class: `tab ${lastTab === c ? 'on' : ''}` }, `${name} ${got}/${list.length}`);
      b.addEventListener('click', () => { lastTab = c; render(); });
      tabs.append(b);
    }
    root.append(tabs);
    // 업적으로 얻은 능력
    const perks = (Object.keys(PERKS) as (keyof typeof PERKS)[]).filter((p) => G.flags[`perk_${p}`]);
    root.append(h('div', { class: 'perk-list' }, h('b', {}, '얻은 능력  '), perks.length ? h('span', {}, ...perks.map((p) => h('span', { class: 'chip perk', title: PERKS[p].desc }, PERKS[p].name))) : h('small', { class: 'muted' }, '도전(✦) 업적을 이루면 영구 능력을 얻어요.'), G.flags.achHp ? h('span', { class: 'chip' }, `업적 체력 +${G.flags.achHp}/3`) : null));
    const tree = h('div', { class: 'ach-tree' });
    const list = ACHS.filter((a) => a.cat === lastTab);
    const node = (a: Ach, depth: number) => {
      const got = !!G.ach[a.id];
      const parentOk = !a.parent || !!G.ach[a.parent];
      const hidden = !got && (a.secret || !parentOk);
      const f = a.frame ?? 'task';
      const pr = !got && !hidden && a.progress ? a.progress() : null;
      tree.append(h('div', { class: `ach-node f-${f} ${got ? 'got' : ''} ${hidden ? 'hidden' : ''}`, style: { marginLeft: `${depth * 26}px` } },
        h('span', { class: 'ach-frame' }, got ? '★' : f === 'challenge' ? '✦' : f === 'goal' ? '◆' : '■'),
        h('div', { class: 'ach-txt' },
          h('b', {}, hidden ? '???' : a.name, h('small', { class: 'ach-kind' }, `  ${a.secret ? '비밀' : FRAME_NAME[f]}`)),
          h('small', {}, hidden ? (a.secret ? '비밀 업적' : '앞의 업적을 이루면 드러나요') : a.desc),
          !hidden && REWARDS[a.id] ? h('small', { class: `ach-reward ${got ? 'got' : ''}` }, `보상: ${rewardText(REWARDS[a.id])}${REWARDS[a.id].perk ? ` — ${PERKS[REWARDS[a.id].perk!].desc}` : ''}`) : null,
          pr ? h('div', { class: 'ach-progress' },
            h('div', { class: 'ach-bar', 'aria-label': `진행 ${pr[0]} / ${pr[1]}` }, h('i', { style: { width: `${(pr[0] / pr[1]) * 100}%` } })),
            h('span', { class: 'ach-count' }, `${pr[0]} / ${pr[1]}`),
          ) : null,
        )));
      for (const k of list.filter((x) => x.parent === a.id)) node(k, depth + 1);
    };
    for (const r of list.filter((a) => !a.parent)) node(r, 0);
    root.append(tree);
  };
  render();
}
