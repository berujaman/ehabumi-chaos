// キャラ育成の画面：曲選択画面のキャラ表示、キャラ画面（作成・切り替え・能力値・パスワード・対戦相手の入力）、バトル画面
(function () {
  const C = RG.Chars;
  const $ = id => document.getElementById(id);
  const esc = s => String(s).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  const avatars = () => RG.config.avatars;
  const avatarSrc = i => (avatars()[i] || avatars()[0]).file;

  let view = 'menu';       // menu | chars | battle
  let pickAvatar = 0;      // 作成フォームで選んでいる画像
  let battleTimer = null;
  let battleMusic = null;   // 対戦中に流す曲（収録曲からランダム）

  // 練習相手（パスワードなしで対戦できる）。能力の目安：れんしゅう＝数回遊べば勝てる、ライバル＝各能力200台、チャンピオン＝各能力500前後
  const TRAINERS = [
    { name: 'れんしゅう', note: 'まずはここから', avatar: 3, base: 35, bias: {} },
    { name: 'ライバル', note: '能力200台で互角', avatar: 2, base: 200, bias: { atk: 1.1, spd: 1.1, charm: 0.6 } },
    { name: 'チャンピオン', note: '能力500前後で互角', avatar: 0, base: 500, bias: { atk: 1.1, def: 1.1, charm: 0.7 } },
  ];
  const trainer = t => {
    const s = {};
    for (const st of C.STATS) s[st.key] = Math.round(t.base * (t.bias[st.key] || 1));
    return C.newCharacter(t.name, Math.min(t.avatar, avatars().length - 1), s);
  };

  function show(name) {
    view = name;
    $('menu').classList.toggle('hidden', name !== 'menu');
    $('chars').classList.toggle('hidden', name !== 'chars');
    $('battle').classList.toggle('hidden', name !== 'battle');
    if (name === 'menu') renderBar();
    if (name === 'chars') renderChars();
  }

  // ---- 曲選択画面の上のキャラ表示 ----
  function renderBar() {
    const ch = C.active();
    $('charBar').innerHTML = ch
      ? `<img src="${esc(avatarSrc(ch.avatar))}" alt=""><span><b>${esc(ch.name)}</b> Lv${C.level(ch)}
         <small>プレイすると成績に応じて育ちます。キャラ画面で対戦も出来ます</small></span><button type="button" id="openChars">キャラ画面</button>`
      : `<span><b>キャラ育成</b><small>キャラを作ると、プレイの成績で能力が育ちます。対戦も出来ます</small></span>
         <button type="button" id="openChars">キャラを作る</button>`;
    $('openChars').addEventListener('click', () => show('chars'));
  }

  // ---- キャラ画面 ----
  function renderChars(message) {
    const d = C.load(), ch = d.slots[d.active];
    const tabs = d.slots.map((c, i) => `<button type="button" class="slot${i === d.active ? ' selected' : ''}" data-slot="${i}">
        ${c ? `<img src="${esc(avatarSrc(c.avatar))}" alt="">${esc(c.name)}` : `${i + 1}人目：空き`}</button>`).join('');
    $('chars').innerHTML = `
      <div class="chars-head"><h2>キャラ育成</h2><button type="button" id="charsBack">曲選択に戻る</button></div>
      <div class="slots">${tabs}</div>
      <p class="chars-note">選んでいるキャラが、プレイの成績で育ちます（${C.SLOTS}人まで。上で切り替え）。</p>
      <div class="chars-body">${ch ? charView(ch) : createForm()}</div>
      <p class="chars-msg" id="charsMsg">${message ? esc(message) : ''}</p>`;
    $('charsBack').addEventListener('click', () => show('menu'));
    $('chars').querySelectorAll('.slot').forEach(b => b.addEventListener('click', () => {
      const dd = C.load();
      dd.active = +b.dataset.slot;
      C.save(dd);
      renderChars();
    }));
    if (ch) bindCharView(ch); else bindCreateForm();
  }

  function createForm() {
    const list = avatars().map((a, i) => `<button type="button" class="avatar-pick${i === pickAvatar ? ' selected' : ''}" data-i="${i}" title="${esc(a.name)}">
      <img src="${esc(a.file)}" alt="${esc(a.name)}"></button>`).join('');
    return `
      <h3>新しいキャラを作る</h3>
      <label class="field">名前（${C.NAME_MAX}文字まで）<input type="text" id="newName" maxlength="${C.NAME_MAX}" placeholder="なまえ" autocomplete="off"></label>
      <div class="field">画像を選ぶ<div class="avatar-list">${list}</div></div>
      <button type="button" class="primary" id="createChar">このキャラで始める</button>
      <details class="restore"><summary>パスワードからキャラを復元する</summary>
        <div class="row"><input type="text" id="restorePass" placeholder="XXXX-XXXX-…" autocomplete="off"><button type="button" id="restoreBtn">復元</button></div>
      </details>`;
  }

  function bindCreateForm() {
    $('chars').querySelectorAll('.avatar-pick').forEach(b => b.addEventListener('click', () => {
      pickAvatar = +b.dataset.i;
      $('chars').querySelectorAll('.avatar-pick').forEach(x => x.classList.toggle('selected', x === b));
    }));
    $('newName').addEventListener('keydown', e => { if (e.key === 'Enter' && !e.isComposing) $('createChar').click(); });
    $('createChar').addEventListener('click', () => {
      const name = $('newName').value.trim();
      if (!name) { $('charsMsg').textContent = '名前を入れてください。'; $('newName').focus(); return; }
      const d = C.load();
      d.slots[d.active] = C.newCharacter(name, pickAvatar);
      C.save(d);
      renderChars(`「${d.slots[d.active].name}」を作りました。曲を遊ぶと育ちます。`);
    });
    $('restoreBtn').addEventListener('click', () => {
      const ch = C.decode($('restorePass').value);
      if (!ch) { $('charsMsg').textContent = 'パスワードが正しくありません。打ち間違いがないか確かめてください。'; return; }
      const d = C.load();
      d.slots[d.active] = ch;
      C.save(d);
      renderChars(`「${ch.name}」を復元しました。`);
    });
  }

  function charView(ch) {
    const stats = C.STATS.map(st => {
      const v = ch.stats[st.key];
      return `<div class="stat" title="${esc(st.from)}で育つ"><span class="sname">${st.name}</span>
        <span class="sbar"><i style="width:${(v / C.MAX * 100).toFixed(1)}%"></i></span><span class="sval">${v}</span></div>`;
    }).join('');
    return `
      <div class="char-card">
        <img class="char-img" src="${esc(avatarSrc(ch.avatar))}" alt="">
        <div class="char-info">
          <div class="char-name">${esc(ch.name)} <span>Lv${C.level(ch)}</span></div>
          <div class="char-rec">プレイ ${ch.plays}回 ／ 対戦 ${ch.wins}勝 ${ch.losses}敗</div>
          <div class="stats">${stats}</div>
        </div>
      </div>
      <div class="field">パスワード（対戦や復元に使います）
        <div class="row pass-row"><code id="myPass">${C.encode(ch)}</code><button type="button" id="copyPass">コピー</button></div>
      </div>
      <div class="field">練習相手と対戦する
        <div class="row trainers">${TRAINERS.map((t, i) => `<button type="button" class="trainer" data-t="${i}">${esc(t.name)}<small>${esc(t.note)}</small></button>`).join('')}</div>
      </div>
      <div class="field">対戦する：相手のパスワードを入れてください
        <div class="row"><input type="text" id="enemyPass" placeholder="XXXX-XXXX-…" autocomplete="off"><button type="button" class="fight" id="fightBtn">対戦</button></div>
      </div>
      <details class="restore"><summary>このキャラを消す</summary>
        <p class="chars-note">消すと元に戻せません（パスワードを控えておけば復元できます）。</p>
        <button type="button" id="deleteChar">「${esc(ch.name)}」を消す</button>
      </details>`;
  }

  function bindCharView(ch) {
    $('copyPass').addEventListener('click', async () => {
      try { await navigator.clipboard.writeText($('myPass').textContent); $('charsMsg').textContent = 'パスワードをコピーしました。'; }
      catch (e) { $('charsMsg').textContent = 'コピーできませんでした。パスワードを選んで手でコピーしてください。'; }
    });
    $('fightBtn').addEventListener('click', () => {
      const enemy = C.decode($('enemyPass').value);
      if (!enemy) { $('charsMsg').textContent = '相手のパスワードが正しくありません。打ち間違いがないか確かめてください。'; return; }
      startBattle(ch, enemy, C.encode(ch), C.encode(enemy));
    });
    $('chars').querySelectorAll('.trainer').forEach(b => b.addEventListener('click', () => {
      const enemy = trainer(TRAINERS[+b.dataset.t]);
      startBattle(ch, enemy, C.encode(ch), C.encode(enemy));
    }));
    $('deleteChar').addEventListener('click', () => {
      const d = C.load();
      d.slots[d.active] = null;
      C.save(d);
      renderChars(`「${ch.name}」を消しました。`);
    });
  }

  // ---- バトル画面 ----
  function startBattle(me, enemy, myPass, enemyPass) {
    const r = RG.Battle.simulate(me, enemy, myPass, enemyPass);
    const side = (f, cls) => `<div class="fighter ${cls}" id="f-${cls}">
        <img src="${esc(avatarSrc(f.avatar))}" alt="">
        <div class="fname">${esc(f.name)}</div>
        <div class="hpbar"><i id="hp-${cls}"></i></div><div class="hpnum" id="hpn-${cls}"></div></div>`;
    $('battle').innerHTML = `
      <div class="battle-song" id="battleSong"></div>
      <div class="battle-field">${side(r.a, 'a')}<div class="vs">VS</div>${side(r.b, 'b')}</div>
      <div class="battle-msg" id="battleMsg"></div>
      <div class="row battle-buttons"><button type="button" id="battleFast">早送り</button><button type="button" id="battleBack" disabled>キャラ画面に戻る</button></div>`;
    show('battle');
    const setHp = (hpA, hpB) => {
      for (const [cls, hp, f] of [['a', hpA, r.a], ['b', hpB, r.b]]) {
        $(`hp-${cls}`).style.width = `${hp / f.maxHp * 100}%`;
        $(`hp-${cls}`).classList.toggle('low', hp / f.maxHp < 0.3);
        $(`hpn-${cls}`).textContent = `HP ${hp} / ${f.maxHp}`;
      }
    };
    setHp(r.a.maxHp, r.b.maxHp);
    let i = 0, delay = 750;
    const lines = [];
    const step = () => {
      const e = r.events[i++];
      lines.push(e.text);
      $('battleMsg').innerHTML = lines.slice(-4).map(esc).join('<br>');
      setHp(e.hpA, e.hpB);
      if (e.kind === 'hit' || e.kind === 'down') flash(`f-${e.target}`, e.kind === 'down' ? 'down' : 'hit');
      if (e.kind === 'attack' || e.kind === 'special') flash(`f-${e.actor}`, 'act');
      if (i < r.events.length) { battleTimer = setTimeout(step, delay); return; }
      finishBattle(r);
    };
    $('battleFast').addEventListener('click', () => { delay = 120; });
    $('battleBack').addEventListener('click', () => { clearTimeout(battleTimer); stopMusic(); show('chars'); });
    playMusic();
    battleTimer = setTimeout(step, 500);
  }

  // 収録曲からランダムに1曲流す（戻るまでくり返し）
  function playMusic() {
    stopMusic();
    const songs = RG.songs.filter(s => s.file);
    if (!songs.length) return;
    const song = songs[Math.floor(Math.random() * songs.length)];
    const a = new Audio(song.file);
    a.volume = 0.5;
    a.loop = true;
    a.play().catch(() => { /* 再生できない環境ではそのまま */ });
    battleMusic = a;
    $('battleSong').textContent = `♪ ${song.title}`;
  }

  function stopMusic() {
    if (!battleMusic) return;
    battleMusic.pause();
    battleMusic.src = '';
    battleMusic = null;
  }

  function flash(id, cls) {
    const el = $(id);
    if (!el) return;
    el.classList.remove('hit', 'act');
    void el.offsetWidth;   // アニメーションをやり直す
    el.classList.add(cls);
  }

  function finishBattle(r) {
    const d = C.load(), ch = d.slots[d.active];
    if (ch && r.winner !== 'draw') {
      if (r.winner === 'a') ch.wins++; else ch.losses++;
      C.save(d);
    }
    $('battleFast').disabled = true;
    $('battleBack').disabled = false;
    $('battleMsg').classList.add(r.winner === 'a' ? 'win' : r.winner === 'b' ? 'lose' : 'draw');
  }

  // 結果画面に出す行（[見出しか項目, 値]）。main.js の finish から呼ぶ
  function resultRows(grown) {
    if (!grown) return [['h', 'キャラ育成'], ['キャラ', 'キャラ画面でキャラを作ると、成績に応じて育ちます']];
    const rows = [['h', `キャラ育成：${grown.character.name}（Lv${C.level(grown.character)}）`]];
    for (const st of C.STATS) {
      const add = grown.added[st.key];
      if (add > 0) rows.push([st.name, `+${add} → ${grown.character.stats[st.key]}`]);
    }
    if (rows.length === 1) rows.push(['成長', 'なし']);
    return rows;
  }

  const isOpen = () => view !== 'menu';

  RG.CharsUI = { show, renderBar, resultRows, isOpen };
  renderBar();
})();
