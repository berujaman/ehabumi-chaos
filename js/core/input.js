// キーボード入力。押した瞬間（onPress）と押しっぱなし（isDown）の両方を提供する。
RG.Input = class {
  constructor() {
    this.down = new Set();
    this.pressHandlers = [];
    const block = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'Enter']);

    window.addEventListener('keydown', e => {
      // 名前やパスワードの入力欄で打っている時はゲームの操作にしない
      if (e.target && e.target.closest && e.target.closest('input, textarea, select')) return;
      if (block.has(e.code) || RG.config.laneKeys.includes(e.code)) e.preventDefault();
      if (e.repeat) return;
      this.down.add(e.code);
      this.pressHandlers.forEach(fn => fn(e.code));
    });
    window.addEventListener('keyup', e => this.down.delete(e.code));
    window.addEventListener('blur', () => this.down.clear());
  }

  isDown(code) { return this.down.has(code); }
  onPress(fn) { this.pressHandlers.push(fn); }
};
