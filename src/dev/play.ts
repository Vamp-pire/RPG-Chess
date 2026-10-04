// 개발용: 사람처럼 게임을 진행해 보는 도우미 (창 조작 + 금빛 별 따라가기 + 전투 봇)
import type { App } from '../game/app';
import { G } from '../core/state';
import { fx } from '../render/fx';
import { botTurn } from './sim';

export function makePlayer(app: App) {
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
  const P = {
    sleep,
    async settle() {
      await sleep(80);
      for (let i = 0; i < 80 && app.explore.busy; i++) await sleep(60);
    },
    dlg() {
      const m = [...document.querySelectorAll('.modal')].pop() as HTMLElement | undefined;
      return m ? m.innerText.replace(/\n+/g, ' | ').slice(0, 500) : null;
    },
    choices() {
      return [...document.querySelectorAll<HTMLButtonElement>('.d-choice')].map((b) => (b.disabled ? '[X]' : '') + b.textContent);
    },
    async pick(txt: string) {
      const b = [...document.querySelectorAll<HTMLButtonElement>('.d-choice')].find((x) => !x.disabled && x.textContent!.includes(txt));
      if (!b) return 'NOPE:' + P.choices().join('/');
      b.click();
      await sleep(350);
      return 'ok';
    },
    closeAll() {
      document.querySelectorAll<HTMLElement>('.cutin').forEach((c) => c.click());
      document.querySelectorAll<HTMLElement>('.coach-x').forEach((c) => c.click());
      document.querySelectorAll<HTMLElement>('.result-card button').forEach((c) => c.click());
      document.querySelectorAll<HTMLElement>('.m-close').forEach((b) => b.click());
    },
    async click(x: number, y: number) {
      await app.explore.click(x, y);
      await P.settle();
    },
    guideText: () => (document.querySelector('.guide-line') as HTMLElement | null)?.innerText ?? '',
    /** 금빛 별 한 걸음 따라가기 */
    async star(): Promise<string> {
      const g = app.guideHere();
      if (!g) return 'no-guide';
      const [x, y] = g.pos;
      const o = app.explore.objAt(x, y);
      // 이미 목표 가장자리 칸에 서 있으면 내 칸을 다시 누르지 않는다 (모서리 방향 묻기 창 방지)
      if (!(g.side && G.pos[0] === x && G.pos[1] === y)) await P.click(x, y);
      if (app.mode === 'battle') return 'battle';
      if (g.side && G.pos[0] === x && G.pos[1] === y) {
        const out = g.side === 'n' ? [x, -1] : g.side === 's' ? [x, 8] : g.side === 'w' ? [-1, y] : [8, y];
        await P.click(out[0], out[1]);
        const r = await P.pick('이동한다');
        await sleep(800);
        return `travel→${G.area} ${r}`;
      }
      if (o && !o.def.walk && Math.max(Math.abs(G.pos[0] - x), Math.abs(G.pos[1] - y)) === 1) {
        await P.click(x, y);
        return 'talk:' + o.def.id;
      }
      return `moved ${G.pos} (star ${g.pos} ${g.label})`;
    },
    async fight() {
      const b = app.battle;
      if (!b) return 'no-battle';
      fx.instant = true;
      let n = 0;
      while (!b.over && n < 80) {
        await botTurn(b);
        n++;
      }
      fx.instant = false;
      await sleep(1000);
      return { enc: b.enc.name, turns: b.turn, hp: G.hp, kills: b.kills.join(','), mode: app.mode, over: b.over };
    },
    /** 대화가 열려 있으면 사람처럼 고른다: 내 계열 선택지 → 무난한 선택지 */
    async autoChoose(align = 'light') {
      const bs = [...document.querySelectorAll<HTMLButtonElement>('.d-choice')].filter((b) => !b.disabled);
      if (!bs.length) return null;
      const skip = /그냥 둔다|나중에|그럼 이만|떠난다|머문다|돌아선다|지금은 둔다|아직은|물러난다/;
      const mine = bs.find((b) => b.querySelector(`.tag-${align}`) && !skip.test(b.textContent!));
      const any = bs.find((b) => !skip.test(b.textContent!) && !b.querySelector('.tag-fight'));
      const b = mine ?? any ?? bs[0];
      const t = b.textContent;
      b.click();
      await sleep(400);
      return t;
    },
    log: [] as string[],
    fights: 0,
    /** 금빛 별을 따라 자동 진행 (33초 단위). 대장간·여관은 무난하게 처리 */
    async auto(maxFights = 40, ms = 33000) {
      const t0 = performance.now();
      const plus = (name: string, n: number) => {
        for (let i = 0; i < n; i++) [...document.querySelectorAll('.mat')].find((x) => x.textContent!.includes(name))?.querySelectorAll<HTMLButtonElement>('.pm')[1].click();
      };
      const cut = () => document.querySelectorAll<HTMLElement>('.cutin').forEach((c) => c.click());
      while (performance.now() - t0 < ms && P.fights < maxFights) {
        cut();
        if (app.mode === 'battle') {
          const r = await P.fight();
          P.fights++;
          P.log.push(`FIGHT ${typeof r === 'string' ? r : `${r.enc} t${r.turns} hp${r.hp} [${r.kills}] → ${r.mode}@${G.area}`}`);
          cut();
          await sleep(400);
          P.closeAll();
          await sleep(300);
          if (app.mode === 'battle' && app.battle && !app.battle.enc.noFlee && app.battle.turn > 70) {
            app.battle.flee();
            P.log.push('FLED');
          }
          continue;
        }
        const r = await P.star();
        if (!r.startsWith('moved')) P.log.push(r);
        const ch = await P.autoChoose();
        if (ch) {
          P.log.push('CHOSE: ' + ch);
          await sleep(500);
          cut();
          const ch2 = await P.autoChoose();
          if (ch2) P.log.push('CHOSE2: ' + ch2);
        }
        if (document.querySelector('.forge')) {
          document.querySelector<HTMLElement>('.coach-x')?.click();
          const e = G.equip;
          const slot = !e.boots ? '신발' : !e.weapon ? '무기' : !e.armor ? '방어구' : !e.engrave ? '각인' : '유물';
          [...document.querySelectorAll<HTMLElement>('.slot-btn')].find((b) => b.textContent!.includes(slot))?.click();
          await sleep(120);
          const have = (id: string) => (G.bag[id as keyof typeof G.bag] ?? 0) + (G.store[id as keyof typeof G.store] ?? 0);
          if (slot === '신발') { plus('박쥐 날개', Math.min(3, have('wing'))); plus('두꺼비 가죽', Math.min(3, have('skin'))); plus('이끼 돌', Math.min(2, have('moss'))); }
          if (slot === '방어구') { plus('가시 덩굴', Math.min(3, have('thorn'))); plus('해골 조각', Math.min(2, have('bone'))); plus('쥐 이빨', Math.min(2, have('tooth'))); }
          if (slot === '각인') { plus('안개 거미줄', Math.min(2, have('silk'))); plus('은빛 날개', Math.min(1, have('silver'))); plus('이끼 돌', Math.min(1, have('moss'))); }
          if (slot === '무기') { plus('이끼 돌', Math.min(2, have('moss'))); plus('사냥개 송곳니', Math.min(1, have('fang'))); plus('쥐 이빨', Math.min(1, have('tooth'))); }
          await sleep(150);
          P.log.push(`FORGE ${slot}: ${(document.querySelector('.f-right') as HTMLElement | null)?.innerText.replace(/\n/g, ' | ').slice(0, 160)}`);
          [...document.querySelectorAll<HTMLButtonElement>('.f-right button')].find((b) => b.textContent!.includes('바로 제작') && !b.disabled)?.click();
          await sleep(1500);
          document.querySelector<HTMLElement>('.result-card button')?.click();
          await sleep(300);
        }
        if (document.querySelector('.qboard')) {
          for (const b of [...document.querySelectorAll<HTMLButtonElement>('.qboard button')]) {
            if (b.textContent!.includes('보고') || b.textContent!.includes('받기')) { b.click(); P.log.push('BOARD ' + b.closest('.quest')?.querySelector('b')?.textContent + ' ' + b.textContent); await sleep(200); }
          }
        }
        if (document.querySelector('.inn')) {
          [...document.querySelectorAll<HTMLButtonElement>('.inn button')].find((b) => b.textContent!.includes('쉬기'))?.click();
          P.log.push('RESTED');
          await sleep(300);
        }
        P.closeAll();
        await sleep(100);
        if (r === 'no-guide') { P.log.push('NO GUIDE at ' + G.area); break; }
      }
      const qs = Object.entries(G.quests).filter(([, v]) => v.st === 'active' || v.st === 'ready').map(([k, v]) => `${k}:${v.st}`).join(',');
      return { fights: P.fights, hp: G.hp, area: G.area, promoted: G.promoted, gear: Object.entries(G.equip).filter((e) => e[1]).map((e) => e[0]).join(','), guide: P.guideText(), quests: qs, recent: P.log.slice(-14) };
    },
  };
  return P;
}
