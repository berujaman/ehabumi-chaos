// 自動バトル：2人のキャラの能力値でターン制の戦いをして、行動の記録を返す。
// 乱数は2人のパスワードから決めるので、同じ組み合わせならどのパソコンで見ても同じ結果になる。
(function () {
  const MAX_TURNS = 30;

  // 文字列から決まった乱数列を作る
  function makeRandom(seedText) {
    let h = 1779033703 ^ seedText.length;
    for (const c of seedText) { h = Math.imul(h ^ c.codePointAt(0), 3432918353); h = (h << 13) | (h >>> 19); }
    let s = h >>> 0;
    return () => {
      s = (s + 0x6d2b79f5) >>> 0;
      let t = s;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function fighter(ch, side) {
    const s = ch.stats;
    return { side, name: ch.name, avatar: ch.avatar, stats: s, maxHp: 120 + s.hp * 4, hp: 120 + s.hp * 4 };
  }

  // a, b: キャラ（RG.Chars の形）。passA, passB: それぞれのパスワード
  // 戻り値: { a, b, events: [{ text, actor?, target?, damage?, hpA, hpB, kind }], winner: 'a'|'b'|'draw' }
  function simulate(chA, chB, passA, passB) {
    // パスワードの順に並べてから戦わせる（どちら側から見ても同じ戦いになるように）
    const swap = passA > passB;
    const rnd = makeRandom(swap ? passB + '|' + passA : passA + '|' + passB);
    const A = fighter(chA, 'a'), B = fighter(chB, 'b');
    const [F1, F2] = swap ? [B, A] : [A, B];   // 乱数を使う順番はこの並び
    const events = [];
    const push = (text, extra = {}) => events.push({ text, hpA: A.hp, hpB: B.hp, ...extra });
    push(`${A.name} と ${B.name} の たたかいが はじまった！`, { kind: 'start' });

    for (let turn = 1; turn <= MAX_TURNS && A.hp > 0 && B.hp > 0; turn++) {
      // 素早さ＋少しの運で先攻を決める
      const i1 = F1.stats.spd + rnd() * (60 + F1.stats.luck / 4);
      const i2 = F2.stats.spd + rnd() * (60 + F2.stats.luck / 4);
      const order = i1 >= i2 ? [F1, F2] : [F2, F1];
      for (const actor of order) {
        const target = actor === A ? B : A;
        if (actor.hp <= 0 || target.hp <= 0) break;
        act(actor, target);
      }
    }

    function act(actor, target) {
      const s = actor.stats, t = target.stats;
      const who = { actor: actor.side, target: target.side };
      // 魅力：相手が見とれて動けない
      if (rnd() < Math.min(0.25, t.charm / 4000)) {
        push(`${actor.name} は ${target.name} に みとれて うごけない！`, { kind: 'charmed', ...who });
        return;
      }
      // 素早さの差で回避
      const evade = Math.min(0.3, Math.max(0.03, 0.06 + (t.spd - s.spd) / 2500));
      // 技：大技を出すことがある
      const special = rnd() < Math.min(0.35, 0.08 + s.tech / 3000);
      push(special ? `${actor.name} の ひっさつわざ！` : `${actor.name} の こうげき！`, { kind: special ? 'special' : 'attack', ...who });
      if (rnd() < evade) {
        push(`${target.name} は ひらりと みをかわした！`, { kind: 'miss', ...who });
        return;
      }
      let dmg = 12 + s.atk * 0.9 + s.tech * 0.25 - t.def * 0.55;
      dmg = Math.max(6 + s.atk * 0.08, dmg) * (0.85 + rnd() * 0.3);
      if (special) dmg *= 1.6;
      const crit = rnd() < Math.min(0.3, 0.04 + s.luck / 3500);
      if (crit) dmg *= 1.8;
      dmg = Math.max(1, Math.round(dmg));
      target.hp = Math.max(0, target.hp - dmg);
      if (crit) push('かいしんの いちげき！', { kind: 'crit', ...who });
      push(`${target.name} に ${dmg} の ダメージ！`, { kind: 'hit', damage: dmg, ...who });
      if (target.hp <= 0) push(`${target.name} は たおれた！`, { kind: 'down', ...who });
    }

    let winner;
    if (A.hp > 0 && B.hp > 0) {
      const ra = A.hp / A.maxHp, rb = B.hp / B.maxHp;
      winner = ra === rb ? 'draw' : ra > rb ? 'a' : 'b';
      push(`${MAX_TURNS}ターンが たった。のこりの体力で しょうぶ！`, { kind: 'timeup' });
    } else winner = A.hp > 0 ? 'a' : 'b';
    push(winner === 'draw' ? 'ひきわけ！' : `${(winner === 'a' ? A : B).name} の かち！`, { kind: 'end' });
    return { a: A, b: B, events, winner };
  }

  RG.Battle = { simulate };
})();
