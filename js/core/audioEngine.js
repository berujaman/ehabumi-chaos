// 音楽の読み込みと再生。ゲームの時計は「曲の再生位置（秒）」= time を基準にする。
RG.AudioEngine = class {
  constructor() {
    this.ctx = null;
    this.source = null;
    this.startAt = 0;
  }

  // AudioContext はユーザー操作（クリック）の後でないと作れないので遅延生成
  ensure() {
    if (!this.ctx) {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.9;
      this.master.connect(this.ctx.destination);
    }
    return this.ctx;
  }

  async decodeFile(file) {
    const data = await file.arrayBuffer();
    return await this.ensure().decodeAudioData(data);
  }

  play(buffer, leadIn) {
    this.stop();
    const ctx = this.ensure();
    if (ctx.state === 'suspended') ctx.resume();
    this.source = ctx.createBufferSource();
    this.source.buffer = buffer;
    this.source.connect(this.master);
    this.startAt = ctx.currentTime + leadIn;
    this.source.start(this.startAt);
  }

  stop() {
    if (this.source) {
      try { this.source.stop(); } catch (e) { /* 再生前に止めた場合 */ }
      this.source.disconnect();
      this.source = null;
    }
  }

  pause() { if (this.ctx) return this.ctx.suspend(); }
  resume() { if (this.ctx) return this.ctx.resume(); }

  // 今、耳に聞こえている曲の位置（秒）。曲開始前は負の値。
  get time() {
    if (!this.ctx) return 0;
    const latency = this.ctx.outputLatency || this.ctx.baseLatency || 0;
    return this.ctx.currentTime - this.startAt - latency - RG.config.audioOffset;
  }

  // 打鍵音（短いクリック）
  tick(freq = 880, gain = 0.08) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.frequency.value = freq;
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.06);
    osc.connect(g).connect(this.master);
    osc.start(t);
    osc.stop(t + 0.07);
  }
};
