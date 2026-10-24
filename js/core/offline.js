// オフライン版の曲の読み込み。
// index.html をファイルとして直接開くと（file://）、ブラウザの制限で mp3 や歌詞を fetch できない。
// そこでオフライン版（tools/build_offline.py で作る）では、曲を songs/offline/<曲ID>.js（mp3 を文字にしたもの）に入れておき、
// <script> で読み込む。公開ページ（https://）や start.bat では使わない。
(function () {
  const active = location.protocol === 'file:';
  RG.offlineSongs = RG.offlineSongs || {};   // 各ファイルが { audio: base64, lyrics } を入れる
  const loading = {};

  function loadScript(id) {
    if (RG.offlineSongs[id]) return Promise.resolve();
    return loading[id] || (loading[id] = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = `songs/offline/${id}.js`;
      s.onload = resolve;
      s.onerror = () => { delete loading[id]; reject(new Error(`オフライン版の曲データがありません: ${id}`)); };
      document.head.appendChild(s);
    }));
  }

  // 曲の mp3 の中身（ArrayBuffer）
  async function songBytes(song) {
    if (!active) {
      const res = await fetch(song.file);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.arrayBuffer();
    }
    await loadScript(song.id);
    const bin = atob(RG.offlineSongs[song.id].audio);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return bytes.buffer;
  }

  // 歌詞のタイミング（無ければ null）
  async function lyrics(song) {
    try {
      if (!active) {
        const res = await fetch(`songs/lyrics/${song.id}.json`);
        return res.ok ? await res.json() : null;
      }
      await loadScript(song.id);
      return RG.offlineSongs[song.id].lyrics || null;
    } catch (e) {
      return null;
    }
  }

  // <audio> で流すためのアドレス（オフライン版では曲データから作る）
  async function songUrl(song) {
    if (!active) return song.file;
    const bytes = await songBytes(song);
    return URL.createObjectURL(new Blob([bytes], { type: 'audio/mpeg' }));
  }

  RG.Offline = { active, songBytes, lyrics, songUrl };
})();
