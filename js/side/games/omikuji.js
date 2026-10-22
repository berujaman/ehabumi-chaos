// 右半分のゲーム⑥：おみくじ（1プレイに1度だけ出る）
//  - 4つのおみくじ箱から ↑ ← → ↓ で1つ選ぶ（10秒選ばないと勝手に引かれる）
//  - 結果（大吉〜大凶）・ラッキーカラー・ラッキーナンバー・一言コメントを表示
//  - 音ゲーへの影響は結果だけで決まる（大吉→特典ブロック3個回復 … 大凶→2個壊れる）
//  - 結果を見せたら、切替時間を待たずに次のゲームへ移る
//  - 曲との連動：10秒前に流れた曲の強い音に合わせて、箱がカタカタ揺れる
//  - 左からの報酬は受け取らない（おみくじは運だけ）
(function () {
  const PICK_TIME = 10, SHOW_TIME = 7;
  const KEYS = ['ArrowUp', 'ArrowLeft', 'ArrowRight', 'ArrowDown'];
  const ARROW = { ArrowUp: '↑', ArrowLeft: '←', ArrowRight: '→', ArrowDown: '↓' };
  const SLOT = {
    ArrowUp: { x: 240, y: 300 },
    ArrowLeft: { x: 130, y: 420 },
    ArrowRight: { x: 350, y: 420 },
    ArrowDown: { x: 240, y: 540 },
  };
  // weight は出やすさ。effect は音ゲーへの影響
  const FORTUNES = [
    { name: '大吉', weight: 10, color: '#ffd34d', effect: { type: 'repair', count: 3 }, note: '特典ブロックを3個回復!' },
    { name: '中吉', weight: 15, color: '#ffb84d', effect: { type: 'repair', count: 2 }, note: '特典ブロックを2個回復' },
    { name: '小吉', weight: 15, color: '#7cf29c', effect: { type: 'repair', count: 1 }, note: '特典ブロックを1個回復' },
    { name: '吉', weight: 20, color: '#5cd6ff', effect: { type: 'repair', count: 1 }, note: '特典ブロックを1個回復' },
    { name: '末吉', weight: 15, color: '#c9cde8', effect: null, note: '音ゲーへの影響なし' },
    { name: '凶', weight: 15, color: '#9d7bff', effect: { type: 'attack', power: 1 }, note: '特典ブロックが1個壊れる…' },
    { name: '大凶', weight: 10, color: '#ff6b6b', effect: { type: 'attack', power: 2 }, note: '特典ブロックが2個壊れる…' },
  ];
  const COLORS = [
    ['赤', '#e84a5f'], ['オレンジ', '#ff9a3d'], ['黄色', '#ffd34d'], ['黄緑', '#a8e05f'], ['緑', '#3ddc84'],
    ['水色', '#5cd6ff'], ['青', '#3a6fd8'], ['紫', '#9d7bff'], ['ピンク', '#ff7eb6'], ['白', '#f5f5f0'],
    ['黒', '#222222'], ['金色', '#d4af37'], ['銀色', '#b8bcc8'], ['茶色', '#8b5a2b'],
  ];
  // 一言コメントは「（ここ）上手く行く可能性がある」
  const COMMENT_HEADS = [
    'とりあえず', 'かなり', '無理かもしれないが', 'ひょっとすると', '根拠はないが', '運が良ければ',
    '奇跡が起きれば', '気合い次第で', '一応', 'ほぼ確実に', '信じれば', 'なんだかんだで',
    'うっかり', '三回に一回くらいは', '今日のうちなら',
  ];

  const pick = list => list[Math.floor(Math.random() * list.length)];
  function pickWeighted(list) {
    let r = Math.random() * list.reduce((s, x) => s + x.weight, 0);
    for (const x of list) { if ((r -= x.weight) < 0) return x; }
    return list[list.length - 1];
  }

  class Omikuji extends RG.SideGame {
    constructor(ctx) {
      super(ctx);
      this.phase = 'pick';   // pick → open → show
      this.timer = PICK_TIME;
      this.shake = 0;
      this.chosen = null;
      this.result = null;
      this.finished = false;
    }

    start(info) {
      this.schedule = this.makeSchedule(info, { minGap: 0.35, minStrength: 0.35 });
    }

    onKey(code) {
      if (this.phase === 'pick' && KEYS.includes(code)) this.draw(code);
    }

    draw(code) {
      this.chosen = code;
      const color = pick(COLORS);
      this.result = {
        fortune: pickWeighted(FORTUNES),
        colorName: color[0], color: color[1],
        number: 1 + Math.floor(Math.random() * 99),
        comment: `${pick(COMMENT_HEADS)}上手く行く可能性がある`,
      };
      this.phase = 'open';
      this.timer = 1.2;   // 紙を開く演出
    }

    reveal() {
      const f = this.result.fortune;
      if (f.effect && f.effect.type === 'repair') this.bus.emit('side:repair', { count: f.effect.count, source: 'omikuji' });
      if (f.effect && f.effect.type === 'attack') this.bus.emit('side:attack', { power: f.effect.power, lane: null, source: 'omikuji' });
      this.phase = 'show';
      this.timer = SHOW_TIME;
    }

    update(dt, t) {
      if (this.schedule && this.schedule.pop(t).length) this.shake = 1;
      this.shake = Math.max(0, this.shake - dt * 5);
      this.timer -= dt;
      if (this.timer > 0) return;
      if (this.phase === 'pick') this.draw(pick(KEYS));   // 時間切れは勝手に引く
      else if (this.phase === 'open') this.reveal();
      else if (this.phase === 'show') this.finished = true;
    }

    receiveReward() { /* おみくじは運だけ。報酬は効かない */ }

    getResult() {
      if (!this.result) return { '結果': '引かなかった' };
      return { '結果': this.result.fortune.name, 'ラッキーカラー': this.result.colorName, 'ラッキーナンバー': String(this.result.number) };
    }

    // ---- 描画 ----
    drawBox(g, x, y, label, active, wobble) {
      g.save();
      g.translate(x, y);
      g.rotate(wobble);
      // 六角形の筒
      g.fillStyle = active ? '#d63a3a' : '#a82a2a';
      g.beginPath();
      g.moveTo(-34, -46); g.lineTo(34, -46); g.lineTo(44, 0); g.lineTo(34, 46); g.lineTo(-34, 46); g.lineTo(-44, 0);
      g.closePath();
      g.fill();
      g.strokeStyle = '#ffd34d'; g.lineWidth = 3;
      g.stroke();
      // 上から出ている棒
      g.fillStyle = '#e8d5a8';
      g.fillRect(-4, -66, 8, 22);
      g.fillStyle = '#ffffff';
      g.font = 'bold 15px sans-serif';
      g.textAlign = 'center';
      g.fillText('御神籤', 0, 6);
      g.fillStyle = '#ffd34d';
      g.font = 'bold 22px sans-serif';
      g.fillText(label, 0, 34);
      g.restore();
    }

    render(g) {
      const grd = g.createLinearGradient(0, 0, 0, this.h);
      grd.addColorStop(0, '#2a0d12');
      grd.addColorStop(1, '#0d0508');
      g.fillStyle = grd;
      g.fillRect(0, 0, this.w, this.h);
      // 鳥居
      g.fillStyle = 'rgba(200,40,40,0.35)';
      g.fillRect(60, 120, 360, 16);
      g.fillRect(80, 150, 320, 10);
      g.fillRect(110, 136, 18, 560);
      g.fillRect(352, 136, 18, 560);

      g.textAlign = 'center';
      g.fillStyle = '#ffd34d';
      g.font = 'bold 30px sans-serif';
      g.fillText('おみくじ', 240, 60);
      g.font = '13px sans-serif';
      g.fillStyle = '#e8c8a8';
      g.fillText('1プレイに1度だけ。結果がそのまま音ゲーに影響します', 240, 86);

      if (this.phase === 'pick') {
        for (const k of KEYS) {
          const s = SLOT[k];
          const wobble = Math.sin(performance.now() / 60 + s.x) * 0.08 * this.shake;
          this.drawBox(g, s.x, s.y, ARROW[k], false, wobble);
        }
        g.fillStyle = '#ffffff';
        g.font = 'bold 18px sans-serif';
        g.fillText('↑ ← → ↓ でおみくじを1つ選ぶ', 240, 640);
        g.fillStyle = '#ffd34d';
        g.fillRect(140, 660, 200 * Math.max(0, this.timer) / PICK_TIME, 6);
        return;
      }

      if (this.phase === 'open') {
        const s = SLOT[this.chosen];
        const p = 1 - Math.max(0, this.timer) / 1.2;
        this.drawBox(g, s.x + (240 - s.x) * p, s.y + (330 - s.y) * p, ARROW[this.chosen], true, Math.sin(p * 30) * 0.25);
        g.fillStyle = '#ffffff';
        g.font = 'bold 20px sans-serif';
        g.fillText('ガラガラ……', 240, 470);
        return;
      }

      this.renderSlip(g);
    }

    // 結果のおみくじの紙
    renderSlip(g) {
      const r = this.result, f = r.fortune;
      const x = 70, y = 110, w = 340, h = 540;
      g.fillStyle = '#fbf6e9';
      g.fillRect(x, y, w, h);
      g.strokeStyle = '#c0392b'; g.lineWidth = 4;
      g.strokeRect(x + 8, y + 8, w - 16, h - 16);
      g.textAlign = 'center';
      g.fillStyle = '#c0392b';
      g.font = 'bold 16px sans-serif';
      g.fillText('― 運勢 ―', 240, y + 44);
      g.font = 'bold 88px serif';
      g.fillStyle = ['凶', '大凶'].includes(f.name) ? '#4a3a6a' : '#c0392b';
      g.fillText(f.name, 240, y + 150);

      g.strokeStyle = '#d8c8a8'; g.lineWidth = 1;
      g.beginPath(); g.moveTo(x + 30, y + 190); g.lineTo(x + w - 30, y + 190); g.stroke();

      g.textAlign = 'left';
      g.fillStyle = '#5a3a2a';
      g.font = 'bold 17px sans-serif';
      g.fillText('ラッキーカラー', x + 34, y + 228);
      g.fillStyle = r.color;
      g.fillRect(x + 190, y + 212, 22, 22);
      g.strokeStyle = '#5a3a2a'; g.lineWidth = 1;
      g.strokeRect(x + 190, y + 212, 22, 22);
      g.fillStyle = '#2a1a10';
      g.fillText(r.colorName, x + 220, y + 228);
      g.fillStyle = '#5a3a2a';
      g.fillText('ラッキーナンバー', x + 34, y + 268);
      g.fillStyle = '#2a1a10';
      g.font = 'bold 24px sans-serif';
      g.fillText(String(r.number), x + 220, y + 270);

      g.beginPath(); g.moveTo(x + 30, y + 300); g.lineTo(x + w - 30, y + 300); g.stroke();
      g.textAlign = 'center';
      g.fillStyle = '#5a3a2a';
      g.font = 'bold 15px sans-serif';
      g.fillText('一言', 240, y + 330);
      g.fillStyle = '#2a1a10';
      g.font = 'bold 19px sans-serif';
      // 長いコメントは「上手く行く可能性がある」の前で折り返す
      const head = r.comment.replace('上手く行く可能性がある', '');
      if (g.measureText(r.comment).width > w - 50) {
        g.fillText(`「${head}`, 240, y + 364);
        g.fillText('上手く行く可能性がある」', 240, y + 392);
      } else {
        g.fillText(`「${r.comment}」`, 240, y + 372);
      }

      g.fillStyle = f.color === '#c9cde8' ? '#6a6a7a' : f.color;
      g.fillRect(x + 30, y + 430, w - 60, 54);
      g.fillStyle = '#1a0d10';
      g.font = 'bold 18px sans-serif';
      g.fillText(`音ゲー：${f.note}`, 240, y + 464);

      g.fillStyle = '#e8c8a8';
      g.font = '13px sans-serif';
      g.fillText(`まもなく次のゲームへ（${Math.ceil(Math.max(0, this.timer))}）`, 240, 690);
    }
  }

  RG.SideGames.register({
    id: 'omikuji', name: 'おみくじ', oncePerPlay: true,
    controls: '↑ ← → ↓ でおみくじを選ぶ（1プレイに1度だけ）',
    create: ctx => new Omikuji(ctx),
  });
})();
