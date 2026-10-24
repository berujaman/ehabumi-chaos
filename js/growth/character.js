// キャラ育成：プレイ結果から能力値を育て、ブラウザ（localStorage）に保存する。キャラは2人まで持てて切り替えられる。
// パスワードは能力値・名前・画像の番号を詰めた文字列。対戦（battle.js）やデータの復元に使う。
(function () {
  const MAX = 999, SLOTS = 2, NAME_MAX = 8, STORE_KEY = 'rg.chars';

  // 能力値（並び順はパスワードの中身の順番でもあるので変えないこと）
  const STATS = [
    { key: 'hp',    name: '体力',   from: '音ゲーで叩いたノーツ数' },
    { key: 'atk',   name: '攻撃',   from: 'シューティングの撃破・格闘のKOとヒット' },
    { key: 'def',   name: '防御',   from: 'ブロック崩しで壊したブロック・格闘のガード' },
    { key: 'spd',   name: '素早さ', from: '音ゲーの精度と最大コンボ' },
    { key: 'tech',  name: '技',     from: 'PERFECT数・格闘のカウンター・ブロック崩しの貫通' },
    { key: 'luck',  name: '運',     from: 'ブラックジャックの勝ち・おみくじ' },
    { key: 'charm', name: '魅力',   from: '恋愛シミュレーションのエンディング' },
  ];
  const START_VALUE = 10;
  const PER_PLAY_MAX = 40;   // 1プレイで1つの能力が伸びる上限

  // ---- 保存 ----
  function load() {
    try {
      const d = JSON.parse(localStorage.getItem(STORE_KEY));
      if (d && Array.isArray(d.slots)) {
        while (d.slots.length < SLOTS) d.slots.push(null);
        return d;
      }
    } catch (e) { /* 壊れている・保存できない環境 */ }
    return { active: 0, slots: Array(SLOTS).fill(null) };
  }
  function save(d) {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(d)); return true; } catch (e) { return false; }
  }

  function newCharacter(name, avatar, stats) {
    const s = {};
    for (const st of STATS) s[st.key] = stats ? clamp(stats[st.key]) : START_VALUE;
    return { name: cleanName(name), avatar: avatar | 0, stats: s, plays: 0, wins: 0, losses: 0 };
  }
  const clamp = v => Math.max(0, Math.min(MAX, Math.round(v) || 0));
  const cleanName = name => [...String(name || '').trim()].slice(0, NAME_MAX).join('') || 'ななしさん';

  function active() {
    const d = load();
    return d.slots[d.active] || null;
  }

  // ---- 育成：1プレイの成績 → 能力値の伸び ----
  // play = { counts:{perfect,great,good,miss}, accuracy, maxCombo, blocksRepaired, side:[{name,result}] }
  function gains(play) {
    const side = name => (play.side.find(s => s.name === name) || {}).result || {};
    const c = play.counts, hits = c.perfect + c.great + c.good;
    const shoot = side('シューティング'), brk = side('ブロック崩し'), fight = side('格闘ゲーム');
    const bj = side('ブラックジャック'), love = side('恋愛シミュレーション'), omi = side('おみくじ');
    const OMIKUJI = { '大吉': 12, '中吉': 8, '小吉': 5, '吉': 4, '末吉': 2, '凶': 1, '大凶': 1 };
    const n = v => Number(v) || 0;
    const g = {
      hp: hits / 25,
      atk: n(shoot['撃破']) / 3 + n(fight['KO']) * 3 + n(fight['ヒット']) / 8,
      def: n(brk['壊したブロック']) / 4 + n(fight['ガード']) / 2 + n(play.blocksRepaired),
      spd: play.accuracy * 10 + play.maxCombo / 40,
      tech: c.perfect / 30 + n(fight['カウンター']) * 2 + n(brk['貫通で壊した数']) / 3,
      luck: n(bj['勝ち']) * 2 + n(bj['ブラックジャック']) * 3 + (OMIKUJI[omi['結果']] || 0),
      charm: n(love['TRUE END']) * 8 + n(love['GOOD END']) * 5 + n(love['NORMAL END']) * 2 + n(love['BAD END']),
    };
    for (const k in g) g[k] = Math.max(0, Math.min(PER_PLAY_MAX, Math.round(g[k])));
    return g;
  }

  // プレイ結果を今のキャラに反映する。キャラがいなければ null
  function applyPlay(play) {
    const d = load(), ch = d.slots[d.active];
    if (!ch) return null;
    const g = gains(play), added = {};
    for (const st of STATS) {
      const before = ch.stats[st.key];
      ch.stats[st.key] = clamp(before + g[st.key]);
      added[st.key] = ch.stats[st.key] - before;
    }
    ch.plays++;
    save(d);
    return { character: ch, added };
  }

  const total = ch => STATS.reduce((s, st) => s + ch.stats[st.key], 0);
  // 見た目のレベル（能力値の合計から。全部999で99）
  const level = ch => Math.max(1, Math.min(99, Math.floor(total(ch) / (STATS.length * MAX) * 98) + 1));

  // ---- パスワード ----
  // 中身（ビット列）: 版(4) 画像(6) 能力値(10×7) 名前の文字数(4) 名前 チェック(16)
  // 名前の1文字：ひらがな・カタカナは 00+8bit、英数字・記号は 01+7bit、それ以外（漢字など）は 1+16bit
  // 読み間違えやすい文字（0 O 1 I）を使わない32文字で書き、4文字ごとに「-」で区切る
  const ALPHA = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const VERSION = 1;

  class Bits {
    constructor() { this.v = 0n; this.n = 0; }
    put(value, width) { this.v = (this.v << BigInt(width)) | (BigInt(value) & ((1n << BigInt(width)) - 1n)); this.n += width; }
  }
  class Reader {
    constructor(v, n) { this.v = v; this.n = n; }
    get(width) {
      if (width > this.n) throw new Error('short');
      this.n -= width;
      return Number((this.v >> BigInt(this.n)) & ((1n << BigInt(width)) - 1n));
    }
  }

  function checksum(v, n) {
    let h = 0x9e37 ^ n;
    for (let i = 0; i < n; i += 8) {
      const byte = Number((v >> BigInt(i)) & 0xffn);
      h = (Math.imul(h ^ byte, 0x5bd1) + (h >>> 7)) & 0xffff;
    }
    return h;
  }
  // 中身を少しかき混ぜる（数字を直接書き換えにくくするため。暗号ではない）
  function scramble(v, n, seed) {
    let s = seed * 2654435761 >>> 0, mask = 0n;
    for (let i = 0; i < n; i += 16) {
      s = (Math.imul(s ^ (s >>> 15), 0x2c1b3c6d) + 0x297a2d39) >>> 0;
      mask = (mask << 16n) | BigInt(s & 0xffff);
    }
    return v ^ (mask & ((1n << BigInt(n)) - 1n));
  }

  function encode(ch) {
    const b = new Bits();
    b.put(VERSION, 4);
    b.put(ch.avatar, 6);
    for (const st of STATS) b.put(ch.stats[st.key], 10);
    const chars = [...ch.name].slice(0, NAME_MAX);
    b.put(chars.length, 4);
    for (const c of chars) {
      const code = c.codePointAt(0);
      if (code >= 0x3040 && code < 0x3140) { b.put(0, 2); b.put(code - 0x3040, 8); }
      else if (code >= 0x20 && code < 0x7f) { b.put(1, 2); b.put(code, 7); }
      else { b.put(1, 1); b.put(code > 0xffff ? 0x3013 : code, 16); }   // 絵文字などは「〓」にする
    }
    const sum = checksum(b.v, b.n);
    let v = (scramble(b.v, b.n, sum) << 16n) | BigInt(sum), n = b.n + 16;
    const pad = (5 - n % 5) % 5;
    v <<= BigInt(pad); n += pad;
    let out = '';
    for (let i = n - 5; i >= 0; i -= 5) out += ALPHA[Number((v >> BigInt(i)) & 31n)];
    return out.match(/.{1,4}/g).join('-');
  }

  // 失敗したら null
  function decode(text) {
    const s = String(text || '').toUpperCase().replace(/[\s\-ー－]/g, '').replace(/O/g, '0');
    if (s.length < 20 || s.length > 80) return null;
    let v = 0n;
    for (const c of s) {
      const i = ALPHA.indexOf(c);
      if (i < 0) return null;
      v = (v << 5n) | BigInt(i);
    }
    const total = s.length * 5;
    // 末尾の詰め物の長さは分からないので、0〜4ビットを順に試してチェックが合うものを採る
    for (let pad = 0; pad < 5; pad++) {
      try {
        const n = total - pad - 16;
        if (n < 4) continue;
        const body = v >> BigInt(pad);
        const sum = Number(body & 0xffffn);
        const payload = scramble(body >> 16n, n, sum);
        if (checksum(payload, n) !== sum) continue;
        const r = new Reader(payload, n);
        if (r.get(4) !== VERSION) continue;
        const avatar = r.get(6), stats = {};
        for (const st of STATS) stats[st.key] = Math.min(MAX, r.get(10));
        const len = r.get(4);
        let name = '';
        for (let i = 0; i < len; i++) {
          if (r.get(1) === 1) name += String.fromCharCode(r.get(16));
          else if (r.get(1) === 0) name += String.fromCharCode(0x3040 + r.get(8));
          else name += String.fromCharCode(r.get(7));
        }
        if (r.n !== 0) continue;
        return newCharacter(name, avatar, stats);
      } catch (e) { /* 長さが合わない */ }
    }
    return null;
  }

  RG.Chars = { STATS, MAX, SLOTS, NAME_MAX, load, save, newCharacter, active, gains, applyPlay, total, level, encode, decode };
})();
