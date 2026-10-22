// 右半分のゲーム③：格闘ゲーム
//  操作（矢印キーのみ）
//   ← →：移動　↑：ジャンプ　↓：攻撃
//   相手と逆の方向を押している間：ガード（後ろに下がりながら防ぐ）
//   相手の方向を押しながら ↓：踏み込み攻撃（相手のガードの上からでもダメージ。ただし次の攻撃まで少し長い）
//  ルール
//  - 敵は曲の強い音（10秒前に流れたもの）に合わせて攻撃してくる。攻撃の前に「!」が出る
//    → ガードするかジャンプでかわす。「!」の間に攻撃を当てるとカウンター（攻撃を止めて1.5倍）
//  - 敵もガードする。普通の攻撃は防がれるので、踏み込み攻撃でガードを崩す
//  - 攻撃を受けると左の特典ブロックを攻撃される（体力が尽きると2個）
//  - 敵をKOすると、左の壊れた特典ブロックを2個回復。次の敵は少し強くなる
//  - 左からの報酬：パワー（攻撃2倍）/ 回復（体力+30）/ アーマー（次の1発を無効）/ 5回目のコンボ報酬は必殺技
(function () {
  const FLOOR = 600, BODY_W = 44, BODY_H = 96;
  const GRAVITY = 1500, JUMP_V = 560, AIR_DODGE = 30;  // AIR_DODGE: この高さ以上なら敵の攻撃が当たらない
  const ATTACK = {
    normal: { active: 0.18, cd: 0.30, dmg: 8, reach: 62, lunge: 0 },
    breaker: { active: 0.22, cd: 0.50, dmg: 8, reach: 66, lunge: 24 },
  };
  const ITEMS = {
    power: { name: 'パワー', color: '#ff5c8a' },
    heal: { name: '回復', color: '#7cf29c' },
    armor: { name: 'アーマー', color: '#5cd6ff' },
    super: { name: '必殺技', color: '#ffb84d' },
  };

  class Fighter extends RG.SideGame {
    constructor(ctx) {
      super(ctx);
      this.p = { x: 140, y: 0, vy: 0, hp: 100, atk: 0, cd: 0, stun: 0, flash: 0, type: 'normal' };
      this.round = 1;
      this.newEnemy();
      this.power = 0;
      this.armor = false;
      this.msgs = [];
      this.sparks = [];
      this.kos = 0; this.hits = 0; this.counters = 0; this.breaks = 0;
      this.blocked = 0; this.taken = 0; this.guarded = 0; this.dodged = 0;
      this.score = 0;
    }

    newEnemy() {
      const maxHp = 80 + this.round * 20;
      this.e = {
        x: 340, hp: maxHp, maxHp, windup: 0, atk: 0, stun: 0, flash: 0, ko: 0, guard: 0,
        dmg: 10 + this.round * 2,
        guardRate: Math.min(0.9, 0.35 + this.round * 0.1),   // 1秒あたりに自分からガードを固める確率
        reactRate: Math.min(0.6, 0.2 + this.round * 0.05),   // 普通の攻撃を見てとっさにガードする確率
      };
    }

    start(info) {
      this.schedule = this.makeSchedule(info, { minGap: 1.1, minStrength: 0.4 });
      this.msg(`ROUND ${this.round}  FIGHT!`, '#e8eaf6');
    }

    msg(text, color) {
      this.msgs.push({ text, color, age: 0 });
      if (this.msgs.length > 4) this.msgs.shift();
    }

    spark(x, y, color) {
      for (let i = 0; i < 10; i++) {
        const a = Math.random() * Math.PI * 2, v = 80 + Math.random() * 160;
        this.sparks.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 0.35, color });
      }
    }

    get facing() { return this.e.x >= this.p.x ? 1 : -1; }   // 相手のいる方向（1=右）
    get towardKey() { return this.facing > 0 ? 'ArrowRight' : 'ArrowLeft'; }
    get backKey() { return this.facing > 0 ? 'ArrowLeft' : 'ArrowRight'; }
    get onGround() { return this.p.y <= 0; }
    get guarding() {
      const p = this.p;
      return this.input.isDown(this.backKey) && p.stun <= 0 && p.atk <= 0 && this.onGround;
    }

    onKey(code) {
      const p = this.p;
      if (p.stun > 0) return;
      if (code === 'ArrowUp' && this.onGround) p.vy = JUMP_V;
      if (code === 'ArrowDown' && p.cd <= 0) {
        // 相手の方向を押しながらなら踏み込み攻撃（ガードの上からでも当たる）
        const type = this.input.isDown(this.towardKey) ? 'breaker' : 'normal';
        const a = ATTACK[type];
        p.type = type;
        p.atk = a.active;
        p.cd = a.cd;
        p.hitDone = false;
        p.x += this.facing * a.lunge;
        // 普通の攻撃は、敵がとっさにガードすることがある
        const e = this.e;
        if (type === 'normal' && e.windup <= 0 && e.atk <= 0 && e.stun <= 0 && e.ko <= 0 && Math.random() < e.reactRate) {
          e.guard = Math.max(e.guard, 0.5);
        }
      }
    }

    update(dt, t) {
      const p = this.p, e = this.e;
      p.cd = Math.max(0, p.cd - dt);
      p.stun = Math.max(0, p.stun - dt);
      p.flash = Math.max(0, p.flash - dt);
      e.stun = Math.max(0, e.stun - dt);
      e.flash = Math.max(0, e.flash - dt);
      e.guard = Math.max(0, e.guard - dt);
      this.power = Math.max(0, this.power - dt);

      // プレイヤー移動：← → で歩く（ガード中＝後ろに下がる時は遅め）、↑ でジャンプ
      const side = e.x >= p.x ? 1 : -1;
      if (p.stun <= 0) {
        const dir = (this.input.isDown('ArrowRight') ? 1 : 0) - (this.input.isDown('ArrowLeft') ? 1 : 0);
        const speed = this.guarding ? 140 : 230;
        if (p.atk <= 0 || !this.onGround) p.x += dir * speed * dt;
      }
      if (!this.onGround || p.vy > 0) {
        p.y += p.vy * dt;
        p.vy -= GRAVITY * dt;
        if (p.y <= 0) { p.y = 0; p.vy = 0; }
      }
      p.x = Math.max(40, Math.min(this.w - 40, p.x));
      if (this.onGround) this.keepApart(side);  // ジャンプ中は相手を飛び越えられる

      // プレイヤーの攻撃判定
      if (p.atk > 0) {
        p.atk -= dt;
        const a = ATTACK[p.type];
        if (!p.hitDone && e.ko <= 0 && Math.abs(e.x - p.x) < BODY_W / 2 + a.reach) {
          p.hitDone = true;
          this.resolvePlayerAttack(p.type);
        }
      }

      // 敵KO演出 → 次の敵
      if (e.ko > 0) {
        e.ko -= dt;
        if (e.ko <= 0) { this.round++; this.newEnemy(); this.msg(`ROUND ${this.round}  FIGHT!`, '#e8eaf6'); }
        this.tickFx(dt);
        return;
      }

      // 敵のAI：距離を保ちつつ近づく。近くにいると時々ガードを固める
      const dist = Math.abs(e.x - p.x);
      const idle = e.stun <= 0 && e.windup <= 0 && e.atk <= 0;
      if (idle && e.guard <= 0) {
        const want = dist > 90 ? -1 : dist < 60 ? 1 : 0;
        e.x += want * this.facing * 120 * dt;
        if (dist < 120 && Math.random() < e.guardRate * dt) e.guard = 0.8 + Math.random() * 0.6;
      }
      e.x = Math.max(40, Math.min(this.w - 40, e.x));
      if (this.onGround) this.keepApart(e.x >= p.x ? 1 : -1);

      // 曲の強い音で攻撃の構え（「!」）→ 0.45 秒後に攻撃。ガード中でも構えに移る
      for (const _ of this.schedule.pop(t)) {
        if (e.windup <= 0 && e.atk <= 0 && e.stun <= 0) { e.windup = 0.45; e.guard = 0; }
      }
      if (e.windup > 0) {
        e.windup -= dt;
        if (e.windup <= 0) { e.atk = 0.15; e.hitDone = false; e.x -= this.facing * 26; }
      }
      if (e.atk > 0) {
        e.atk -= dt;
        if (!e.hitDone && Math.abs(e.x - p.x) < BODY_W / 2 + 70) {
          e.hitDone = true;
          this.playerHit(e.dmg);
        }
      }
      this.tickFx(dt);
    }

    resolvePlayerAttack(type) {
      const e = this.e, a = ATTACK[type];
      const counter = e.windup > 0;
      const mult = (this.power > 0 ? 2 : 1) * (counter ? 1.5 : 1);
      if (e.guard > 0 && !counter) {
        if (type === 'breaker') {
          // 踏み込み攻撃はガードの上から当たり、ガードを崩す
          e.guard = 0;
          e.stun = 0.4;
          this.breaks++;
          this.hits++;
          this.damageEnemy(a.dmg * mult * 1.25, '#ff9a3d');
          this.msg('ガードブレイク!', '#ff9a3d');
        } else {
          this.blocked++;
          this.damageEnemy(1, '#9aa0c3');
          this.msg('防がれた → 相手の方向＋↓で崩せ', '#9aa0c3');
        }
        e.x += this.facing * 10;
        return;
      }
      this.hits++;
      this.damageEnemy(a.dmg * mult, counter ? '#ffe066' : '#ffffff');
      if (counter) { this.counters++; e.windup = 0; this.msg('COUNTER!', '#ffe066'); }
      e.stun = 0.25;
      e.x += this.facing * 18;
    }

    // 2人が重ならないよう押し戻す（壁際なら相手側を動かす）
    keepApart(side) {
      const p = this.p, e = this.e;
      if ((e.x - p.x) * side >= BODY_W) return;
      p.x = e.x - side * BODY_W;
      if (p.x < 40 || p.x > this.w - 40) {
        p.x = Math.max(40, Math.min(this.w - 40, p.x));
        e.x = p.x + side * BODY_W;
      }
    }

    tickFx(dt) {
      for (const s of this.sparks) { s.x += s.vx * dt; s.y += s.vy * dt; s.life -= dt; }
      this.sparks = this.sparks.filter(s => s.life > 0);
      for (const m of this.msgs) m.age += dt;
      this.msgs = this.msgs.filter(m => m.age < 1.6);
    }

    damageEnemy(dmg, color) {
      const e = this.e;
      e.hp = Math.max(0, e.hp - dmg);
      e.flash = 0.12;
      this.score += Math.round(dmg * 10);
      this.spark(e.x, FLOOR - 60, color);
      if (e.hp <= 0 && e.ko <= 0) {
        e.ko = 1.6;
        e.windup = 0; e.atk = 0; e.guard = 0;
        this.kos++;
        this.score += 1000;
        this.bus.emit('side:repair', { count: 2, source: 'fighter' });
        this.msg('K.O.! 左のブロックを2個回復', '#3ddc84');
      }
    }

    playerHit(dmg) {
      const p = this.p;
      if (p.y >= AIR_DODGE) {
        this.dodged++;
        this.msg('ジャンプで回避!', '#5cd6ff');
        return;
      }
      if (this.guarding) {
        p.hp = Math.max(1, p.hp - 2);
        this.guarded++;
        this.spark(p.x + this.facing * 20, FLOOR - 60, '#5cd6ff');
        this.msg('GUARD!', '#5cd6ff');
        return;
      }
      if (this.armor) {
        this.armor = false;
        this.spark(p.x, FLOOR - 60, '#5cd6ff');
        this.msg('アーマーで無効!', '#5cd6ff');
        return;
      }
      p.hp -= dmg;
      p.stun = 0.35;
      p.flash = 0.2;
      p.atk = 0;
      p.x -= this.facing * 30;
      this.taken++;
      this.spark(p.x, FLOOR - 60, '#ff6b6b');
      if (p.hp <= 0) {
        p.hp = 100;
        this.bus.emit('side:attack', { power: 2, lane: null, source: 'fighter' });
        this.msg('ダウン! 左に大ダメージ', '#ff6b6b');
      } else {
        this.bus.emit('side:attack', { power: 1, lane: null, source: 'fighter' });
        this.msg('被弾! 左に攻撃', '#ff6b6b');
      }
    }

    receiveReward({ kind, level }) {
      const type = kind === 'combo' && level % 5 === 0 ? 'super' : ['power', 'heal', 'armor'][Math.floor(Math.random() * 3)];
      if (type === 'power') this.power = 10;
      if (type === 'heal') this.p.hp = Math.min(100, this.p.hp + 30);
      if (type === 'armor') this.armor = true;
      if (type === 'super' && this.e.ko <= 0) this.damageEnemy(40, '#ffb84d');
      this.msg(`${kind === 'accuracy' ? 'GREAT報酬' : 'コンボ報酬'}: ${ITEMS[type].name}`, ITEMS[type].color);
    }

    getResult() {
      return {
        'スコア': this.score, 'KO': this.kos, 'ヒット': this.hits, 'ガードブレイク': this.breaks,
        'カウンター': this.counters, '防がれた': this.blocked, 'ガード': this.guarded, '回避': this.dodged, '被弾': this.taken,
      };
    }

    drawBody(g, x, lift, color, face, opts) {
      const top = FLOOR - BODY_H - lift;
      const lean = opts.guard ? -face * 6 : 0;   // ガード中は少し後ろに反る
      g.fillStyle = opts.flash > 0 ? '#ffffff' : color;
      g.beginPath(); g.arc(x + lean, top + 14, 14, 0, Math.PI * 2); g.fill();
      RG.roundRect(g, x - 16 + lean / 2, top + 30, 32, 40, 6); g.fill();
      g.fillRect(x - 14, top + 66, 10, 30);
      g.fillRect(x + 4, top + 66, 10, 30);
      const armY = top + 40;
      if (opts.attack) {
        const len = opts.breaker ? 64 : 56;
        g.fillRect(face > 0 ? x + 14 : x - 14 - len, armY, len, 10);
        g.beginPath(); g.arc(x + face * (len + 16), armY + 5, opts.breaker ? 12 : 9, 0, Math.PI * 2); g.fill();
      } else if (opts.guard) {
        // 腕を立てて顔の前で構える
        g.fillRect(x + face * 16 - 5, armY - 26, 10, 36);
        g.fillRect(x + face * 6 - 5, armY - 20, 10, 30);
      } else {
        g.fillRect(face > 0 ? x + 12 : x - 12 - 20, armY, 20, 10);
      }
    }

    render(g) {
      const p = this.p, e = this.e, face = this.facing;
      const grd = g.createLinearGradient(0, 0, 0, this.h);
      grd.addColorStop(0, '#1a1030');
      grd.addColorStop(1, '#05060c');
      g.fillStyle = grd;
      g.fillRect(0, 0, this.w, this.h);
      g.fillStyle = '#2a2f52';
      g.fillRect(0, FLOOR, this.w, 4);
      g.fillStyle = '#10142a';
      g.fillRect(0, FLOOR + 4, this.w, this.h - FLOOR - 4);

      // 体力バー
      const bar = (x, w, ratio, color, label, alignRight) => {
        g.fillStyle = '#2a2f52';
        g.fillRect(x, 80, w, 14);
        g.fillStyle = color;
        const fw = w * Math.max(0, ratio);
        g.fillRect(alignRight ? x + w - fw : x, 80, fw, 14);
        g.fillStyle = '#e8eaf6';
        g.font = 'bold 13px sans-serif';
        g.textAlign = alignRight ? 'right' : 'left';
        g.fillText(label, alignRight ? x + w : x, 74);
      };
      bar(12, 200, p.hp / 100, '#5cd6ff', 'YOU' + (this.armor ? ' アーマー' : '') + (this.power > 0 ? ` パワー${Math.ceil(this.power)}s` : ''), false);
      bar(268, 200, e.hp / e.maxHp, '#ff5c8a', `ENEMY  R${this.round}`, true);

      // 影
      g.fillStyle = 'rgba(0,0,0,0.35)';
      g.beginPath(); g.ellipse(p.x, FLOOR + 2, 22 - Math.min(12, p.y / 10), 5, 0, 0, Math.PI * 2); g.fill();

      if (e.ko <= 0 || Math.floor(e.ko * 10) % 2 === 0) {
        this.drawBody(g, e.x, 0, e.windup > 0 ? '#ff9a3d' : '#ff5c8a', -face, { attack: e.atk > 0, guard: e.guard > 0, flash: e.flash });
      }
      this.drawBody(g, p.x, p.y, this.power > 0 ? '#ff9ec0' : '#5cd6ff', face,
        { attack: p.atk > 0, breaker: p.type === 'breaker', guard: this.guarding, flash: p.flash });

      if (e.windup > 0) {
        g.fillStyle = '#ffe066';
        g.font = 'bold 40px sans-serif';
        g.textAlign = 'center';
        g.fillText('!', e.x, FLOOR - BODY_H - 18);
      } else if (e.guard > 0 && e.ko <= 0) {
        g.fillStyle = '#9aa0c3';
        g.font = 'bold 14px sans-serif';
        g.textAlign = 'center';
        g.fillText('ガード中', e.x, FLOOR - BODY_H - 14);
      }

      for (const s of this.sparks) {
        g.globalAlpha = Math.max(0, s.life / 0.35);
        g.fillStyle = s.color;
        g.fillRect(s.x - 3, s.y - 3, 6, 6);
      }
      g.globalAlpha = 1;

      g.textAlign = 'left';
      g.fillStyle = '#e8eaf6';
      g.font = 'bold 18px sans-serif';
      g.fillText(`SCORE ${this.score}`, 12, 26);
      g.font = '13px sans-serif';
      g.fillStyle = '#3ddc84';
      g.fillText(`KO ${this.kos}（KOで左のブロックを2個回復）`, 12, 46);
      g.fillStyle = '#6a70a0';
      g.textAlign = 'center';
      g.fillText('← → 移動 / ↑ ジャンプ / ↓ 攻撃', 240, 670);
      g.fillText('相手と逆を押す＝ガード / 相手の方向＋↓＝ガードの上から当たる攻撃', 240, 690);

      this.msgs.forEach((m, i) => {
        g.globalAlpha = Math.max(0, 1 - m.age / 1.6);
        g.fillStyle = m.color;
        g.font = 'bold 20px sans-serif';
        g.fillText(m.text, 240, 180 + i * 26 - m.age * 10);
      });
      g.globalAlpha = 1;
    }
  }

  RG.SideGames.register({
    id: 'fighter', name: '格闘ゲーム',
    controls: '← ↑ → 移動・ジャンプ / ↓ 攻撃 / 相手と逆でガード',
    create: ctx => new Fighter(ctx),
  });
})();
