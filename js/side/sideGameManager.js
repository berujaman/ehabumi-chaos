// 右半分の進行役。開始の遅れ・ゲームのランダム選択・切替・報酬の受け渡しを担当する。
RG.SideGameManager = class {
  constructor({ bus, input, config }) {
    this.ctx = { bus, input, config };
    this.bus = bus;
    this.config = config;
    this.active = false;
    // 右のゲームは矢印キーのみ。押した瞬間を今のゲームへ渡す
    input.onPress(code => {
      if (this.active && this.current && code.startsWith('Arrow')) this.current.onKey(code);
    });
    this.setup(null);
  }

  setup(chart) {
    if (this.current) this.current.destroy();
    this.chart = chart;
    this.current = null;
    this.currentDef = null;
    this.pendingRewards = [];
    this.nextSwitch = Infinity;
    this.history = [];  // 結果表示用：遊んだゲームの記録
    this.usedOnce = new Set();  // 1プレイに1度だけのゲームで、もう出たもの
    this.titleAt = -Infinity;
  }

  startRandom(t) {
    const exclude = [...this.usedOnce];
    if (this.currentDef) exclude.push(this.currentDef.id);  // 同じゲームの連続は避ける
    const def = RG.SideGames.pickRandom(exclude);
    if (def.oncePerPlay) this.usedOnce.add(def.id);
    if (this.current) {
      this.history.push({ name: this.currentDef.name, result: this.current.getResult() });
      this.current.destroy();
    }
    this.currentDef = def;
    this.current = def.create(this.ctx);
    this.current.start({ chart: this.chart, songTime: t, delay: this.config.sideGameDelay });
    const rot = this.config.sideGameRotateInterval;
    this.nextSwitch = rot > 0 ? t + rot : Infinity;
    this.titleAt = t;
    this.bus.emit('side:started', { id: def.id, name: def.name });
    this.pendingRewards.splice(0).forEach(r => this.current.receiveReward(r));
  }

  update(dt, t) {
    this.active = true;
    if (!this.current && t >= this.config.sideGameDelay) this.startRandom(t);
    else if (this.current && (t >= this.nextSwitch || this.current.finished)) this.startRandom(t);
    // 処理落ちしても動きが遅くならないよう、1/60 秒ずつ刻んで更新する
    if (this.current) {
      const steps = Math.max(1, Math.ceil(dt * 60));
      for (let i = 0; i < steps; i++) this.current.update(dt / steps, t - dt * (steps - 1 - i) / steps);
    }
  }

  pause() { this.active = false; }

  // 開始前に届いた報酬は貯めておき、開始時に渡す
  deliverReward(reward) {
    if (this.current) this.current.receiveReward(reward);
    else this.pendingRewards.push(reward);
  }

  // 同じゲームを何回か遊んだ場合は数値を合計して1つにまとめる
  results() {
    const list = this.history.slice();
    if (this.current) list.push({ name: this.currentDef.name, result: this.current.getResult() });
    const merged = new Map();
    for (const { name, result } of list) {
      const m = merged.get(name) || {};
      for (const [k, v] of Object.entries(result)) m[k] = typeof v === 'number' ? (m[k] || 0) + v : v;
      merged.set(name, m);
    }
    return [...merged].map(([name, result]) => ({ name, result }));
  }

  render(g, t) {
    if (this.current) {
      this.current.render(g, t);
      this.renderTitle(g, t);
      this.renderSwitchCountdown(g, t);
      return;
    }
    g.fillStyle = '#05060c';
    g.fillRect(0, 0, 480, 720);
    g.textAlign = 'center';
    g.fillStyle = '#9aa0c3';
    g.font = '18px sans-serif';
    g.fillText('サイドゲーム開始まで', 240, 330);
    const remain = Math.max(0, this.config.sideGameDelay - Math.max(0, t));
    g.fillStyle = '#e8eaf6';
    g.font = 'bold 64px sans-serif';
    g.fillText(remain.toFixed(1), 240, 400);
    if (this.pendingRewards.length) {
      g.font = '14px sans-serif';
      g.fillStyle = '#7cf29c';
      g.fillText(`待機中のアイテム: ${this.pendingRewards.length}`, 240, 440);
    }
  }

  // 開始・切替時にゲーム名と操作を大きく出す
  renderTitle(g, t) {
    const age = t - this.titleAt;
    if (age > 2.2) return;
    g.globalAlpha = Math.min(1, Math.max(0, (2.2 - age) / 0.5));
    g.fillStyle = 'rgba(5,6,12,0.75)';
    g.fillRect(0, 290, 480, 120);
    g.textAlign = 'center';
    g.fillStyle = '#e8eaf6';
    g.font = 'bold 34px sans-serif';
    g.fillText(this.currentDef.name, 240, 345);
    g.fillStyle = '#9aa0c3';
    g.font = '15px sans-serif';
    g.fillText(this.currentDef.controls || '', 240, 380);
    g.globalAlpha = 1;
  }

  renderSwitchCountdown(g, t) {
    const remain = this.nextSwitch - t;
    if (remain > 5 || remain < 0) return;
    g.textAlign = 'right';
    g.fillStyle = '#ffb84d';
    g.font = 'bold 15px sans-serif';
    g.fillText(`次のゲームまで ${Math.ceil(remain)}`, 470, 24);
  }
};
