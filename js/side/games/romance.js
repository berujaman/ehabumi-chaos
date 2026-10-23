// 右半分のゲーム⑤：恋愛シミュレーション（矢印キーで4択）
//  - キャラが出てきて質問する。答えは ↑ ← → ↓ の4つ（どの矢印にどの答えが来るかは毎回入れ替わる）
//  - 選んだ答えで好感度が上下する。10秒答えないと「無視」扱いで下がる
//  - 3回答えるとエンディング（結果画面）。好感度で4種類に分かれ、左の音ゲーに影響する
//      TRUE END → 特典ブロック2個回復 / GOOD END → 1個回復 / NORMAL END → なし / BAD END → 1個壊れる
//  - エンディングの後は次のキャラが登場（右のゲームが切り替わるまで続く）
//  - 曲との連動：10秒前に流れた曲の強い音に合わせて、ハートとキャラが弾む
//  - 左からの報酬：ヒント（一番喜ぶ答えが光る）/ チャーム（次の答えの上がり幅2倍）/ プレゼント（+15）/
//    5回目のコンボ報酬は運命（+30）
(function () {
  const QUESTIONS_PER_DATE = 3, ANSWER_TIME = 10, START_AFFECTION = 50;
  const KEYS = ['ArrowUp', 'ArrowLeft', 'ArrowRight', 'ArrowDown'];
  const ARROW = { ArrowUp: '↑', ArrowLeft: '←', ArrowRight: '→', ArrowDown: '↓' };
  // 選択肢の箱の位置（十字に並べる）
  const SLOT = {
    ArrowUp: { x: 240, y: 478 },
    ArrowLeft: { x: 122, y: 560 },
    ArrowRight: { x: 358, y: 560 },
    ArrowDown: { x: 240, y: 642 },
  };
  const BOX_W = 214, BOX_H = 64;
  const ENDINGS = [
    { min: 95, key: 'true', title: 'TRUE END', color: '#ff7eb6', effect: { type: 'repair', count: 2 }, note: '左の特典ブロックを2個回復!' },
    { min: 75, key: 'good', title: 'GOOD END', color: '#7cf29c', effect: { type: 'repair', count: 1 }, note: '左の特典ブロックを1個回復' },
    { min: 45, key: 'normal', title: 'NORMAL END', color: '#c9cde8', effect: null, note: '左への影響なし' },
    { min: -1, key: 'bad', title: 'BAD END', color: '#ff6b6b', effect: { type: 'attack', power: 1 }, note: '左の特典ブロックが1個壊れる…' },
  ];
  const ITEMS = {
    hint: { name: 'ヒント', color: '#ffe066' },
    charm: { name: 'チャーム', color: '#ff7eb6' },
    present: { name: 'プレゼント', color: '#7cf29c' },
    destiny: { name: '運命', color: '#ffb84d' },
  };

  // 選択肢は [答え, 好感度の増減, キャラの反応]
  const CHARACTERS = [
    {
      name: 'ひなた', role: '幼なじみ', hair: '#ff9a3d', hairDark: '#d9701a', eye: '#7a4a1e', accessory: 'pin',
      greeting: 'やっほー！ 今日はいっしょに過ごせるんだよね？',
      endings: {
        true: 'ずっと前から、キミのことが好きだったんだ！',
        good: 'また明日も、いっしょに帰ろうね！',
        normal: 'うん、また遊ぼうね。',
        bad: '……今日は、もう帰るね。',
      },
      questions: [
        { q: 'ねえねえ、今度の休み、どこ行きたい？', a: [
          ['遊園地で絶叫マシン！', 20, 'さっすが！ 分かってるね！'],
          ['ひなたが行きたい所でいいよ', 10, 'えへへ、じゃあ考えとく！'],
          ['家でゴロゴロしたい', -5, 'えー、もったいないよー'],
          ['その日は予定がある', -15, '……そっか。ざんねん'],
        ] },
        { q: 'お弁当作りすぎちゃった！ 食べる？', a: [
          ['全部食べる！', 20, 'ほんと!? うれしい！'],
          ['おいしそう、いただきます', 10, 'どうぞどうぞ！'],
          ['味見してからね', -5, 'むー、信用ないなぁ'],
          ['ダイエット中なんで', -15, '……そ、そうなんだ'],
        ] },
        { q: '最近わたし、なにか変わったと思う？', a: [
          ['髪、少し切った？', 20, '気づいてくれた！'],
          ['いつも元気だよね', 10, 'それ、ほめてる？ えへへ'],
          ['……背が伸びた？', -5, '伸びてないよ！'],
          ['特に何も', -15, '……ふーん'],
        ] },
        { q: '雨降ってきちゃった！ 傘ある？', a: [
          ['いっしょに入ろう', 20, '……う、うん！'],
          ['この傘使って', 10, 'でもキミが濡れちゃうよ？'],
          ['走れば平気！', -5, 'えー、びしょびしょだよ！'],
          ['自分の分しかない', -15, '……そうだよね'],
        ] },
        { q: 'ゲームで勝負しよ！ 負けたらジュースおごりね！', a: [
          ['本気でいくよ！', 20, 'そうこなくっちゃ！'],
          ['いいよ、受けて立つ', 10, 'よーし、負けないから！'],
          ['手加減してあげるよ', -5, 'なめないでよね！'],
          ['めんどくさい', -15, 'ノリ悪いなぁ'],
        ] },
      ],
    },
    {
      name: 'しずく', role: '生徒会長', hair: '#3a4f9a', hairDark: '#26346b', eye: '#2c3e7a', accessory: 'glasses',
      greeting: '……来たのね。時間どおり、悪くないわ。',
      endings: {
        true: '……あなたになら、生徒会長じゃない私を見せてもいいわ。',
        good: '明日も手伝ってくれると、うれしいわ。',
        normal: '今日はありがとう。では、また。',
        bad: '……時間の無駄だったわね。',
      },
      questions: [
        { q: '生徒会の仕事、手伝ってくれるかしら。', a: [
          ['しずくさんと一緒なら喜んで', 20, '……そ、そう。ならお願い'],
          ['もちろん、何でもやるよ', 10, '助かるわ'],
          ['報酬は？', -5, '現金な人ね'],
          ['忙しいので無理です', -15, '……期待した私がばかだったわ'],
        ] },
        { q: 'この本、読んだことある？', a: [
          ['あるよ、ラストが最高だった', 20, '話が分かるわね'],
          ['おすすめなら読んでみたい', 10, '貸してあげてもいいわよ'],
          ['表紙だけ見たことある', -5, 'それは読んだと言わないわ'],
          ['本は眠くなる', -15, '……そう'],
        ] },
        { q: 'テスト、何点だった？', a: [
          ['教わった所、全部できた', 20, '……当然よ。私が教えたんだから'],
          ['次はもっと頑張る', 10, 'その意気よ'],
          ['聞かないで……', -5, '……今度、教えてあげるわ'],
          ['テストなんて意味ない', -15, '本気で言ってるの？'],
        ] },
        { q: '……ねえ。今日の私、疲れているように見える？', a: [
          ['無理しないで。肩もむよ', 20, '……ありがとう。少しだけ'],
          ['いつも頑張りすぎだよ', 10, '……見ていてくれたのね'],
          ['いつも通りに見えるけど', -5, '……そう。ならいいわ'],
          ['会長なんだから当然でしょ', -15, '……'],
        ] },
        { q: '放課後、少し時間ある？', a: [
          ['しずくさんのためなら空ける', 20, '……調子のいい人'],
          ['あるよ、どうしたの？', 10, '別に。少し話したかっただけ'],
          ['宿題が終わったらね', -5, '……優先順位は大事ね'],
          ['ない', -15, '……そう'],
        ] },
      ],
    },
    {
      name: 'ミコト', role: '不思議な転校生', hair: '#b7a8e8', hairDark: '#8a77c9', eye: '#6a4fc0', accessory: 'star',
      greeting: '……きみ、今日は電波の調子がいいね。',
      endings: {
        true: '……きみは、わたしの惑星。ずっと周りを回ってて。',
        good: '……また、宇宙の話をしよう。',
        normal: '……またね、地球人。',
        bad: '……交信、終了。',
      },
      questions: [
        { q: '月の裏側って、どんな色だと思う？', a: [
          ['きっとミコトの髪と同じ色', 20, '……ふふ。素敵な答え'],
          ['行ってみないと分からないね', 10, '……いっしょに行く？'],
          ['灰色じゃない？', -5, '……夢がない'],
          ['どうでもいい', -15, '……さよなら、地球人'],
        ] },
        { q: 'わたし、昨日宇宙人と話したの。', a: [
          ['何て言ってた？', 20, '……「きみによろしく」って'],
          ['すごいね', 10, '……信じてくれるの？'],
          ['夢でも見たんじゃない？', -5, '……夢も、現実の一部'],
          ['病院行こうか', -15, '……'],
        ] },
        { q: 'この石、拾ったの。あげる。', a: [
          ['宝物にするよ', 20, '……大事にしてね'],
          ['きれいだね、ありがとう', 10, '……光にかざすと、もっときれい'],
          ['ただの石だよね？', -5, '……ただの石なんて、ない'],
          ['いらない', -15, '……そう'],
        ] },
        { q: 'もし明日、世界が終わるなら何する？', a: [
          ['ミコトと星を見る', 20, '……いいね。約束'],
          ['好きな人に会いに行く', 10, '……それ、だれ？'],
          ['いつも通り寝る', -5, '……ある意味、強い'],
          ['考えたくない', -15, '……逃げるのは、よくない'],
        ] },
        { q: '……わたしのこと、変だと思う？', a: [
          ['変なところが好きだよ', 20, '……！ ……ありがと'],
          ['個性的でいいと思う', 10, '……個性、大事'],
          ['ちょっとだけ', -5, '……正直'],
          ['かなり変', -15, '……知ってる'],
        ] },
      ],
    },
  ];

  function shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  // 幅に収まるよう1文字ずつ折り返す
  function wrap(g, text, maxW) {
    const rows = [];
    let row = '';
    for (const ch of text) {
      if (row && g.measureText(row + ch).width > maxW) { rows.push(row); row = ch; } else row += ch;
    }
    if (row) rows.push(row);
    return rows;
  }

  class Romance extends RG.SideGame {
    constructor(ctx) {
      super(ctx);
      this.items = { hint: 0, charm: 0, present: 0, destiny: 0 };
      this.msgs = [];
      this.floats = [];   // 好感度の増減の数字（ふわっと上に消える）
      this.beat = 0;      // 曲の強い音で 1 になり、だんだん 0 に戻る
      this.lastChar = -1;
      this.dates = 0;
      this.endingCounts = { true: 0, good: 0, normal: 0, bad: 0 };
      this.newDate();
    }

    start(info) {
      this.schedule = this.makeSchedule(info, { minGap: 0.4, minStrength: 0.4 });
    }

    msg(text, color) {
      this.msgs.push({ text, color, age: 0 });
      if (this.msgs.length > 3) this.msgs.shift();
    }

    newDate() {
      let idx;
      do { idx = Math.floor(Math.random() * CHARACTERS.length); } while (CHARACTERS.length > 1 && idx === this.lastChar);
      this.lastChar = idx;
      this.ch = CHARACTERS[idx];
      this.questions = shuffle(this.ch.questions).slice(0, QUESTIONS_PER_DATE);
      this.qIndex = 0;
      this.affection = START_AFFECTION;
      this.expression = 'normal';
      this.speech = this.ch.greeting;
      this.phase = 'intro';
      this.timer = 2.2;
      this.ending = null;
      // 前のデートのエンディング中に届いたプレゼント・運命はここで使う
      for (const [type, amount] of [['present', 15], ['destiny', 30]]) {
        while (this.items[type] > 0) { this.items[type]--; this.affection = Math.min(100, this.affection + amount); }
      }
    }

    nextQuestion() {
      const q = this.questions[this.qIndex];
      // どの矢印にどの答えを置くかは毎回入れ替える
      const order = shuffle(q.a);
      this.choices = {};
      KEYS.forEach((k, i) => { this.choices[k] = order[i]; });
      this.speech = q.q;
      this.expression = 'normal';
      this.phase = 'ask';
      this.timer = ANSWER_TIME;
      this.hintActive = this.items.hint > 0;
      if (this.hintActive) this.items.hint--;
      this.picked = null;
    }

    onKey(code) {
      if (this.phase !== 'ask' || !this.choices[code]) return;
      const [, delta, reaction] = this.choices[code];
      let d = delta;
      if (d > 0 && this.items.charm > 0) { this.items.charm--; d *= 2; this.msg('チャームで2倍!', ITEMS.charm.color); }
      this.picked = code;
      this.react(d, reaction);
    }

    react(delta, line) {
      this.changeAffection(delta);
      this.speech = line;
      this.expression = delta >= 20 ? 'love' : delta > 0 ? 'happy' : delta > -10 ? 'pout' : 'sad';
      this.phase = 'react';
      this.timer = 2.0;
    }

    changeAffection(delta) {
      this.affection = Math.max(0, Math.min(100, this.affection + delta));
      this.floats.push({ text: `${delta > 0 ? '+' : ''}${delta}`, color: delta > 0 ? '#ff7eb6' : '#8fa0d8', age: 0 });
    }

    finishDate() {
      const e = ENDINGS.find(x => this.affection >= x.min);
      this.ending = e;
      this.dates++;
      this.endingCounts[e.key]++;
      if (e.effect && e.effect.type === 'repair') this.bus.emit('side:repair', { count: e.effect.count, source: 'romance' });
      if (e.effect && e.effect.type === 'attack') this.bus.emit('side:attack', { power: e.effect.power, lane: null, source: 'romance' });
      this.speech = this.ch.endings[e.key];
      this.expression = e.key === 'true' ? 'love' : e.key === 'good' ? 'happy' : e.key === 'normal' ? 'normal' : 'sad';
      this.phase = 'ending';
      this.timer = 5.0;
    }

    update(dt, t) {
      if (this.schedule && this.schedule.pop(t).length) this.beat = 1;
      this.beat = Math.max(0, this.beat - dt * 4);
      for (const f of this.floats) f.age += dt;
      this.floats = this.floats.filter(f => f.age < 1.4);
      for (const m of this.msgs) m.age += dt;
      this.msgs = this.msgs.filter(m => m.age < 2);

      this.timer -= dt;
      if (this.timer > 0) return;
      if (this.phase === 'intro') this.nextQuestion();
      else if (this.phase === 'ask') {
        this.react(-10, '……無視？');   // 時間切れ
        this.msg('時間切れ', '#9aa0c3');
      } else if (this.phase === 'react') {
        this.qIndex++;
        if (this.qIndex >= QUESTIONS_PER_DATE) this.finishDate(); else this.nextQuestion();
      } else if (this.phase === 'ending') this.newDate();
    }

    receiveReward({ kind, level }) {
      const type = kind === 'combo' && level % 5 === 0 ? 'destiny' : ['hint', 'charm', 'present'][Math.floor(Math.random() * 3)];
      if (type === 'present' || type === 'destiny') {
        if (this.phase !== 'ending') this.changeAffection(type === 'present' ? 15 : 30);
        else this.items[type]++;   // エンディング中に届いたら次のデートで使う
      } else {
        this.items[type]++;
      }
      this.msg(`${kind === 'accuracy' ? 'GREAT報酬' : 'コンボ報酬'}: ${ITEMS[type].name}`, ITEMS[type].color);
      if (this.phase === 'ask' && type === 'hint' && !this.hintActive) { this.items.hint--; this.hintActive = true; }
    }

    getResult() {
      return {
        'デート回数': this.dates, 'TRUE END': this.endingCounts.true, 'GOOD END': this.endingCounts.good,
        'NORMAL END': this.endingCounts.normal, 'BAD END': this.endingCounts.bad,
      };
    }

    // ---- 描画 ----
    drawCharacter(g, cx, cy) {
      const c = this.ch, ex = this.expression;
      const bob = Math.sin(this.beat * Math.PI) * 4;
      cy -= bob;
      // 後ろ髪
      g.fillStyle = c.hairDark;
      g.beginPath(); g.ellipse(cx, cy + 20, 92, 112, 0, 0, Math.PI * 2); g.fill();
      // 首・肩
      g.fillStyle = '#f6d7c3';
      g.fillRect(cx - 16, cy + 62, 32, 30);
      g.fillStyle = '#2d3561';
      g.beginPath(); g.ellipse(cx, cy + 140, 96, 56, 0, Math.PI, 0); g.fill();
      g.fillStyle = '#ffffff';
      g.beginPath(); g.moveTo(cx - 22, cy + 86); g.lineTo(cx, cy + 112); g.lineTo(cx + 22, cy + 86); g.fill();
      // 顔
      g.fillStyle = '#fbe3d3';
      g.beginPath(); g.ellipse(cx, cy, 70, 78, 0, 0, Math.PI * 2); g.fill();
      // 前髪
      g.fillStyle = c.hair;
      g.beginPath();
      g.moveTo(cx - 80, cy + 10);
      g.quadraticCurveTo(cx - 84, cy - 86, cx, cy - 90);
      g.quadraticCurveTo(cx + 84, cy - 86, cx + 80, cy + 10);
      g.quadraticCurveTo(cx + 56, cy - 30, cx + 30, cy - 34);
      g.lineTo(cx + 18, cy - 14);
      g.lineTo(cx + 4, cy - 38);
      g.lineTo(cx - 14, cy - 16);
      g.lineTo(cx - 28, cy - 36);
      g.quadraticCurveTo(cx - 56, cy - 30, cx - 80, cy + 10);
      g.fill();
      // 目
      const eyeY = cy + 8;
      for (const s of [-1, 1]) {
        const x = cx + s * 27;
        if (ex === 'love' || ex === 'happy') {
          g.strokeStyle = '#3a2a2a'; g.lineWidth = 3;
          g.beginPath(); g.arc(x, eyeY + 4, 10, Math.PI * 1.1, Math.PI * 1.9); g.stroke();
        } else if (ex === 'sad') {
          g.fillStyle = c.eye;
          g.beginPath(); g.ellipse(x, eyeY + 2, 8, 11, 0, 0, Math.PI * 2); g.fill();
          g.strokeStyle = '#3a2a2a'; g.lineWidth = 2;
          g.beginPath(); g.moveTo(x - 10, eyeY - 14 - s * 3); g.lineTo(x + 10, eyeY - 14 + s * 3); g.stroke();
        } else {
          g.fillStyle = c.eye;
          g.beginPath(); g.ellipse(x, eyeY, 9, 13, 0, 0, Math.PI * 2); g.fill();
          g.fillStyle = '#ffffff';
          g.beginPath(); g.arc(x - 3, eyeY - 5, 3.5, 0, Math.PI * 2); g.fill();
          if (ex === 'pout') {
            g.strokeStyle = '#3a2a2a'; g.lineWidth = 2;
            g.beginPath(); g.moveTo(x - 10, eyeY - 18 + s * 3); g.lineTo(x + 10, eyeY - 18 - s * 3); g.stroke();
          }
        }
      }
      // 頬
      if (ex === 'love' || ex === 'happy') {
        g.fillStyle = ex === 'love' ? 'rgba(255,110,150,0.55)' : 'rgba(255,140,160,0.35)';
        g.beginPath(); g.ellipse(cx - 42, cy + 30, 13, 7, 0, 0, Math.PI * 2); g.fill();
        g.beginPath(); g.ellipse(cx + 42, cy + 30, 13, 7, 0, 0, Math.PI * 2); g.fill();
      }
      // 口
      g.strokeStyle = '#a0484f'; g.lineWidth = 3; g.fillStyle = '#c4545f';
      g.beginPath();
      if (ex === 'love' || ex === 'happy') { g.arc(cx, cy + 38, 11, 0.1 * Math.PI, 0.9 * Math.PI); g.fill(); }
      else if (ex === 'sad') { g.arc(cx, cy + 52, 10, 1.15 * Math.PI, 1.85 * Math.PI); g.stroke(); }
      else if (ex === 'pout') { g.moveTo(cx - 8, cy + 44); g.lineTo(cx + 8, cy + 42); g.stroke(); }
      else { g.arc(cx, cy + 38, 7, 0.15 * Math.PI, 0.85 * Math.PI); g.stroke(); }
      // 小物
      if (c.accessory === 'glasses') {
        g.strokeStyle = '#2a2f52'; g.lineWidth = 2.5;
        g.strokeRect(cx - 44, eyeY - 14, 34, 26);
        g.strokeRect(cx + 10, eyeY - 14, 34, 26);
        g.beginPath(); g.moveTo(cx - 10, eyeY - 4); g.lineTo(cx + 10, eyeY - 4); g.stroke();
      } else if (c.accessory === 'pin') {
        g.fillStyle = '#ffe066';
        g.fillRect(cx + 34, cy - 52, 26, 7);
        g.fillStyle = '#ff5c8a';
        g.fillRect(cx + 38, cy - 60, 7, 22);
      } else if (c.accessory === 'star') {
        this.drawStar(g, cx - 50, cy - 58, 13, '#ffe066');
      }
      if (ex === 'love') {
        this.drawHeart(g, cx + 76, cy - 66, 12 + this.beat * 3, '#ff5c8a');
      }
    }

    drawStar(g, x, y, r, color) {
      g.fillStyle = color;
      g.beginPath();
      for (let i = 0; i < 10; i++) {
        const a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? r * 0.45 : r;
        g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
      }
      g.closePath();
      g.fill();
    }

    drawHeart(g, x, y, s, color) {
      g.fillStyle = color;
      g.beginPath();
      g.moveTo(x, y + s * 0.9);
      g.bezierCurveTo(x - s * 1.4, y - s * 0.1, x - s * 0.6, y - s * 1.1, x, y - s * 0.35);
      g.bezierCurveTo(x + s * 0.6, y - s * 1.1, x + s * 1.4, y - s * 0.1, x, y + s * 0.9);
      g.fill();
    }

    render(g) {
      const W = this.w;
      const grd = g.createLinearGradient(0, 0, 0, this.h);
      grd.addColorStop(0, '#3a1f3f');
      grd.addColorStop(1, '#120a1a');
      g.fillStyle = grd;
      g.fillRect(0, 0, W, this.h);
      // 背景の小さなハート
      g.globalAlpha = 0.08 + this.beat * 0.06;
      for (let i = 0; i < 9; i++) this.drawHeart(g, 40 + (i * 53) % 420, 90 + (i * 97) % 260, 10, '#ff7eb6');
      g.globalAlpha = 1;

      // 上：名前と好感度
      g.textAlign = 'left';
      g.fillStyle = '#ffd6e8';
      g.font = 'bold 18px sans-serif';
      g.fillText(this.ch.name, 12, 28);
      const nameW = g.measureText(this.ch.name).width;
      g.font = '12px sans-serif';
      g.fillStyle = '#c9a8c8';
      g.fillText(this.ch.role, 12 + nameW + 8, 28);
      this.drawHeart(g, 24, 50, 9 + this.beat * 2, '#ff5c8a');
      g.fillStyle = '#4a2a4a';
      g.fillRect(40, 44, 200, 12);
      g.fillStyle = '#ff7eb6';
      g.fillRect(40, 44, 200 * this.affection / 100, 12);
      g.fillStyle = '#ffffff';
      g.font = 'bold 12px sans-serif';
      g.fillText(`好感度 ${this.affection}`, 248, 55);
      const qn = Math.min(this.qIndex + 1, QUESTIONS_PER_DATE);
      g.textAlign = 'right';
      g.fillStyle = '#c9a8c8';
      g.font = '13px sans-serif';
      if (this.phase !== 'ending' && this.phase !== 'intro') g.fillText(`質問 ${qn} / ${QUESTIONS_PER_DATE}`, 468, 46);
      const owned = Object.entries(this.items).filter(([, n]) => n > 0).map(([k, n]) => `${ITEMS[k].name}×${n}`);
      if (owned.length) { g.fillStyle = '#ffe066'; g.fillText(owned.join(' '), 468, 64); }

      this.drawCharacter(g, 240, 196);

      // 増減の数字
      g.textAlign = 'center';
      for (const f of this.floats) {
        g.globalAlpha = Math.max(0, 1 - f.age / 1.4);
        g.fillStyle = f.color;
        g.font = 'bold 30px sans-serif';
        g.fillText(f.text, 360, 150 - f.age * 40);
      }
      g.globalAlpha = 1;

      // セリフ
      g.fillStyle = 'rgba(20,10,25,0.85)';
      RG.roundRect(g, 18, 338, 444, 90, 12);
      g.fill();
      g.strokeStyle = '#ff9ec0'; g.lineWidth = 2;
      g.stroke();
      g.fillStyle = '#ff9ec0';
      g.font = 'bold 13px sans-serif';
      g.textAlign = 'left';
      g.fillText(this.ch.name, 32, 358);
      g.fillStyle = '#ffffff';
      g.font = '17px sans-serif';
      wrap(g, `「${this.speech}」`, 410).slice(0, 3).forEach((row, i) => g.fillText(row, 32, 382 + i * 22));

      if (this.phase === 'ask' || this.phase === 'react') this.renderChoices(g);
      if (this.phase === 'ending') this.renderEnding(g);
      if (this.phase === 'intro') {
        g.textAlign = 'center';
        g.fillStyle = '#ffd6e8';
        g.font = 'bold 22px sans-serif';
        g.fillText(`♥ ${this.ch.name}とのデート ♥`, 240, 560);
      }

      g.textAlign = 'center';
      this.msgs.forEach((m, i) => {
        g.globalAlpha = Math.max(0, 1 - m.age / 2);
        g.fillStyle = m.color;
        g.font = 'bold 15px sans-serif';
        g.fillText(m.text, 240, 92 + i * 20);
      });
      g.globalAlpha = 1;
    }

    renderChoices(g) {
      for (const k of KEYS) {
        const [text, delta] = this.choices[k], s = SLOT[k];
        const picked = this.picked === k, faded = this.phase === 'react' && !picked;
        const best = this.hintActive && delta === Math.max(...KEYS.map(kk => this.choices[kk][1]));
        g.globalAlpha = faded ? 0.3 : 1;
        g.fillStyle = picked ? '#ff7eb6' : '#2a1830';
        RG.roundRect(g, s.x - BOX_W / 2, s.y - BOX_H / 2, BOX_W, BOX_H, 10);
        g.fill();
        g.strokeStyle = best && this.phase === 'ask' ? '#ffe066' : '#ff9ec0';
        g.lineWidth = best && this.phase === 'ask' ? 4 : 1.5;
        g.stroke();
        g.fillStyle = picked ? '#2a1830' : '#ff9ec0';
        g.font = 'bold 20px sans-serif';
        g.textAlign = 'left';
        g.fillText(ARROW[k], s.x - BOX_W / 2 + 10, s.y + 7);
        g.fillStyle = picked ? '#2a1830' : '#ffffff';
        g.font = '14px sans-serif';
        const rows = wrap(g, text, BOX_W - 44).slice(0, 2);
        rows.forEach((row, i) => g.fillText(row, s.x - BOX_W / 2 + 34, s.y + 5 - (rows.length - 1) * 9 + i * 18));
      }
      g.globalAlpha = 1;
      if (this.phase === 'ask') {
        g.fillStyle = this.timer < 3 ? '#ff6b6b' : '#ff9ec0';
        g.fillRect(140, 698, 200 * Math.max(0, this.timer) / ANSWER_TIME, 6);
      }
    }

    renderEnding(g) {
      const e = this.ending;
      g.fillStyle = 'rgba(15,8,20,0.88)';
      RG.roundRect(g, 30, 450, 420, 240, 14);
      g.fill();
      g.strokeStyle = e.color; g.lineWidth = 3;
      g.stroke();
      g.textAlign = 'center';
      g.fillStyle = e.color;
      g.font = 'bold 40px sans-serif';
      g.fillText(e.title, 240, 510);
      g.fillStyle = '#ffffff';
      g.font = '16px sans-serif';
      g.fillText(`${this.ch.name}の好感度  ${this.affection} / 100`, 240, 552);
      for (let i = 0; i < 5; i++) {
        this.drawHeart(g, 180 + i * 30, 585, 10, i < Math.round(this.affection / 20) ? '#ff5c8a' : '#4a2a4a');
      }
      g.fillStyle = e.color;
      g.font = 'bold 16px sans-serif';
      g.fillText(e.note, 240, 636);
      g.fillStyle = '#c9a8c8';
      g.font = '13px sans-serif';
      g.fillText('まもなく次のデートが始まります', 240, 668);
    }
  }

  RG.SideGames.register({
    id: 'romance', name: '恋愛シミュレーション',
    controls: '↑ ← → ↓ で答えを選ぶ（3問でエンディング）',
    create: ctx => new Romance(ctx),
  });
})();
