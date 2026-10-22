// 右半分のゲーム④：ブラックジャック（← → 賭け数 / ↑ ヒット / ↓ スタンド）
//  - 賭けるのは左の「特典ブロック」。負けると賭けた数だけ壊され、勝つと賭けた数だけ回復する
//  - ブラックジャック（最初の2枚で21）で勝つと +1 個多く回復
//  - 自分の番には制限時間があり、過ぎると自動でスタンド
//  - ディーラーのカードは曲の強い音（10秒前に流れたもの）に合わせてめくられる
//  - 左からの報酬：のぞき見（伏せ札が見える）/ バースト保険（バーストしても負けにならない）/
//    ダブル（次の勝ちで回復2倍）/ 5回目のコンボ報酬はラッキー（次の手札がブラックジャック）
(function () {
  const SUITS = ['♠', '♥', '♦', '♣'];
  const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
  const CARD_W = 62, CARD_H = 88;
  const BET_TIME = 4, TURN_TIME = 8, RESULT_TIME = 2.2, MAX_BET = 3;
  const ITEMS = {
    peek: { name: 'のぞき見', color: '#5cd6ff' },
    insurance: { name: 'バースト保険', color: '#7cf29c' },
    double: { name: 'ダブル', color: '#ff5c8a' },
    lucky: { name: 'ラッキー', color: '#ffb84d' },
  };

  function cardValue(c) {
    if (c.rank === 'A') return 11;
    if (['J', 'Q', 'K'].includes(c.rank)) return 10;
    return Number(c.rank);
  }
  function handTotal(hand) {
    let total = 0, aces = 0;
    for (const c of hand) { total += cardValue(c); if (c.rank === 'A') aces++; }
    while (total > 21 && aces > 0) { total -= 10; aces--; }
    return total;
  }
  const isBlackjack = hand => hand.length === 2 && handTotal(hand) === 21;

  class Blackjack extends RG.SideGame {
    constructor(ctx) {
      super(ctx);
      this.shoe = [];
      this.bet = 1;
      this.items = { peek: 0, insurance: 0, double: 0, lucky: 0 };
      this.msgs = [];
      this.wins = 0; this.losses = 0; this.pushes = 0; this.blackjacks = 0;
      this.repaired = 0; this.lost = 0;
      this.toBetting();
    }

    start(info) {
      this.schedule = this.makeSchedule(info, { minGap: 0.45, minStrength: 0.35 });
    }

    msg(text, color) {
      this.msgs.push({ text, color, age: 0 });
      if (this.msgs.length > 3) this.msgs.shift();
    }

    draw() {
      if (this.shoe.length < 20) {
        this.shoe = [];
        for (let d = 0; d < 4; d++) for (const s of SUITS) for (const r of RANKS) this.shoe.push({ rank: r, suit: s });
        for (let i = this.shoe.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [this.shoe[i], this.shoe[j]] = [this.shoe[j], this.shoe[i]];
        }
      }
      return this.shoe.pop();
    }

    toBetting() {
      this.phase = 'bet';
      this.timer = BET_TIME;
      this.player = [];
      this.dealer = [];
      this.outcome = null;
      this.dealerRevealed = false;
    }

    deal() {
      this.phase = 'player';
      this.timer = TURN_TIME;
      this.peekThisHand = this.items.peek > 0;
      if (this.peekThisHand) this.items.peek--;
      if (this.items.lucky > 0) {
        this.items.lucky--;
        this.player = [{ rank: 'A', suit: '♠' }, { rank: 'K', suit: '♠' }];
        this.msg('ラッキー! ブラックジャック', '#ffb84d');
      } else {
        this.player = [this.draw(), this.draw()];
      }
      this.dealer = [this.draw(), this.draw()];
      if (isBlackjack(this.player) || isBlackjack(this.dealer)) this.toDealer();
    }

    toDealer() {
      this.phase = 'dealer';
      this.dealerWait = 1.2;  // 曲の強い音が来なくても、この秒数でめくる
    }

    onKey(code) {
      if (this.phase === 'bet') {
        if (code === 'ArrowLeft') this.bet = Math.max(1, this.bet - 1);
        if (code === 'ArrowRight') this.bet = Math.min(MAX_BET, this.bet + 1);
        if (code === 'ArrowUp') this.deal();
      } else if (this.phase === 'player') {
        if (code === 'ArrowUp') {
          this.player.push(this.draw());
          const total = handTotal(this.player);
          if (total > 21) this.finish('bust');
          else if (total === 21) this.toDealer();
        }
        if (code === 'ArrowDown') this.toDealer();
      }
    }

    update(dt, t) {
      for (const m of this.msgs) m.age += dt;
      this.msgs = this.msgs.filter(m => m.age < 2);
      const beats = this.schedule.pop(t).length;

      if (this.phase === 'bet') {
        this.timer -= dt;
        if (this.timer <= 0) this.deal();
      } else if (this.phase === 'player') {
        this.timer -= dt;
        if (this.timer <= 0) { this.msg('時間切れ → スタンド', '#9aa0c3'); this.toDealer(); }
      } else if (this.phase === 'dealer') {
        this.dealerWait -= dt;
        if (beats > 0 || this.dealerWait <= 0) {
          this.dealerWait = 1.2;
          if (!this.dealerRevealed) {
            this.dealerRevealed = true;
          } else if (handTotal(this.dealer) < 17 && !isBlackjack(this.player)) {
            this.dealer.push(this.draw());
          } else {
            this.settle();
          }
        }
      } else if (this.phase === 'result') {
        this.timer -= dt;
        if (this.timer <= 0) this.toBetting();
      }
    }

    settle() {
      const p = handTotal(this.player), d = handTotal(this.dealer);
      const pBJ = isBlackjack(this.player), dBJ = isBlackjack(this.dealer);
      if (pBJ && dBJ) this.finish('push');
      else if (pBJ) this.finish('blackjack');
      else if (dBJ) this.finish('lose');
      else if (d > 21) this.finish('win');
      else if (p > d) this.finish('win');
      else if (p < d) this.finish('lose');
      else this.finish('push');
    }

    finish(result) {
      this.phase = 'result';
      this.timer = RESULT_TIME;
      this.dealerRevealed = true;
      if (result === 'bust' && this.items.insurance > 0) {
        this.items.insurance--;
        this.outcome = { text: 'バースト… でも保険で負けなし', color: '#7cf29c' };
        this.pushes++;
        return;
      }
      if (result === 'win' || result === 'blackjack') {
        let count = this.bet + (result === 'blackjack' ? 1 : 0);
        if (this.items.double > 0) { this.items.double--; count *= 2; }
        this.wins++;
        if (result === 'blackjack') this.blackjacks++;
        this.repaired += count;
        this.bus.emit('side:repair', { count, source: 'blackjack' });
        this.outcome = { text: `${result === 'blackjack' ? 'ブラックジャック!' : 'WIN!'}  左のブロックを${count}個回復`, color: '#3ddc84' };
      } else if (result === 'push') {
        this.pushes++;
        this.outcome = { text: '引き分け', color: '#e8eaf6' };
      } else {
        this.losses++;
        this.lost += this.bet;
        this.bus.emit('side:attack', { power: this.bet, lane: null, source: 'blackjack' });
        this.outcome = { text: `${result === 'bust' ? 'バースト' : 'LOSE'}…  左のブロックが${this.bet}個壊される`, color: '#ff6b6b' };
      }
    }

    receiveReward({ kind, level }) {
      const type = kind === 'combo' && level % 5 === 0 ? 'lucky' : ['peek', 'insurance', 'double'][Math.floor(Math.random() * 3)];
      this.items[type]++;
      this.msg(`${kind === 'accuracy' ? 'GREAT報酬' : 'コンボ報酬'}: ${ITEMS[type].name}`, ITEMS[type].color);
    }

    getResult() {
      return { '勝ち': this.wins, '負け': this.losses, '引き分け': this.pushes, 'ブラックジャック': this.blackjacks, '回復させた数': this.repaired, '賭けで失った数': this.lost };
    }

    drawCard(g, x, y, card, hidden) {
      RG.roundRect(g, x, y, CARD_W, CARD_H, 7);
      if (hidden) {
        g.fillStyle = '#3a4170';
        g.fill();
        g.strokeStyle = '#5cd6ff';
        g.lineWidth = 2;
        RG.roundRect(g, x + 6, y + 6, CARD_W - 12, CARD_H - 12, 5);
        g.stroke();
        return;
      }
      g.fillStyle = '#f5f5f0';
      g.fill();
      const red = card.suit === '♥' || card.suit === '♦';
      g.fillStyle = red ? '#d62d4a' : '#1a1a2a';
      g.textAlign = 'left';
      g.font = 'bold 18px sans-serif';
      g.fillText(card.rank, x + 7, y + 22);
      g.textAlign = 'center';
      g.font = '30px sans-serif';
      g.fillText(card.suit, x + CARD_W / 2, y + CARD_H / 2 + 18);
    }

    drawHand(g, hand, y, hideSecond, peek) {
      const total = hand.length * (CARD_W + 8) - 8;
      let x = (this.w - total) / 2;
      hand.forEach((c, i) => {
        const hidden = hideSecond && i === 1;
        this.drawCard(g, x, y, c, hidden && !peek);
        if (hidden && peek) {
          g.strokeStyle = '#5cd6ff'; g.lineWidth = 3;
          RG.roundRect(g, x, y, CARD_W, CARD_H, 7); g.stroke();
        }
        x += CARD_W + 8;
      });
    }

    render(g) {
      g.fillStyle = '#0b3a24';
      g.fillRect(0, 0, this.w, this.h);
      g.strokeStyle = 'rgba(255,255,255,0.12)';
      g.lineWidth = 2;
      g.beginPath(); g.ellipse(240, 380, 220, 250, 0, 0, Math.PI * 2); g.stroke();

      const hideSecond = this.phase === 'player' || (this.phase === 'dealer' && !this.dealerRevealed);
      g.textAlign = 'center';
      g.fillStyle = '#cfe8d8';
      g.font = 'bold 15px sans-serif';
      if (this.dealer.length) {
        g.fillText(`ディーラー  ${hideSecond ? (this.peekThisHand ? handTotal(this.dealer) + '（のぞき見）' : '?') : handTotal(this.dealer)}`, 240, 140);
        this.drawHand(g, this.dealer, 152, hideSecond, this.peekThisHand);
        g.fillText(`あなた  ${handTotal(this.player)}`, 240, 430);
        this.drawHand(g, this.player, 442, false, false);
      }

      // 中央：状態
      g.font = 'bold 20px sans-serif';
      if (this.phase === 'bet') {
        g.fillStyle = '#ffe066';
        g.fillText(`賭け: 特典ブロック ${this.bet} 個`, 240, 320);
        g.font = '15px sans-serif';
        g.fillStyle = '#cfe8d8';
        g.fillText('← → で賭け数（1〜3）  ↑ で配る', 240, 350);
        g.fillText(`自動で配るまで ${Math.ceil(this.timer)}`, 240, 376);
      } else if (this.phase === 'player') {
        g.fillStyle = '#ffe066';
        g.fillText('↑ ヒット（もう1枚）   ↓ スタンド', 240, 330);
        g.fillStyle = this.timer < 3 ? '#ff6b6b' : '#cfe8d8';
        g.fillRect(140, 352, 200 * (this.timer / TURN_TIME), 6);
      } else if (this.phase === 'dealer') {
        g.fillStyle = '#cfe8d8';
        g.fillText('ディーラーの番…', 240, 330);
      } else if (this.phase === 'result' && this.outcome) {
        g.fillStyle = this.outcome.color;
        g.font = 'bold 20px sans-serif';
        g.fillText(this.outcome.text, 240, 330);
      }

      // HUD
      g.textAlign = 'left';
      g.fillStyle = '#e8eaf6';
      g.font = 'bold 18px sans-serif';
      g.fillText(`勝ち ${this.wins}  負け ${this.losses}  引分 ${this.pushes}`, 12, 26);
      g.font = '13px sans-serif';
      g.fillStyle = '#cfe8d8';
      g.fillText(`賭け ${this.bet}個（負け→左のブロックが壊れる / 勝ち→回復）`, 12, 46);
      const owned = Object.entries(this.items).filter(([, n]) => n > 0).map(([k, n]) => `${ITEMS[k].name}×${n}`);
      g.fillStyle = '#ffe066';
      g.fillText(owned.length ? `アイテム: ${owned.join(' ')}` : 'アイテム: なし', 12, 64);

      g.textAlign = 'center';
      this.msgs.forEach((m, i) => {
        g.globalAlpha = Math.max(0, 1 - m.age / 2);
        g.fillStyle = m.color;
        g.font = 'bold 17px sans-serif';
        g.fillText(m.text, 240, 600 + i * 22);
      });
      g.globalAlpha = 1;
    }
  }

  RG.SideGames.register({ id: 'blackjack', name: 'ブラックジャック', controls: '← → 賭け数 / ↑ ヒット / ↓ スタンド', create: ctx => new Blackjack(ctx) });
})();
