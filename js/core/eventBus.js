// 左右のゲームをつなぐイベントバス。ゲーム同士は直接呼び合わず、必ずここを通す。
//
// 主なイベント:
//   rhythm:judge        { result, lane, combo }       判定が出た
//   rhythm:comboReward  { combo, level }              コンボ節目（右のゲームへの報酬）
//   rhythm:accuracyReward { count, level }            GREAT以上の累計の節目（右のゲームへの報酬）
//   rhythm:blockRepaired { lane, remaining }          特典ブロックが回復した
//   rhythm:blockBroken  { lane, remaining }           特典ブロックが壊れた
//   side:attack         { power, lane?, source }      右のゲームから左への攻撃
//   side:repair         { count, source }             右のゲームから左への回復（壊れたブロックを直す）
//   side:started        { id, name }                  右のゲームが開始/切替
RG.EventBus = class {
  constructor() { this.handlers = {}; }

  on(type, fn) {
    (this.handlers[type] || (this.handlers[type] = [])).push(fn);
    return () => this.off(type, fn);
  }

  off(type, fn) {
    const list = this.handlers[type];
    if (list) this.handlers[type] = list.filter(f => f !== fn);
  }

  emit(type, payload) {
    (this.handlers[type] || []).slice().forEach(fn => fn(payload));
  }
};
