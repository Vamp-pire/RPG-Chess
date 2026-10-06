import { BAL, BAL_DEFAULT } from '../core/balance';
import { RUN_RULES, runRule } from './runrules';
import { bossIntro, bossMemory, chapterEnd, chapterStart, companionTalk, talkChain, townRumor } from './story';
import { takeBetaGift, isClosedTester } from '../core/release';
import { Mood, setMood } from '../core/bgm';
import { titleFooter } from '../ui/release';
import { Vec, rand } from '../core/geom';
import { sfx } from '../core/sfx';
import { dailyEnc, dailyReward, todayDaily } from './daily';
import { meta, playEnding, ENDINGS, ENDING_ORDER, rebirth, EndingId, peaceOpen } from './ending';
import { runEvent } from './events';
import { kiboHere, kiboPlace, kiboTalk } from './kibo';
import { DIFFS } from '../core/difficulty';
import { loreText } from '../ui/lore';
import { MIN_CORE, SLOTS, SLOT_INFO, Slot, itemStats } from '../core/items';
import { G, HP_MUL, SLOTS_N, addBag, freshMats, align, baseRules, curSlot, emit, equipped, getLog, hasJob, hasSave, load, log, loadout, matHave, maxHp, newGame, promo2Of, onLog, pieceTitle, save, setSlot, slotInfo, wipeSave, on } from '../core/state';
import { AREAS, AreaId, EncDef, FIXED_ENCS, OPPOSITE, ObjDef, SIDE_NAME, Side, expandEnc, randomEnc, sideCells } from '../data/areas';
import { ABILITIES, MATS, MAT_ORDER, MatId } from '../data/materials';
import { MOBS, MobId } from '../data/mobs';
import { ALIGN_NAMES, Align, BranchId, COMPANIONS, PIECES, PROMO3, PieceId, jobDef } from '../data/pieces';
import { Renderer, Scene } from '../render/board';
import { fx } from '../render/fx';
import { pieceSrc, portraitUrl } from '../render/sprites';
import { Choice, clearCoach, coach, cutin, dialog, h, modal, modalOpen, patternGrid, setDialogHero, toast } from '../ui/dom';
import { openCodex } from '../ui/codex';
import { matIcon, newSquares, openForge, invGrid } from '../ui/forge';
import { openDifficulty, openHelp, openMap, openSettings } from '../ui/extra';
import { prefs } from '../core/prefs';
import { PUZZLES, openBoard, openInn, openInventory, openJobSelect, openPuzzle, openShop } from '../ui/town';
import { initAchievements, openAchievements, syncAchievements } from './achievements';
import { Battle, BattleResult } from './battle';
import { Explore, RMob, RObj, exitOpen } from './explore';
import { talk } from './npcs';
import { eggGold, eggKey, eggLose, eggShopOpen, eggTime, eggWall } from './eggs';
import { QUESTS, craftCount, guideFor, rewardHint, initQuestHooks, progressText, q, qComplete, qOn, qReady, qStart, qst, trackedQuest } from './quests';

type Mode = 'title' | 'explore' | 'battle';

export class App {
  mode: Mode = 'title';
  renderer: Renderer;
  explore: Explore;
  battle: Battle | null = null;
  battleMob: RMob | null = null;
  onWin: (() => void) | null = null;
  side: HTMLElement;
  last = performance.now();
  keyBuf = '';

  constructor() {
    const canvas = document.getElementById('board') as HTMLCanvasElement;
    this.renderer = new Renderer(canvas);
    this.side = document.getElementById('side')!;
    this.explore = new Explore({
      objVisible: (d) => this.objVisible(d),
      interact: async (o) => { await this.interact(o); },
      startBattle: (m, ambush) => this.startBattle(m, ambush),
      // 지역 이동은 바로 (판 바깥 화살표나 가장자리 칸을 한 번 더 누른 것 자체가 의도라서 확인창을 띄우지 않는다)
      askTravel: (_to, _side, go) => { void go(); },
      travel: (to, side, from) => this.travel(to, side, from),
      locked: (msg) => dialog('막힌 길', msg, [{ label: '돌아선다', onPick: () => {} }]),
      refresh: () => this.renderSide(),
      guide: () => this.guideHere(),
      badge: (d) => this.npcBadge(d),
    });
    canvas.addEventListener('pointerdown', (e) => {
      if (modalOpen()) return;
      const [x, y] = this.renderer.pick(e)!;
      if (this.mode === 'explore') this.explore.click(x, y);
      else if (this.mode === 'battle') this.battle?.click(x, y);
    });
    window.addEventListener('keydown', (e) => this.onKey(e));
    // 설정의 '힌트 다시 보기'
    window.addEventListener('cf-reset-tips', () => {
      if (!G) return;
      for (const k of Object.keys(G.flags)) if (k.startsWith('tip_')) delete G.flags[k];
      save();
    });
    onLog(() => this.renderLog());
    initQuestHooks();
    initAchievements();
    // 대화창 왼쪽에 서는 주인공
    let heroKey = '';
    let heroSrc = '';
    // 쉴 때 동료가 이번 장의 속마음을 꺼낸다 (여관 창 위로 대화가 뜨도록 살짝 뒤에)
    on('rest', () => { setTimeout(() => void companionTalk(), 450); });
    // 탐험 중 칸에 마우스를 올리면 자동 이동 경로 미리 보기
    this.renderer.hoverInfo = (c) => (this.mode === 'explore' ? this.explore.previewPath(c) : null);
    setDialogHero(() => {
      const k = G ? `${G.piece}` : 'pawn';
      if (k !== heroKey) { heroKey = k; heroSrc = portraitUrl(`p:${G ? PIECES[G.piece].img : 'wp'}`); }
      return { src: heroSrc, name: G ? pieceTitle() : '폰' };
    });
    fx.speed = prefs().speed === 'fast' ? 0.55 : 1;
    fx.skip = !!prefs().skipAnim;
    window.addEventListener('resize', () => this.renderSide());
    requestAnimationFrame((t) => this.loop(t));
  }

  get scene(): Scene | null {
    if (this.mode === 'battle' && this.battle) return this.battle.scene;
    if (this.mode === 'explore') return this.explore.scene;
    return null;
  }

  loop(t: number) {
    const dt = Math.min(50, t - this.last);
    this.last = t;
    fx.update(dt);
    const s = this.scene;
    if (s) this.renderer.draw(s);
    requestAnimationFrame((tt) => this.loop(tt));
  }

  refreshAll() {
    eggGold();
    save();
    this.renderSide();
    if (this.mode === 'explore') this.explore.refresh();
  }

  // ---------- 키보드 (Esc + 이스터 에그) ----------
  onKey(e: KeyboardEvent) {
    if ((e.target as HTMLElement)?.tagName === 'INPUT') return;
    if (e.key === 'Escape') {
      const close = document.querySelectorAll<HTMLButtonElement>('.m-close');
      if (close.length) close[close.length - 1].click();
      else if (this.battle?.mode) { this.battle.mode = null; this.battle.refresh(); }
      return;
    }
    if (modalOpen() || this.mode === 'title') return;
    // 메뉴 단축키 (탐험 중에만)
    if (this.mode === 'explore' && !e.ctrlKey && !e.metaKey && !e.altKey) {
      const fn = this.menuKeys[e.key.toLowerCase()];
      if (fn) { e.preventDefault(); fn(); return; }
    }
    this.keyBuf = (this.keyBuf + e.key.toLowerCase()).slice(-2);
    if (this.keyBuf === 'e4' && !G.flags.e4) {
      G.flags.e4 = true;
      toast('…어디선가 누군가 e4를 두었다. 기보가 살짝 떨린다.', 'rare');
      emit('e4');
    }
    // 여백의 낙서 (새 이스터 에그) — 위의 e4와는 따로 센다
    eggKey(e.key, this.mode);
    // 조작은 전부 화면의 버튼·칸으로 한다 (키보드 단축키는 Esc만)
  }

  // ---------- 타이틀 ----------
  title() {
    this.mode = 'title';
    Object.assign(BAL, BAL_DEFAULT); // 실험 규칙(개발 도구로만 켬)은 제목 화면에서 늘 꺼진다
    setMood('title');
    document.body.classList.add('at-title');
    const cont = hasSave();
    let pokes = 0;
    const knight = h('img', { src: pieceSrc('wn'), alt: '' });
    knight.addEventListener('click', () => {
      knight.classList.remove('jump');
      void knight.offsetWidth;
      knight.classList.add('jump');
      if (++pokes === 5) {
        try { localStorage.setItem('cf_titleKnight', '1'); } catch { /* */ }
        toast('나이트: "그만 좀 눌러! 난 L자로만 움직인다고!"', 'rare');
      }
    });
    const box = h('div', { class: 'title-screen' },
      h('div', { class: 'title-art' }, knight, h('img', { src: pieceSrc('wb'), alt: '' }), h('img', { src: pieceSrc('wp'), alt: '' })),
      h('h1', {}, '기보 밖의 한 수'),
      h('p', { class: 'tagline' }, '체스 말 하나로 떠나는 조합·강화 RPG'),
      // 진엔딩(덮인 기보)을 본 사람만: 제목 아래 새 기보의 첫 줄
      meta().endings.includes('closed') ? h('p', { class: 'title-firstline' }, '1. 폰, 기보 밖으로.') : null,
    );
    void cont;
    const btns = h('div', { class: 'title-btns' });
    // 저장 슬롯 셋: 이어하기 / 새 게임
    const slots = h('div', { class: 'slot-cards' });
    const DN: Record<string, string> = Object.fromEntries(Object.entries(DIFFS).map(([k, v]) => [k, v.name]));
    for (let n = 1; n <= SLOTS_N; n++) {
      const info = slotInfo(n);
      const card = h('div', { class: `slot-card ${info ? '' : 'empty'} ${curSlot() === n ? 'last' : ''}` },
        h('b', {}, `슬롯 ${n}`),
        info ? h('small', {}, `${info.piece}${info.rebirth ? ` ★${info.rebirth}` : ''}`) : h('small', { class: 'muted' }, '비어 있음'),
        info ? h('small', { class: 'muted' }, `${AREAS[info.area as AreaId]?.name ?? ''} · ${DN[info.diff] ?? ''}${info.t ? ` · ${new Date(info.t).toLocaleDateString()}` : ''}`) : null,
      );
      if (info) {
        const b = h('button', { class: 'btn primary small' }, '이어하기');
        b.addEventListener('click', () => { setSlot(n); if (load()) { box.remove(); this.begin(false); } });
        card.append(b);
      }
      const nb = h('button', { class: `btn small ${info ? 'ghost' : 'primary'}` }, info ? '새로 시작' : '새 게임');
      nb.addEventListener('click', () => {
        if (info && !confirm(`슬롯 ${n}의 진행이 지워집니다. 새로 시작할까요?`)) return;
        setSlot(n);
        box.remove();
        this.pickPiece();
      });
      card.append(nb);
      slots.append(card);
    }
    const m = meta();
    if (m.endings.length) slots.append(h('p', { class: 'muted small meta-line' }, `본 엔딩 ${m.endings.length}/${ENDING_ORDER.length} · 최고 환생 ★${m.rebirths}`));
    const hb = h('button', { class: 'btn big ghost' }, '도움말');
    hb.addEventListener('click', () => openHelp());
    const sb = h('button', { class: 'btn big ghost' }, '설정');
    sb.addEventListener('click', () => openSettings(() => {}));
    btns.append(hb, sb);
    box.append(slots, btns, titleFooter());
    document.getElementById('overlay')!.append(box);
  }

  pickPiece() {
    // 시작 말은 폰 하나뿐이라 말을 고르는 창 없이 바로 난이도로 (테스터: 고를 게 없는데 왜 있나)
    // (나이트·비숍 데이터는 남겨 두지만 고를 수 없다)
    const id: PieceId = 'pawn';
    {
      {
        openDifficulty((diff) => {
          wipeSave();
          newGame(id, diff);
          qStart('main_job', true);
          this.begin(true);
          // 베타 참여자 선물: 환생('남는다')과 같은 재화 + 칭호
          if (takeBetaGift()) {
            G.gold += 100;
            const rares: MatId[] = ['pearl', 'silver', 'crack', 'fang'];
            for (let i = 0; i < 2; i++) addBag(rares[Math.floor(Math.random() * rares.length)], 1);
            emit('betaGift');
            save();
            toast('베타 참여 선물: 칭호 「첫 수를 둔 자」, 100G, 희귀 재료 2개', 'rare');
            this.refreshAll();
          }
        });
      }
    }
  }

  async begin(fresh: boolean) {
    document.body.classList.remove('at-title');
    setTimeout(() => eggTime(), 1500);
    this.mode = 'explore';
    this.explore.enter(G.area);
    // 옛 저장: 새로 생긴 이야기 줄기를 이어 준다
    if (G.promoted2 && qst('main_r3') === 'locked' && !G.flags.king_dead) qStart('main_r3', true);
    for (const c of G.party) qStart(c === 'soldier' ? 'cq_soldier' : c === 'ghostknight' ? 'cq_ghost' : 'cq_priest', true);
    syncAchievements();
    // 클로즈드 베타에 참여했던 기기: 이 슬롯에 칭호가 없으면 준다 (오픈 베타는 저장을 초기화하지 않음)
    if (isClosedTester() && !G.ach.beta_first) emit('betaGift'); // 업적 알림이 뜬다
    try {
      if (localStorage.getItem('cf_titleKnight')) emit('titleKnight');
    } catch { /* */ }
    save();
    if (fresh) {
      if (!fx.instant) await chapterStart(1);
      dialog('프롤로그', '눈을 떠 보니 처음 보는 마을 광장이다. 다른 말들은 다 정해진 순서대로만 움직인다. 한 칸 가고, 서고, 또 한 칸. 그런데 나는 아무 데로나 움직일 수 있다. 광장 위쪽에 있는 [기록의 벽]이 희미하게 빛나고 있다.', [
        { label: '기록의 벽으로 가 본다', onPick: () => this.tip('move', '점이 찍힌 칸이 갈 수 있는 곳이에요. 먼 칸을 눌러도 금빛 화살표를 따라 알아서 걸어가요. 금빛 별이 다음 목적지예요.', { act: '손가락이 가리키는 칸을 눌러 한 걸음 걸어 보세요' }) },
      ], { self: true, speaker: PIECES[G.piece].name });
    }
    log(`📍 ${AREAS[G.area].name}`);
  }

  // ---------- 안내 ----------
  guideTarget() {
    if (!prefs().guide) return null;
    // 체력이 바닥이면 쉬는 곳이 먼저
    if (G.job && G.hp <= Math.ceil(maxHp() / 3)) {
      const r2 = AREAS[G.area].region === 2;
      return { id: 'rest', area: (r2 ? 'camp' : 'town') as AreaId, obj: r2 ? 'fire' : 'inn', text: `체력이 낮다 (${G.hp}/${maxHp()}): ${r2 ? '모닥불' : '여관'}에서 쉬기` };
    }
    // 지도에서 고른 목적지가 있으면 그쪽이 먼저 (도착하면 저절로 꺼진다)
    const dest = G.flags.dest as AreaId | '';
    if (dest) {
      if (dest === G.area) { G.flags.dest = ''; toast(`${AREAS[dest].name}에 도착했다`, 'good'); }
      else return { id: 'dest', area: dest, text: '📍 목적지' };
    }
    const id = trackedQuest();
    if (id) {
      // 보스를 향하는데 장비가 모자라면 먼저 재료 사냥으로 안내한다
      // 장비 안내는 '만든 횟수'로 센다 (같은 부위를 다시 만들어도 1회)
      const gearN = craftCount();
      const NEED: Record<string, number> = { main_boss: 3, main_r2: 4, main_r3: 4, main_r4: 5 };
      if (NEED[id] && gearN < NEED[id]) {
        const need = NEED[id];
        // 만들 만큼 모였으면 대장간으로, 아니면 몹이 남은 곳으로
        // 2지역에서는 야영지의 떠돌이 대장장이가 더 가깝다
        const reg = AREAS[G.area].region;
        const F: [AreaId, string, string] = reg >= 4 ? ['margin', 'forge4', '여백의 모루'] : reg === 3 ? ['frostpost', 'smith3', '초소 대장장이'] : reg === 2 ? ['camp', 'smith', '떠돌이 대장장이'] : ['town', 'forge', '대장간'];
        const up = this.canUpgrade();
        if (up) return { id: 'farm-forge', area: F[0], obj: F[1], text: `${F[2]}에서 ${SLOT_INFO[up].name} 만들기 (제작 ${gearN}/${need}회)` };
        const r2 = id !== 'main_boss';
        const here = AREAS[G.area].random || AREAS[G.area].mobs.length ? G.area : null;
        // 아직 못 본 재료가 나오는 곳을 먼저 권한다
        const r1Pick: AreaId = !G.flags.got_wing ? 'forest' : !G.flags.got_moss && G.flags.rook_gone ? 'hills' : G.area === 'meadow' ? 'forest' : 'meadow';
        const r2Pick: AreaId = id === 'main_r4' ? (G.area === 'fold' ? 'inkwell' : 'fold') : id === 'main_r3' ? (!G.flags.got_fur ? 'tundra' : G.area === 'tundra' ? 'glacier' : 'tundra') : !G.flags.got_silk || !G.flags.got_skin ? 'marsh' : 'ruins';
        // 지금 지역에 몹이 남아 있으면 여기서 모은다 (다른 지역으로 핑퐁하지 않게)
        const farmArea = (here && this.explore.mobs.length && AREAS[G.area].region === AREAS[r2 ? r2Pick : r1Pick].region ? here : r2 ? r2Pick : r1Pick) as AreaId;
        return { id: 'farm', area: farmArea, text: `재료 모으기 (제작 ${gearN}/${need}회 → 대장간)` };
      }
      const g = guideFor(id);
      if (g) return { id, ...g };
    }
    // 진행 중인 퀘스트가 없으면 이야기의 다음 걸음을 안내한다
    if (!G.job) return { id: 'story', area: 'town' as AreaId, obj: 'record', text: '기록의 벽' };
    if (qst('main_boss') === 'locked') return { id: 'story', area: 'town' as AreaId, obj: 'elder', text: '촌장 킹에게 말 걸기' };
    if (G.promoted && qst('main_r2') === 'locked') return { id: 'story', area: 'camp' as AreaId, obj: 'scout', text: '야영지의 정찰병 나이트' };
    return null;
  }

  /** 가진 재료로 쓸모 있게 만들 수 있는 부위 (빈 부위를 먼저. 무기·신발은 새 칸, 방어구는 특성 재료). 없으면 null */
  canUpgrade(): Slot | null {
    const lo = loadout();
    const usable = MAT_ORDER.filter((m) => !MATS[m].binder && !MATS[m].key && matHave(m) > 0);
    const found: Slot[] = [];
    for (const slot of ['weapon', 'boots'] as const) {
      // 비어 있거나, 끼고 있는 장비가 새 칸을 하나도 못 주면 다시 만들 가치가 있다
      if (G.equip[slot] && !this.uselessGear(slot)) continue;
      for (const m of usable) {
        const f = MATS[m].frag;
        if (!f || matHave(m) < MIN_CORE[slot]) continue;
        if (newSquares(lo.rules, [{ ...f, mode: slot === 'weapon' ? 'attack' : 'move' }]) > 0) found.push(slot);
      }
    }
    const coreN = usable.reduce((s, m) => s + matHave(m), 0);
    if (!G.equip.armor && usable.filter((m) => MATS[m].trait).reduce((s, m) => s + matHave(m), 0) >= MIN_CORE.armor) found.push('armor');
    // 각인: 능력 재료 + 핵심 재료 4개 / 유물: 균열 이끼 2개나 가시 덩굴 3개 + 핵심 재료 5개
    if (!G.equip.engrave && usable.some((m) => MATS[m].ability && ABILITIES[MATS[m].ability!].slot === 'engrave') && coreN >= MIN_CORE.engrave) found.push('engrave');
    if (!G.equip.relic && (matHave('crack') >= 2 || matHave('thorn') >= 3) && coreN >= MIN_CORE.relic) found.push('relic');
    // 빈 부위(장비 수가 느는 쪽)를 먼저 권한다
    return found.find((s) => !G.equip[s]) ?? found[0] ?? null;
  }

  /** 끼고 있는 무기/신발이 기본 행마와 전부 겹치는가 */
  uselessGear(slot: 'weapon' | 'boots'): boolean {
    const it = equipped(slot);
    if (!it) return false;
    const mine = itemStats(it).rules;
    if (!mine.length) return true;
    const others = loadout().rules.filter((r) => !mine.some((x) => JSON.stringify(x) === JSON.stringify(r)));
    return newSquares(others, mine) === 0;
  }

  /** NPC 머리 위 표시: 새 이야기 '!', 보고할 것 '?' */
  npcBadge(d: ObjDef): string {
    const s = (q: string) => qst(q);
    if (d.kind === 'kibo') return kiboHere(d.id) ? '!' : '';
    switch (d.id) {
      case 'record': return G.job ? '' : '!';
      case 'elder':
        if (!G.job) return '';
        if ((s('main_promo') === 'active' && matHave('crown')) || (s('main_promo2') === 'active' && matHave('qcrown'))) return '?';
        return s('main_boss') === 'locked' ? '!' : '';
      case 'board': {
        const ids = ['sq_smith', 'sq_dex', 'sq_merchant', ...(G.promoted ? ['sq_dex2'] : [])];
        if (ids.some((i) => s(i) === 'ready')) return '?';
        return ids.some((i) => s(i) === 'locked') ? '!' : '';
      }
      case 'shepherd': return s('sq_sheep') === 'ready' ? '?' : s('sq_sheep') === 'locked' ? '!' : '';
      case 'priest':
        if (s('sq_shrine') === 'locked') return '!';
        return s('sq_shrine') === 'done' && G.flags.shrine === 'purify' && G.promoted && s('rc_priest') !== 'done' ? '!' : '';
      case 'soldier':
        if (s('sq_pawn') === 'done') return G.promoted && s('rc_soldier') !== 'done' ? '!' : '';
        return Number(G.flags.pawnTalkAt ?? -1) !== G.battles || s('sq_pawn') === 'locked' ? '!' : '';
      case 'puzzle': return s('sq_puzzle') === 'done' ? '' : '!';
      case 'puzzle2': return s('sq_puzzle2') === 'done' ? '' : '!';
      case 'rook': return '!';
      case 'shrine': return s('sq_shrine') === 'done' ? '' : s('sq_shrine') === 'active' ? '!' : '';
      case 'scout': return s('sq_scout') === 'ready' ? '?' : s('main_r2') === 'locked' || s('sq_scout') === 'locked' ? '!' : '';
      case 'witch': return s('sq_witch') === 'ready' ? '?' : s('sq_witch') === 'locked' ? '!' : '';
      case 'ghostknight':
        if (s('sq_ghost') === 'ready') return '?';
        if (s('sq_ghost') === 'locked') return '!';
        return s('sq_ghost') === 'done' && G.flags.ghost_bound && s('rc_ghost') !== 'done' ? '!' : '';
      case 'scribe': return G.flags.scribeTalked ? '' : '!';
      case 'lostpawn': return s('sq_wolves') === 'ready' ? '?' : s('sq_wolves') === 'locked' ? '!' : '';
      case 'puzzle3': return s('sq_puzzle3') === 'done' ? '' : '!';
      case 'logbook': return G.flags.logbook ? '' : '!';
      case 'hermit': return (qst('main_promo3') === 'active' && matHave('kcrown') > 0) || s('sq_hermit') === 'ready' ? '?' : s('sq_hermit') === 'locked' ? '!' : '';
      case 'scribe2': return G.job && !G.flags.jobGift ? '!' : '';
    }
    return '';
  }

  /** 현재 판에서 가야 할 칸: 같은 판이면 목표, 아니면 나가야 할 변의 가장 가까운 칸 */
  guideHere(): { pos: Vec; label: string; side?: Side } | null {
    const g = this.guideTarget();
    if (!g) return null;
    if (g.area === G.area) {
      if (g.id === 'farm') {
        // 가장 가까운 몹을 가리킨다 (없으면 다음 지역으로)
        const m = this.explore.mobs.slice().sort((a, b) => Math.max(Math.abs(a.x - G.pos[0]), Math.abs(a.y - G.pos[1])) - Math.max(Math.abs(b.x - G.pos[0]), Math.abs(b.y - G.pos[1])))[0];
        return m ? { pos: [m.x, m.y], label: '몹 (닿으면 전투)' } : null;
      }
      const o = g.obj ? this.explore.objs.find((x) => x.def.id === g.obj) : null;
      const pos = o ? ([o.x, o.y] as Vec) : g.pos ?? null;
      return pos ? { pos, label: g.text } : null;
    }
    const step = this.routeStep(G.area, g.area);
    if (!step) return null;
    // 룩이 막은 길이면 룩에게 안내한다
    const ex = AREAS[G.area].exits[step.side];
    const rook = this.explore.objs.find((o) => o.def.id === 'rook');
    if (ex && !exitOpen(ex) && ex.req === 'rook' && rook) return { pos: [rook.x, rook.y], label: '고집쟁이 룩 (길을 막고 있다)' };
    // 길목 문지기가 막은 길이면 문지기에게 안내한다
    if (ex?.gate && !G.flags[ex.gate]) {
      const gm = this.explore.mobs.find((m) => m.fixed?.once === ex.gate || m.fixed?.enc === 'towers' || m.fixed?.enc === 'double');
      if (gm) return { pos: [gm.x, gm.y], label: '길을 막은 문지기' };
    }
    const cells = sideCells(step.side).filter(([x, y]) => !this.explore.blockedTile(x, y) && !this.explore.objAt(x, y));
    const exitCell = this.explore.nearestByPath(cells);
    return exitCell ? { pos: exitCell, label: `${AREAS[step.next].name}(으)로`, side: step.side } : null;
  }

  routeStep(from: AreaId, to: AreaId): { side: Side; next: AreaId } | null {
    const prev = new Map<AreaId, { from: AreaId; side: Side }>();
    const queue: AreaId[] = [from];
    const seen = new Set([from]);
    while (queue.length) {
      const a = queue.shift()!;
      if (a === to) break;
      for (const [s, ex] of Object.entries(AREAS[a].exits)) {
        // 룩이 막은 길도 경로로는 안내한다 (룩에게 안내되도록)
        // 문지기가 이 지역에 있는 길목은 경로로 안내한다 (문지기에게 가도록)
        const gateHere = !!ex?.gate && AREAS[a].mobs.some((m) => m.once === ex.gate || (ex.gate === 'towers_done' && m.enc === 'towers') || (ex.gate === 'double_dead' && m.enc === 'double'));
        if ((!exitOpen(ex) && ex?.req !== 'rook' && !(gateHere && (!ex!.req || exitOpen({ ...ex!, gate: undefined })))) || !ex?.to || seen.has(ex.to)) continue;
        seen.add(ex.to);
        prev.set(ex.to, { from: a, side: s as Side });
        queue.push(ex.to);
      }
    }
    if (!prev.has(to)) return null;
    let cur = to;
    while (prev.get(cur)!.from !== from) cur = prev.get(cur)!.from;
    return { side: prev.get(cur)!.side, next: cur };
  }

  guideText(): string {
    const t = this.guideTextBase();
    const g = this.guideTarget();
    const rw = g ? rewardHint(g.id) : '';
    return t && rw ? `${t} · 🎁 ${rw}` : t;
  }

  private guideTextBase(): string {
    const g = this.guideTarget();
    if (!g) return '';
    // 보스를 향하는데 장비가 거의 없으면 한마디 덧붙인다
    const gearN = craftCount();
    const warn = g.id === 'farm' ? '' : (g.id === 'main_boss' && gearN < 3) || (g.id === 'main_r2' && gearN < 4) ? ' (장비가 부족해 보인다: 대장간부터)' : '';
    if (g.id === 'farm' && g.area === G.area) return `${g.text} — 몹 칸에 닿으면 전투. 재료가 모이면 마을 대장간으로`;
    if (g.area === G.area) return `${g.text} — 판 위 금빛 ★ 칸으로 가기${warn}`;
    const step = this.routeStep(G.area, g.area);
    if (!step) return `${g.text} — ${AREAS[g.area].name} (아직 길이 없다)`;
    const ex = AREAS[G.area].exits[step.side];
    if (ex && !exitOpen(ex) && ex.req === 'rook') return `${g.text} @ ${AREAS[g.area].name} — 북쪽 길을 막은 룩과 먼저 이야기하자`;
    if (ex?.gate && !G.flags[ex.gate]) return `${g.text} @ ${AREAS[g.area].name} — 먼저 ${SIDE_NAME[step.side]} 길목을 막은 문지기를 쓰러뜨리자`;
    return `${g.text} @ ${AREAS[g.area].name} — ${SIDE_NAME[step.side]} 가장자리로 나가기${warn}`;
  }

  // ---------- 이동 ----------
  travel(to: AreaId, side: Side, from: Vec) {
    if (hasJob('healer') && G.hp < maxHp()) {
      G.hp = Math.min(maxHp(), G.hp + HP_MUL);
      toast(`치유사: 체력 +${HP_MUL}`, 'good');
    }
    sfx('travel');
    const fade = document.getElementById('fade')!;
    fade.classList.add('on');
    setTimeout(() => {
      // 반대쪽 변의 같은 줄로 도착
      const arrive = OPPOSITE[side];
      const want: Vec = arrive === 'n' ? [from[0], 0] : arrive === 's' ? [from[0], 7] : arrive === 'w' ? [0, from[1]] : [7, from[1]];
      G.area = to;
      G.pos = want;
      kiboPlace(to);
      this.explore.enter(to);
      emit('travel', to);
      if (kiboHere(`kibo_${to}`)) toast('떠돌이 기보사가 판을 펼쳐 놓고 있다.', 'info');
      G.pos = this.explore.landing(arrive, want);
      this.explore.resume();
      if (to === 'erased' && !G.flags.erasedSeen) {
        G.flags.erasedSeen = true;
        G.flags.fogOpen = true;
        emit('secretRoom');
        if (qOn('sq_secret')) qComplete('sq_secret', { text: '비밀을 찾았다' });
        cutin('지워진 칸', '기보에서 지워 버린 곳. 온통 하얗다.', 'win');
      }
      if (AREAS[to].region === 2 && !G.flags.r2Seen) {
        G.flags.r2Seen = true;
        void chapterStart(2);
      }
      if (AREAS[to].region === 3) void chapterStart(3);
      if (AREAS[to].region === 4) void chapterStart(4);
      // 장이 바뀐 뒤 마을에 돌아오면 수군거림이 달라진다
      if (to === 'town') setTimeout(townRumor, 600);
      save();
      this.renderSide();
      fade.classList.remove('on');
    }, fx.instant ? 0 : 220);
  }

  // ---------- 전투 ----------
  startBattle(m: RMob, ambush: boolean) {
    if (m.fixed?.enc === 'author' && peaceOpen() && !G.flags.author_dead) {
      this.battleMob = m;
      const fight = () => { G.flags.talk_author = true; this.startEncounter(expandEnc(FIXED_ENCS.author, 4), { ambush }); };
      dialog('저자', '"왔구나. 여기까지 오는 길도 다 내가 적은 잉크 위였다는 건 알고 있겠지. …그 펜을 쥘 만한지 보자."', [
        { label: '이번엔 내가 적을게', tag: 'fight', note: '저자와 싸운다', onPick: fight },
        { label: '싸우지 않겠다', tag: 'light', note: '???', onPick: () => void talkChain('저자', 'm:author', [
          ['"싸우지 않으면 아무도 못 이겨. 그건 끝이 아니야."', '있어. 스테일메이트. 아무도 안 지고 끝나는 거.'],
          ['"…그럼 증명해 봐. 난 안 멈춘다."', '나도 안 쓰러질게.'],
        ]).then(() => { G.flags.talk_author = true; this.startEncounter(FIXED_ENCS.author_peace); }) },
      ], { sprite: 'm:author', speaker: '저자' });
      return;
    }
    const party = m.party ?? [m.sprite];
    const base = m.fixed ? FIXED_ENCS[m.fixed.enc] : randomEnc(runRule() === 'pack' ? [...party, party[Math.floor(Math.random() * party.length)]] : party, AREAS[G.area].biome);
    const enc = expandEnc(base, AREAS[G.area].region);
    this.battleMob = m;
    this.startEncounter(enc, { ambush });
  }

  startEncounter(enc: EncDef, opts: { ambush?: boolean; onWin?: () => void } = {}) {
    this.onWin = opts.onWin ?? null;
    const fade = document.getElementById('fade')!;
    fade.classList.add('on', 'battle');
    const go = async () => {
      fx.clear();
      this.battle = new Battle(enc, { end: (r, k) => this.endBattle(r, k), refresh: () => this.renderSide() }, { ambush: opts.ambush });
      const bossNote = enc === FIXED_ENCS.boss
        ? '판 가장자리가 타들어 간다. 사라지는 칸(붉은 표시)에서 물러서라.'
        : enc === FIXED_ENCS.queen
          ? '퀸의 손은 3칸까지. 공격 뒤 한 턴 멈추고 가까이 넘어온다. 그 틈에 붙어서 치면 피해가 2배다. 보라색 체크 줄에서는 비켜서라.'
          : '';
      if (bossNote) this.battle.bossNote = bossNote;
      this.mode = 'battle';
      this.renderSide();
      fade.classList.remove('on', 'battle');
      if (opts.ambush) toast('암살자의 기습! 적 하나가 약해졌다.', 'good');
      if (enc.boss) sfx('boss');
      const storyBoss = enc === FIXED_ENCS.boss ? 'boss' : enc === FIXED_ENCS.queen ? 'queen' : enc === FIXED_ENCS.king ? 'king' : enc === FIXED_ENCS.author ? 'author' : null;
      if (storyBoss) await bossIntro(storyBoss);
      if (enc === FIXED_ENCS.boss) await cutin('밀짚왕', '지워진 수들이 모여 된 왕. 판 가장자리부터 타들어 간다.', 'boss');
      if (enc === FIXED_ENCS.queen) {
        await cutin('잘못 둔 퀸', bossNote, 'boss');
      }
      if (enc === FIXED_ENCS.blunder) await cutin('???', '있어서는 안 될 수.', 'boss');
      this.tip('battle', '붉게 깜빡이는 칸은 적이 다음 턴에 공격할 곳이에요. 거기서 비켜서면 맞지 않아요. 바로 옆에 붙어서 치면 피해가 2배예요 (적도 마찬가지).', { act: '손가락이 가리키는 칸을 누르세요 (적을 치거나, 붉은 칸을 피해 움직이기)' });
      if (G.party.length || enc.guest) this.tip('ally', '동료와 함께일 때는 한 턴에 말 하나만 움직일 수 있어요.', { act: '움직일 말을 판에서 눌러 바꿔 보세요' });
      if (enc.guest) toast(`${COMPANIONS[enc.guest].name}이(가) 함께 싸운다. 움직일 말을 판에서 누르면 바꿀 수 있다.`, 'info');
    };
    if (fx.instant) go();
    else setTimeout(go, 260);
  }

  endBattle(r: BattleResult, kills: MobId[]) {
    clearCoach('battle', 'ally');
    const m = this.battleMob;
    const b = this.battle;
    // 넓힌 복사본이면 원본으로 비교한다 (FIXED_ENCS.x === enc 판정)
    const enc = b?.enc?.src ?? b?.enc;
    const onWin = this.onWin;
    this.battle = null;
    this.battleMob = null;
    this.onWin = null;
    fx.clear();
    const ambush = !!G.flags.ambushBonus;
    delete G.flags.ambushBonus;
    if (r === 'flee') {
      this.mode = 'explore';
      this.explore.resume();
      emit('flee');
      toast(DIFFS[G.diff].fleeCost ? `도망쳤다. (HP -${DIFFS[G.diff].fleeCost})` : '도망쳤다.', 'bad');
      save();
      return;
    }
    if (r === 'lose') {
      sfx('lose');
      eggLose(b?.enc.enemies.map((e) => e.m) ?? []);
      const lost: [MatId, number][] = [];
      for (const [id, n] of Object.entries(G.bag) as [MatId, number][]) {
        if (MATS[id].key) continue;
        const raw = n * DIFFS[G.diff].loss;
        const l = Math.min(n, Math.floor(raw) + (Math.random() < raw - Math.floor(raw) ? 1 : 0));
        if (l) {
          lost.push([id, l]);
          G.bag[id] = n - l;
        }
      }
      G.hp = maxHp();
      delete G.flags.will_used; // 여관에서 깨어나니 의지도 돌아온다
      G.flags.deaths = Number(G.flags.deaths ?? 0) + 1;
      // 그 지역의 거점에서 깨어난다 (1지역·비밀 지역은 마을 여관)
      const reg = AREAS[G.area].region;
      const wake: [AreaId, Vec, string] = reg === 4 ? ['margin', [4, 4], '여백의 촛불 곁'] : reg === 3 ? ['frostpost', [4, 4], '서리 초소 모닥불 곁'] : reg === 2 ? ['camp', [4, 4], '야영지 모닥불 곁'] : ['town', [6, 4], '마을 여관'];
      G.area = wake[0];
      G.pos = wake[1];
      emit('death');
      this.mode = 'explore';
      this.explore.enter(wake[0]);
      save();
      if (fx.instant) return;
      cutin('쓰러졌다…', `정신을 차려 보니 ${wake[2]}이다.`, 'lose').then(() => {
        // 무엇에 당했는지 요약
        const causes = [...(b?.dmgLog ?? new Map()).entries()].sort((x, y) => y[1].dmg - x[1].dmg);
        const top = causes[0]?.[0] ?? '';
        const advice = top.includes('체크 라인') ? '보라색 줄이 보이면 그 줄에서 비켜서자.'
          : top.includes('지워지는') ? '주황색 칸은 다음 턴에 사라진다. 미리 안쪽으로 물러나자.'
          : top.includes('골렘') ? '골렘은 일직선으로 돌진한다. 붉은 줄에서 옆으로 비키고, 돌진 뒤 굳은 틈에 치자.'
          : top.includes('사냥개') || top.includes('퀸') ? '멀리서도 닿는 적이다. 사거리 밖에서 기회를 보다가 파고들자. 버겁다면 장비를 강화하자.'
          : '붉게 깜빡이는 칸에 서 있으면 맞는다. 칠 수 없을 땐 예고 칸을 피해 칠 자리를 노리자.';
        const body = h('div', {},
          h('div', { class: 'sub' }, '패배 원인'),
          h('div', { class: 'cause-list' }, ...causes.slice(0, 4).map(([k, v]) => h('div', { class: 'cause' }, h('b', {}, k), h('span', {}, `${v.hits}번 · ${v.dmg} 피해`)))),
          h('p', { class: 'hint' }, `💡 ${advice}`),
          h('div', { class: 'sub' }, '잃은 재료'),
          h('p', {}, lost.length ? '가방 재료의 일부를 잃었다. (창고 재료와 핵심 아이템은 무사하다)' : '잃은 재료는 없다.'),
          h('div', { class: 'chips' }, ...lost.map(([id, n]) => h('span', { class: 'chip mat-chip' }, matIcon(id, 18), ` ${MATS[id].name} -${n}`))),
          h('p', { class: 'hint' }, '여관에서 가방 재료를 창고에 맡기면 잃지 않는다. 대장간에서 장비를 보강하고 다시 도전하자.'));
        modal('패배', body);
      });
      return;
    }
    // 승리
    const drops = new Map<MatId, number>();
    const rareGot: MatId[] = [];
    const add = (id: MatId, n: number) => drops.set(id, (drops.get(id) ?? 0) + n);
    for (const k of kills) {
      const d = MOBS[k];
      G.dex[k] = (G.dex[k] ?? 0) + 1;
      // 기본 재료는 난이도별 확률로 (열쇠 재료·보스 왕관은 늘 준다)
      for (const [id, n] of d.drops) if (MATS[id].key || d.ai === 'boss' || d.ai === 'queen' || Math.random() < DIFFS[G.diff].drop) add(id, n);
      if (d.rare && Math.random() < d.rare[1] * DIFFS[G.diff].rare + (hasJob('hunter') ? 0.05 : 0)) {
        add(d.rare[0], 1);
        if (MATS[d.rare[0]].rare) rareGot.push(d.rare[0]);
      }
      if (d.drops.length && Math.random() < DIFFS[G.diff].extra) add(d.drops[0][0], 1);
      if (hasJob('necro') && d.drops.length && Math.random() < 0.2) add(d.drops[0][0], 1);
      emit('kill', k);
    }
    // 빛나는 개체: 기본 재료 2배 + 희귀 재료 확정
    for (const k of b?.shinyKills ?? []) {
      const d = MOBS[k];
      for (const [id, n] of d.drops) add(id, n);
      const r = d.rare?.[0] ?? 'shard';
      add(r, 1);
      if (MATS[r].rare) rareGot.push(r);
      G.flags.shiny = Number(G.flags.shiny ?? 0) + 1;
      emit('shiny', G.flags.shiny);
    }
    if (ambush) for (const [id, n] of drops) drops.set(id, n * 2);
    // 열쇠 재료(왕관 등)는 추가 드롭·빛나는 개체·기습 2배로 불어나지 않는다: 한 전투에 최대 1개.
    // 승급 왕관은 이미 그 승급을 했거나 들고 있으면 더 주지 않는다 (각성 보스에게서 또 나오던 것 — 베타 제보 '왕관 여러 개')
    const crownUsed: Partial<Record<MatId, boolean>> = { crown: G.promoted, qcrown: G.promoted2, kcrown: !!G.flags.promoted3 };
    for (const [id, n] of [...drops]) {
      if (!MATS[id].key) continue;
      if (id in crownUsed && (crownUsed[id] || matHave(id) > 0)) drops.delete(id);
      else drops.set(id, Math.min(1, n));
    }
    const reb = 1 + Number(G.flags.rebirth ?? 0) * 0.25;
    const gold = Math.round(reb * (kills.length + (b?.shinyKills.length ?? 0) * 3) * ([2, 2, 4, 6, 8][AREAS[G.area].region] ?? 2) * DIFFS[G.diff].gold);
    G.gold += gold;
    G.battles++;
    for (const [id, n] of drops) addBag(id, n);
    if (m) {
      if (m.fixed) G.flags[`cleared_${m.fixed.id}`] = true;
      // 한 번만 나오는 고정 몹(문지기·보스)은 쓰러뜨리면 표시를 남긴다
      if (m.fixed?.once) G.flags[m.fixed.once] = true;
      this.explore.removeMob(m);
    }
    if (enc?.boss) G.hp = maxHp(); // 보스를 이기면 기운을 되찾는다
    this.mode = 'explore';
    this.explore.resume();
    for (const x of b?.hows ?? []) G.flags[`how_${x.how}`] = true;
    // 보스전 기보 저장 (보스마다 가장 최근 승리 한 판)
    if (b && enc && (enc.boss || enc.awake)) {
      G.flags[`replay_${enc.name}`] = JSON.stringify({ name: enc.name, w: b.w, h: b.h, t: Date.now(), frames: b.frames.slice(0, 120) });
    }
    // 사제 용사: 이길 때마다 체력 1 회복
    if (G.flags.branch === 'priest' && G.hp < maxHp()) G.hp = Math.min(maxHp(), G.hp + HP_MUL);
    emit('battleWin', { boss: !!enc?.boss, dmg: b?.dmgTaken ?? 0, turns: b?.turn ?? 0, enc: enc?.name, hows: b?.hows ?? [], acts: b?.acts, hp: G.hp, will: !!b?.willFired, kills, awake: !!enc?.awake });
    let bossText = '';
    if (enc === FIXED_ENCS.boss) {
      G.flags.boss_dead = true;
      G.progress += 2;
      qComplete('main_boss', { gold: 50 });
      qStart('main_promo');
      bossText = '밀짚왕이 흩어지면서 밀짚 왕관이 바닥에 굴러떨어졌다. 들판 가장자리에서 지워지던 칸들이 하나둘 돌아온다.';
    }
    if (enc === FIXED_ENCS.queen) {
      G.flags.queen_dead = true;
      G.progress += 2;
      qComplete('main_r2', { gold: 100 });
      qStart('main_promo2');
      bossText = '퀸이 부서진 자리에 뒤집힌 왕관만 남았다. 늪에 엉켜 있던 수들이 천천히 풀리기 시작한다.';
    }
    if (enc === FIXED_ENCS.bonelord) {
      G.flags.bonelord_dead = true;
      if (qst('sq_ghost') === 'active') qReady('sq_ghost');
    }
    if (enc === FIXED_ENCS.blunder) G.flags.blunder_dead = true;
    // 각성한 보스: 한 번 이기면 끝, 전용 보상
    if (enc?.awake) {
      const id = enc === FIXED_ENCS.boss_awake ? 'boss' : enc === FIXED_ENCS.queen_awake ? 'queen' : 'king';
      G.flags[`${id}_awake_dead`] = true;
      const bonus: [MatId, number][] = id === 'boss' ? [['fang', 2], ['shard', 1]] : id === 'queen' ? [['mirror', 2], ['shard', 1]] : [['tusk', 2], ['quill', 1]];
      for (const [m, n] of bonus) { addBag(m, n); drops.set(m, (drops.get(m) ?? 0) + n); }
      emit('awakeWin', id);
      bossText = `${enc.name}이(가) 무너졌다. 각성의 흔적이 희귀 재료로 남았다.`;
    }
    if (enc === FIXED_ENCS.towers) {
      G.flags.towers_done = true;
      if (qst('sq_hermit') === 'active') qReady('sq_hermit');
    }
    if (enc === FIXED_ENCS.giant) G.flags.giant_dead = true;
    if (enc === FIXED_ENCS.double) G.flags.double_dead = true;
    if (enc === FIXED_ENCS.king) {
      G.flags.king_dead = true;
      G.progress += 2;
      qComplete('main_r3', { gold: 150 });
      qStart('main_promo3');
      bossText = '얼어붙은 킹이 깨지고 얼음 왕관이 남았다. 마지막 얼음 조각이 속삭인다. "판이 멈춘 건 우리 탓이 아니다. 펜을 놓은 자가 있다." 봉우리 동쪽 너머에서 펜 긁는 소리가 들린다.';
    }
    // 스테일메이트: 저자를 치지 않고 끝까지 버텼다 → 싸움 없이 엔딩
    if (enc === FIXED_ENCS.author_peace) {
      G.flags.author_dead = true;
      G.flags.peace = true;
      G.progress += 2;
      qComplete('main_r4', { gold: 200 });
      onWin?.();
      save();
      if (!fx.instant) void this.ending('stalemate');
      return;
    }
    if (enc === FIXED_ENCS.author) {
      G.flags.author_dead = true;
      G.progress += 2;
      qComplete('main_r4', { gold: 200 });
      bossText = '';
      onWin?.();
      save();
      if (!fx.instant) void this.ending();
      return;
    }
    if (enc === FIXED_ENCS.rook) this.resolveRookFight();
    onWin?.();
    save();
    const memory = enc === FIXED_ENCS.boss ? 0 : enc === FIXED_ENCS.queen ? 1 : enc === FIXED_ENCS.king ? 2 : -1;
    if (!fx.instant) { sfx('win'); this.showSpoils(drops, gold, rareGot, bossText, memory >= 0 ? () => bossMemory(memory as 0 | 1 | 2) : undefined); }
  }

  resolveRookFight() {
    G.flags.rook_gone = true;
    qComplete('sq_rook', { gold: 10 });
    this.explore.removeObj('rook');
  }

  showSpoils(drops: Map<MatId, number>, gold: number, rare: MatId[], bossText: string, after?: () => Promise<void>) {
    const list = h('div', { class: 'spoils' });
    let i = 0;
    for (const [id, n] of drops) {
      const isRare = MATS[id].rare || MATS[id].key;
      const fresh = freshMats.has(id);
      list.append(h('div', { class: `spoil ${isRare ? 'rare' : ''} ${fresh ? 'fresh' : ''}`, style: { animationDelay: `${i++ * 90}ms` } }, matIcon(id, 34), h('b', {}, MATS[id].name), h('span', {}, `×${n}`), fresh ? h('em', { class: 'spoil-tag new' }, '새 재료!') : isRare ? h('em', { class: 'spoil-tag' }, '희귀') : null));
    }
    freshMats.clear();
    // 희귀·새 재료는 따로 알림을 띄우지 않고 이 창 한 장에서 보여 준다
    const body = h('div', {}, list, h('p', { class: 'spoil-sum' }, `+${gold}G · 재료 ${[...drops.values()].reduce((a, b) => a + b, 0)}개 → 가방`));
    if (bossText) cutin('승리', bossText, 'win').then(() => (after ? after() : undefined)).then(() => modal('전리품', body));
    else modal('전리품', body);
    void rare;
    this.tip('drop', '얻은 재료는 가방에 들어가요. 쓰러지면 가방 속 재료를 잃을 수 있으니 여관 창고에 맡겨 두면 안전해요. 몹의 움직임은 [도감]에서 볼 수 있어요.', { act: '재료가 모이면 마을 대장간에서 장비를 만들어요' });
  }

  // ---------- 오브젝트 ----------
  objVisible(d: ObjDef) {
    if (d.kind === 'sheep') return qst('sq_sheep') === 'active' && !G.flags[d.id];
    if (d.kind === 'bridgeRook') return !G.flags.rook_gone;
    if (d.kind === 'merchant') return qst('sq_merchant') === 'active';
    if (d.kind === 'chest') return !G.flags[d.id];
    if (d.kind === 'kibo') return kiboHere(d.id);
    if (d.id === 'soldier') return !G.party.includes('soldier');
    if (d.id === 'priest') return !G.party.includes('priest');
    if (d.id === 'ghostknight') return !G.party.includes('ghostknight') && !G.flags.ghost_rest;
    return true;
  }

  /** 직업 계열 선택지. 중립은 빛/어둠 선택지도 약하게 쓸 수 있다 */
  alignChoice(label: string, need: Align, fn: (weak: boolean) => void, note?: string): Choice {
    const a = align();
    if (!a) return { label, tag: need, disabled: true, note: '직업이 없다', onPick: () => {} };
    if (a === need) return { label, tag: need, note, onPick: () => fn(false) };
    if (a === 'neutral') return { label, tag: need, note: `중립: 효과 약함${note ? ' · ' + note : ''}`, onPick: () => fn(true) };
    return { label, tag: need, disabled: true, note: `${ALIGN_NAMES[need]} 직업 필요`, onPick: () => {} };
  }

  async interact(o: RObj) {
    const d = o.def;
    const refresh = () => this.refreshAll();
    switch (d.kind) {
      case 'forge':
        openForge(() => { clearCoach('forge', 'mastery'); refresh(); }, { craftOnly: d.id === 'smith' });
        this.tip('forge', '재료마다 움직임 조각과 특성이 숨어 있어요. 한 재료가 30% 이상이면 그 움직임이, 40% 이상이면 특성이 붙어요.', { act: '💡 추천 조합의 [넣기]를 누른 뒤 [바로 제작]을 눌러 보세요', el: '.recs .rec .btn' });
        return;
      case 'shop':
        eggShopOpen();
        openShop(refresh, d.id === 'peddler');
        return;
      case 'board':
        openBoard(refresh, () => {
          const dd = todayDaily();
          if (!dd || dd.done) return;
          this.startEncounter(dailyEnc(dd), { onWin: () => dailyReward(dd) });
        });
        return;
      case 'inn':
        openInn(refresh, d.id === 'fire');
        return;
      case 'record':
        return this.recordWall();
      case 'kibo':
        return kiboTalk(this);
      case 'event':
        sfx('event');
        this.explore.removeObj('evt');
        return runEvent(this, () => this.refreshAll());
      case 'npc':
      case 'bridgeRook':
      case 'shrine':
        return talk(this, d.id);
      case 'puzzle': {
        if (d.id === 'puzzle3') {
          if (qst('sq_puzzle3') === 'done') { dialog(d.label, '녹아내린 돌판. 안은 비어 있다.', [{ label: '닫기', onPick: () => {} }]); return; }
          qStart('sq_puzzle3');
          openPuzzle(PUZZLES.glacier, () => { qComplete('sq_puzzle3', { gold: 60, mats: [['tusk', 1], ['frost', 2]] }); refresh(); });
          return;
        }
        const qid = d.id === 'puzzle2' ? 'sq_puzzle2' : 'sq_puzzle';
        if (qst(qid) === 'done') {
          dialog(d.label, '풀린 돌판. 안은 비어 있다.', [{ label: '닫기', onPick: () => {} }]);
          return;
        }
        qStart(qid);
        openPuzzle(d.id === 'puzzle2' ? PUZZLES.ruins : PUZZLES.town, () => {
          if (d.id === 'puzzle2') {
            qComplete('sq_puzzle2', { mats: [['fogkey', 1], ['crack', hasJob('scholar') ? 2 : 1]] });
            qStart('sq_secret');
            toast('안개 열쇠가 차갑게 빛난다… 마을 북쪽의 안개가 떠오른다.', 'rare');
          } else qComplete('sq_puzzle', { mats: [['crack', hasJob('scholar') ? 3 : 2]] });
          refresh();
        });
        return;
      }
      case 'herb': {
        const n = 1 + rand(2);
        addBag('fiber', n);
        G.flags.herbs = Number(G.flags.herbs ?? 0) + 1;
        emit('herb', G.flags.herbs);
        fx.burst(o.x + 0.5, o.y + 0.5, '#d8c77e', 8, { speed: 1.5 });
        toast(`들풀 섬유 +${n}`, 'good');
        this.explore.removeObj(d.id);
        save();
        return;
      }
      case 'sheep': {
        G.flags[d.id] = true;
        const s = q('sq_sheep');
        s.n++;
        fx.burst(o.x + 0.5, o.y + 0.5, '#fff', 10, { speed: 2 });
        toast(`양을 찾았다! (${s.n}/3) 양은 알아서 마을로 돌아간다.`, 'good');
        if (s.n >= 3) qReady('sq_sheep');
        this.explore.removeObj(d.id);
        refresh();
        return;
      }
      case 'waypoint': {
        if (G.flags[d.id]) return;
        G.flags[d.id] = true;
        fx.burst(o.x + 0.5, o.y + 0.5, '#9fd8d0', 14, { speed: 2 });
        const s = q('sq_scout');
        if (s.st === 'active') {
          s.n = ['wp_marsh', 'wp_ruins', 'wp_tower'].filter((f) => G.flags[f]).length;
          toast(`${d.label}을(를) 지도에 표시했다. (${s.n}/3)`, 'good');
          if (s.n >= 3) qReady('sq_scout');
        } else toast(`${d.label}에 손을 얹었다. 차가운 기운이 느껴진다.`, 'info');
        refresh();
        return;
      }
      case 'chest': {
        G.flags[d.id] = true;
        const loot: Record<string, [MatId, number][]> = {
          chest_h: [['crack', 1]],
          chest_r: [['mirror', 1], ['bone', 2]],
          chest_e: [['shard', 2], ['mirror', 1], ['blunder', 1]],
        };
        const items = loot[d.id] ?? [['fiber', 2]];
        for (const [m, n] of items) addBag(m, n);
        G.gold += 20;
        if (hasJob('thief')) addBag(items[0][0], 1);
        fx.burst(o.x + 0.5, o.y + 0.5, '#e6c25a', 14, { speed: 2.5 });
        toast(`${d.label}: ${items.map(([m, n]) => `${MATS[m].name} ×${n}`).join(', ')}, 20G${hasJob('thief') ? ' (+도적의 눈썰미)' : ''}`, 'rare');
        this.explore.removeObj(d.id);
        refresh();
        return;
      }
      case 'merchant': {
        qComplete('sq_merchant', { mats: [['silver', 1]], text: '상점 할인 20%' });
        G.flags.discount = true;
        this.explore.removeObj(d.id);
        dialog('떠돌이 나이트 상인', '"허허, 내 다음 착지를 읽다니! 약속대로 은빛 날개를 주지. 마을 상점에도 말해 두겠네."', [{ label: '고맙습니다', onPick: () => {} }], { sprite: 'p:bn', npc: 'merchant', speaker: '나이트 상인' });
        refresh();
        return;
      }
    }
  }

  recordWall() {
    eggWall();
    const choose = () => openJobSelect((j) => {
      const first = !G.job;
      G.job = j;
      const jd = jobDef(j)!;
      log(`🪶 직업: ${jd.name} (${ALIGN_NAMES[jd.align]})`);
      if (first) {
        qComplete('main_job', { gold: 10 });
        toast('촌장 킹(벽 오른쪽)에게 말을 걸어 보자', 'info');
      } else emit('jobChange', j);
      emit('job', j);
      this.refreshAll();
    });
    if (!G.job) return choose();
    const jd = jobDef(G.job)!;
    const choices: Choice[] = [{ label: '떠난다', onPick: () => {} }];
    // 누구나 길(직업·성향)을 다시 정할 수 있다 — 엔딩마다 처음부터 다시 하지 않아도 되게 (베타 의견: 엔딩이 늘어도 노가다). 중립은 싸게
    const cost = jd.align === 'neutral' ? 20 : 80;
    choices.unshift({ label: `이름을 다시 새긴다 (${cost}G)`, note: '직업과 성향이 바뀌어요', disabled: G.gold < cost, onPick: () => { G.gold -= cost; choose(); } });
    // 마지막 보스를 쓰러뜨리고 엔딩을 본 뒤 남기로 했어도, 여기서 언제든 환생할 수 있다 (그 전에는 안 보임)
    if (G.flags.author_dead && G.flags.ending) {
      const e = G.flags.ending as EndingId;
      choices.unshift({ label: '처음부터 다시 쓴다 (환생)', note: `본 엔딩: ${ENDINGS[e].name} · ${ENDINGS[e].bonus}`, tag: 'neutral', onPick: () => rebirth(this, e) });
    }
    const extra = G.promoted ? ' 그 옆에 누군가 아주 작게 적어 두었다: "다음 수는 네가 둬."' : '';
    dialog('기록의 벽', `빈칸에 새겨진 내 이름 옆에 "${jd.name}"이라고 적혀 있다.${extra}`, choices);
  }

  async promote(second = false) {
    const p = PIECES[G.piece];
    // 두 번째 승급은 갈래를 고른다
    if (second && p.branches && !G.flags.branch) {
      const bs = p.branches;
      dialog('두 번째 승급 — 어떤 틀로?', '뒤집힌 왕관에서 빛이 세 갈래로 갈라진다. 한 번 고르면 되돌릴 수 없다.', (Object.keys(bs) as BranchId[]).map((b) => ({
        label: bs[b].name,
        note: bs[b].desc,
        onPick: () => { G.flags.branch = b; void this.promote(true); },
      })), { sprite: 'p:bk', npc: 'elder', speaker: '촌장 킹', noClose: true }); // 왕관을 이미 바쳤으니 고르지 않고 닫을 수 없다
      return;
    }
    const pr = second ? promo2Of() : p.promo;
    if (second) G.promoted2 = true;
    else {
      G.promoted = true;
      G.mastery = true;
    }
    G.hp = maxHp();
    log(`👑 승급: ${pr.name}`);
    await cutin(`승급 — ${pr.name}`, `${pr.desc} 최대 체력 +${pr.hp}.${second ? '' : ' 마을 남쪽 길이 열렸다.'}`, 'promo', pieceSrc(p.img));
    qComplete(second ? 'main_promo2' : 'main_promo', { gold: second ? 60 : 30 });
    if (second) qStart('main_r3');
    emit(second ? 'promote2' : 'promote');
    this.refreshAll();
    await chapterEnd(second ? 2 : 1);
  }

  /** 거점 사이 빠른 이동 (지도에서) */
  fastTravel(to: AreaId) {
    const spot: Record<string, Vec> = { town: [6, 4], camp: [4, 4], frostpost: [4, 4], margin: [4, 4] };
    sfx('travel');
    kiboPlace(to);
    G.area = to;
    G.pos = spot[to] ?? [4, 4];
    this.explore.enter(to);
    save();
    this.renderSide();
    toast(`${AREAS[to].name}(으)로 옮겨 왔다.`, 'info');
  }

  /** 엔딩 (저자를 쓰러뜨린 뒤) */
  ending(forced?: EndingId) {
    return playEnding(this, forced);
  }

  /** 환생한 새 게임 시작 */
  rebirthBegin(n: number) {
    qStart('main_job', true);
    this.begin(false);
    const rr = runRule();
    const intro = () => dialog(`환생 ★${n}`, '기보가 다시 펼쳐졌다. 낯익은 마을 광장, 정해진 순서대로 움직이는 말들. 그래도 이번엔 기억이 남아 있다. 몸에 밴 기술과 도감에 적어 둔 이름들.', [
      { label: '다시, 첫 수부터', onPick: () => this.refreshAll() },
    ], { self: true, speaker: PIECES[G.piece].name });
    if (!rr) return intro();
    // 판 규칙 카드: 뒤집히며 이번 판의 규칙이 드러난다
    const card = h('div', { class: 'rule-card' }, h('div', { class: 'rc-face rc-back' }, '🎴'), h('div', { class: 'rc-face rc-front' }, h('small', {}, '이번 판의 규칙'), h('b', {}, RUN_RULES[rr].name), h('p', {}, RUN_RULES[rr].desc)));
    const go = h('button', { class: 'btn primary', disabled: true }, '이 규칙으로 시작');
    const md = modal('판 규칙 카드', h('div', { class: 'rule-pick' }, card, go), { closable: false, onClose: intro });
    setTimeout(() => { card.classList.add('flip'); sfx('perfect'); }, 450);
    setTimeout(() => { go.disabled = false; }, 1100);
    go.addEventListener('click', () => md.close());
  }


  /** 세 번째 승급: 얼어붙은 왕관 */
  async promote3() {
    G.flags.promoted3 = true;
    G.hp = maxHp();
    log(`👑 승급: ${PROMO3.name}`);
    await cutin(`승급 — ${PROMO3.name}`, `${PROMO3.desc} 최대 체력 +${PROMO3.hp}. 왕의 봉우리 동쪽, 글자가 끊기는 곳으로 가는 길이 열렸다.`, 'promo', pieceSrc(PIECES[G.piece].img));
    qComplete('main_promo3', { gold: 80 });
    qStart('main_r4');
    emit('promote3');
    this.refreshAll();
    await chapterEnd(3);
  }

  recruit(c: keyof typeof COMPANIONS) {
    if (G.party.includes(c)) return;
    G.party.push(c);
    emit('recruit', c);
    const d = COMPANIONS[c];
    cutin(`동료 — ${d.name}`, `${d.desc} ${d.passive}`, 'promo', pieceSrc(d.img));
    this.refreshAll();
  }

  // ---------- 사이드 패널 ----------
  /** 지금 장면에 맞는 배경 음악 */
  private musicMood(): Mood {
    if (this.mode === 'title' || !G) return 'title';
    if (this.mode === 'battle') return this.battle?.enc.boss ? 'boss' : 'battle';
    const a = AREAS[G.area];
    if (['town', 'camp', 'frostpost', 'margin'].includes(G.area)) return 'town';
    return (['r1', 'r1', 'r2', 'r3', 'r4'][a.region] ?? 'r1') as Mood;
  }

  /** 판 아래 행동 줄 (전투 중에만) */
  private actBar(): HTMLElement {
    let el = document.getElementById('actbar');
    if (!el) {
      el = h('div', { id: 'actbar', class: 'actbar' });
      document.getElementById('stage')!.append(el);
    }
    return el;
  }

  /** 옆 메뉴 단축키 → 여는 함수 */
  menuKeys: Record<string, () => void> = {};

  renderSide() {
    setMood(this.musicMood());
    const bar = this.actBar();
    if (this.mode === 'battle' && this.battle) {
      this.battle.renderPanel(this.side);
      this.side.append(this.logBox());
      this.battle.renderActionBar(bar);
      bar.classList.add('on');
      this.renderer.bottomInset = bar.offsetHeight + 6;
      return;
    }
    bar.classList.remove('on');
    bar.innerHTML = '';
    this.renderer.bottomInset = 0;
    if (this.mode !== 'explore') return;
    const el = this.side;
    el.innerHTML = '';
    const p = PIECES[G.piece];
    const jd = jobDef(G.job);
    const mh = maxHp();
    const lo = loadout();
    const extra = lo.rules.slice(baseRules().length);
    const gt = this.guideText();
    if (this.explore.scene?.edges?.some((e) => e.hot && e.open)) this.tip('edge', '판 가장자리에 서면 옆 지역으로 넘어갈 수 있어요. 판 바깥쪽 금빛 화살표를 눌러도 돼요.', { act: '지금 서 있는 칸(손가락)을 한 번 더 누르세요' });
    el.append(h('div', { class: 'card area-card' },
      h('div', { class: 'area-name' }, AREAS[G.area].name, runRule() ? h('span', { class: 'rule-chip', title: RUN_RULES[runRule()!].desc }, `🎴 ${RUN_RULES[runRule()!].name}`) : null),
      gt ? h('div', { class: 'guide-line' }, '🧭 ', gt) : h('div', { class: 'muted small' }, '판 가장자리 칸에서 바깥 화살표를 누르면 다른 지역으로 간다'),
    ));
    // 메뉴: 아이콘만 (이모지와 글자를 한 상자에 같이 넣으면 둘 다 어중간하다는 베타 의견). 이름은 마우스를 올리면,
    // 모서리의 글자는 단축키 (탐험 중 키보드로 바로 열기)
    const menu = (icon: string, label: string, key: string, fn: () => void, desc: string) => {
      const b = h('button', { class: 'menu-btn', title: `${label} (${key}) — ${desc}`, 'aria-label': label }, h('span', { class: 'menu-ico' }, icon), h('span', { class: 'menu-key' }, key));
      b.addEventListener('click', fn);
      this.menuKeys[key.toLowerCase()] = fn;
      return b;
    };
    el.append(h('div', { class: 'side-menu' },
      menu('🗺️', '지도', 'M', () => openMap({ target: this.guideTarget(), badge: (d) => this.npcBadge(d), travel: (a) => this.fastTravel(a), dest: (G.flags.dest as AreaId) || null, setDest: (a) => { G.flags.dest = a ?? ''; if (a) toast(`목적지: ${AREAS[a].name} — 금빛 화살표를 따라가세요`, 'info'); this.refreshAll(); } }), '지도 · 목적지 정하기 · 거점 이동'),
      menu('🛡️', '장비', 'I', () => openInventory(() => this.refreshAll()), '장비 바꿔 끼기 · 가방 재료 · 분해'),
      menu('📖', '도감', 'C', () => openCodex(), '몹 · 재료 · 레시피'),
      menu('🏆', '업적', 'A', () => openAchievements(), '업적과 보상'),
      menu('❓', '도움말', 'H', () => openHelp(), '규칙과 조작'),
      menu('⚙️', '설정', 'O', () => openSettings(() => this.refreshAll(), true), '안내 · 소리 · 음악 · 글자 크기 · 세이브 코드'),
    ));
    el.append(h('div', { class: 'card' },
      h('div', { class: 'row gap' }, h('img', { class: 'portrait', src: pieceSrc(p.img), alt: '' }), h('div', {},
        h('b', {}, pieceTitle()),
        h('div', { class: 'small muted' }, jd ? `${jd.name} · ${ALIGN_NAMES[jd.align]}` : '직업 없음'),
        h('div', { class: 'gold' }, `${G.gold}G`))),
      h('div', { class: 'hpbar' }, h('i', { style: { width: `${(G.hp / mh) * 100}%` } }), h('span', {}, `HP ${G.hp} / ${mh}`)),
      G.party.length ? h('div', { class: 'party' }, ...G.party.map((c) => h('span', { class: 'chip', title: COMPANIONS[c].passive }, h('img', { src: pieceSrc(COMPANIONS[c].img), alt: '' }), COMPANIONS[c].name))) : null,
    ));
    const eq = h('div', { class: 'card' }, h('div', { class: 'sub' }, '행마 · 장비'));
    eq.append(h('div', { class: 'row gap top' }, patternGrid(baseRules(), extra, pieceSrc(p.img)), h('div', { class: 'eq-mini' }, ...SLOTS.map((s) => {
      const it = equipped(s);
      const dud = (s === 'weapon' || s === 'boots') && this.uselessGear(s);
      return h('div', {}, h('small', {}, SLOT_INFO[s].name), ' ', it ? itemStats(it).name : h('span', { class: 'muted' }, '—'),
        dud ? h('span', { class: 'dud', title: '기본 행마와 전부 겹쳐 새 칸을 주지 않는다. 다른 재료로 다시 만들어 보자.' }, ' 겹침') : null);
    }))));
    eq.append(h('p', { class: 'legend small' }, h('i', { class: 'dot base both' }), ' 기본 ', h('i', { class: 'dot new move' }), ' 이동 ', h('i', { class: 'dot new attack' }), ' 공격 ', h('i', { class: 'dot new both' }), ' 이동·공격'));
    // 무기(공격 행마)는 전투에서만 — 탐험 이동이 안 바뀌어 '적용 안 됨'으로 오해하지 않게
    if (G.equip.weapon || G.equip.armor) eq.append(h('p', { class: 'hint small' }, '무기의 공격 행마와 방어구의 특성은 전투에서 쓰여요. 탐험 중 이동은 신발(이동 행마)만 바뀌어요.'));
    el.append(eq);

    const tracked = trackedQuest();
    const qs = h('div', { class: 'card' }, h('div', { class: 'sub' }, '퀘스트 (눌러서 안내 대상 선택)'));
    const ids = Object.keys(QUESTS).filter((id) => qOn(id)).sort((a, b) => (QUESTS[b].main ? 1 : 0) - (QUESTS[a].main ? 1 : 0));
    for (const id of ids) {
      const d = QUESTS[id];
      const line = h('button', { class: `qline ${d.main ? 'main' : ''} ${d.recruit ? 'recruit' : ''} ${qst(id)} ${tracked === id ? 'tracked' : ''}` },
        h('b', {}, tracked === id ? '🧭 ' : d.main ? '◆ ' : d.recruit ? '♟ ' : '◇ ', d.name, ' ', h('span', { class: 'muted' }, progressText(id))),
        h('div', { class: 'small muted' }, d.desc));
      line.addEventListener('click', () => { G.flags.track = id; this.refreshAll(); });
      qs.append(line);
    }
    if (!ids.length) qs.append(h('p', { class: 'muted small' }, '진행 중인 퀘스트가 없다. 마을 사람들과 의뢰 게시판을 살펴보자.'));
    el.append(qs);

    const bag = h('div', { class: 'card' }, h('div', { class: 'sub' }, '가방'));
    const bagItems = MAT_ORDER.filter((id) => G.bag[id]).map((id) => ({ id, n: G.bag[id] ?? 0 }));
    bag.append(invGrid(bagItems, { desc: (id) => loreText(id) }));
    bag.append(h('p', { class: 'hint small bag-help' }, '재료는 대장간에서 장비로 만들어요. 쓰러지면 가방 재료 일부를 잃으니 여관 창고에 맡겨 두세요. 끼고 있는 장비를 바꾸려면 위의 [장비] 버튼을 누르세요.'));
    el.append(bag);
    el.append(this.logBox());
    el.append(h('div', { class: 'row gap' }, this.btn('타이틀로', () => { save(); location.reload(); }, 'ghost')));
  }

  /** 처음 한 번만 보여 주는 힌트 */
  tip(id: string, text: string, opts: { act?: string; el?: string } = {}) {
    if (!G || G.flags[`tip_${id}`] || !prefs().tips) return;
    G.flags[`tip_${id}`] = true;
    coach(text, id, opts);
    // 판 위 손가락 표시를 바로 그리도록 지금 화면만 다시 그린다
    if (this.mode === 'battle') this.battle?.refresh();
    else if (this.mode === 'explore' && !this.explore.busy) this.explore.refresh();
  }

  btn(label: string, fn: () => void, cls = '') {
    const b = h('button', { class: `btn small ${cls}` }, label);
    b.addEventListener('click', fn);
    return b;
  }

  logBox() {
    const box = h('div', { class: 'card log', id: 'log' });
    for (const l of getLog().slice(-6)) box.append(h('div', {}, l));
    return box;
  }

  renderLog() {
    const old = document.getElementById('log');
    if (old) old.replaceWith(this.logBox());
  }
}
