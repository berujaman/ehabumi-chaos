// 右半分のゲーム②：ブロック崩し（← → でパドル移動）
//  - 曲の強い音（10秒前に流れたもの）に合わせて、上から新しいブロックの列が押し込んでくる
//  - 列が赤い線まで下りてくる、またはボールを落とすと、左の特典ブロックを攻撃
//  - ブロックを10個壊すごとに、左の壊れた特典ブロックを1個回復
//  - 左の音ゲーで GREAT 以上が出るたびにボールの貫通力が1上がる（最大5）。MISS が出ると1下がる（最小0）。
//    貫通力の数だけブロックを跳ね返らずに突き抜け、パドルで打ち返すと貫通の残りが元に戻る
//  - 左からの報酬：ワイド（パドル拡大）/ マルチ（ボール追加）/ スロー（ボールが遅く）/ 5回目のコンボ報酬はボム（一番下の列を消す）
(function () {
  const COLS = 8, BW = 52, BH = 18, GAP = 4, ROW_H = BH + GAP;
  const X0 = (480 - COLS * (BW + GAP) + GAP) / 2;
  const PADDLE_Y = 660, DANGER_Y = 560;
  const MAX_PIERCE = 5;
  const PIERCE_COLORS = ['#ffffff', '#ffe9a8', '#ffd34d', '#ffb84d', '#ff8a3d', '#ff4d4d'];  // 貫通力 0〜5 のボールの色
  const ROW_COLORS = ['#ff5c8a', '#ffb84d', '#ffe066', '#7cf29c', '#5cd6ff', '#9d7bff'];
  const ITEMS = {
    wide: { name: 'ワイド', color: '#5cd6ff' },
    multi: { name: 'マルチボール', color: '#ff5c8a' },
    slow: { name: 'スロー', color: '#7cf29c' },
    bomb: { name: 'ボム', color: '#ffb84d' },
  };

  class Breakout extends RG.SideGame {
    constructor(ctx) {
      super(ctx);
      this.paddleX = 240;
      this.rows = [];
      this.balls = [];
      this.parts = [];
      this.msgs = [];
      this.wide = 0;
      this.slow = 0;
      this.respawn = 0.6;
      this.colorIdx = 0;
      this.broken = 0;
      this.dropped = 0;
      this.pushedIn = 0;
      this.score = 0;
      this.pierce = 0;
      this.pierced = 0;
      // 音ゲーの判定を聞いて、GREAT 以上なら貫通力を上げ、MISS なら下げる
      this.offJudge = this.bus.on('rhythm:judge', p => {
        if (p.result === 'perfect' || p.result === 'great') this.addPierce();
        else if (p.result === 'miss') this.lowerPierce();
      });
      for (let i = 0; i < 7; i++) this.addRow(80 + i * ROW_H);
    }

    start(info) {
      // 列が押し込んでくる間隔は最低3秒（曲の強い音に合わせる）
      this.schedule = this.makeSchedule(info, { minGap: 3.0, minStrength: 0.45 });
      this.msg('START!', '#e8eaf6');
    }

    destroy() { this.offJudge(); }

    addPierce() {
      if (this.pierce >= MAX_PIERCE) return;
      this.pierce++;
      for (const b of this.balls) b.pierceLeft = Math.min(this.pierce, b.pierceLeft + 1);
      if (this.pierce === MAX_PIERCE) this.msg('貫通力 MAX!', PIERCE_COLORS[MAX_PIERCE]);
    }

    lowerPierce() {
      if (this.pierce <= 0) return;
      this.pierce--;
      for (const b of this.balls) b.pierceLeft = Math.min(this.pierce, b.pierceLeft);
      this.msg('MISS → 貫通力ダウン', '#8fa0d8');
    }

    msg(text, color) {
      this.msgs.push({ text, color, age: 0 });
      if (this.msgs.length > 4) this.msgs.shift();
    }

    addRow(y) {
      const color = ROW_COLORS[this.colorIdx++ % ROW_COLORS.length];
      this.rows.push({ y, color, bricks: new Array(COLS).fill(true) });
    }

    // 上から1列押し込む（既存の列は1段下がる）
    pushRow() {
      for (const r of this.rows) r.y += ROW_H;
      this.addRow(80);
    }

    get paddleW() { return this.wide > 0 ? 130 : 80; }
    get ballSpeed() { return this.slow > 0 ? 260 : 380; }

    launchBall(x, angle) {
      const a = angle ?? (-Math.PI / 2 + (Math.random() - 0.5) * 0.8);
      this.balls.push({ x, y: PADDLE_Y - 12, vx: Math.cos(a), vy: Math.sin(a), pierceLeft: this.pierce });
    }

    laneOf(x) {
      return Math.max(0, Math.min(this.config.lanes - 1, Math.floor(x / this.w * this.config.lanes)));
    }

    breakBrick(row, col) {
      row.bricks[col] = false;
      this.broken++;
      this.score += 50;
      const x = X0 + col * (BW + GAP) + BW / 2, y = row.y + BH / 2;
      for (let i = 0; i < 6; i++) {
        const a = Math.random() * Math.PI * 2;
        this.parts.push({ x, y, vx: Math.cos(a) * 120, vy: Math.sin(a) * 120, life: 0.4, color: row.color });
      }
      if (this.broken % 10 === 0) {
        this.bus.emit('side:repair', { count: 1, source: 'breakout' });
        this.msg(`${this.broken}個破壊! 左のブロックを回復`, '#3ddc84');
      }
    }

    update(dt, t) {
      const inp = this.input;
      const dir = (inp.isDown('ArrowRight') ? 1 : 0) - (inp.isDown('ArrowLeft') ? 1 : 0);
      const half = this.paddleW / 2;
      this.paddleX = Math.max(half, Math.min(this.w - half, this.paddleX + dir * 440 * dt));
      this.wide = Math.max(0, this.wide - dt);
      this.slow = Math.max(0, this.slow - dt);

      for (const _ of this.schedule.pop(t)) this.pushRow();

      // 赤い線まで下りてきた列は左を攻撃して消える
      for (const r of this.rows) {
        const alive = r.bricks.map((b, i) => (b ? i : -1)).filter(i => i >= 0);
        if (alive.length && r.y + BH > DANGER_Y) {
          const cx = X0 + (alive.reduce((s, i) => s + i, 0) / alive.length) * (BW + GAP) + BW / 2;
          this.bus.emit('side:attack', { power: 1, lane: this.laneOf(cx), source: 'breakout' });
          this.pushedIn++;
          this.msg('ブロックが押し込まれた! 左に攻撃', '#ff6b6b');
          r.bricks.fill(false);
        }
      }
      this.rows = this.rows.filter(r => r.bricks.some(Boolean));
      if (this.rows.length === 0) { this.pushRow(); this.pushRow(); }

      if (this.balls.length === 0) {
        this.respawn -= dt;
        if (this.respawn <= 0) { this.launchBall(this.paddleX); this.respawn = 1.0; }
      }

      const speed = this.ballSpeed;
      for (const b of this.balls) {
        b.x += b.vx * speed * dt;
        b.y += b.vy * speed * dt;
        if (b.x < 7) { b.x = 7; b.vx = Math.abs(b.vx); }
        if (b.x > this.w - 7) { b.x = this.w - 7; b.vx = -Math.abs(b.vx); }
        if (b.y < 40) { b.y = 40; b.vy = Math.abs(b.vy); }

        // パドル：当たった位置で跳ね返る角度が変わる
        if (b.vy > 0 && b.y + 7 >= PADDLE_Y && b.y + 7 <= PADDLE_Y + 14 && Math.abs(b.x - this.paddleX) <= half + 7) {
          const off = (b.x - this.paddleX) / half;
          const a = -Math.PI / 2 + off * 1.05;
          b.vx = Math.cos(a); b.vy = Math.sin(a);
          b.y = PADDLE_Y - 7;
          b.pierceLeft = this.pierce;
        }

        // ブロック
        hit:
        for (const r of this.rows) {
          if (b.y + 7 < r.y || b.y - 7 > r.y + BH) continue;
          for (let c = 0; c < COLS; c++) {
            if (!r.bricks[c]) continue;
            const bx = X0 + c * (BW + GAP);
            const nx = Math.max(bx, Math.min(b.x, bx + BW)), ny = Math.max(r.y, Math.min(b.y, r.y + BH));
            if ((b.x - nx) ** 2 + (b.y - ny) ** 2 > 49) continue;
            if (b.pierceLeft > 0) {
              // 貫通：跳ね返らずに突き抜ける
              b.pierceLeft--;
              this.pierced++;
            } else {
              const overlapX = Math.min(b.x + 7 - bx, bx + BW - (b.x - 7));
              const overlapY = Math.min(b.y + 7 - r.y, r.y + BH - (b.y - 7));
              if (overlapX < overlapY) b.vx = -b.vx; else b.vy = -b.vy;
            }
            this.breakBrick(r, c);
            break hit;
          }
        }

        if (b.y > this.h + 10) {
          b.dead = true;
          this.dropped++;
          this.bus.emit('side:attack', { power: 1, lane: this.laneOf(b.x), source: 'breakout' });
          this.msg('ボールを落とした! 左に攻撃', '#ff6b6b');
        }
      }
      this.balls = this.balls.filter(b => !b.dead);

      for (const q of this.parts) { q.x += q.vx * dt; q.y += q.vy * dt; q.life -= dt; }
      this.parts = this.parts.filter(q => q.life > 0);
      for (const m of this.msgs) m.age += dt;
      this.msgs = this.msgs.filter(m => m.age < 1.6);
    }

    receiveReward({ kind, level }) {
      const type = kind === 'combo' && level % 5 === 0 ? 'bomb' : ['wide', 'multi', 'slow'][Math.floor(Math.random() * 3)];
      if (type === 'wide') this.wide = 12;
      if (type === 'slow') this.slow = 10;
      if (type === 'multi') {
        const from = this.balls[0] || { x: this.paddleX };
        this.launchBall(from.x, -Math.PI / 2 - 0.5);
        this.launchBall(from.x, -Math.PI / 2 + 0.5);
      }
      if (type === 'bomb') {
        const lowest = this.rows.reduce((a, r) => (!a || r.y > a.y ? r : a), null);
        if (lowest) lowest.bricks.forEach((b, c) => { if (b) this.breakBrick(lowest, c); });
      }
      this.msg(`${kind === 'accuracy' ? 'GREAT報酬' : 'コンボ報酬'}: ${ITEMS[type].name}`, ITEMS[type].color);
    }

    getResult() {
      return { 'スコア': this.score, '壊したブロック': this.broken, '貫通で壊した数': this.pierced, 'ボールを落とした': this.dropped, '押し込まれた列': this.pushedIn };
    }

    render(g) {
      g.fillStyle = '#05060c';
      g.fillRect(0, 0, this.w, this.h);

      // 危険ライン
      g.strokeStyle = 'rgba(255,77,77,0.6)';
      g.setLineDash([8, 6]);
      g.beginPath(); g.moveTo(0, DANGER_Y); g.lineTo(this.w, DANGER_Y); g.stroke();
      g.setLineDash([]);

      for (const r of this.rows) {
        r.bricks.forEach((b, c) => {
          if (!b) return;
          const x = X0 + c * (BW + GAP);
          g.fillStyle = r.color;
          RG.roundRect(g, x, r.y, BW, BH, 4);
          g.fill();
          g.fillStyle = 'rgba(255,255,255,0.35)';
          g.fillRect(x + 4, r.y + 3, BW - 8, 3);
        });
      }

      g.fillStyle = this.wide > 0 ? '#5cd6ff' : '#e8eaf6';
      RG.roundRect(g, this.paddleX - this.paddleW / 2, PADDLE_Y, this.paddleW, 12, 6);
      g.fill();

      // ボール：貫通の残りが多いほど赤く光る（スロー中は緑の縁）
      for (const b of this.balls) {
        const lv = Math.max(0, Math.min(MAX_PIERCE, b.pierceLeft));
        if (lv > 0) {
          g.fillStyle = PIERCE_COLORS[lv] + '55';
          g.beginPath(); g.arc(b.x, b.y, 9 + lv * 1.6, 0, Math.PI * 2); g.fill();
        }
        g.fillStyle = PIERCE_COLORS[lv];
        g.beginPath(); g.arc(b.x, b.y, 7, 0, Math.PI * 2); g.fill();
        if (this.slow > 0) { g.strokeStyle = '#7cf29c'; g.lineWidth = 2; g.stroke(); }
      }

      for (const q of this.parts) {
        g.globalAlpha = Math.max(0, q.life / 0.4);
        g.fillStyle = q.color;
        g.fillRect(q.x - 2, q.y - 2, 4, 4);
      }
      g.globalAlpha = 1;

      g.textAlign = 'left';
      g.fillStyle = '#e8eaf6';
      g.font = 'bold 18px sans-serif';
      g.fillText(`SCORE ${this.score}`, 12, 26);
      g.font = '13px sans-serif';
      g.fillStyle = '#9aa0c3';
      const status = [`破壊 ${this.broken}`, `落下 ${this.dropped}`];
      if (this.wide > 0) status.push(`ワイド ${Math.ceil(this.wide)}s`);
      if (this.slow > 0) status.push(`スロー ${Math.ceil(this.slow)}s`);
      g.fillText(status.join('  '), 12, 46);
      g.fillStyle = '#3ddc84';
      g.fillText(`左のブロック回復まで あと${10 - this.broken % 10}個`, 12, 64);
      // 貫通力のメーター（音ゲーで GREAT 以上が出るたびに増える）
      g.textAlign = 'right';
      g.fillStyle = '#e8eaf6';
      g.font = 'bold 13px sans-serif';
      g.fillText(`貫通力 ${this.pierce}/${MAX_PIERCE}`, 468 - MAX_PIERCE * 14 - 6, 46);
      for (let i = 0; i < MAX_PIERCE; i++) {
        g.fillStyle = i < this.pierce ? PIERCE_COLORS[i + 1] : '#2a2f52';
        g.fillRect(468 - (MAX_PIERCE - i) * 14, 36, 11, 11);
      }
      g.fillStyle = '#6a70a0';
      g.textAlign = 'center';
      g.fillText('← → パドル移動　／　音ゲーの GREAT 以上で貫通力アップ・MISS でダウン', 240, 705);

      g.textAlign = 'center';
      this.msgs.forEach((m, i) => {
        g.globalAlpha = Math.max(0, 1 - m.age / 1.6);
        g.fillStyle = m.color;
        g.font = 'bold 18px sans-serif';
        g.fillText(m.text, 240, 420 + i * 24 - m.age * 10);
      });
      g.globalAlpha = 1;
    }
  }

  RG.SideGames.register({ id: 'breakout', name: 'ブロック崩し', controls: '← → でパドル移動', create: ctx => new Breakout(ctx) });
})();
