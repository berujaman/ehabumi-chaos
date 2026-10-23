// 左半分：音ゲー本体（判定・コンボ・特典ブロック・描画）
(function () {
  const LANE_COLORS = ['#ff5c8a', '#ffb84d', '#5cd6ff', '#9d7bff'];
  const JUDGE_STYLE = {
    perfect: { text: 'PERFECT', color: '#ffe066' },
    great: { text: 'GREAT', color: '#7cf29c' },
    good: { text: 'GOOD', color: '#5cd6ff' },
    miss: { text: 'MISS', color: '#ff6b6b' },
  };

  const W = 480, H = 720;
  const LANE_X0 = 40, LANE_W = 100;
  const JUDGE_Y = 560;
  // 歌詞の流れ方（遠近法）。horizon=消える先の高さ、camH=基準の行が来る高さ - horizon、z0=基準の行までの距離
  const LYRIC = {
    font: 24, width: 380, rowGap: 34, lineGap: 18,
    horizon: 40, camH: 400, z0: 320,
    farFade: 1100, nearFade: 120, idleSpeed: 25,
  };
  const BLOCK_Y0 = 584, BLOCK_STEP = 22, BLOCK_H = 16;

  RG.RhythmGame = class {
    constructor(bus, audio) {
      this.bus = bus;
      this.audio = audio;
      this.reset([]);
    }

    // approachTime: ノーツが出てから判定ラインに届くまでの秒数（難易度で変わる。小さいほど速く流れる）
    reset(notes, lyrics, approachTime) {
      const c = RG.config;
      this.approachTime = approachTime || c.approachTime;
      this.lyrics = (lyrics || []).slice().sort((a, b) => a.t - b.t);  // [{ t: 歌い出し, e: 歌い終わり, text }]
      this.lyricIdx = 0;
      this.layout = null;
      this.notes = notes.map(n => ({ ...n, judged: false })).sort((a, b) => a.time - b.time);
      this.score = 0;
      this.combo = 0;
      this.maxCombo = 0;
      this.counts = { perfect: 0, great: 0, good: 0, miss: 0 };
      this.blocks = new Array(c.lanes).fill(c.bonusBlocksPerLane);
      this.blocksLost = 0;
      this.blocksRepaired = 0;
      this.greatCount = 0;   // GREAT以上の累計（ミスしてもリセットしない）
      this.attacks = [];
      this.repairs = [];
      this.effects = [];
      this.scan = 0;   // これより前のノーツはすべて判定済み
      this.now = 0;
      this.shake = 0;
    }

    laneCenter(lane) { return LANE_X0 + LANE_W * (lane + 0.5); }
    blockPos(lane, i) { return { x: this.laneCenter(lane), y: BLOCK_Y0 + i * BLOCK_STEP + BLOCK_H / 2 }; }
    // 特典ブロックの色：満タンは金、半分以上残っていれば橙、それより少なければ赤、無ければ灰色
    blockStyle(count) {
      const max = RG.config.bonusBlocksPerLane;
      if (count >= max) return { fill: '#ffd34d', shine: '#fff5c2', text: '#ffd34d' };
      if (count <= 0) return { fill: '#666666', shine: '#888888', text: '#666666' };
      if (count >= max / 2) return { fill: '#ff9a3d', shine: '#ffd2a8', text: '#ffb06a' };
      return { fill: '#ff5c5c', shine: '#ffc2c2', text: '#ff7a7a' };
    }

    multiplier(lane) { return 1 + RG.config.bonusPerBlock * this.blocks[lane]; }

    // ---- 入力 ----
    press(lane, t) {
      const good = RG.config.judge.good;
      let best = null, bestD = Infinity;
      for (let i = this.scan; i < this.notes.length; i++) {
        const n = this.notes[i];
        if (n.time - t > good) break;
        if (n.judged || n.lane !== lane) continue;
        const d = Math.abs(n.time - t);
        if (d <= good && d < bestD) { best = n; bestD = d; }
      }
      if (best) this.judge(best, bestD, t);
    }

    judge(note, d, t) {
      const c = RG.config;
      const result = d <= c.judge.perfect ? 'perfect' : d <= c.judge.great ? 'great' : 'good';
      note.judged = true;
      this.counts[result]++;
      this.combo++;
      this.maxCombo = Math.max(this.maxCombo, this.combo);
      this.score += Math.round(c.scores[result] * this.multiplier(note.lane));
      this.effects.push({ kind: 'judge', result, lane: note.lane, t0: t });
      this.effects.push({ kind: 'hit', lane: note.lane, t0: t, color: LANE_COLORS[note.lane] });
      if (this.audio) this.audio.tick(result === 'perfect' ? 1320 : 990, 0.05);
      this.bus.emit('rhythm:judge', { result, lane: note.lane, combo: this.combo });

      if (this.combo % c.comboRewardEvery === 0) {
        this.bus.emit('rhythm:comboReward', { combo: this.combo, level: this.combo / c.comboRewardEvery });
        this.effects.push({ kind: 'banner', text: `${this.combo} COMBO → アイテム送信!`, t0: t, color: '#7cf29c' });
      }
      if (result !== 'good') {
        this.greatCount++;
        if (c.greatRewardEvery > 0 && this.greatCount % c.greatRewardEvery === 0) {
          this.bus.emit('rhythm:accuracyReward', { count: this.greatCount, level: this.greatCount / c.greatRewardEvery });
          this.effects.push({ kind: 'banner', text: `GREAT以上 ${this.greatCount}回 → アイテム送信!`, t0: t, color: '#5cd6ff' });
        }
      }
      if (c.comboRepairEvery > 0 && this.combo % c.comboRepairEvery === 0) this.repairBlock(t);
    }

    miss(note, t) {
      note.judged = true;
      this.counts.miss++;
      this.combo = 0;
      this.effects.push({ kind: 'judge', result: 'miss', lane: note.lane, t0: t });
      this.bus.emit('rhythm:judge', { result: 'miss', lane: note.lane, combo: 0 });
    }

    // ---- 特典ブロック ----
    pickLaneWithBlocks(preferred) {
      if (preferred != null && this.blocks[preferred] > 0) return preferred;
      const alive = this.blocks.map((b, i) => (b > 0 ? i : -1)).filter(i => i >= 0);
      if (alive.length === 0) return preferred ?? Math.floor(Math.random() * RG.config.lanes);
      return alive[Math.floor(Math.random() * alive.length)];
    }

    // 右のゲームからの攻撃を受け付ける（右端から飛んできて着弾時にブロックを壊す）
    queueAttack({ power = 1, lane = null }) {
      for (let i = 0; i < power; i++) {
        this.attacks.push({ lane: this.pickLaneWithBlocks(lane), t0: this.now + i * 0.12 });
      }
    }

    resolveAttack(a) {
      const lane = this.pickLaneWithBlocks(a.lane);
      if (this.blocks[lane] > 0) {
        this.blocks[lane]--;
        this.blocksLost++;
        const pos = this.blockPos(lane, this.blocks[lane]);
        this.effects.push({ kind: 'break', x: pos.x, y: pos.y, t0: this.now });
        this.bus.emit('rhythm:blockBroken', { lane, remaining: this.blocks[lane] });
      } else {
        this.score = Math.max(0, this.score - RG.config.allBrokenPenalty);
        this.effects.push({ kind: 'banner', text: `-${RG.config.allBrokenPenalty}`, t0: this.now, color: '#ff6b6b' });
      }
      this.shake = 0.25;
    }

    repairBlock(t) {
      const max = RG.config.bonusBlocksPerLane;
      let lane = -1;
      this.blocks.forEach((b, i) => { if (b < max && (lane < 0 || b < this.blocks[lane])) lane = i; });
      if (lane < 0) return;
      this.blocks[lane]++;
      this.effects.push({ kind: 'banner', text: '特典ブロック修復!', t0: t, color: '#ffe066' });
    }

    // 右のゲームからの回復を受け付ける（緑の光が飛んできて、壊れたブロックをランダムに1個直す）
    queueRepair({ count = 1 } = {}) {
      for (let i = 0; i < count; i++) this.repairs.push({ lane: this.pickBrokenLane(), t0: this.now + i * 0.12 });
    }

    pickBrokenLane() {
      const max = RG.config.bonusBlocksPerLane;
      const broken = this.blocks.map((b, i) => (b < max ? i : -1)).filter(i => i >= 0);
      return broken.length ? broken[Math.floor(Math.random() * broken.length)] : -1;
    }

    resolveRepair(r) {
      const max = RG.config.bonusBlocksPerLane;
      const lane = r.lane >= 0 && this.blocks[r.lane] < max ? r.lane : this.pickBrokenLane();
      if (lane < 0) {
        // 壊れたブロックが無ければ得点ボーナスに
        this.score += RG.config.repairOverflowBonus;
        this.effects.push({ kind: 'banner', text: `ブロック満タン ボーナス +${RG.config.repairOverflowBonus}`, t0: this.now, color: '#7cf29c' });
        return;
      }
      const pos = this.blockPos(lane, this.blocks[lane]);
      this.blocks[lane]++;
      this.blocksRepaired++;
      this.effects.push({ kind: 'mend', x: pos.x, y: pos.y, t0: this.now });
      this.effects.push({ kind: 'banner', text: 'シューティングの撃破で ブロック回復!', t0: this.now, color: '#7cf29c' });
      this.bus.emit('rhythm:blockRepaired', { lane, remaining: this.blocks[lane] });
    }

    // ---- 更新 ----
    update(t) {
      const dt = Math.max(0, t - this.now);
      this.now = t;
      const good = RG.config.judge.good;

      while (this.scan < this.notes.length && this.notes[this.scan].judged) this.scan++;
      for (let i = this.scan; i < this.notes.length; i++) {
        const n = this.notes[i];
        if (n.time >= t - good) break;
        if (!n.judged) this.miss(n, t);
      }

      const travel = RG.config.attackTravelTime;
      this.attacks = this.attacks.filter(a => {
        if (t - a.t0 >= travel) { this.resolveAttack(a); return false; }
        return true;
      });
      this.repairs = this.repairs.filter(r => {
        if (t - r.t0 >= travel) { this.resolveRepair(r); return false; }
        return true;
      });
      this.effects = this.effects.filter(e => t - e.t0 < (e.kind === 'banner' ? 1.5 : 0.6));
      this.shake = Math.max(0, this.shake - dt);
    }

    // ---- 歌詞（ノーツの後ろに流れる。下から出てきて、奥の遠くへ小さくなりながら消えていく） ----
    // 歌詞全体を1枚の「床」に並べ、遠近法で描く。各行は歌い出しの瞬間に基準の位置（判定ラインの少し上）を通る。
    lyricLayout(g) {
      if (this.layout) return this.layout;
      g.font = `bold ${LYRIC.font}px sans-serif`;
      let pos = 0;
      this.layout = this.lyrics.map(l => {
        const rows = wrapText(g, l.text, LYRIC.width);
        const item = { rows, pos, anchor: pos + (rows.length - 1) * LYRIC.rowGap / 2 };
        pos += rows.length * LYRIC.rowGap + LYRIC.lineGap;
        return item;
      });
      return this.layout;
    }

    // 時刻 t に、床がどこまで流れているか（歌い出しから次の歌い出しまで一定の速さで流れる）
    lyricScroll(t) {
      const L = this.lyrics, A = this.layout;
      if (t < L[0].t) return A[0].anchor - (L[0].t - t) * LYRIC.idleSpeed;
      while (this.lyricIdx < L.length - 1 && L[this.lyricIdx + 1].t <= t) this.lyricIdx++;
      while (this.lyricIdx > 0 && L[this.lyricIdx].t > t) this.lyricIdx--;
      const i = this.lyricIdx;
      if (i === L.length - 1) return A[i].anchor + (t - L[i].t) * LYRIC.idleSpeed;
      const p = (t - L[i].t) / (L[i + 1].t - L[i].t);
      return A[i].anchor + (A[i + 1].anchor - A[i].anchor) * p;
    }

    renderLyrics(g, t) {
      const L = this.lyrics;
      if (!RG.config.showLyrics || !L.length) return;
      const A = this.lyricLayout(g);
      const S = this.lyricScroll(t);
      const centerX = LANE_X0 + LANE_W * RG.config.lanes / 2;
      g.save();
      g.beginPath();
      g.rect(LANE_X0, 0, LANE_W * RG.config.lanes, JUDGE_Y);
      g.clip();
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      for (let i = 0; i < L.length; i++) {
        A[i].rows.forEach((row, r) => {
          const s = S - A[i].pos - r * LYRIC.rowGap;   // 正：基準より奥（歌い終わった側）、負：手前（これから）
          const z = LYRIC.z0 + s;
          if (s < -LYRIC.nearFade || z < 40 || s > LYRIC.farFade) return;
          const scale = LYRIC.z0 / z;
          const y = LYRIC.horizon + LYRIC.camH * scale;
          const alpha = s >= 0 ? (1 - s / LYRIC.farFade) * 0.7 : (1 + s / LYRIC.nearFade) * 0.7;
          g.font = `bold ${(LYRIC.font * scale).toFixed(1)}px sans-serif`;
          g.globalAlpha = Math.max(0, alpha);
          g.fillStyle = '#c9cde8';
          g.fillText(row, centerX, y);
        });
      }
      g.restore();
      g.globalAlpha = 1;
    }

    get accuracy() {
      const c = this.counts, total = c.perfect + c.great + c.good + c.miss;
      return total ? (c.perfect + c.great * 0.7 + c.good * 0.4) / total : 0;
    }

    // ---- 描画 ----
    render(g, t, keysDown) {
      const c = RG.config;
      g.save();
      g.fillStyle = '#080a14';
      g.fillRect(0, 0, W, H);
      if (this.shake > 0) g.translate((Math.random() - 0.5) * 14 * this.shake * 4, (Math.random() - 0.5) * 8 * this.shake * 4);

      // レーン
      for (let l = 0; l < c.lanes; l++) {
        const x = LANE_X0 + l * LANE_W;
        g.fillStyle = l % 2 ? '#10142a' : '#0d1124';
        g.fillRect(x, 0, LANE_W, JUDGE_Y + 10);
        if (keysDown[l]) {
          const grd = g.createLinearGradient(0, JUDGE_Y, 0, JUDGE_Y - 260);
          grd.addColorStop(0, LANE_COLORS[l] + '66');
          grd.addColorStop(1, LANE_COLORS[l] + '00');
          g.fillStyle = grd;
          g.fillRect(x, JUDGE_Y - 260, LANE_W, 260);
        }
      }
      g.strokeStyle = '#2a2f52';
      g.lineWidth = 1;
      for (let l = 0; l <= c.lanes; l++) {
        const x = LANE_X0 + l * LANE_W + 0.5;
        g.beginPath(); g.moveTo(x, 0); g.lineTo(x, JUDGE_Y + 10); g.stroke();
      }

      this.renderLyrics(g, t);

      // 判定ライン
      g.fillStyle = '#e8eaf6';
      g.fillRect(LANE_X0, JUDGE_Y - 2, LANE_W * c.lanes, 4);

      // ノーツ
      const approach = this.approachTime;
      for (let i = this.scan; i < this.notes.length; i++) {
        const n = this.notes[i];
        if (n.time > t + approach) break;
        if (n.judged) continue;
        const y = JUDGE_Y - (n.time - t) / approach * (JUDGE_Y + 20);
        const x = LANE_X0 + n.lane * LANE_W + 8;
        g.fillStyle = LANE_COLORS[n.lane];
        roundRect(g, x, y - 9, LANE_W - 16, 18, 6);
        g.fill();
        g.fillStyle = 'rgba(255,255,255,0.5)';
        g.fillRect(x + 6, y - 6, LANE_W - 28, 3);
      }

      // 特典ブロック（残りの数で色が変わる：満タン＝金、減ると橙→赤）
      for (let l = 0; l < c.lanes; l++) {
        const style = this.blockStyle(this.blocks[l]);
        for (let b = 0; b < c.bonusBlocksPerLane; b++) {
          const x = LANE_X0 + l * LANE_W + 14, y = BLOCK_Y0 + b * BLOCK_STEP;
          roundRect(g, x, y, LANE_W - 28, BLOCK_H, 4);
          if (b < this.blocks[l]) {
            g.fillStyle = style.fill;
            g.fill();
            g.fillStyle = style.shine;
            g.fillRect(x + 4, y + 3, LANE_W - 36, 3);
          } else {
            g.strokeStyle = '#3a3f60';
            g.setLineDash([4, 3]);
            g.stroke();
            g.setLineDash([]);
          }
        }
        g.fillStyle = '#e8eaf6';
        g.font = 'bold 20px sans-serif';
        g.textAlign = 'center';
        g.fillText(c.laneLabels[l], this.laneCenter(l), 678);
        g.font = '13px sans-serif';
        g.fillStyle = style.text;
        g.fillText('x' + this.multiplier(l).toFixed(2), this.laneCenter(l), 700);
      }

      // 飛んでくる攻撃
      for (const a of this.attacks) {
        const p = Math.min(1, Math.max(0, (t - a.t0) / c.attackTravelTime));
        const target = this.blockPos(a.lane, Math.max(0, this.blocks[a.lane] - 1));
        const x = W + 10 + (target.x - W - 10) * p;
        const y = 160 + (target.y - 160) * p - Math.sin(p * Math.PI) * 80;
        g.fillStyle = '#ff4d4d';
        g.beginPath(); g.arc(x, y, 9, 0, Math.PI * 2); g.fill();
        g.fillStyle = '#ffb3b3';
        g.beginPath(); g.arc(x, y, 4, 0, Math.PI * 2); g.fill();
      }

      // 飛んでくる回復
      for (const r of this.repairs) {
        const p = Math.min(1, Math.max(0, (t - r.t0) / c.attackTravelTime));
        const lane = r.lane >= 0 ? r.lane : 0;
        const target = this.blockPos(lane, Math.min(c.bonusBlocksPerLane - 1, this.blocks[lane]));
        const x = W + 10 + (target.x - W - 10) * p;
        const y = 120 + (target.y - 120) * p - Math.sin(p * Math.PI) * 60;
        g.fillStyle = '#3ddc84';
        g.beginPath(); g.arc(x, y, 9, 0, Math.PI * 2); g.fill();
        g.fillStyle = '#d6ffe6';
        g.fillRect(x - 5, y - 1.5, 10, 3);
        g.fillRect(x - 1.5, y - 5, 3, 10);
      }

      // エフェクト（バナーは重ならないよう縦に並べる）
      let bannerRow = 0;
      for (const e of this.effects) {
        const age = t - e.t0;
        if (e.kind === 'judge') {
          const s = JUDGE_STYLE[e.result];
          g.globalAlpha = Math.max(0, 1 - age / 0.6);
          g.fillStyle = s.color;
          g.font = 'bold 18px sans-serif';
          g.textAlign = 'center';
          g.fillText(s.text, this.laneCenter(e.lane), JUDGE_Y - 30 - age * 40);
        } else if (e.kind === 'hit') {
          g.globalAlpha = Math.max(0, 1 - age / 0.35);
          g.strokeStyle = e.color;
          g.lineWidth = 3;
          g.beginPath(); g.arc(this.laneCenter(e.lane), JUDGE_Y, 14 + age * 120, 0, Math.PI * 2); g.stroke();
        } else if (e.kind === 'break') {
          g.globalAlpha = Math.max(0, 1 - age / 0.6);
          g.fillStyle = '#ffd34d';
          for (let k = 0; k < 8; k++) {
            const ang = k / 8 * Math.PI * 2;
            g.fillRect(e.x + Math.cos(ang) * age * 120 - 3, e.y + Math.sin(ang) * age * 120 - 3, 6, 6);
          }
        } else if (e.kind === 'banner') {
          g.globalAlpha = Math.max(0, 1 - age / 1.5);
          g.fillStyle = e.color;
          g.font = 'bold 20px sans-serif';
          g.textAlign = 'center';
          g.fillText(e.text, W / 2, 200 + 26 * bannerRow++ - age * 20);
        } else if (e.kind === 'mend') {
          g.globalAlpha = Math.max(0, 1 - age / 0.6);
          g.strokeStyle = '#3ddc84';
          g.lineWidth = 3;
          g.strokeRect(e.x - 36 - age * 20, e.y - 8 - age * 10, 72 + age * 40, 16 + age * 20);
        }
        g.globalAlpha = 1;
      }

      // HUD
      g.textAlign = 'left';
      g.fillStyle = '#e8eaf6';
      g.font = 'bold 22px sans-serif';
      g.fillText(String(this.score).padStart(8, '0'), 12, 30);
      if (this.combo >= 3) {
        g.textAlign = 'center';
        g.fillStyle = 'rgba(232,234,246,0.85)';
        g.font = 'bold 44px sans-serif';
        g.fillText(this.combo, W / 2, 300);
        g.font = '14px sans-serif';
        g.fillText('COMBO', W / 2, 322);
      }
      g.restore();
    }
  };

  // 幅に収まるよう折り返す
  function wrapText(g, text, maxW) {
    // 英語と韓国語は単語（空白区切り）ごと、日本語・中国語は1文字ずつ折り返す
    const tokens = text.match(/[A-Za-z0-9'’,.!?—\-가-힯㄰-㆏]+\s*|\s+|./g) || [];
    const rows = [];
    let row = '';
    for (const tok of tokens) {
      if (row && g.measureText(row + tok).width > maxW) { rows.push(row.trim()); row = tok.trimStart(); }
      else row += tok;
    }
    if (row.trim()) rows.push(row.trim());
    return rows.length ? rows : [text];
  }

  function roundRect(g, x, y, w, h, r) {
    g.beginPath();
    g.moveTo(x + r, y);
    g.arcTo(x + w, y, x + w, y + h, r);
    g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r);
    g.arcTo(x, y, x + w, y, r);
    g.closePath();
  }
  RG.roundRect = roundRect;
})();
