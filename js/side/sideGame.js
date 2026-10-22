// 右半分に入るゲームの共通の形（基底クラス）と登録簿。
//
// 新しいゲームを足すときは:
//   1. js/side/games/_template.js をコピーして中身を書く
//   2. RG.SideGames.register({ id, name, controls, create }) で登録（controls は開始時に出す操作説明）
//   3. index.html に <script> を1行追加
//
// 操作は矢印キーのみ（A S D F は音ゲー用）。押しっぱなしは this.input.isDown('ArrowLeft') など、
// 押した瞬間は onKey(code) に届く。
//
// 左の音ゲーへの影響は this.bus.emit(...) で送る（例: 'side:attack'）。
// 左を助けるときは this.bus.emit('side:repair', { count: 1 }) で壊れた特典ブロックを直せる。
// 左からの報酬は receiveReward() に届く。報酬をどう使うかは各ゲームが決める。
RG.SideGame = class {
  /** @param {{bus: RG.EventBus, input: RG.Input, config: object}} ctx */
  constructor(ctx) {
    this.bus = ctx.bus;
    this.input = ctx.input;
    this.config = ctx.config;
    this.w = 480;
    this.h = 720;
  }

  /** ゲーム開始時。info = { chart, songTime, delay } */
  start(info) {}

  /** 毎フレーム。dt は経過秒、songTime は曲の再生位置（秒） */
  update(dt, songTime) {}

  /** 描画（480x720 のキャンバス） */
  render(g, songTime) {}

  /** 矢印キーを押した瞬間。code = 'ArrowUp' | 'ArrowDown' | 'ArrowLeft' | 'ArrowRight' */
  onKey(code) {}

  /** 曲の強い音（オンセット）を delay 秒遅らせた予定表を作る。pop(t) で時刻が来た分を取り出せる */
  makeSchedule({ chart, songTime, delay }, { minGap = 0.6, minStrength = 0.3 } = {}) {
    const list = [];
    let last = -Infinity;
    for (const o of (chart ? chart.onsets : [])) {
      if (o.strength < minStrength || o.time - last < minGap) continue;
      list.push({ time: o.time + delay, strength: o.strength });
      last = o.time;
    }
    let idx = list.findIndex(s => s.time >= songTime);
    if (idx < 0) idx = list.length;
    return {
      pop(t) {
        const due = [];
        while (idx < list.length && list[idx].time <= t) due.push(list[idx++]);
        return due;
      },
    };
  }

  /** 左の音ゲーからの報酬。reward = { kind: 'combo'|'accuracy', level, combo?, count? } */
  receiveReward(reward) {}

  /** 結果画面に出す情報 { label: value, ... } */
  getResult() { return {}; }

  /** 別のゲームに切り替わる時の後始末 */
  destroy() {}
};
// ゲーム側で this.finished = true にすると、切替時間を待たずに次のゲームへ移る（おみくじなど短いゲーム用）

RG.SideGames = {
  list: [],

  // def: { id, name, controls, create, weight?: 出やすさ（標準1）, oncePerPlay?: true なら1プレイに1度だけ }
  register(def) {
    if (!def.id || !def.create) throw new Error('SideGame には id と create が必要です');
    this.list.push({ weight: 1, ...def });
  },

  // 重み付きランダム。exclude（IDの配列）は候補から外す（他に候補が無ければ外さない）
  pickRandom(exclude = []) {
    let pool = this.list.filter(d => !exclude.includes(d.id));
    if (pool.length === 0) pool = this.list;
    const total = pool.reduce((s, d) => s + d.weight, 0);
    let r = Math.random() * total;
    for (const d of pool) { if ((r -= d.weight) < 0) return d; }
    return pool[pool.length - 1];
  },
};
