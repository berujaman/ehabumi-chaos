// 起動・画面遷移・ゲームループ。左右のゲームのつなぎ込みはここで行う。
(function () {
  const cfg = RG.config;
  const $ = id => document.getElementById(id);

  const bus = new RG.EventBus();
  const input = new RG.Input();
  const audio = new RG.AudioEngine();
  const rhythm = new RG.RhythmGame(bus, audio);
  const side = new RG.SideGameManager({ bus, input, config: cfg });
  const rg = $('rhythm').getContext('2d');
  const sg = $('side').getContext('2d');

  RG.debug = { bus, rhythm, side, audio }; // 開発用：ブラウザのコンソールから状態を確認できる

  let state = 'menu';   // menu | playing | paused | result
  let buffer = null, chart = null, songName = '', lyrics = null;

  // ---- 左右の連動 ----
  bus.on('side:attack', p => rhythm.queueAttack(p));
  bus.on('rhythm:comboReward', p => side.deliverReward({ kind: 'combo', ...p }));
  bus.on('rhythm:accuracyReward', p => side.deliverReward({ kind: 'accuracy', ...p }));
  bus.on('side:repair', p => rhythm.queueRepair(p));
  bus.on('side:started', p => { $('sideLabel').textContent = `${p.name}（矢印キー）`; });

  input.onPress(code => {
    if (code === 'Escape') { togglePause(); return; }
    if (code === 'Enter' && (state === 'menu' || state === 'result') && chart && !RG.CharsUI.isOpen()) { start(); return; }
    if (state === 'result' && (code === 'ArrowDown' || code === 'ArrowUp')) {
      const grid = document.querySelector('#result .result-grid');
      if (grid) grid.scrollBy({ top: code === 'ArrowDown' ? 90 : -90, behavior: 'smooth' });
      return;
    }
    if (state !== 'playing') return;
    const lane = cfg.laneKeys.indexOf(code);
    if (lane >= 0) rhythm.press(lane, audio.time);
  });

  // ---- 曲選択 ----
  const DIFFS = ['easy', 'normal', 'hard'];
  const status = text => { $('status').textContent = text; };
  const cache = {};        // 曲ID → { buffer, features, beats }（解析は曲ごとに1回）
  const customSongs = {};  // 収録曲以外（ファイル選択）
  let sel = null;          // { song, diff }
  let loadToken = 0;

  // 歌詞の言語ラベルの色分け（songs.js の lang）
  const LANG_CLASS = { '日本語': 'ja', '英語': 'en', '韓国語': 'ko', '中国語': 'zh' };
  const allSongs = () => [...RG.songs, ...Object.values(customSongs)];

  // 並び順：選んだ難易度のレベルが低い順（同じなら他の難易度のレベル → BPM の順）。選択はブラウザに覚えておく
  let sortDiff = 'normal';
  try { sortDiff = localStorage.getItem('rg.sortDiff') || 'normal'; } catch (e) { /* 保存できない環境 */ }
  function sortedSongs() {
    const key = s => [
      s.difficulties[sortDiff].level ?? 99,
      DIFFS.reduce((sum, d) => sum + (s.difficulties[d].level ?? 99), 0),
      s.bpm || 0,
    ];
    const builtIn = RG.songs.slice().sort((a, b) => {
      const ka = key(a), kb = key(b);
      for (let i = 0; i < ka.length; i++) if (ka[i] !== kb[i]) return ka[i] - kb[i];
      return 0;
    });
    return [...builtIn, ...Object.values(customSongs)];
  }
  const fmtTime = sec => `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, '0')}`;

  // 自己ベスト（このブラウザにだけ保存）
  const bestKey = (id, diff) => `rg.best.${id}.${diff}`;
  function loadBest(id, diff) {
    try { return JSON.parse(localStorage.getItem(bestKey(id, diff))); } catch (e) { return null; }
  }
  function saveBest(id, diff, rec) {
    try { localStorage.setItem(bestKey(id, diff), JSON.stringify(rec)); } catch (e) { /* 保存できない環境 */ }
  }

  function renderSongList() {
    $('sortBar').innerHTML = '並び順：' + DIFFS.map(d =>
      `<button type="button" class="sort ${d}${d === sortDiff ? ' selected' : ''}" data-sort="${d}">${cfg.difficultyNames[d]} のレベル順</button>`).join('');
    $('songList').innerHTML = sortedSongs().map(s => {
      const isSel = sel && sel.song.id === s.id;
      const meta = [s.bpm ? `BPM ${s.bpm}` : null, s.duration ? fmtTime(s.duration) : null].filter(Boolean).join(' ・ ');
      const buttons = DIFFS.map(d => {
        const best = loadBest(s.id, d), lv = s.difficulties[d].level;
        return `<button type="button" class="diff ${d}${isSel && sel.diff === d ? ' selected' : ''}${d === sortDiff ? ' sortkey' : ''}" data-song="${escapeHtml(s.id)}" data-diff="${d}">
          <span class="name">${cfg.difficultyNames[d]}</span>
          <span class="lv">Lv ${lv ?? '?'}</span>
          <span class="best">${best ? 'BEST ' + best.score : '—'}</span></button>`;
      }).join('');
      const langs = (s.lang || []).map(l => `<span class="lang lang-${LANG_CLASS[l] || 'other'}">${escapeHtml(l)}</span>`).join('');
      return `<div class="song${isSel ? ' selected' : ''}"><div><div class="title">${escapeHtml(s.title)}</div>
        <div class="meta">${langs}${escapeHtml(meta)}</div></div><div class="diffs">${buttons}</div></div>`;
    }).join('');
  }

  $('sortBar').addEventListener('click', e => {
    const b = e.target.closest('.sort');
    if (!b) return;
    sortDiff = b.dataset.sort;
    try { localStorage.setItem('rg.sortDiff', sortDiff); } catch (err) { /* 保存できない環境 */ }
    renderSongList();
  });

  $('songList').addEventListener('click', e => {
    const b = e.target.closest('.diff');
    if (b) select(b.dataset.song, b.dataset.diff);
  });

  async function select(songId, diff) {
    const song = allSongs().find(s => s.id === songId);
    sel = { song, diff };
    chart = null;
    $('startBtn').disabled = true;
    renderSongList();
    const token = ++loadToken;
    try {
      const data = await loadSong(song);
      if (token !== loadToken) return;  // 読み込み中に別の曲が選ばれた
      buffer = data.buffer;
      lyrics = data.lyrics;
      chart = RG.ChartGenerator.buildChart(data.features, { ...song.difficulties[diff], beats: data.beats });
      songName = `${song.title} [${cfg.difficultyNames[diff]}]`;
      renderSongList();
      status(`${song.title}：${cfg.difficultyNames[diff]} Lv${song.difficulties[diff].level} ／ ${chart.notes.length} ノーツ ／ ${fmtTime(buffer.duration)}`);
      $('startBtn').disabled = false;
    } catch (err) {
      console.error(err);
      if (token !== loadToken) return;
      status(location.protocol === 'file:'
        ? '収録曲は start.bat から起動した時だけ読み込めます（ブラウザの制限のため）。'
        : '曲を読み込めませんでした。');
    }
  }

  async function loadSong(song) {
    if (cache[song.id]) return cache[song.id];
    const G = RG.ChartGenerator;
    let buf = song.buffer;
    if (!buf) {
      status(`${song.title} を読み込み中…`);
      const res = await fetch(song.file);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.arrayBuffer();
      song.cover = await RG.Share.extractCover(data);   // 結果画像に使うジャケット（デコードの前に読む）
      buf = await audio.ensure().decodeAudioData(data);
    }
    const features = await G.extractFeatures(buf, p => status(`譜面を解析中… ${Math.round(p * 100)}%`));
    const bpm = song.bpm || G.estimateTempo(features).bpm;
    const beats = G.trackBeats(features, bpm);
    // 拍への当てはまりは、その曲で使う格子（16分・3連符など）のうち一番よく合うもので判断する
    const grids = [...new Set(DIFFS.map(d => song.difficulties[d].grid || 4))];
    const fit = Math.max(...grids.map(g => G.gridFit(features, beats, g)));
    const useBeats = fit >= cfg.minGridFit ? beats : null;
    song.duration = buf.duration;
    if (!song.bpm) song.bpm = Math.round(bpm);
    // 収録曲以外は難易度の数字をノーツの密度から自動で付ける
    for (const d of DIFFS) {
      const opts = song.difficulties[d];
      if (opts.level == null) opts.level = G.rateLevel(G.buildChart(features, { ...opts, beats: useBeats }));
    }
    return (cache[song.id] = { buffer: buf, features, beats: useBeats, lyrics: song.file ? await loadLyrics(song) : null });
  }

  // 歌詞のタイミング: songs/lyrics/<曲ID>.json（[{ t: 歌い出し秒, e: 歌い終わり秒, text }]）。無ければ表示しない
  async function loadLyrics(song) {
    try {
      const res = await fetch(`songs/lyrics/${song.id}.json`);
      return res.ok ? await res.json() : null;
    } catch (e) {
      return null;
    }
  }

  function addCustomSong(id, title, buf, cover) {
    delete cache[id];
    customSongs[id] = { id, title, buffer: buf, cover, bpm: null, difficulties: JSON.parse(JSON.stringify(cfg.difficulty)) };
    select(id, 'normal');
  }

  $('fileInput').addEventListener('change', async e => {
    const file = e.target.files[0];
    if (!file) return;
    status('読み込み中…');
    try {
      const data = await file.arrayBuffer();
      const cover = await RG.Share.extractCover(data);
      addCustomSong('custom', file.name.replace(/\.[^.]+$/, ''), await audio.ensure().decodeAudioData(data), cover);
    } catch (err) {
      console.error(err);
      status('この音楽ファイルは読み込めませんでした（mp3 / wav / ogg / m4a などを試してください）');
    }
  });
  $('startBtn').addEventListener('click', start);

  try { cfg.showLyrics = localStorage.getItem('rg.showLyrics') !== '0'; } catch (e) { /* 保存できない環境 */ }
  $('showLyrics').checked = cfg.showLyrics;
  $('showLyrics').addEventListener('change', e => {
    cfg.showLyrics = e.target.checked;
    try { localStorage.setItem('rg.showLyrics', cfg.showLyrics ? '1' : '0'); } catch (err) { /* 保存できない環境 */ }
  });
  renderSongList();

  function start() {
    if (!chart) return;
    rhythm.reset(chart.notes, lyrics, sel && cfg.approachTimes[sel.diff]);
    side.setup(chart);
    $('sideLabel').textContent = 'サイドゲーム（矢印キー）';
    audio.play(buffer, cfg.leadIn);
    state = 'playing';
    $('overlay').classList.add('hidden');
    $('menu').classList.add('hidden');
    $('result').classList.add('hidden');
  }

  function togglePause() {
    if (state === 'playing') { state = 'paused'; audio.pause(); side.pause(); }
    else if (state === 'paused') { state = 'playing'; audio.resume(); }
  }

  function finish() {
    state = 'result';
    audio.stop();
    side.pause();
    const c = rhythm.counts;
    const acc = rhythm.accuracy;
    const rank = acc >= 0.95 ? 'S' : acc >= 0.85 ? 'A' : acc >= 0.7 ? 'B' : acc >= 0.5 ? 'C' : 'D';
    const fullCombo = c.miss === 0 && rhythm.notes.length > 0;
    let record = '';
    if (sel) {
      const prev = loadBest(sel.song.id, sel.diff);
      if (!prev || rhythm.score > prev.score) {
        saveBest(sel.song.id, sel.diff, { score: rhythm.score, rank, maxCombo: rhythm.maxCombo });
        record = prev ? `NEW RECORD!（前回 ${prev.score}）` : 'NEW RECORD!';
      } else record = `自己ベスト ${prev.score}`;
      renderSongList();
    }
    const rows = [
      ['h', '音ゲー'],
      ['ランク', rank + (fullCombo ? '（フルコンボ!）' : '')],
      ['スコア', rhythm.score], ['最大コンボ', `${rhythm.maxCombo} / ${rhythm.notes.length}`],
      ['PERFECT', c.perfect], ['GREAT', c.great], ['GOOD', c.good], ['MISS', c.miss],
      ['精度', (rhythm.accuracy * 100).toFixed(1) + '%'],
      ['壊された特典ブロック', rhythm.blocksLost],
      ['回復した特典ブロック', rhythm.blocksRepaired],
    ];
    const sideResults = side.results();
    for (const r of sideResults) {
      rows.push(['h', r.name]);
      for (const [k, v] of Object.entries(r.result)) rows.push([k, v]);
    }
    // キャラ育成：成績を今のキャラの能力値に足す
    const grown = RG.Chars.applyPlay({ counts: c, accuracy: acc, maxCombo: rhythm.maxCombo, blocksRepaired: rhythm.blocksRepaired, side: sideResults });
    rows.push(...RG.CharsUI.resultRows(grown));
    const shared = {
      title: sel ? sel.song.title : songName, diffName: sel ? cfg.difficultyNames[sel.diff] : '',
      level: sel ? sel.song.difficulties[sel.diff].level : '?', rank, fullCombo,
      score: rhythm.score, maxCombo: rhythm.maxCombo, notes: rhythm.notes.length, accuracy: acc, counts: { ...c },
      blocksLost: rhythm.blocksLost, blocksRepaired: rhythm.blocksRepaired, side: sideResults, cover: sel && sel.song.cover,
    };
    const card = RG.Share.makeCard(shared);
    $('result').innerHTML = `<h1>RESULT</h1><p class="lead">${escapeHtml(songName)}<br><b>${escapeHtml(record)}</b></p>
      <p class="scroll-hint">成績の一覧はマウスホイールか ↑ ↓ でスクロールできます</p>
      <div class="result-grid"><img class="share-preview" alt="結果画像" src="${card.toDataURL('image/jpeg', 0.85)}">${rows.map(([k, v]) => k === 'h'
        ? `<div class="h">${escapeHtml(v)}</div>`
        : `<div>${escapeHtml(k)}</div><div class="v">${escapeHtml(String(v))}</div>`).join('')}</div>
      <div class="share-bar">
        <span>結果を共有：</span>
        <button type="button" id="shareSave">画像を保存</button>
        <button type="button" id="shareX">X に投稿</button>
        <button type="button" id="shareLine">LINE で送る</button>
        <button type="button" id="shareInsta">Instagram</button>
        <button type="button" id="shareTweetApp">tweet.app（テスト）</button>
      </div>
      <p class="share-status" id="shareStatus"></p>
      <div class="row"><button id="retryBtn" class="primary" type="button">もう一度</button></div>
      <div class="row"><button id="menuBtn" type="button">曲・難易度を選び直す</button></div>`;
    $('overlay').classList.remove('hidden');
    $('result').classList.remove('hidden');
    $('result').querySelector('.result-grid').scrollTop = 0;
    const shareStatus = text => { $('shareStatus').textContent = text; };
    $('shareSave').addEventListener('click', async () => {
      await RG.Share.saveImage(card);
      shareStatus('結果画像（jpg）を保存しました。');
    });
    $('shareX').addEventListener('click', async () => {
      const copied = await RG.Share.openX(shared, card);
      shareStatus(copied
        ? 'X の投稿画面を開きました。画像はコピー済みなので、投稿欄で Ctrl+V を押すと貼り付けられます。'
        : 'X の投稿画面を開きました。画像は「画像を保存」してから添付してください。');
    });
    $('shareLine').addEventListener('click', () => {
      RG.Share.openLine(shared);
      shareStatus('LINE の送信画面を開きました（LINE では画像は送れないので、必要なら「画像を保存」してから送ってください）。');
    });
    $('shareInsta').addEventListener('click', async () => {
      const how = await RG.Share.shareInstagram(shared, card);
      if (how === 'saved') shareStatus('画像を保存して Instagram を開きました。Instagram の「作成」から保存した画像を投稿してください。');
      else if (how === 'shared') shareStatus('共有メニューに渡しました。');
    });
    $('shareTweetApp').addEventListener('click', async () => {
      const copied = await RG.Share.openTweetApp(shared);
      shareStatus(copied
        ? 'tweet.app を開きました。投稿文はコピー済みなので、投稿欄で Ctrl+V（スマホは長押しで貼り付け）してください。画像は「画像を保存」してから添付してください。'
        : 'tweet.app を開きました。投稿文をコピーできなかったので、文章は手で入力してください。');
    });
    $('retryBtn').addEventListener('click', start);
    $('menuBtn').addEventListener('click', () => {
      state = 'menu';
      $('result').classList.add('hidden');
      RG.CharsUI.show('menu');
    });
  }

  function escapeHtml(s) {
    return s.replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  }

  // ---- ループ ----
  let lastNow = performance.now();
  function frame(now) {
    const dt = Math.min(0.25, (now - lastNow) / 1000);
    lastNow = now;
    const active = state === 'playing' || state === 'paused';
    const t = active ? audio.time : 0;

    if (state === 'playing') {
      rhythm.update(t);
      side.update(dt, t);
      if (t > buffer.duration + 1.5) finish();
    }

    const keys = cfg.laneKeys.map(k => input.isDown(k));
    rhythm.render(rg, t, keys);
    side.render(sg, t);

    if (active && t < 0) drawCenter(rg, Math.ceil(-t).toString(), 'bold 80px sans-serif');
    if (state === 'paused') {
      for (const g of [rg, sg]) {
        g.fillStyle = 'rgba(0,0,0,0.55)';
        g.fillRect(0, 0, 480, 720);
      }
      drawCenter(rg, 'PAUSE', 'bold 48px sans-serif');
      drawCenter(sg, 'Esc で再開', 'bold 28px sans-serif');
    }
    requestAnimationFrame(frame);
  }

  function drawCenter(g, text, font) {
    g.textAlign = 'center';
    g.fillStyle = '#e8eaf6';
    g.font = font;
    g.fillText(text, 240, 380);
  }

  requestAnimationFrame(frame);
})();
