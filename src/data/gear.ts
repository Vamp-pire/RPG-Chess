// 장비 밑판: 몹이 떨어뜨리는 완성된 장비. 행마·특성은 여기서 정해지고, 대장간에서는 개조 칸에 재료를 넣어 다듬는다.
// 무기는 직업 성향 계열(빛 = 인파이팅, 어둠 = 아웃파이팅, 중립 = 변칙)에 묶이고, 다른 부위는 누구나 쓴다.
// 설계 문서: docs/gear-overhaul.md (1지역은 사용자와 확정, 2~4지역은 임시안)
import { ALFIL, DIAG, JUMP2, KING, KNIGHT, ORTH, RING2, Vec } from '../core/geom';
import { MoveRule, RuleKind } from '../core/rules';
import type { Slot } from '../core/items';
import type { SetId } from '../core/sets';
import { AbilityId, MatId, TraitId } from './materials';
import { MobId } from './mobs';
import { Align } from './pieces';

export type Fam = Align;
/** 보스 고유 무기 효과 (계열마다 하나) */
export type UniqId = 'crowd' | 'aim' | 'swap';

export const FAM_NAME: Record<Fam, string> = { light: '빛', dark: '어둠', neutral: '중립' };
export const FAM_STYLE: Record<Fam, string> = { light: '인파이팅', dark: '아웃파이팅', neutral: '변칙' };
/** 계열 특성: 덤 효과·강화로 붙는 계열다운 특성 */
export const FAM_TRAIT: Record<Fam, TraitId> = { light: 'sturdy', dark: 'light', neutral: 'bind' };

export const UNIQ: Record<UniqId, { name: string; desc: string }> = {
  crowd: { name: '포위 돌파', desc: '붙어 있는 적이 둘 이상이면 피해 +1' },
  aim: { name: '정조준', desc: '바로 전 행동이 이동이 아니었으면(제자리에서 쏘면) 피해 +1' },
  swap: { name: '자리 바꾸기', desc: '친 적이 살아남으면 그 적과 자리를 바꾼다' },
};

export interface BaseDef {
  id: string;
  name: string;
  slot: Slot;
  /** 무기만: 이 계열 직업만 낄 수 있다 (없으면 누구나) */
  fam?: Fam;
  region: 1 | 2 | 3 | 4;
  /** 떨어뜨리는 몹 (shop = 상점, starter = 직업을 정할 때, boss = 보스 첫 처치, ritual = 의식) */
  from: (MobId | 'shop' | 'starter' | 'boss' | 'ritual')[];
  elite?: boolean;
  unique?: UniqId;
  rules: MoveRule[];
  traits?: Partial<Record<TraitId, number>>;
  ability?: { id: AbilityId; lv: number };
  /** 강화·분해에 쓰는 재료 */
  mat: MatId;
  set?: SetId;
  /** 2~4지역 임시안 표시 (사용자와 다시 정할 것) */
  draft?: boolean;
}

const A = (kind: RuleKind, dirs: Vec[], range = 1, extra: Partial<MoveRule> = {}): MoveRule => ({ kind, dirs, range, mode: 'attack', ...extra });
const M = (kind: RuleKind, dirs: Vec[], range = 1, extra: Partial<MoveRule> = {}): MoveRule => ({ kind, dirs, range, mode: 'move', ...extra });
const legA = (dirs = KNIGHT) => A('leap', dirs, 1, { leg: true });

const LIST: BaseDef[] = [
  // ======================= 시작 무기 (직업을 정할 때 계열마다 하나) =======================
  { id: 'st_club', name: '나무 몽둥이', slot: 'weapon', fam: 'light', region: 1, from: ['starter'], rules: [A('step', ORTH)], mat: 'fiber' },
  { id: 'st_sling', name: '돌팔매', slot: 'weapon', fam: 'dark', region: 1, from: ['starter'], rules: [A('slide', ORTH, 2)], mat: 'fiber' },
  { id: 'st_stick', name: '휘는 막대', slot: 'weapon', fam: 'neutral', region: 1, from: ['starter'], rules: [legA()], mat: 'fiber' },

  // ======================= 1지역: 첫수 들판 (확정) =======================
  // 빛 (인파이팅)
  { id: 'r1_mace', name: '쥐이빨 철퇴', slot: 'weapon', fam: 'light', region: 1, from: ['rat'], rules: [A('step', ORTH)], traits: { sharp: 1 }, mat: 'tooth', set: 'fang' },
  { id: 'r1_shield', name: '이끼 방패검', slot: 'weapon', fam: 'light', region: 1, from: ['golem', 'rook'], rules: [A('step', KING)], traits: { sturdy: 1 }, mat: 'moss', set: 'stone' },
  { id: 'r1_claw', name: '두더지 발톱 장갑', slot: 'weapon', fam: 'light', region: 1, from: ['mole'], rules: [A('step', ORTH)], traits: { counter: 1 }, mat: 'claw', set: 'thorn' },
  { id: 'r1_lance', name: '송곳니 성창', slot: 'weapon', fam: 'light', region: 1, from: ['hound'], elite: true, rules: [A('step', KING)], traits: { sharp: 1, counter: 1 }, mat: 'fang', set: 'fang' },
  // 어둠 (아웃파이팅)
  { id: 'r1_sling', name: '젤 새총', slot: 'weapon', fam: 'dark', region: 1, from: ['slime'], rules: [A('slide', DIAG, 2)], traits: { sticky: 1 }, mat: 'gel', set: 'slime' },
  { id: 'r1_bow', name: '들풀 활', slot: 'weapon', fam: 'dark', region: 1, from: ['shop'], rules: [A('slide', ORTH, 3)], mat: 'fiber' },
  { id: 'r1_dart', name: '까마귀 깃 투척침', slot: 'weapon', fam: 'dark', region: 1, from: ['crow'], rules: [A('leap', ALFIL)], traits: { light: 1 }, mat: 'feather', set: 'wing' },
  { id: 'r1_longbow', name: '송곳니 장궁', slot: 'weapon', fam: 'dark', region: 1, from: ['hound'], elite: true, rules: [A('slide', ORTH, 3)], traits: { sharp: 1 }, mat: 'fang', set: 'fang' },
  // 중립 (변칙)
  { id: 'r1_boomerang', name: '박쥐날개 부메랑', slot: 'weapon', fam: 'neutral', region: 1, from: ['bat'], rules: [legA()], traits: { light: 1 }, mat: 'wing', set: 'wing' },
  { id: 'r1_whip', name: '가시 채찍', slot: 'weapon', fam: 'neutral', region: 1, from: ['thorn'], rules: [A('leap', JUMP2)], traits: { counter: 1 }, mat: 'thorn', set: 'thorn' },
  { id: 'r1_scythe', name: '메뚜기 다리 낫', slot: 'weapon', fam: 'neutral', region: 1, from: ['hopper'], rules: [A('hop', KING, 3)], mat: 'leg' },
  { id: 'r1_chain', name: '사냥개 사슬낫', slot: 'weapon', fam: 'neutral', region: 1, from: ['hound'], elite: true, rules: [legA(), A('leap', JUMP2)], traits: { sharp: 1 }, mat: 'fang', set: 'fang' },
  // 밀짚왕 고유
  { id: 'r1_scepter', name: '밀짚 왕홀', slot: 'weapon', fam: 'light', region: 1, from: ['boss', 'strawking'], unique: 'crowd', rules: [A('step', KING)], traits: { undying: 1 }, mat: 'fiber' },
  { id: 'r1_greatbow', name: '밀짚 장궁', slot: 'weapon', fam: 'dark', region: 1, from: ['boss', 'strawking'], unique: 'aim', rules: [A('slide', ORTH, 4)], mat: 'fiber' },
  { id: 'r1_baton', name: '밀짚 지휘봉', slot: 'weapon', fam: 'neutral', region: 1, from: ['boss', 'strawking'], unique: 'swap', rules: [A('leap', KNIGHT)], mat: 'fiber' },
  // 공용: 신발
  { id: 'r1_gelboots', name: '점액 장화', slot: 'boots', region: 1, from: ['slime'], rules: [M('step', DIAG)], traits: { sticky: 1 }, mat: 'gel', set: 'slime' },
  { id: 'r1_batboots', name: '박쥐날개 신', slot: 'boots', region: 1, from: ['bat'], rules: [M('leap', KNIGHT)], traits: { light: 1 }, mat: 'wing', set: 'wing' },
  { id: 'r1_mossboots', name: '이끼 장화', slot: 'boots', region: 1, from: ['golem', 'rook'], rules: [M('slide', ORTH, 2)], traits: { sturdy: 1 }, mat: 'moss', set: 'stone' },
  { id: 'r1_crowboots', name: '까마귀 깃 신', slot: 'boots', region: 1, from: ['crow'], rules: [M('leap', ALFIL)], mat: 'feather', set: 'wing' },
  { id: 'r1_hopboots', name: '메뚜기 다리 신', slot: 'boots', region: 1, from: ['hopper'], rules: [M('hop', KING, 3)], mat: 'leg' },
  { id: 'r1_grassboots', name: '들풀 짚신', slot: 'boots', region: 1, from: ['shop'], rules: [M('step', DIAG)], mat: 'fiber' },
  { id: 'r1_houndboots', name: '사냥개 가죽 장화', slot: 'boots', region: 1, from: ['hound'], elite: true, rules: [M('slide', KING, 2)], mat: 'fang', set: 'fang' },
  // 공용: 방어구
  { id: 'r1_ratvest', name: '들쥐 가죽 조끼', slot: 'armor', region: 1, from: ['rat'], rules: [], traits: { sharp: 2 }, mat: 'tooth', set: 'fang' },
  { id: 'r1_mossarmor', name: '이끼 갑옷', slot: 'armor', region: 1, from: ['golem', 'rook'], rules: [], traits: { sturdy: 2 }, mat: 'moss', set: 'stone' },
  { id: 'r1_thornarmor', name: '가시 갑옷', slot: 'armor', region: 1, from: ['thorn'], rules: [], traits: { counter: 2 }, mat: 'thorn', set: 'thorn' },
  { id: 'r1_gelarmor', name: '젤 갑옷', slot: 'armor', region: 1, from: ['slime'], rules: [], traits: { sticky: 2 }, mat: 'gel', set: 'slime' },
  { id: 'r1_molearmor', name: '두더지 가죽 갑옷', slot: 'armor', region: 1, from: ['mole'], rules: [], traits: { sturdy: 1, counter: 1 }, mat: 'claw', set: 'stone' },
  // 공용: 각인·유물
  { id: 'r1_pushmark', name: '이끼 각인', slot: 'engrave', region: 1, from: ['golem'], rules: [], ability: { id: 'push', lv: 1 }, mat: 'moss', set: 'stone' },
  { id: 'r1_hopmark', name: '박쥐 각인', slot: 'engrave', region: 1, from: ['bat'], rules: [], ability: { id: 'hop', lv: 1 }, mat: 'wing', set: 'wing' },
  { id: 'r1_swapmark', name: '기보 파편 각인', slot: 'engrave', region: 1, from: ['hound'], elite: true, rules: [], ability: { id: 'swap', lv: 1 }, mat: 'shard' },
  { id: 'r1_traprelic', name: '가시 덫 유물', slot: 'relic', region: 1, from: ['thorn'], rules: [], ability: { id: 'trap', lv: 1 }, mat: 'thorn', set: 'thorn' },
  { id: 'r1_crackrelic', name: '균열 유물', slot: 'relic', region: 1, from: ['golem', 'mole'], rules: [], ability: { id: 'terrain', lv: 1 }, mat: 'moss', set: 'stone' },

  // ======================= 2지역: 혼전의 늪 (임시안 v2, 2026-10-07 검토: 앞 지역과 모양이 겹치던 것·같은 수치였던 것 정리) =======================
  { id: 'r2_greatsword', name: '해골 대검', slot: 'weapon', fam: 'light', region: 2, from: ['skeleton'], rules: [A('step', KING)], traits: { undying: 1, sharp: 1 }, mat: 'bone', set: 'bone', draft: true },
  { id: 'r2_webmace', name: '거미줄 철퇴', slot: 'weapon', fam: 'light', region: 2, from: ['spider'], rules: [A('step', KING)], traits: { bind: 1, sturdy: 1 }, mat: 'silk', set: 'web', draft: true },
  { id: 'r2_axe', name: '뼈 군주의 도끼', slot: 'weapon', fam: 'light', region: 2, from: ['bonelord'], elite: true, rules: [A('step', KING)], traits: { sharp: 2, undying: 1 }, mat: 'bone', set: 'bone', draft: true },
  { id: 'r2_crossbow', name: '거미줄 석궁', slot: 'weapon', fam: 'dark', region: 2, from: ['spider'], rules: [A('slide', DIAG, 3)], traits: { bind: 1 }, mat: 'silk', set: 'web', draft: true },
  { id: 'r2_ghostbow', name: '망령 활', slot: 'weapon', fam: 'dark', region: 2, from: ['wraith'], rules: [A('slide', ORTH, 3, { pierce: true })], mat: 'ecto', set: 'ghost', draft: true },
  { id: 'r2_bonebow', name: '뼈 군주의 장궁', slot: 'weapon', fam: 'dark', region: 2, from: ['bonelord'], elite: true, rules: [A('slide', ORTH, 4)], traits: { sharp: 1 }, mat: 'bone', set: 'bone', draft: true },
  { id: 'r2_tongue', name: '두꺼비 혀 채찍', slot: 'weapon', fam: 'neutral', region: 2, from: ['toad'], rules: [A('leap', JUMP2), A('leap', ALFIL)], traits: { light: 1 }, mat: 'skin', set: 'wing', draft: true },
  { id: 'r2_boneboom', name: '해골 부메랑', slot: 'weapon', fam: 'neutral', region: 2, from: ['skeleton'], rules: [legA(), A('leap', JUMP2)], traits: { undying: 1 }, mat: 'bone', set: 'bone', draft: true },
  { id: 'r2_ghostchain', name: '망령 사슬낫', slot: 'weapon', fam: 'neutral', region: 2, from: ['bonelord'], elite: true, rules: [A('leap', KNIGHT), A('hop', ORTH, 3)], traits: { sharp: 1 }, mat: 'ecto', set: 'ghost', draft: true },
  { id: 'r2_mscepter', name: '거울 왕홀', slot: 'weapon', fam: 'light', region: 2, from: ['boss', 'misqueen'], unique: 'crowd', rules: [A('step', KING)], traits: { sturdy: 1, counter: 1 }, mat: 'mirror', set: 'ghost', draft: true },
  { id: 'r2_mbow', name: '거울 활', slot: 'weapon', fam: 'dark', region: 2, from: ['boss', 'misqueen'], unique: 'aim', rules: [A('slide', ORTH, 4), A('slide', DIAG, 2)], mat: 'mirror', set: 'ghost', draft: true },
  { id: 'r2_mbaton', name: '거울 지휘봉', slot: 'weapon', fam: 'neutral', region: 2, from: ['boss', 'misqueen'], unique: 'swap', rules: [A('leap', KNIGHT), A('leap', ALFIL)], mat: 'mirror', set: 'ghost', draft: true },
  { id: 'r2_toadboots', name: '두꺼비 가죽 신', slot: 'boots', region: 2, from: ['toad'], rules: [M('leap', JUMP2)], traits: { light: 1 }, mat: 'skin', set: 'wing', draft: true },
  { id: 'r2_webboots', name: '거미줄 신', slot: 'boots', region: 2, from: ['spider'], rules: [M('slide', DIAG, 2)], traits: { bind: 1 }, mat: 'silk', set: 'web', draft: true },
  { id: 'r2_ghostboots', name: '망령 장화', slot: 'boots', region: 2, from: ['wraith'], rules: [M('slide', ORTH, 2, { pierce: true })], mat: 'ecto', set: 'ghost', draft: true },
  { id: 'r2_bonearmor', name: '해골 갑옷', slot: 'armor', region: 2, from: ['skeleton', 'bonelord'], rules: [], traits: { undying: 1, sturdy: 1 }, mat: 'bone', set: 'bone', draft: true },
  { id: 'r2_silkarmor', name: '거미줄 망토', slot: 'armor', region: 2, from: ['spider'], rules: [], traits: { bind: 2 }, mat: 'silk', set: 'web', draft: true },
  { id: 'r2_skinarmor', name: '두꺼비 가죽 옷', slot: 'armor', region: 2, from: ['toad'], rules: [], traits: { light: 2 }, mat: 'skin', set: 'wing', draft: true },
  { id: 'r2_pullmark', name: '거미줄 각인', slot: 'engrave', region: 2, from: ['spider'], rules: [], ability: { id: 'pull', lv: 1 }, mat: 'silk', set: 'web', draft: true },
  { id: 'r2_blinkmark', name: '망령 각인', slot: 'engrave', region: 2, from: ['wraith'], rules: [], ability: { id: 'blink', lv: 1 }, mat: 'ecto', set: 'ghost', draft: true },
  { id: 'r2_traprelic', name: '뼈 덫 유물', slot: 'relic', region: 2, from: ['bonelord'], elite: true, rules: [], ability: { id: 'trap', lv: 2 }, mat: 'bone', set: 'bone', draft: true },

  // ======================= 3지역: 종반의 설원 (임시안) =======================
  { id: 'r3_wolfclaw', name: '늑대 발톱', slot: 'weapon', fam: 'light', region: 3, from: ['wolf'], rules: [A('step', KING)], traits: { sharp: 1, light: 1, counter: 1 }, mat: 'fur', set: 'wing', draft: true },
  { id: 'r3_icemace', name: '얼음 철퇴', slot: 'weapon', fam: 'light', region: 3, from: ['icesprite', 'tower'], rules: [A('step', KING)], traits: { sturdy: 2, counter: 1 }, mat: 'ice', set: 'frost', draft: true },
  { id: 'r3_tuskaxe', name: '엄니 도끼', slot: 'weapon', fam: 'light', region: 3, from: ['giant'], elite: true, rules: [A('step', KING)], traits: { sharp: 2, sturdy: 1, undying: 1 }, mat: 'tusk', set: 'fang', draft: true },
  { id: 'r3_frostbow', name: '서리 활', slot: 'weapon', fam: 'dark', region: 3, from: ['snowpawn'], rules: [A('slide', ORTH, 4)], traits: { bind: 1 }, mat: 'frost', set: 'frost', draft: true },
  { id: 'r3_bstaff', name: '서리 비숍의 지팡이', slot: 'weapon', fam: 'dark', region: 3, from: ['frostbishop'], rules: [A('slide', DIAG, 4)], mat: 'frost', set: 'frost', draft: true },
  { id: 'r3_giantbow', name: '거인의 장궁', slot: 'weapon', fam: 'dark', region: 3, from: ['giant'], elite: true, rules: [A('slide', KING, 3)], traits: { sharp: 1 }, mat: 'tusk', set: 'fang', draft: true },
  { id: 'r3_wolfboom', name: '늑대 이빨 부메랑', slot: 'weapon', fam: 'neutral', region: 3, from: ['wolf'], rules: [A('leap', KNIGHT), A('leap', JUMP2)], traits: { light: 1 }, mat: 'fur', set: 'wing', draft: true },
  { id: 'r3_icehook', name: '얼음 갈고리', slot: 'weapon', fam: 'neutral', region: 3, from: ['icesprite'], rules: [A('leap', ALFIL), A('hop', DIAG, 3)], mat: 'ice', set: 'frost', draft: true },
  { id: 'r3_tuskchain', name: '엄니 사슬낫', slot: 'weapon', fam: 'neutral', region: 3, from: ['giant'], elite: true, rules: [A('leap', KNIGHT), A('leap', JUMP2), A('leap', ALFIL)], traits: { sharp: 1 }, mat: 'tusk', set: 'fang', draft: true },
  { id: 'r3_fscepter', name: '서리 왕홀', slot: 'weapon', fam: 'light', region: 3, from: ['boss', 'frozenking'], unique: 'crowd', rules: [A('step', KING)], traits: { undying: 1, sturdy: 2 }, mat: 'ice', set: 'frost', draft: true },
  { id: 'r3_fbow', name: '서리 장궁', slot: 'weapon', fam: 'dark', region: 3, from: ['boss', 'frozenking'], unique: 'aim', rules: [A('slide', KING, 4)], mat: 'frost', set: 'frost', draft: true },
  { id: 'r3_fbaton', name: '서리 지휘봉', slot: 'weapon', fam: 'neutral', region: 3, from: ['boss', 'frozenking'], unique: 'swap', rules: [A('leap', RING2)], mat: 'ice', set: 'frost', draft: true },
  { id: 'r3_furboots', name: '늑대 털 신', slot: 'boots', region: 3, from: ['wolf'], rules: [M('leap', KNIGHT)], traits: { light: 1 }, mat: 'fur', set: 'wing', draft: true },
  { id: 'r3_iceboots', name: '얼음 장화', slot: 'boots', region: 3, from: ['icesprite', 'frostbishop'], rules: [M('slide', DIAG, 3)], traits: { sturdy: 1 }, mat: 'ice', set: 'frost', draft: true },
  { id: 'r3_icearmor', name: '얼음 비늘 갑옷', slot: 'armor', region: 3, from: ['tower', 'icesprite'], rules: [], traits: { sturdy: 3 }, mat: 'ice', set: 'stone', draft: true },
  { id: 'r3_furcoat', name: '늑대 털 외투', slot: 'armor', region: 3, from: ['wolf'], rules: [], traits: { light: 2, sturdy: 1 }, mat: 'fur', set: 'wing', draft: true },
  { id: 'r3_frostcoat', name: '서리 망토', slot: 'armor', region: 3, from: ['snowpawn', 'frostbishop'], rules: [], traits: { bind: 2, sturdy: 1 }, mat: 'frost', set: 'web', draft: true },
  { id: 'r3_pushmark', name: '거인 각인', slot: 'engrave', region: 3, from: ['giant'], elite: true, rules: [], ability: { id: 'push', lv: 2 }, mat: 'tusk', draft: true },
  { id: 'r3_terrrelic', name: '파수꾼의 유물', slot: 'relic', region: 3, from: ['tower'], rules: [], ability: { id: 'terrain', lv: 2 }, mat: 'ice', set: 'stone', draft: true },

  // ======================= 4지역: 기보의 끝 (임시안) =======================
  { id: 'r4_inkmace', name: '잉크 철퇴', slot: 'weapon', fam: 'light', region: 4, from: ['inkblot'], rules: [A('step', KING)], traits: { sharp: 2, counter: 1, kibo: 1 }, mat: 'ink', set: 'ink', draft: true },
  { id: 'r4_pageblade', name: '페이지 칼날', slot: 'weapon', fam: 'light', region: 4, from: ['erased', 'bookworm'], rules: [A('step', KING)], traits: { undying: 1, sharp: 2, sturdy: 1 }, mat: 'page', set: 'bone', draft: true },
  { id: 'r4_quillsword', name: '깃펜 검', slot: 'weapon', fam: 'light', region: 4, from: ['double'], elite: true, rules: [A('step', KING)], traits: { sharp: 3, undying: 1, counter: 1 }, mat: 'quill', set: 'ink', draft: true },
  { id: 'r4_inkbow', name: '책벌레 활', slot: 'weapon', fam: 'dark', region: 4, from: ['bookworm'], rules: [A('slide', ORTH, 5, { pierce: true })], mat: 'page', set: 'bone', draft: true },
  { id: 'r4_annotbow', name: '주석 석궁', slot: 'weapon', fam: 'dark', region: 4, from: ['annot'], rules: [A('slide', DIAG, 4)], traits: { sharp: 1 }, mat: 'ink', set: 'ink', draft: true },
  { id: 'r4_quillbow', name: '깃펜 장궁', slot: 'weapon', fam: 'dark', region: 4, from: ['double'], elite: true, rules: [A('slide', KING, 4)], traits: { sharp: 1 }, mat: 'quill', set: 'ink', draft: true },
  { id: 'r4_inkboom', name: '잉크 부메랑', slot: 'weapon', fam: 'neutral', region: 4, from: ['inkblot', 'annot'], rules: [A('leap', RING2)], mat: 'ink', set: 'ink', draft: true },
  { id: 'r4_erasedchain', name: '지워진 사슬', slot: 'weapon', fam: 'neutral', region: 4, from: ['erased'], rules: [A('leap', KNIGHT), A('hop', ORTH, 4)], mat: 'page', set: 'bone', draft: true },
  { id: 'r4_quillbaton', name: '깃펜 지휘봉', slot: 'weapon', fam: 'neutral', region: 4, from: ['double'], elite: true, rules: [A('leap', RING2), A('leap', KNIGHT)], traits: { sharp: 1 }, mat: 'quill', set: 'ink', draft: true },
  { id: 'r4_pageboots', name: '페이지 신', slot: 'boots', region: 4, from: ['erased', 'bookworm'], rules: [M('leap', RING2)], mat: 'page', set: 'bone', draft: true },
  { id: 'r4_inkboots', name: '잉크 장화', slot: 'boots', region: 4, from: ['inkblot', 'annot'], rules: [M('slide', KING, 3)], mat: 'ink', set: 'ink', draft: true },
  { id: 'r4_pagecoat', name: '페이지 외투', slot: 'armor', region: 4, from: ['bookworm', 'erased'], rules: [], traits: { undying: 1, sturdy: 2 }, mat: 'page', set: 'bone', draft: true },
  { id: 'r4_inkcoat', name: '잉크 망토', slot: 'armor', region: 4, from: ['annot', 'inkblot'], rules: [], traits: { kibo: 2, light: 1 }, mat: 'ink', set: 'ink', draft: true },
  { id: 'r4_swapmark', name: '주석 각인', slot: 'engrave', region: 4, from: ['annot'], rules: [], ability: { id: 'swap', lv: 2 }, mat: 'ink', set: 'ink', draft: true },
  { id: 'r4_blinkmark', name: '책벌레 각인', slot: 'engrave', region: 4, from: ['bookworm'], rules: [], ability: { id: 'blink', lv: 2 }, mat: 'page', set: 'bone', draft: true },
  { id: 'r4_traprelic', name: '겹수의 유물', slot: 'relic', region: 4, from: ['double'], elite: true, rules: [], ability: { id: 'trap', lv: 3 }, mat: 'quill', set: 'ink', draft: true },

  // ======================= 2~4지역 새 몹 장비 (2026-10-07) =======================
  // 2지역: 늪 뱀 · 늪 거북 · 폐허 석상
  { id: 'r2_snakeblade', name: '뱀 비늘 사슬낫', slot: 'weapon', fam: 'neutral', region: 2, from: ['snake'], rules: [A('slide', KNIGHT, 2)], traits: { light: 1 }, mat: 'scale', set: 'wing', draft: true },
  { id: 'r2_snakeboots', name: '뱀 비늘 신', slot: 'boots', region: 2, from: ['snake'], rules: [M('slide', KNIGHT, 2)], mat: 'scale', set: 'wing', draft: true },
  { id: 'r2_shellsword', name: '등딱지 방패검', slot: 'weapon', fam: 'light', region: 2, from: ['turtle'], rules: [A('step', KING)], traits: { sturdy: 2 }, mat: 'shell', set: 'stone', draft: true },
  { id: 'r2_shellarmor', name: '등딱지 갑옷', slot: 'armor', region: 2, from: ['turtle'], rules: [], traits: { sturdy: 2, counter: 1 }, mat: 'shell', set: 'stone', draft: true },
  { id: 'r2_sling3', name: '석상 투석기', slot: 'weapon', fam: 'dark', region: 2, from: ['statue'], rules: [A('leap', JUMP2), A('slide', DIAG, 2)], traits: { sharp: 1 }, mat: 'rubble', set: 'stone', draft: true },
  { id: 'r2_statuerelic', name: '석상의 유물', slot: 'relic', region: 2, from: ['statue'], rules: [], ability: { id: 'terrain', lv: 2 }, mat: 'rubble', set: 'stone', draft: true },
  // 3지역: 요새 포병 · 설원 곰 · 눈토끼(탐험판에서 잡으면)
  { id: 'r3_cannon', name: '눈 대포', slot: 'weapon', fam: 'dark', region: 3, from: ['cannon'], rules: [A('cannon', ORTH, 7), A('slide', ORTH, 2)], traits: { sharp: 1 }, mat: 'powder', set: 'frost', draft: true },
  { id: 'r3_powdermark', name: '화약 각인', slot: 'engrave', region: 3, from: ['cannon'], rules: [], ability: { id: 'pull', lv: 2 }, mat: 'powder', set: 'frost', draft: true },
  { id: 'r3_bearclaw', name: '곰 발톱 장갑', slot: 'weapon', fam: 'light', region: 3, from: ['bear'], rules: [A('step', KING)], traits: { counter: 2, sharp: 1 }, mat: 'bearclaw', set: 'thorn', draft: true },
  { id: 'r3_beararmor', name: '곰 가죽 갑옷', slot: 'armor', region: 3, from: ['bear'], rules: [], traits: { sturdy: 2, undying: 1 }, mat: 'bearclaw', set: 'bone', draft: true },
  { id: 'r3_rabbitboom', name: '토끼 발 부메랑', slot: 'weapon', fam: 'neutral', region: 3, from: ['rabbit'], rules: [A('leap', JUMP2), A('leap', ALFIL), A('leap', KNIGHT)], traits: { light: 2 }, mat: 'rabbitfoot', set: 'wing', draft: true },
  { id: 'r3_rabbitboots', name: '토끼 발 신', slot: 'boots', region: 3, from: ['rabbit'], rules: [M('leap', RING2)], traits: { light: 1 }, mat: 'rabbitfoot', set: 'wing', draft: true },
  // 4지역: 번진 기물 · 묘수 기호 · 수 번호
  { id: 'r4_smudgeboom', name: '번진 잉크 부메랑', slot: 'weapon', fam: 'neutral', region: 4, from: ['smudge'], rules: [A('leap', KNIGHT), A('slide', DIAG, 2)], traits: { kibo: 1 }, mat: 'smear', set: 'ink', draft: true },
  { id: 'r4_smudgeboots', name: '번진 잉크 신', slot: 'boots', region: 4, from: ['smudge'], rules: [M('leap', KNIGHT), M('slide', DIAG, 2)], mat: 'smear', set: 'ink', draft: true },
  { id: 'r4_redbow', name: '묘수의 활', slot: 'weapon', fam: 'dark', region: 4, from: ['brilliant'], rules: [A('slide', KING, 3)], traits: { sharp: 1, kibo: 1 }, mat: 'redink', set: 'ink', draft: true },
  { id: 'r4_brilmark', name: '묘수 각인', slot: 'engrave', region: 4, from: ['brilliant'], rules: [], ability: { id: 'blink', lv: 3 }, mat: 'redink', set: 'ink', draft: true },
  { id: 'r4_numblade', name: '번호 칼', slot: 'weapon', fam: 'light', region: 4, from: ['number'], rules: [A('step', KING)], traits: { sharp: 2, undying: 1, counter: 1 }, mat: 'numeral', set: 'bone', draft: true },
  { id: 'r4_numarmor', name: '번호 갑옷', slot: 'armor', region: 4, from: ['number'], rules: [], traits: { sturdy: 2, undying: 1, sharp: 1 }, mat: 'numeral', set: 'bone', draft: true },

  // ======================= 숨은 무기 (의식으로만) =======================
  { id: 'gun', name: '기보 밖의 총', slot: 'weapon', region: 2, from: ['ritual'], rules: [{ kind: 'slide', dirs: KING, range: 4, mode: 'attack', gun: true }], mat: 'trigger' },
];

export const BASES: Record<string, BaseDef> = Object.fromEntries(LIST.map((b) => [b.id, b]));
export const BASE_LIST = LIST;

/** 이 몹이 떨어뜨리는 밑판 (같은 지역) */
export const basesFrom = (m: MobId, region: number) => LIST.filter((b) => b.region === region && b.from.includes(m) && !b.unique);
/** 지역의 일반 밑판 (출처가 몹인 것) */
export const basesOfRegion = (region: number) => LIST.filter((b) => b.region === region && !b.unique && b.from.some((f) => f !== 'shop' && f !== 'starter' && f !== 'ritual' && f !== 'boss'));
export const starterOf = (f: Fam) => LIST.find((b) => b.from.includes('starter') && b.fam === f)!;
export const uniqueOf = (boss: MobId, f: Fam) => LIST.find((b) => b.unique && b.from.includes(boss) && b.fam === f) ?? null;
