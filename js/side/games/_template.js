// 新しいサイドゲームのひな形（このファイル自体は読み込まれていません）。
// コピーして名前を変え、index.html の shooter.js の下に <script> を追加すると、
// 右半分のランダム選択の候補に入ります。
(function () {
  class MyGame extends RG.SideGame {
    constructor(ctx) {
      super(ctx);
      // this.bus / this.input / this.config / this.w / this.h が使えます
    }

    start({ chart, songTime, delay }) {
      // chart.onsets（曲の音の立ち上がり）を使えば、曲に合わせた出来事が作れます
    }

    update(dt, songTime) {
      // 失敗したら左の音ゲーに影響を与える:
      // this.bus.emit('side:attack', { power: 1, lane: 0, source: 'mygame' });
      // 成功したら左の壊れた特典ブロックを直す:
      // this.bus.emit('side:repair', { count: 1, source: 'mygame' });
    }

    render(g) {
      g.fillStyle = '#000';
      g.fillRect(0, 0, this.w, this.h);
    }

    receiveReward({ kind, level }) {
      // 左からの報酬（kind: 'combo' = コンボ節目, 'accuracy' = GREAT以上の累計）。このゲームなりの「得」に変換する
    }

    getResult() {
      return { 'スコア': 0 };
    }
  }

  RG.SideGames.register({ id: 'mygame', name: 'マイゲーム', controls: '← → 移動 / ↑ 決定', weight: 1, create: ctx => new MyGame(ctx) });
})();
