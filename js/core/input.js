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
    this.setupTouch();
  }

  // スマホ・タブレット：画面下のボタン（data-code にキー名）を、キーを押したのと同じ扱いにする
  setupTouch() {
    // 主な入力が指（スマホ・タブレット）の時だけ。タッチ画面付きのパソコンはキーボードで遊ぶ前提なので出さない
    const touch = window.matchMedia('(pointer: coarse)').matches;
    document.body.classList.toggle('touch', touch);
    const held = new Map();   // 指の番号 → 押しているキー
    const release = e => {
      const code = held.get(e.pointerId);
      if (!code) return;
      held.delete(e.pointerId);
      if (![...held.values()].includes(code)) this.down.delete(code);
      const btn = document.querySelector(`.touch-pad [data-code="${code}"]`);
      if (btn && ![...held.values()].includes(code)) btn.classList.remove('on');
    };
    document.querySelectorAll('.touch-pad [data-code]').forEach(btn => {
      btn.addEventListener('pointerdown', e => {
        e.preventDefault();
        const code = btn.dataset.code;
        held.set(e.pointerId, code);
        btn.classList.add('on');
        if (!this.down.has(code)) {
          this.down.add(code);
          this.pressHandlers.forEach(fn => fn(code));
        }
      });
      for (const type of ['pointerup', 'pointercancel', 'pointerleave']) btn.addEventListener(type, release);
      btn.addEventListener('contextmenu', e => e.preventDefault());
    });
  }

  isDown(code) { return this.down.has(code); }
  onPress(fn) { this.pressHandlers.push(fn); }
};
