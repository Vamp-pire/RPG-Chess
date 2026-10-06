import { Vec, pick, shuffle, key } from '../core/geom';
import { MobId } from './mobs';
import { CompanionId } from './pieces';

export type AreaId = 'town' | 'meadow' | 'forest' | 'hills' | 'throne' | 'camp' | 'marsh' | 'ruins' | 'tower' | 'erased'
  | 'frostpost' | 'tundra' | 'glacier' | 'bastion' | 'kingpeak'
  | 'margin' | 'fold' | 'inkwell' | 'lastpage';
/** 지역 이동은 판의 네 변(가장자리)으로. 가장자리 칸에서 판 밖으로 나가면 이동 */
export type Side = 'n' | 's' | 'w' | 'e';
export const SIDE_NAME: Record<Side, string> = { n: '북쪽(위)', s: '남쪽(아래)', w: '서쪽(왼쪽)', e: '동쪽(오른쪽)' };
export const OPPOSITE: Record<Side, Side> = { n: 's', s: 'n', w: 'e', e: 'w' };
export const onSide = (p: Vec, s: Side) => (s === 'n' ? p[1] === 0 : s === 's' ? p[1] === 7 : s === 'w' ? p[0] === 0 : p[0] === 7);
export const sideCells = (s: Side): Vec[] => Array.from({ length: 8 }, (_, i) => (s === 'n' ? [i, 0] : s === 's' ? [i, 7] : s === 'w' ? [0, i] : [7, i]) as Vec);
export type Biome = AreaId;

export type ObjKind =
  | 'forge' | 'shop' | 'board' | 'inn' | 'record'
  | 'npc' | 'herb' | 'sheep' | 'shrine' | 'puzzle' | 'chest' | 'bridgeRook' | 'merchant' | 'waypoint' | 'kibo' | 'event';

export interface ObjDef {
  id: string;
  kind: ObjKind;
  x: number;
  y: number;
  label: string;
  sprite: string;
  walk: boolean; // 밟아서 발동 / false면 인접 클릭
}

export type Mover = 'none' | 'wander' | 'chase';

export interface FixedMob {
  id: string;
  x: number;
  y: number;
  sprite: MobId;
  enc: string;
  mover: Mover;
  once?: string; // 이 플래그가 켜지면 다시 나오지 않음
  req?: string; // 이 플래그가 켜져 있어야 나온다 (각성 보스 재도전 등)
}

/** to가 없으면 막힌 길. req가 있으면 조건을 만족할 때만 열린다 */
export interface Exit {
  to?: AreaId;
  req?: 'promoted' | 'fogkey' | 'rook' | 'promoted2' | 'promoted3';
  /** 이 플래그가 켜져야 열린다 (길목을 막은 문지기를 쓰러뜨리면 켜짐) */
  gate?: string;
  locked?: string;
}

export interface AreaDef {
  id: AreaId;
  name: string;
  biome: Biome;
  region: 1 | 2 | 3 | 4 | 0;
  walls: Vec[];
  water?: Vec[];
  exits: Partial<Record<Side, Exit>>;
  objs: ObjDef[];
  mobs: FixedMob[];
  random?: { n: number; table: { sprite: MobId; mover: Mover; party: MobId[][] }[] };
}

/**
 * 난이도 리듬: 막힘과 뚫림을 변칙적으로 반복한다. 지역 일반 몹의 숨은 체력 보정 (-1 = 시원하게, +1 = 막힘)
 * 1지역: 들판 쫙 → 숲 잠깐 막힘 → 언덕 조금 뚫림 → 사냥개 다시 조금 막힘 → 밀짚왕 중간 막힘
 * 2지역(첫 승급 직후): 늪 시원하게 → 성채 보통 → 뼈 군주 막힘 → 퀸 크게 막힘
 * 3지역(두 번째 승급 직후): 파일 의외로 살짝 막힘 → 빙하 뚫림 → 요새 보통 → 거인 막힘 → 킹 크게 막힘
 * 4지역(세 번째 승급 직후): 접힌 페이지 시원하게 → 잉크 샘 살짝 막힘 → 겹수 막힘 → 저자 가장 크게 막힘
 */
export const TENSION: Partial<Record<AreaId, number>> = {
  meadow: 0, forest: 1, hills: 0,
  marsh: 0, ruins: 0,
  tundra: 1, glacier: -1, bastion: 0,
  fold: -1, inkwell: 1,
};

const o = (id: string, kind: ObjKind, x: number, y: number, label: string, sprite: string, walk = true): ObjDef => ({ id, kind, x, y, label, sprite, walk });

export const AREAS: Record<AreaId, AreaDef> = {
  town: {
    id: 'town', name: '첫수 마을', biome: 'town', region: 1,
    // 좌우 대칭 배치: 1열·6열 = 시설/주민, 가운데 = 광장, 아래 줄 = 담장
    walls: [[0, 3], [0, 4], [7, 3], [7, 4], [2, 7], [3, 7], [4, 7], [5, 7]],
    exits: {
      w: { to: 'forest' },
      e: { to: 'meadow' },
      s: { to: 'camp', req: 'promoted', locked: '담장 너머 길이 하얗게 비어 있다. 아직 기록되지 않은 곳 같다. (첫 승급 후 열린다)' },
      n: { to: 'erased', req: 'fogkey', locked: '북쪽 너머로 안개가 짙다. 무언가가 있어야 걷힐 것 같다.' },
    },
    objs: [
      o('forge', 'forge', 1, 1, '대장간', 'o:forge'),
      o('record', 'record', 3, 1, '기록의 벽', 'o:record', false),
      o('elder', 'npc', 4, 1, '촌장 킹', 'p:bk', false),
      o('shop', 'shop', 6, 1, '상점', 'o:shop'),
      o('priest', 'npc', 1, 3, '사제 비숍', 'p:bb', false),
      o('shepherd', 'npc', 6, 3, '양치기', 'p:bp', false),
      o('board', 'board', 1, 5, '게시판', 'o:board'),
      o('inn', 'inn', 6, 5, '여관', 'o:inn'),
      o('soldier', 'npc', 3, 6, '폰 병사', 'p:bp', false),
      o('puzzle', 'puzzle', 4, 6, '수수께끼', 'o:puzzle', false),
    ],
    mobs: [],
  },
  meadow: {
    id: 'meadow', name: '여명의 들판', biome: 'meadow', region: 1,
    walls: [[3, 5], [4, 5], [5, 2]],
    exits: { w: { to: 'town' }, n: { to: 'hills', req: 'rook', locked: '고집쟁이 룩이 북쪽 길을 막고 서 있다. 룩과 이야기해 보자.' } },
    objs: [
      o('kibo_meadow', 'kibo', 6, 2, '떠돌이 기보사', 'p:wb', false),
      o('herb_m1', 'herb', 2, 2, '들풀', 'o:herb'),
      o('herb_m2', 'herb', 6, 6, '들풀', 'o:herb'),
      o('sheep1', 'sheep', 1, 5, '길 잃은 양', 'o:sheep'),
      o('rook', 'bridgeRook', 4, 0, '고집쟁이 룩', 'p:br', false),
      o('merchant', 'merchant', 4, 3, '나이트 상인', 'p:bn', true),
    ],
    mobs: [],
    random: {
      n: 3,
      table: [
        { sprite: 'slime', mover: 'none', party: [['slime', 'slime'], ['slime', 'rat']] },
        { sprite: 'rat', mover: 'wander', party: [['rat', 'rat', 'rat'], ['rat', 'rat']] },
      ],
    },
  },
  forest: {
    id: 'forest', name: '속삭이는 숲', biome: 'forest', region: 1,
    walls: [[2, 1], [5, 2], [1, 4], [6, 4], [3, 6], [4, 3]],
    exits: { e: { to: 'town' } },
    objs: [
      o('kibo_forest', 'kibo', 6, 3, '떠돌이 기보사', 'p:wb', false),
      o('shrine', 'shrine', 1, 1, '성소', 'o:shrine', false),
      o('sheep2', 'sheep', 6, 6, '길 잃은 양', 'o:sheep'),
      o('herb_f1', 'herb', 4, 5, '들풀', 'o:herb'),
    ],
    mobs: [
      { id: 'bats', x: 5, y: 0, sprite: 'bat', enc: 'bats', mover: 'wander' },
      { id: 'thorns', x: 2, y: 4, sprite: 'thorn', enc: 'thorns', mover: 'none' },
    ],
    random: {
      n: 2,
      table: [
        { sprite: 'slime', mover: 'none', party: [['slime', 'slime', 'slime']] },
        { sprite: 'bat', mover: 'wander', party: [['bat', 'bat'], ['bat', 'slime']] },
      ],
    },
  },
  hills: {
    id: 'hills', name: '이끼 바위 언덕', biome: 'hills', region: 1,
    walls: [[2, 2], [3, 2], [5, 4], [5, 5], [1, 5]],
    exits: { s: { to: 'meadow' }, e: { to: 'throne', gate: 'gate_hills', locked: '옥좌로 가는 길목을 가시덤불 문지기들이 막고 있다. 먼저 쓰러뜨리자.' } },
    objs: [
      o('kibo_hills', 'kibo', 1, 3, '떠돌이 기보사', 'p:wb', false),
      o('sheep3', 'sheep', 6, 6, '길 잃은 양', 'o:sheep'),
      o('chest_h', 'chest', 0, 2, '낡은 상자', 'o:chest'),
    ],
    mobs: [
      { id: 'golem1', x: 4, y: 1, sprite: 'golem', enc: 'golem', mover: 'none' },
      { id: 'golem2', x: 2, y: 6, sprite: 'golem', enc: 'golem2', mover: 'none' },
      { id: 'hound', x: 6, y: 3, sprite: 'hound', enc: 'hound', mover: 'chase' },
      { id: 'gate1', x: 6, y: 4, sprite: 'thorn', enc: 'gate_hills', mover: 'none', once: 'gate_hills' },
    ],
    random: {
      n: 1,
      table: [{ sprite: 'rat', mover: 'wander', party: [['rat', 'rat', 'slime']] }],
    },
  },
  throne: {
    id: 'throne', name: '밀짚 옥좌', biome: 'throne', region: 1,
    walls: [[1, 1], [6, 1], [1, 6], [6, 6], [3, 5]],
    exits: { w: { to: 'hills' } },
    objs: [],
    mobs: [
      { id: 'boss', x: 4, y: 2, sprite: 'strawking', enc: 'boss', mover: 'none', once: 'boss_dead' },
      { id: 'boss_awake', x: 4, y: 2, sprite: 'strawking', enc: 'boss_awake', mover: 'none', req: 'boss_dead', once: 'boss_awake_dead' },
    ],
  },

  // ---------- 2지역: 혼전의 늪 (중반) ----------
  camp: {
    id: 'camp', name: '기로의 야영지', biome: 'camp', region: 2,
    walls: [[0, 3], [0, 4], [7, 3], [7, 4]],
    exits: {
      n: { to: 'town' },
      w: { to: 'marsh' },
      e: { to: 'ruins' },
      s: { to: 'frostpost', req: 'promoted2', locked: '눈보라 너머로 길이 끊겨 있다. 더 넓은 틀이 있어야 버틸 수 있을 것 같다. (두 번째 승급 후 열린다)' },
    },
    objs: [
      o('smith', 'forge', 1, 1, '떠돌이 대장장이', 'o:smith'),
      o('peddler', 'shop', 6, 1, '행상', 'o:peddler'),
      o('kibo_camp', 'kibo', 6, 4, '떠돌이 기보사', 'p:wb', false),
      o('scout', 'npc', 2, 2, '정찰병 나이트', 'p:wn', false),
      o('witch', 'npc', 5, 2, '늪의 마녀', 'p:bq', false),
      o('fire', 'inn', 3, 4, '모닥불', 'o:fire'),
      o('herb_c1', 'herb', 1, 6, '들풀', 'o:herb'),
      o('herb_c2', 'herb', 6, 6, '들풀', 'o:herb'),
    ],
    mobs: [],
  },
  marsh: {
    id: 'marsh', name: '안개 늪', biome: 'marsh', region: 2,
    walls: [[4, 1], [1, 5]],
    water: [[2, 1], [2, 2], [1, 2], [5, 4], [5, 5], [4, 5], [3, 6], [6, 2], [6, 3]],
    exits: { e: { to: 'camp' }, s: { to: 'tower', gate: 'gate_marsh', locked: '탑으로 가는 늪길을 늪지기들이 지키고 있다. 먼저 쓰러뜨리자.' } },
    objs: [
      o('kibo_marsh', 'kibo', 1, 4, '떠돌이 기보사', 'p:wb', false),
      o('wp_marsh', 'waypoint', 3, 3, '안개 비석', 'o:stone'),
      o('herb_s1', 'herb', 6, 6, '들풀', 'o:herb'),
    ],
    mobs: [
      { id: 'toads', x: 5, y: 1, sprite: 'toad', enc: 'toads', mover: 'none' },
      { id: 'gate2', x: 5, y: 6, sprite: 'wraith', enc: 'gate_marsh', mover: 'none', once: 'gate_marsh' },
    ],
    random: {
      n: 3,
      table: [
        { sprite: 'toad', mover: 'wander', party: [['toad', 'toad', 'rat'], ['toad', 'spider', 'wraith']] },
        { sprite: 'spider', mover: 'chase', party: [['spider', 'rat', 'toad'], ['spider', 'wraith', 'toad']] },
        { sprite: 'wraith', mover: 'wander', party: [['wraith', 'toad', 'rat']] },
      ],
    },
  },
  ruins: {
    id: 'ruins', name: '무너진 성채', biome: 'ruins', region: 2,
    walls: [[1, 1], [6, 1], [1, 6], [6, 6], [3, 3], [4, 3]],
    exits: { w: { to: 'camp' }, s: { locked: '무너진 벽이 길을 막고 있다.' } },
    objs: [
      o('kibo_ruins', 'kibo', 6, 3, '떠돌이 기보사', 'p:wb', false),
      o('wp_ruins', 'waypoint', 3, 5, '부서진 제단', 'o:altar'),
      o('ghostknight', 'npc', 5, 4, '망령 기사', 'p:bn', false),
      o('puzzle2', 'puzzle', 2, 4, '금 간 돌판', 'o:puzzle', false),
      o('chest_r', 'chest', 0, 4, '녹슨 상자', 'o:chest'),
    ],
    mobs: [{ id: 'bonelord', x: 4, y: 1, sprite: 'bonelord', enc: 'bonelord', mover: 'none' }],
    random: {
      n: 2,
      table: [
        { sprite: 'skeleton', mover: 'wander', party: [['skeleton', 'skeleton'], ['skeleton', 'wraith']] },
        { sprite: 'wraith', mover: 'chase', party: [['wraith', 'wraith'], ['wraith', 'skeleton', 'spider']] },
      ],
    },
  },
  tower: {
    id: 'tower', name: '거꾸로 탑', biome: 'tower', region: 2,
    walls: [[2, 2], [5, 2], [2, 5], [5, 5]],
    exits: { n: { to: 'marsh' } },
    objs: [o('wp_tower', 'waypoint', 1, 6, '탑의 문', 'o:gate')],
    mobs: [
      { id: 'queen', x: 4, y: 3, sprite: 'misqueen', enc: 'queen', mover: 'none', once: 'queen_dead' },
      { id: 'queen_awake', x: 4, y: 3, sprite: 'misqueen', enc: 'queen_awake', mover: 'none', req: 'queen_dead', once: 'queen_awake_dead' },
    ],
  },
  erased: {
    id: 'erased', name: '지워진 칸', biome: 'erased', region: 0,
    walls: [],
    exits: { s: { to: 'town' } },
    objs: [
      o('scribe', 'npc', 3, 3, '기록하는 자', 'p:wq', false),
      o('chest_e', 'chest', 6, 1, '하얀 상자', 'o:chest'),
    ],
    mobs: [{ id: 'blunder', x: 5, y: 5, sprite: 'blunder', enc: 'blunder', mover: 'none', once: 'blunder_dead' }],
  },
  // ================= 3지역: 종반의 설원 =================
  frostpost: {
    id: 'frostpost', name: '서리 초소', biome: 'frostpost', region: 3,
    walls: [[0, 3], [7, 3], [3, 0], [4, 0]],
    exits: { n: { to: 'camp' }, w: { to: 'tundra' }, e: { to: 'glacier' }, s: { to: 'bastion' } },
    objs: [
      o('smith3', 'forge', 1, 1, '초소 대장장이', 'o:smith'),
      o('peddler3', 'shop', 6, 1, '설원 행상', 'o:peddler'),
      o('fire3', 'inn', 3, 4, '초소 모닥불', 'o:fire'),
      o('hermit', 'npc', 5, 5, '늙은 룩 은자', 'p:wr', false),
      o('herb_p1', 'herb', 1, 6, '들풀', 'o:herb'),
    ],
    mobs: [],
  },
  tundra: {
    id: 'tundra', name: '얼어붙은 파일', biome: 'tundra', region: 3,
    walls: [[2, 2], [5, 5], [5, 1], [2, 6]],
    exits: { e: { to: 'frostpost' } },
    objs: [o('herb_t1', 'herb', 1, 1, '들풀', 'o:herb'), o('chest_t', 'chest', 0, 6, '얼어붙은 상자', 'o:chest'), o('lostpawn', 'npc', 6, 6, '길 잃은 폰', 'p:wp', false)],
    mobs: [{ id: 'giant', x: 3, y: 4, sprite: 'giant', enc: 'giant', mover: 'none' }],
    random: {
      n: 3,
      table: [
        { sprite: 'wolf', mover: 'chase', party: [['wolf', 'wolf'], ['wolf', 'wolf', 'icesprite']] },
        { sprite: 'icesprite', mover: 'wander', party: [['icesprite', 'icesprite'], ['icesprite', 'wolf']] },
      ],
    },
  },
  glacier: {
    id: 'glacier', name: '빙하 협곡', biome: 'glacier', region: 3,
    walls: [[1, 1], [1, 2], [6, 5], [6, 6], [3, 3], [4, 4]],
    exits: { w: { to: 'frostpost' } },
    objs: [o('chest_g', 'chest', 7, 0, '빙하 속 상자', 'o:chest'), o('herb_g1', 'herb', 0, 7, '들풀', 'o:herb'), o('puzzle3', 'puzzle', 2, 5, '얼음 속 돌판', 'o:puzzle', false)],
    mobs: [{ id: 'bishops', x: 5, y: 2, sprite: 'frostbishop', enc: 'bishops', mover: 'none' }],
    random: {
      n: 3,
      table: [
        { sprite: 'frostbishop', mover: 'wander', party: [['frostbishop', 'icesprite'], ['frostbishop', 'snowpawn', 'snowpawn']] },
        { sprite: 'snowpawn', mover: 'none', party: [['snowpawn', 'snowpawn', 'snowpawn'], ['snowpawn', 'snowpawn', 'wolf']] },
      ],
    },
  },
  bastion: {
    id: 'bastion', name: '룩의 요새', biome: 'bastion', region: 3,
    walls: [[0, 2], [1, 2], [6, 2], [7, 2], [0, 5], [1, 5], [6, 5], [7, 5]],
    exits: { n: { to: 'frostpost' }, s: { to: 'kingpeak', gate: 'towers_done', locked: '봉우리로 가는 길을 룩 파수꾼들이 쏘아 대고 있다. 요새 한가운데의 파수꾼부터 잠재우자.' } },
    objs: [o('logbook', 'npc', 2, 6, '파수꾼의 일지', 'o:record', false)],
    mobs: [{ id: 'towers', x: 3, y: 3, sprite: 'tower', enc: 'towers', mover: 'none' }],
    random: {
      n: 2,
      table: [
        { sprite: 'tower', mover: 'none', party: [['tower', 'snowpawn', 'snowpawn'], ['tower', 'wolf']] },
        { sprite: 'wolf', mover: 'chase', party: [['wolf', 'wolf', 'wolf']] },
      ],
    },
  },
  kingpeak: {
    id: 'kingpeak', name: '왕의 봉우리', biome: 'kingpeak', region: 3,
    walls: [[1, 1], [6, 1], [1, 6], [6, 6]],
    exits: { n: { to: 'bastion' }, e: { to: 'margin', req: 'promoted3', locked: '봉우리 너머는 글자가 끝나는 곳. 얼어붙은 왕관을 바쳐 틀을 넓혀야 건널 수 있다. (세 번째 승급 후 열린다)' } },
    objs: [],
    mobs: [
      { id: 'king', x: 4, y: 3, sprite: 'frozenking', enc: 'king', mover: 'none', once: 'king_dead' },
      { id: 'king_awake', x: 4, y: 3, sprite: 'frozenking', enc: 'king_awake', mover: 'none', req: 'king_dead', once: 'king_awake_dead' },
    ],
  },
  // ================= 4지역: 기보의 끝 =================
  margin: {
    id: 'margin', name: '여백', biome: 'margin', region: 4,
    walls: [],
    exits: { w: { to: 'kingpeak' }, e: { to: 'fold' }, s: { to: 'inkwell' } },
    objs: [
      o('forge4', 'forge', 1, 1, '여백의 모루', 'o:forge'),
      o('peddler4', 'shop', 6, 1, '잉크 행상', 'o:peddler'),
      o('fire4', 'inn', 3, 4, '촛불', 'o:fire'),
      o('scribe2', 'npc', 5, 5, '여백의 기록자', 'p:wq', false),
    ],
    mobs: [],
  },
  fold: {
    id: 'fold', name: '접힌 페이지', biome: 'fold', region: 4,
    walls: [[3, 0], [3, 1], [3, 2], [4, 5], [4, 6], [4, 7]],
    exits: { w: { to: 'margin' }, s: { to: 'lastpage', gate: 'double_dead', locked: '마지막 장으로 가는 페이지가 겹쳐 붙어 있다. 겹수를 쓰러뜨려 떼어 내자.' } },
    objs: [o('chest_f', 'chest', 7, 0, '접힌 상자', 'o:chest')],
    mobs: [{ id: 'double', x: 6, y: 3, sprite: 'double', enc: 'double', mover: 'none' }],
    random: {
      n: 3,
      table: [
        { sprite: 'inkblot', mover: 'wander', party: [['inkblot', 'inkblot'], ['inkblot', 'erased']] },
        { sprite: 'erased', mover: 'chase', party: [['erased', 'erased'], ['erased', 'annot']] },
      ],
    },
  },
  inkwell: {
    id: 'inkwell', name: '잉크 샘', biome: 'inkwell', region: 4,
    walls: [[2, 3], [5, 3]],
    water: [[3, 3], [4, 3], [3, 4], [4, 4]],
    exits: { n: { to: 'margin' }, e: { to: 'lastpage', gate: 'double_dead', locked: '마지막 장으로 가는 페이지가 겹쳐 붙어 있다. 접힌 페이지의 겹수를 먼저 쓰러뜨리자.' } },
    objs: [o('herb_i1', 'herb', 1, 6, '들풀', 'o:herb'), o('well', 'npc', 6, 1, '잉크 우물', 'o:altar', false)],
    mobs: [],
    random: {
      n: 4,
      table: [
        { sprite: 'bookworm', mover: 'wander', party: [['bookworm', 'inkblot'], ['bookworm', 'bookworm']] },
        { sprite: 'annot', mover: 'chase', party: [['annot', 'annot'], ['annot', 'inkblot', 'inkblot']] },
      ],
    },
  },
  lastpage: {
    id: 'lastpage', name: '마지막 장', biome: 'lastpage', region: 4,
    walls: [[2, 2], [5, 2], [2, 5], [5, 5]],
    exits: { n: { to: 'fold' }, w: { to: 'inkwell' } },
    objs: [],
    mobs: [{ id: 'author', x: 4, y: 2, sprite: 'author', enc: 'author', mover: 'none', once: 'author_dead' }],
  },
};

// ---------- 전투 구성 ----------
export interface EncDef {
  name: string;
  w: number;
  h: number;
  walls: Vec[];
  water?: Vec[];
  /** 지형: 수풀(멀리서 오는 공격 막음) · 얼음(한 칸 더 미끄러짐) · 고지(여기서 공격하면 +1) */
  bush?: Vec[];
  ice?: Vec[];
  high?: Vec[];
  throne?: Vec;
  enemies: { m: MobId; x: number; y: number }[];
  player: Vec;
  boss?: boolean;
  noFlee?: boolean;
  /** 각성한 보스 재도전 */
  awake?: boolean;
  /** 오늘의 기보 규칙 */
  daily?: 'shiny' | 'ice' | 'fury' | 'bush';
  /** 판을 넓힌 복사본이면 원본 전투 */
  src?: EncDef;
  guest?: CompanionId; // 시험 전투: 이 동료가 임시로 함께 싸운다
  /** 버티기: 이 턴 수를 버티면 승리 (스테일메이트 — 저자는 치지 않는다) */
  hold?: number;
  /** 야생 조우에 붙는 작은 지형 세트 이름과 설명 */
  terrainName?: string;
  terrainHint?: string;
  /** 끝없는 탑: 높은 층일수록 몹(부하 제외)에 더하는 체력 */
  hpBonus?: number;
}

export const FIXED_ENCS: Record<string, EncDef> = {
  bats: { name: '박쥐 둥지', w: 6, h: 6, walls: [[1, 2], [4, 3]], enemies: [{ m: 'bat', x: 1, y: 0 }, { m: 'bat', x: 4, y: 0 }, { m: 'bat', x: 3, y: 1 }], player: [2, 5] },
  thorns: { name: '가시덤불 숲길', w: 6, h: 6, walls: [[0, 3], [5, 2]], enemies: [{ m: 'thorn', x: 2, y: 2 }, { m: 'thorn', x: 4, y: 1 }, { m: 'slime', x: 1, y: 0 }], player: [3, 5] },
  golem: { name: '굴러온 바위', w: 7, h: 7, walls: [[1, 3], [5, 3]], enemies: [{ m: 'golem', x: 3, y: 0 }, { m: 'rat', x: 1, y: 1 }, { m: 'rat', x: 5, y: 1 }], player: [3, 6] },
  golem2: { name: '이끼 형제', w: 6, h: 6, walls: [[2, 3]], enemies: [{ m: 'golem', x: 1, y: 0 }, { m: 'golem', x: 4, y: 0 }], player: [3, 5] },
  hound: { name: '낙오 사냥개', w: 8, h: 8, walls: [[2, 3], [5, 3], [3, 5], [4, 2]], enemies: [{ m: 'hound', x: 4, y: 0 }, { m: 'rat', x: 1, y: 1 }, { m: 'rat', x: 6, y: 1 }], player: [3, 7] },
  boss: { name: '밀짚왕', w: 7, h: 7, walls: [], throne: [3, 0], enemies: [{ m: 'strawking', x: 3, y: 1 }, { m: 'strawpawn', x: 2, y: 2 }, { m: 'strawpawn', x: 4, y: 2 }], player: [3, 6], boss: true, noFlee: true },
  rook: { name: '고집쟁이 룩', w: 6, h: 6, walls: [[1, 1], [4, 4], [4, 1]], enemies: [{ m: 'rook', x: 2, y: 0 }], player: [3, 5] },
  toads: { name: '두꺼비 연못', w: 6, h: 6, walls: [], water: [[2, 2], [3, 3], [2, 3]], enemies: [{ m: 'toad', x: 1, y: 0 }, { m: 'toad', x: 4, y: 0 }, { m: 'toad', x: 3, y: 1 }], player: [3, 5] },
  bonelord: { name: '뼈 군주의 전당', w: 7, h: 7, walls: [[1, 3], [5, 3]], enemies: [{ m: 'bonelord', x: 3, y: 0 }, { m: 'skeleton', x: 1, y: 1 }, { m: 'skeleton', x: 5, y: 1 }], player: [3, 6] },
  queen: { name: '잘못 둔 퀸', w: 8, h: 8, walls: [[2, 2], [5, 2], [2, 5], [5, 5]], enemies: [{ m: 'misqueen', x: 3, y: 1 }], player: [4, 7], boss: true, noFlee: true },
  blunder: { name: '???', w: 7, h: 7, walls: [[3, 3]], enemies: [{ m: 'blunder', x: 3, y: 0 }], player: [3, 6], noFlee: true },
  // ---- 길목 문지기 (쓰러뜨려야 다음 길이 열린다) ----
  gate_hills: { name: '옥좌로 가는 길목', w: 7, h: 7, walls: [[1, 3], [5, 3]], high: [[3, 5]], enemies: [{ m: 'thorn', x: 2, y: 1 }, { m: 'thorn', x: 4, y: 1 }, { m: 'golem', x: 3, y: 0 }, { m: 'slime', x: 1, y: 0 }], player: [3, 6] },
  gate_marsh: { name: '탑 앞의 늪지기', w: 7, h: 7, walls: [[3, 3]], water: [[1, 3], [5, 3]], bush: [[2, 5], [4, 5]], enemies: [{ m: 'wraith', x: 3, y: 0 }, { m: 'spider', x: 1, y: 1 }, { m: 'spider', x: 5, y: 1 }, { m: 'toad', x: 3, y: 1 }], player: [3, 6] },
  // ---- 각성한 보스 (재도전) ----
  boss_awake: { name: '각성한 밀짚왕', w: 7, h: 7, walls: [], throne: [3, 0], enemies: [{ m: 'strawking', x: 3, y: 1 }, { m: 'strawpawn', x: 2, y: 2 }, { m: 'strawpawn', x: 4, y: 2 }, { m: 'strawpawn', x: 3, y: 2 }], player: [3, 6], boss: true, noFlee: true, awake: true },
  queen_awake: { name: '각성한 퀸', w: 8, h: 8, walls: [[2, 2], [5, 2], [2, 5], [5, 5]], enemies: [{ m: 'misqueen', x: 3, y: 1 }, { m: 'echo', x: 5, y: 1 }], player: [4, 7], boss: true, noFlee: true, awake: true },
  king_awake: { name: '각성한 킹', w: 8, h: 8, walls: [[1, 1], [6, 1]], ice: [[2, 4], [5, 4], [3, 5], [4, 2]], enemies: [{ m: 'frozenking', x: 4, y: 1 }, { m: 'tower', x: 0, y: 0 }, { m: 'tower', x: 7, y: 0 }], player: [4, 7], boss: true, noFlee: true, awake: true },
  // ---- 3지역 ----
  giant: { name: '서리 거인', w: 8, h: 8, walls: [[2, 3], [5, 3]], ice: [[3, 5], [4, 5]], enemies: [{ m: 'giant', x: 4, y: 0 }, { m: 'wolf', x: 1, y: 1 }, { m: 'wolf', x: 6, y: 1 }], player: [4, 7] },
  bishops: { name: '서리 비숍의 대각선', w: 7, h: 7, walls: [[3, 3]], ice: [[1, 4], [5, 4], [2, 2], [4, 2]], enemies: [{ m: 'frostbishop', x: 1, y: 0 }, { m: 'frostbishop', x: 5, y: 0 }, { m: 'icesprite', x: 3, y: 1 }], player: [3, 6] },
  towers: { name: '요새의 파수꾼', w: 7, h: 7, walls: [[1, 3], [5, 3]], high: [[3, 4]], enemies: [{ m: 'tower', x: 0, y: 0 }, { m: 'tower', x: 6, y: 0 }, { m: 'snowpawn', x: 2, y: 1 }, { m: 'snowpawn', x: 3, y: 1 }, { m: 'snowpawn', x: 4, y: 1 }], player: [3, 6] },
  king: { name: '얼어붙은 킹', w: 8, h: 8, walls: [[1, 1], [6, 1]], ice: [[2, 4], [5, 4]], enemies: [{ m: 'frozenking', x: 4, y: 1 }, { m: 'snowpawn', x: 3, y: 2 }, { m: 'snowpawn', x: 5, y: 2 }], player: [4, 7], boss: true, noFlee: true },
  // ---- 4지역 ----
  double: { name: '겹수', w: 8, h: 8, walls: [[3, 3], [4, 4]], bush: [[1, 5], [6, 5]], enemies: [{ m: 'double', x: 4, y: 0 }, { m: 'inkblot', x: 1, y: 1 }, { m: 'inkblot', x: 6, y: 1 }], player: [4, 7] },
  author_peace: { name: '마지막 대국', w: 8, h: 8, walls: [[2, 2], [5, 2]], high: [[1, 5], [6, 5], [3, 6]], enemies: [{ m: 'author', x: 4, y: 1 }, { m: 'annot', x: 2, y: 1 }], player: [4, 7], boss: true, hold: 10 },
  author: { name: '저자', w: 8, h: 8, walls: [[2, 2], [5, 2]], high: [[1, 5], [6, 5], [3, 6]], enemies: [{ m: 'author', x: 4, y: 1 }, { m: 'annot', x: 2, y: 1 }], player: [4, 7], boss: true, noFlee: true },
  trial_soldier: { name: '폰 병사의 첫 수', w: 6, h: 6, walls: [[2, 2], [3, 2]], enemies: [{ m: 'rat', x: 0, y: 0 }, { m: 'rat', x: 5, y: 0 }, { m: 'bat', x: 2, y: 0 }, { m: 'slime', x: 4, y: 1 }], player: [2, 5], guest: 'soldier', noFlee: true },
  trial_ghost: { name: '망령 기사의 맹세', w: 7, h: 7, walls: [[1, 3], [5, 3]], enemies: [{ m: 'skeleton', x: 1, y: 0 }, { m: 'skeleton', x: 5, y: 0 }, { m: 'wraith', x: 3, y: 0 }], player: [3, 6], guest: 'ghostknight', noFlee: true },
  trial_priest: { name: '사제의 순례', w: 7, h: 7, walls: [[3, 3]], enemies: [{ m: 'spider', x: 1, y: 0 }, { m: 'spider', x: 5, y: 0 }, { m: 'toad', x: 3, y: 1 }], player: [3, 6], guest: 'priest', noFlee: true },
};

function terrainSet(types: MobId[], biome: Biome, size: number, enemies: { m: MobId; x: number; y: number }[], player: Vec) {
  const used = new Set([...enemies.map((e) => key(e.x, e.y)), key(player[0], player[1])]);
  const walls: Vec[] = [];
  const water: Vec[] = [];
  const bush: Vec[] = [];
  const ice: Vec[] = [];
  const high: Vec[] = [];
  const mid = Math.floor(size / 2);
  const add = (into: Vec[], p: Vec) => {
    const [x, y] = p;
    if (x < 0 || y < 2 || x >= size || y >= size - 1 || used.has(key(x, y))) return;
    used.add(key(x, y));
    into.push(p);
  };
  const has = (...ids: MobId[]) => types.some((m) => ids.includes(m));
  let terrainName = '';
  let terrainHint = '';

  // 하나의 작은 세트만 사용한다. 통로를 막거나 대칭 도형을 만들지 않아 자연스럽고, 항상 옆길이 남는다.
  if (has('toad')) {
    terrainName = '얕은 연못';
    terrainHint = '두꺼비는 물길을 뛰어넘지만, 옆으로 돌아갈 길은 남아 있다.';
    add(water, [mid - 1, mid]); add(water, [mid, mid + 1]); add(bush, [mid + 1, mid]);
  } else if (has('icesprite', 'frostbishop', 'snowpawn')) {
    terrainName = '갈라진 빙판';
    terrainHint = '빙판은 한 칸 더 미끄러진다. 비숍형 적의 대각선 길을 조심하자.';
    add(ice, [mid - 1, mid]); add(ice, [mid, mid + 1]); add(ice, [mid + 1, mid - 1]);
  } else if (has('tower', 'rook')) {
    terrainName = '낮은 돌출 바위';
    terrainHint = '직선 공격수에게 긴 시야가 열리지만, 고지는 누구나 차지할 수 있다.';
    const line = enemies.find((e) => e.m === 'tower' || e.m === 'rook');
    if (line) high.push([line.x, line.y]);
    add(high, [mid - 1, mid + 1]); add(walls, [mid + 1, mid - 1]);
  } else if (has('bat', 'skeleton', 'wolf', 'erased')) {
    terrainName = '부서진 돌담';
    terrainHint = 'L자로 뛰는 적은 돌담을 넘는다. 중앙은 열어 두었다.';
    add(walls, [mid - 1, mid]); add(walls, [mid + 1, mid + 1]); add(bush, [mid, mid - 1]);
  } else if (has('hound', 'wraith', 'bookworm', 'giant', 'golem')) {
    terrainName = '갈림길';
    terrainHint = '직선으로 밀고 오는 적에게 길이 열려 있다. 수풀은 먼 공격을 막아 준다.';
    add(walls, [mid - 1, mid]); add(bush, [mid + 1, mid + 1]); add(high, [mid, mid - 1]);
  } else {
    const byBiome: Partial<Record<Biome, { name: string; hint: string; kind: 'bush' | 'ice' | 'high' }>> = {
      forest: { name: '낮은 수풀', hint: '수풀에 있으면 먼 공격을 막을 수 있다.', kind: 'bush' },
      meadow: { name: '들풀 군락', hint: '낮은 수풀이 시야를 가린다.', kind: 'bush' },
      hills: { name: '완만한 언덕', hint: '고지에서 공격하면 피해가 1 늘어난다.', kind: 'high' },
      ruins: { name: '무너진 단', hint: '고지는 누구나 차지할 수 있다.', kind: 'high' },
      marsh: { name: '늪 가장자리', hint: '수풀과 물길 사이로 길이 이어진다.', kind: 'bush' },
      tundra: { name: '옅은 빙판', hint: '빙판을 밟으면 한 칸 더 미끄러진다.', kind: 'ice' },
      glacier: { name: '얼음 갈라짐', hint: '빙판을 밟으면 한 칸 더 미끄러진다.', kind: 'ice' },
      bastion: { name: '돌계단', hint: '고지에서 공격하면 피해가 1 늘어난다.', kind: 'high' },
    };
    const d = byBiome[biome] ?? { name: '흩어진 지형', hint: '전장의 길을 살펴보자.', kind: 'bush' as const };
    terrainName = d.name;
    terrainHint = d.hint;
    const list = d.kind === 'bush' ? bush : d.kind === 'ice' ? ice : high;
    add(list, [mid - 1, mid]); add(list, [mid + 1, mid + 1]);
  }
  return { walls, water, bush, ice, high, terrainName, terrainHint };
}

export function randomEnc(types: MobId[], biome: Biome = 'meadow'): EncDef {
  const n = types.length;
  const size = n <= 2 ? 5 : n === 3 ? 6 : 7;
  const top: Vec[] = [];
  for (let y = 0; y < 2; y++) for (let x = 0; x < size; x++) top.push([x, y]);
  const spots = shuffle(top);
  const enemies = types.map((m, i) => ({ m, x: spots[i][0], y: spots[i][1] }));
  const player: Vec = [Math.floor(size / 2), size - 1];
  const terrain = terrainSet(types, biome, size, enemies, player);
  const name = { meadow: '들판의 조우', forest: '숲의 조우', hills: '언덕의 조우', marsh: '늪의 조우', ruins: '폐허의 조우', tundra: '설원의 조우', glacier: '빙하의 조우', bastion: '요새의 조우', fold: '접힌 페이지', inkwell: '잉크 샘' }[biome as string] ?? '조우';
  return { name, w: size, h: size, enemies, player, ...terrain };
}

export const pickParty = (t: { party: MobId[][] }) => pick(t.party);

/** 판을 키우지 않는 강한 몹 (엘리트·보스) */
const NO_DUP: MobId[] = ['hound', 'bonelord', 'giant', 'double', 'rook', 'blunder', 'strawking', 'misqueen', 'frozenking', 'author'];

/**
 * 2지역부터: 전투 판을 한 칸 넓히고 몹을 늘린다 (대신 몹 체력은 battle.ts에서 낮춘다).
 * 1지역·보스전·시험 전투는 그대로. 원본 전투(FIXED_ENCS)는 건드리지 않고 복사본을 돌려준다.
 */
export function expandEnc(enc: EncDef, region: number): EncDef {
  if (region < 2 || enc.boss || enc.guest) return enc;
  const w = Math.min(8, enc.w + 1);
  const h = Math.min(8, enc.h + 1);
  const dy = h - enc.h;
  const e: EncDef = { ...enc, w, h, src: enc, player: [Math.min(w - 1, enc.player[0]), enc.player[1] + dy], enemies: enc.enemies.map((x) => ({ ...x })) };
  const extra = region >= 3 ? 2 : 1;
  const pool = enc.enemies.map((x) => x.m).filter((m) => !NO_DUP.includes(m));
  const taken = new Set([...e.enemies.map((x) => key(x.x, x.y)), ...e.walls.map(([x, y]) => key(x, y)), ...(e.water ?? []).map(([x, y]) => key(x, y)), key(e.player[0], e.player[1])]);
  for (let i = 0; i < extra && pool.length; i++) {
    const spots: Vec[] = [];
    for (let y = 0; y < 2; y++) for (let x = 0; x < w; x++) if (!taken.has(key(x, y))) spots.push([x, y]);
    if (!spots.length) break;
    const [x, y] = pick(spots);
    taken.add(key(x, y));
    e.enemies.push({ m: pick(pool), x, y });
  }
  return e;
}
