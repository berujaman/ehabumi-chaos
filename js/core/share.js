// 結果の共有：結果画像（1200x675 の jpg）づくりと、SNS の投稿画面を開くリンク。
//  - 画像そのものを投稿リンクで渡すことはできない（X・LINE の仕様）。
//    そのため X ボタンは画像をクリップボードにもコピーし、投稿画面で Ctrl+V で貼れるようにする
//  - Instagram には投稿画面を開くリンクが無い。スマホでは共有メニュー（画像付き）、PC では画像を保存して Instagram を開く
(function () {
  const W = 1200, H = 675;
  const RANK_COLORS = { S: '#ffd34d', A: '#ff7eb6', B: '#5cd6ff', C: '#7cf29c', D: '#9aa0c3' };
  const DIFF_COLORS = { EASY: '#7cf29c', NORMAL: '#ffb84d', HARD: '#ff5c8a' };
  // 右のゲームごとに、画像に載せる代表的な成績
  const SIDE_KEYS = ['結果', 'KO', '撃破', '壊したブロック', '勝ち', 'TRUE END', 'デート回数'];

  // ---- mp3 に埋め込まれたジャケット画像（ID3 の APIC）を取り出す ----
  async function extractCover(arrayBuffer) {
    try {
      const b = new Uint8Array(arrayBuffer);
      if (b[0] !== 0x49 || b[1] !== 0x44 || b[2] !== 0x33) return null;   // "ID3"
      const ver = b[3];
      const size = (b[6] << 21) | (b[7] << 14) | (b[8] << 7) | b[9];
      let i = 10;
      while (i + 10 < 10 + size) {
        const id = String.fromCharCode(b[i], b[i + 1], b[i + 2], b[i + 3]);
        if (!/^[A-Z0-9]{4}$/.test(id)) break;
        const fs = ver === 4
          ? (b[i + 4] << 21) | (b[i + 5] << 14) | (b[i + 6] << 7) | b[i + 7]
          : ((b[i + 4] << 24) | (b[i + 5] << 16) | (b[i + 6] << 8) | b[i + 7]) >>> 0;
        if (id === 'APIC') {
          let p = i + 10;
          const end = p + fs, enc = b[p++];
          let mime = '';
          while (b[p] !== 0) mime += String.fromCharCode(b[p++]);
          p += 2;   // mime の終端と画像の種類
          if (enc === 1 || enc === 2) { while (!(b[p] === 0 && b[p + 1] === 0)) p += 2; p += 2; }
          else { while (b[p] !== 0) p++; p++; }
          const blob = new Blob([b.slice(p, end)], { type: mime || 'image/jpeg' });
          return await createImageBitmap(blob);
        }
        i += 10 + fs;
      }
    } catch (e) { /* ジャケットが読めなくても結果画像は作れる */ }
    return null;
  }

  // 幅に収まるよう折り返す（英語は単語の途中で切らない、日本語は1文字ずつ）
  function wrap(g, text, maxW) {
    const tokens = text.match(/[A-Za-z0-9'’().,!?&\-]+\s*|\s+|./g) || [];
    const rows = [];
    let row = '';
    for (const tok of tokens) {
      if (row && g.measureText(row + tok).width > maxW) { rows.push(row.trimEnd()); row = tok.trimStart(); } else row += tok;
    }
    if (row.trim()) rows.push(row.trimEnd());
    return rows;
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

  // ---- 結果画像 ----
  // r: { title, diffName, level, rank, fullCombo, score, maxCombo, notes, accuracy, counts, blocksLost, blocksRepaired, side, cover, record }
  function makeCard(r) {
    const cv = document.createElement('canvas');
    cv.width = W; cv.height = H;
    const g = cv.getContext('2d');
    const font = (size, bold = true) => `${bold ? 'bold ' : ''}${size}px "Segoe UI", "Hiragino Sans", "Yu Gothic UI", sans-serif`;

    // 背景
    const bg = g.createLinearGradient(0, 0, W, H);
    bg.addColorStop(0, '#1a0f2e');
    bg.addColorStop(1, '#070a16');
    g.fillStyle = bg;
    g.fillRect(0, 0, W, H);
    g.globalAlpha = 0.06;
    g.fillStyle = '#ffffff';
    for (let x = -H; x < W; x += 46) {
      g.beginPath(); g.moveTo(x, H); g.lineTo(x + 18, H); g.lineTo(x + 18 + H, 0); g.lineTo(x + H, 0); g.fill();
    }
    g.globalAlpha = 1;

    // ロゴと日付
    const logo = g.createLinearGradient(56, 0, 520, 0);
    logo.addColorStop(0, '#ff5c8a');
    logo.addColorStop(1, '#5cd6ff');
    g.fillStyle = logo;
    g.font = font(52);
    g.textBaseline = 'alphabetic';
    g.fillText('エハブミカオス', 56, 92);
    const d = new Date();
    g.fillStyle = '#9aa0c3';
    g.font = font(20, false);
    g.textAlign = 'right';
    g.fillText(`${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()} ${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`, W - 56, 88);
    g.textAlign = 'left';

    // ジャケット
    const cx = 56, cy = 130, cs = 380;
    g.save();
    roundRect(g, cx, cy, cs, cs, 18);
    g.clip();
    if (r.cover) {
      const s = Math.max(cs / r.cover.width, cs / r.cover.height);
      g.drawImage(r.cover, cx + (cs - r.cover.width * s) / 2, cy + (cs - r.cover.height * s) / 2, r.cover.width * s, r.cover.height * s);
    } else {
      const pg = g.createLinearGradient(cx, cy, cx + cs, cy + cs);
      pg.addColorStop(0, '#3a2a6a'); pg.addColorStop(1, '#1a3a5a');
      g.fillStyle = pg;
      g.fillRect(cx, cy, cs, cs);
      g.fillStyle = 'rgba(255,255,255,0.5)';
      g.font = font(160);
      g.textAlign = 'center';
      g.fillText('♪', cx + cs / 2, cy + cs / 2 + 56);
      g.textAlign = 'left';
    }
    g.restore();
    g.strokeStyle = 'rgba(255,255,255,0.25)';
    g.lineWidth = 2;
    roundRect(g, cx, cy, cs, cs, 18);
    g.stroke();

    // 曲名と難易度
    const x0 = 480;
    // 長い曲名は文字を小さくして2行までに収める
    g.fillStyle = '#ffffff';
    let titleSize = 38, titleRows;
    for (titleSize of [38, 32, 27]) {
      g.font = font(titleSize);
      titleRows = wrap(g, r.title, 430);
      if (titleRows.length <= 2) break;
    }
    titleRows = titleRows.slice(0, 2);
    const lineH = titleSize + 8;
    titleRows.forEach((row, i) => g.fillText(row, x0, 160 + i * lineH));
    let y = 160 + titleRows.length * lineH - 8;
    const badge = `${r.diffName}  Lv${r.level}`;
    g.font = font(22);
    const bw = g.measureText(badge).width + 28;
    g.fillStyle = DIFF_COLORS[r.diffName] || '#9aa0c3';
    roundRect(g, x0, y - 4, bw, 36, 18);
    g.fill();
    g.fillStyle = '#10142a';
    g.fillText(badge, x0 + 14, y + 22);

    // ランク
    g.textAlign = 'center';
    g.fillStyle = RANK_COLORS[r.rank] || '#ffffff';
    g.font = font(220);
    g.fillText(r.rank, 1040, 330);
    g.font = font(22);
    g.fillStyle = '#c9cde8';
    g.fillText('RANK', 1040, 126);
    if (r.fullCombo) {
      g.fillStyle = '#ffd34d';
      g.font = font(26);
      g.fillText('FULL COMBO!', 1040, 372);
    }
    g.textAlign = 'left';

    // スコアなど（下の「右のゲームの成績」と重ならないよう、行の位置は下から決める）
    y = Math.min(y + 74, 330);
    g.fillStyle = '#9aa0c3';
    g.font = font(20);
    g.fillText('SCORE', x0, y);
    g.fillStyle = '#ffffff';
    g.font = font(58);
    g.fillText(r.score.toLocaleString(), x0, y + 56);
    y = 426;
    const stats = [
      ['最大コンボ', `${r.maxCombo} / ${r.notes}`],
      ['精度', `${(r.accuracy * 100).toFixed(1)}%`],
      ['PERFECT / GREAT / GOOD / MISS', `${r.counts.perfect} / ${r.counts.great} / ${r.counts.good} / ${r.counts.miss}`],
      ['特典ブロック', `壊された ${r.blocksLost}　回復 ${r.blocksRepaired}`],
    ];
    stats.forEach(([k, v], i) => {
      const yy = y + i * 30;
      g.fillStyle = '#9aa0c3';
      g.font = font(18, false);
      g.fillText(k, x0, yy);
      g.fillStyle = '#ffffff';
      g.font = font(20);
      g.fillText(v, x0 + 330, yy);
    });

    // 右のゲームの成績（チップ）
    const chips = r.side.map(s => {
      const key = SIDE_KEYS.find(k => k in s.result) || Object.keys(s.result)[0];
      return key ? `${s.name}：${key === '結果' ? '' : key + ' '}${s.result[key]}` : s.name;
    }).slice(0, 6);
    let chipX = 56;
    const chipY = 552;
    g.font = font(18);
    for (const text of chips) {
      const w = g.measureText(text).width + 26;
      if (chipX + w > W - 56) break;
      g.fillStyle = 'rgba(92,214,255,0.14)';
      roundRect(g, chipX, chipY, w, 34, 17);
      g.fill();
      g.strokeStyle = 'rgba(92,214,255,0.5)';
      g.lineWidth = 1.5;
      g.stroke();
      g.fillStyle = '#d6f4ff';
      g.fillText(text, chipX + 13, chipY + 23);
      chipX += w + 10;
    }

    // フッター：ハッシュタグとゲームのURL
    g.fillStyle = 'rgba(255,255,255,0.08)';
    g.fillRect(0, H - 62, W, 62);
    g.fillStyle = '#ff9ec0';
    g.font = font(22);
    g.fillText(RG.config.share.hashtags.map(h => '#' + h).join('  '), 56, H - 22);
    if (RG.config.share.url) {
      g.textAlign = 'right';
      g.fillStyle = '#c9cde8';
      g.font = font(20, false);
      g.fillText(RG.config.share.url.replace(/^https?:\/\//, ''), W - 56, H - 22);
      g.textAlign = 'left';
    }
    return cv;
  }

  // ---- 投稿文 ----
  function postText(r) {
    const omikuji = r.side.find(s => s.name === 'おみくじ' && s.result['結果'] && s.result['結果'] !== '引かなかった');
    return `『エハブミカオス』で「${r.title}」${r.diffName} Lv${r.level} をプレイ！\n` +
      `ランク${r.rank}${r.fullCombo ? '（フルコンボ!）' : ''} スコア${r.score.toLocaleString()} 最大コンボ${r.maxCombo}` +
      (omikuji ? `\nおみくじは${omikuji.result['結果']}でした` : '');
  }

  // 空白を「+」ではなく「%20」にする（サイトによっては「+」がそのまま表示されるため）
  const query = params => Object.entries(params).map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&');
  const hashtagText = () => RG.config.share.hashtags.map(h => '#' + h).join(' ');
  const toBlob = (cv, type, q) => new Promise(res => cv.toBlob(res, type, q));
  const fileName = () => {
    const d = new Date(), p = n => String(n).padStart(2, '0');
    return `ehabumi-chaos_${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}.jpg`;
  };

  async function saveImage(cv) {
    const blob = await toBlob(cv, 'image/jpeg', 0.92);
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = fileName();
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  }

  // 画像をクリップボードへ（対応していないブラウザでは false）
  async function copyImage(cv) {
    try {
      if (!navigator.clipboard || !window.ClipboardItem) return false;
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': toBlob(cv, 'image/png') })]);
      return true;
    } catch (e) {
      return false;
    }
  }

  // ---- 各SNS ----
  // window.open はクリックの直後に呼ぶ（間に await を挟むとポップアップとしてブロックされる）
  function openX(r, cv) {
    const url = RG.config.share.url;
    const params = { text: postText(r), hashtags: RG.config.share.hashtags.join(',') };
    if (url) params.url = url;
    const q = query(params);
    const copied = copyImage(cv);   // 新しいタブに移る前（このページが前面のうち）にコピーを始める
    window.open(`https://twitter.com/intent/tweet?${q}`, '_blank', 'noopener');
    return copied;
  }

  function openLine(r) {
    const url = RG.config.share.url;
    const text = `${postText(r)}\n${hashtagText()}`;
    const link = url
      ? `https://social-plugins.line.me/lineit/share?${query({ url, text })}`
      : `https://line.me/R/share?text=${encodeURIComponent(text)}`;
    window.open(link, '_blank', 'noopener');
  }

  // tweet.app（テスト版）：投稿画面を開くリンクや文章を渡す仕組みが無いので、
  // 投稿文をクリップボードにコピーしてからアプリを開き、投稿欄に貼り付けてもらう
  function openTweetApp(r) {
    const url = RG.config.share.url;
    const text = `${postText(r)}\n${hashtagText()}${url ? '\n' + url : ''}`;
    let copied;
    try {
      copied = navigator.clipboard.writeText(text).then(() => true, () => false);   // タブを移る前にコピーを始める
    } catch (e) {
      copied = Promise.resolve(false);
    }
    window.open('https://app.tweet.app/feed', '_blank', 'noopener');
    return copied;
  }

  // スマホなど画像付きの共有メニューが使える環境ではそれを使い（Instagram を選べる）、
  // 使えない環境（PC）では画像を保存して Instagram を開く
  const canShareFiles = () => {
    try {
      return !!(navigator.canShare && navigator.canShare({ files: [new File([''], 'x.jpg', { type: 'image/jpeg' })] }));
    } catch (e) {
      return false;
    }
  };

  async function shareInstagram(r, cv) {
    if (!canShareFiles()) {
      window.open('https://www.instagram.com/', '_blank', 'noopener');   // 先に開く（ポップアップ扱いを避ける）
      await saveImage(cv);
      return 'saved';
    }
    const blob = await toBlob(cv, 'image/jpeg', 0.92);
    try {
      await navigator.share({ files: [new File([blob], fileName(), { type: 'image/jpeg' })], text: `${postText(r)}\n${hashtagText()}` });
      return 'shared';
    } catch (e) {
      if (e.name === 'AbortError') return 'cancelled';
      await saveImage(cv);
      return 'saved';
    }
  }

  RG.Share = { extractCover, makeCard, postText, saveImage, openX, openLine, openTweetApp, shareInstagram };
})();
