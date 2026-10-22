// 右半分のゲーム①：縦スクロールシューティング
//  - 敵は「10秒前に流れた曲」の強い音に合わせて出てくる（曲のオンセット + 遅延秒）
//  - 画面下まで逃げた敵は、逃げた位置（横方向）に対応するレーンの特典ブロックを攻撃する
//  - 左のコンボ報酬・GREAT以上の累計報酬はアイテムとして上から降ってくる
//  - 10体倒すごとに、左の壊れた特典ブロックを1個回復する
(function () {
  const ITEMS = {
    rapid: { label: 'R', color: '#ff5c8a', name: '連射' },
    spread: { label: 'S', color: '#5cd6ff', name: '拡散' },
    shield: { label: 'G', color: '#7cf29c', name: 'シールド' },
    bomb: { label: 'B', color: '#ffb84d', name: 'ボム' },
  };

  class Shooter extends RG.SideGame {
    constructor(ctx) {
      super(ctx);
      this.p = { x: this.w / 2, y: this.h - 80, r: 10 };
      this.shots = [];
      this.enemies = [];
      this.eShots = [];
      this.items = [];
      this.parts = [];
      this.msgs = [];
      this.stars = Array.from({ length: 70 }, () => ({
        x: Math.random() * this.w, y: Math.random() * this.h, v: 30 + Math.random() * 120,
      }));
      this.fireCd = 0;
      this.spread = 0;     // 0〜2
      this.rapid = 0;      // 残り秒
      this.shield = false;
      this.inv = 0;        // 無敵の残り秒
      this.score = 0;
      this.kills = 0;
      this.escaped = 0;
      this.time = 0;
    }

    start({ chart, songTime, delay }) {
      const s = this.config.shooter;
      this.spawns = [];
      let last = -Infinity;
      for (const o of (chart ? chart.onsets : [])) {
        if (o.strength < s.spawnMinStrength || o.time - last < s.spawnMinGap) continue;
        this.spawns.push({ time: o.time + delay, strength: o.strength });
        last = o.time;
      }
      this.spawnIdx = this.spawns.findIndex(sp => sp.time >= songTime);
      if (this.spawnIdx < 0) this.spawnIdx = this.spawns.length;
      this.msg('START!', '#e8eaf6');
    }

    msg(text, color) {
      this.msgs.push({ text, color, age: 0 });
      if (this.msgs.length > 4) this.msgs.shift();
    }

    spawnEnemy(sp) {
      const big = sp.strength >= this.config.shooter.bigEnemyStrength;
      const x = 40 + Math.random() * (this.w - 80);
      this.enemies.push(big
        ? { x, bx: x, y: -30, r: 22, hp: 4, vy: 60, amp: 20, freq: 1.2, age: 0, big, cd: 1.0 }
        : { x, bx: x, y: -20, r: 13, hp: 1, vy: 100 + sp.strength * 90, amp: 30 + Math.random() * 40, freq: 2 + Math.random() * 2, age: 0, big, cd: Infinity });
    }

    burst(x, y, color, n = 10) {
      for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI * 2, v = 60 + Math.random() * 180;
        this.parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 0.5, color });
      }
    }

    killEnemy(e, color, particles) {
      this.kills++;
      this.score += e.big ? 500 : 100;
      this.burst(e.x, e.y, color, particles);
      const every = this.config.shooter.repairEveryKills;
      if (every > 0 && this.kills % every === 0) {
        this.bus.emit('side:repair', { count: 1, source: 'shooter' });
        this.msg(`${this.kills}体撃破! 左のブロックを回復`, '#3ddc84');
      }
    }

    hitPlayer() {
      if (this.inv > 0) return;
      if (this.shield) { this.shield = false; this.msg('シールド消失', '#7cf29c'); }
      else if (this.spread > 0) { this.spread--; this.msg('パワーダウン', '#ff6b6b'); }
      this.inv = 1.5;
      this.burst(this.p.x, this.p.y, '#ffffff', 14);
    }

    update(dt, t) {
      const s = this.config.shooter, inp = this.input, p = this.p;
      this.time += dt;

      // 移動
      const dx = (inp.isDown('ArrowRight') ? 1 : 0) - (inp.isDown('ArrowLeft') ? 1 : 0);
      const dy = (inp.isDown('ArrowDown') ? 1 : 0) - (inp.isDown('ArrowUp') ? 1 : 0);
      const len = Math.hypot(dx, dy) || 1;
      p.x = Math.max(16, Math.min(this.w - 16, p.x + dx / len * s.playerSpeed * dt));
      p.y = Math.max(40, Math.min(this.h - 24, p.y + dy / len * s.playerSpeed * dt));

      // 自動射撃
      this.fireCd -= dt;
      if (this.fireCd <= 0) {
        this.fireCd = this.rapid > 0 ? s.rapidFireInterval : s.fireInterval;
        const angles = [[0], [-0.15, 0, 0.15], [-0.3, -0.15, 0, 0.15, 0.3]][this.spread];
        for (const a of angles) this.shots.push({ x: p.x, y: p.y - 14, vx: Math.sin(a) * 720, vy: -Math.cos(a) * 720 });
      }
      this.rapid = Math.max(0, this.rapid - dt);
      this.inv = Math.max(0, this.inv - dt);

      // 敵の出現（曲のリズムに合わせて）
      while (this.spawnIdx < this.spawns.length && this.spawns[this.spawnIdx].time <= t) {
        this.spawnEnemy(this.spawns[this.spawnIdx++]);
      }

      for (const st of this.stars) { st.y += st.v * dt; if (st.y > this.h) { st.y = 0; st.x = Math.random() * this.w; } }
      for (const b of this.shots) { b.x += b.vx * dt; b.y += b.vy * dt; }
      for (const b of this.eShots) { b.x += b.vx * dt; b.y += b.vy * dt; }

      for (const e of this.enemies) {
        e.age += dt;
        e.y += e.vy * dt;
        e.x = e.bx + Math.sin(e.age * e.freq) * e.amp;
        e.cd -= dt;
        if (e.cd <= 0 && e.y < p.y - 60) {
          e.cd = 1.6;
          const a = Math.atan2(p.y - e.y, p.x - e.x);
          this.eShots.push({ x: e.x, y: e.y, vx: Math.cos(a) * 200, vy: Math.sin(a) * 200 });
        }
      }

      // 当たり判定：自弾 × 敵
      for (const b of this.shots) {
        for (const e of this.enemies) {
          if (e.hp > 0 && Math.hypot(b.x - e.x, b.y - e.y) < e.r + 4) {
            e.hp--; b.dead = true;
            if (e.hp <= 0) this.killEnemy(e, e.big ? '#ffb84d' : '#ff5c8a', e.big ? 20 : 10);
            break;
          }
        }
      }
      // 敵・敵弾 × 自機
      for (const e of this.enemies) if (e.hp > 0 && Math.hypot(e.x - p.x, e.y - p.y) < e.r + p.r) { this.hitPlayer(); e.hp = 0; this.burst(e.x, e.y, '#ff5c8a'); }
      for (const b of this.eShots) if (Math.hypot(b.x - p.x, b.y - p.y) < p.r + 4) { this.hitPlayer(); b.dead = true; }

      // 撃ち漏らし → 左の音ゲーへ攻撃
      for (const e of this.enemies) {
        if (e.hp > 0 && e.y > this.h + e.r) {
          e.hp = 0;
          this.escaped++;
          const lane = Math.max(0, Math.min(this.config.lanes - 1, Math.floor(e.x / this.w * this.config.lanes)));
          this.bus.emit('side:attack', { power: e.big ? 2 : 1, lane, source: 'shooter' });
          this.msg('撃ち漏らし! 特典ブロックに攻撃', '#ff6b6b');
        }
      }

      // アイテム
      for (const it of this.items) {
        it.y += 110 * dt;
        if (Math.hypot(it.x - p.x, it.y - p.y) < 26) { it.dead = true; this.applyItem(it.type); }
        if (it.y > this.h + 20) it.dead = true;
      }

      for (const q of this.parts) { q.x += q.vx * dt; q.y += q.vy * dt; q.life -= dt; }
      for (const m of this.msgs) m.age += dt;

      const inside = o => o.x > -40 && o.x < this.w + 40 && o.y > -60 && o.y < this.h + 40;
      this.shots = this.shots.filter(b => !b.dead && inside(b));
      this.eShots = this.eShots.filter(b => !b.dead && inside(b));
      this.enemies = this.enemies.filter(e => e.hp > 0);
      this.items = this.items.filter(i => !i.dead);
      this.parts = this.parts.filter(q => q.life > 0);
      this.msgs = this.msgs.filter(m => m.age < 1.6);
    }

    // コンボ報酬：5回に1回はボム。GREAT以上の累計報酬：連射・拡散・シールドのどれか
    receiveReward({ kind, level }) {
      const basic = ['rapid', 'spread', 'shield'][Math.floor(Math.random() * 3)];
      const type = kind === 'combo' && level % 5 === 0 ? 'bomb' : basic;
      this.items.push({ x: 50 + Math.random() * (this.w - 100), y: -20, type });
      this.msg(`${kind === 'accuracy' ? 'GREAT報酬' : 'コンボ報酬'}: ${ITEMS[type].name}`, ITEMS[type].color);
    }

    applyItem(type) {
      if (type === 'rapid') this.rapid = this.config.shooter.rapidDuration;
      if (type === 'spread') this.spread = Math.min(2, this.spread + 1);
      if (type === 'shield') this.shield = true;
      if (type === 'bomb') {
        for (const e of this.enemies) this.killEnemy(e, '#ffb84d', 12);
        this.enemies = [];
        this.eShots = [];
      }
      this.msg(`${ITEMS[type].name} GET!`, ITEMS[type].color);
    }

    getResult() {
      return { 'スコア': this.score, '撃破': this.kills, '撃ち漏らし': this.escaped };
    }

    render(g) {
      const p = this.p;
      g.fillStyle = '#05060c';
      g.fillRect(0, 0, this.w, this.h);
      g.fillStyle = '#6a70a0';
      for (const st of this.stars) g.fillRect(st.x, st.y, st.v > 100 ? 2 : 1, st.v > 100 ? 2 : 1);

      // 下端の危険ライン（ここを越えた敵が左を攻撃）
      g.fillStyle = 'rgba(255,77,77,0.18)';
      g.fillRect(0, this.h - 6, this.w, 6);
      g.strokeStyle = 'rgba(255,77,77,0.25)';
      for (let l = 1; l < this.config.lanes; l++) {
        const x = l * this.w / this.config.lanes;
        g.beginPath(); g.moveTo(x, this.h - 16); g.lineTo(x, this.h); g.stroke();
      }

      g.fillStyle = '#ffe066';
      for (const b of this.shots) g.fillRect(b.x - 2, b.y - 8, 4, 12);

      for (const e of this.enemies) {
        g.fillStyle = e.big ? '#ffb84d' : '#ff5c8a';
        g.beginPath();
        g.moveTo(e.x, e.y + e.r);
        g.lineTo(e.x - e.r, e.y - e.r * 0.6);
        g.lineTo(e.x + e.r, e.y - e.r * 0.6);
        g.closePath();
        g.fill();
        if (e.big) { g.fillStyle = '#fff'; g.fillRect(e.x - 10, e.y - e.r - 8, 20 * e.hp / 4, 3); }
      }

      g.fillStyle = '#ff8080';
      for (const b of this.eShots) { g.beginPath(); g.arc(b.x, b.y, 4, 0, Math.PI * 2); g.fill(); }

      for (const it of this.items) {
        const d = ITEMS[it.type];
        g.fillStyle = d.color;
        RG.roundRect(g, it.x - 14, it.y - 10, 28, 20, 8);
        g.fill();
        g.fillStyle = '#05060c';
        g.font = 'bold 14px sans-serif';
        g.textAlign = 'center';
        g.fillText(d.label, it.x, it.y + 5);
      }

      // 自機
      if (this.inv <= 0 || Math.floor(this.inv * 12) % 2 === 0) {
        g.fillStyle = this.rapid > 0 ? '#ff9ec0' : '#5cd6ff';
        g.beginPath();
        g.moveTo(p.x, p.y - 16);
        g.lineTo(p.x - 12, p.y + 12);
        g.lineTo(p.x, p.y + 6);
        g.lineTo(p.x + 12, p.y + 12);
        g.closePath();
        g.fill();
        if (this.shield) {
          g.strokeStyle = '#7cf29c';
          g.lineWidth = 2;
          g.beginPath(); g.arc(p.x, p.y, 22, 0, Math.PI * 2); g.stroke();
        }
      }

      for (const q of this.parts) {
        g.globalAlpha = Math.max(0, q.life / 0.5);
        g.fillStyle = q.color;
        g.fillRect(q.x - 2, q.y - 2, 4, 4);
      }
      g.globalAlpha = 1;

      // HUD
      g.textAlign = 'left';
      g.fillStyle = '#e8eaf6';
      g.font = 'bold 18px sans-serif';
      g.fillText(`SCORE ${this.score}`, 12, 26);
      g.font = '13px sans-serif';
      g.fillStyle = '#9aa0c3';
      const status = [`撃破 ${this.kills}`, `撃ち漏らし ${this.escaped}`, `拡散Lv${this.spread}`];
      if (this.rapid > 0) status.push(`連射 ${this.rapid.toFixed(0)}s`);
      if (this.shield) status.push('シールド');
      g.fillText(status.join('  '), 12, 46);
      const every = this.config.shooter.repairEveryKills;
      if (every > 0) {
        g.fillStyle = '#3ddc84';
        g.fillText(`左のブロック回復まで あと${every - this.kills % every}体`, 12, 64);
      }

      g.textAlign = 'center';
      this.msgs.forEach((m, i) => {
        g.globalAlpha = Math.max(0, 1 - m.age / 1.6);
        g.fillStyle = m.color;
        g.font = 'bold 18px sans-serif';
        g.fillText(m.text, this.w / 2, 140 + i * 24 - m.age * 10);
      });
      g.globalAlpha = 1;
    }
  }

  RG.SideGames.register({ id: 'shooter', name: 'シューティング', controls: '矢印キーで移動（自動で撃つ）', create: ctx => new Shooter(ctx) });
})();
