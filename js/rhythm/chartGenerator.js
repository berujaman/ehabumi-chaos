// 音楽データから譜面を自動生成する。
//
// 方法：
//  1. 短い区間ごとに FFT で周波数成分を求め、前の区間から「増えた音の量」(スペクトルフラックス)を計算
//  2. 周囲より飛び抜けて増えた瞬間を「音の立ち上がり（オンセット）」= ノーツ候補とする（リズム）
//  3. テンポ(BPM)を推定し、候補を 4分/8分/16分音符の格子に合わせて選ぶ（難易度で細かさが変わる）
//  4. その瞬間に増えた音の高さの重心で、低い音→左レーン、高い音→右レーンに振り分ける（メロディ）
//
// 戻り値: { notes: [{time, lane, strength}], onsets: [{time, strength}], duration }
//   onsets は右側のゲーム（敵の出現タイミングなど）でも使う。
(function () {
  const N = 1024, HOP = 512;

  function makeFFT(n) {
    const levels = Math.log2(n);
    const rev = new Uint32Array(n);
    for (let i = 0; i < n; i++) {
      let r = 0, x = i;
      for (let j = 0; j < levels; j++) { r = (r << 1) | (x & 1); x >>= 1; }
      rev[i] = r;
    }
    const cos = new Float32Array(n / 2), sin = new Float32Array(n / 2);
    for (let i = 0; i < n / 2; i++) {
      cos[i] = Math.cos(2 * Math.PI * i / n);
      sin[i] = Math.sin(2 * Math.PI * i / n);
    }
    return function (re, im) {
      for (let i = 0; i < n; i++) {
        const j = rev[i];
        if (j > i) {
          let t = re[i]; re[i] = re[j]; re[j] = t;
          t = im[i]; im[i] = im[j]; im[j] = t;
        }
      }
      for (let size = 2; size <= n; size <<= 1) {
        const half = size >> 1, step = n / size;
        for (let i = 0; i < n; i += size) {
          for (let j = 0, k = 0; j < half; j++, k += step) {
            const a = i + j, b = a + half;
            const tr = re[b] * cos[k] + im[b] * sin[k];
            const ti = im[b] * cos[k] - re[b] * sin[k];
            re[b] = re[a] - tr; im[b] = im[a] - ti;
            re[a] += tr; im[a] += ti;
          }
        }
      }
    };
  }

  const fft = makeFFT(N);
  const hann = new Float32Array(N);
  for (let i = 0; i < N; i++) hann[i] = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / (N - 1));
  const yieldToBrowser = () => new Promise(r => setTimeout(r, 0));

  // ---- 1. 特徴抽出（重い処理。曲ごとに1回だけ行い、難易度の切替では使い回す） ----
  // 戻り値: { duration, candidates: [{time, strength, pitch}] }  candidates = ノーツ候補となる全オンセット
  async function extractFeatures(buffer, onProgress) {
    const sr = buffer.sampleRate, len = buffer.length;

    const mono = new Float32Array(len);
    for (let c = 0; c < buffer.numberOfChannels; c++) {
      const d = buffer.getChannelData(c);
      for (let i = 0; i < len; i++) mono[i] += d[i] / buffer.numberOfChannels;
    }

    const frames = Math.max(0, Math.floor((len - N) / HOP) + 1);
    const flux = new Float32Array(frames);
    const pitch = new Float32Array(frames);
    const re = new Float32Array(N), im = new Float32Array(N);
    const prev = new Float32Array(N / 2);
    const binHz = sr / N;
    const maxBin = Math.min(N / 2 - 1, Math.floor(10000 / binHz));
    const pitchLo = Math.max(1, Math.floor(100 / binHz)), pitchHi = Math.floor(4000 / binHz);

    for (let f = 0; f < frames; f++) {
      const off = f * HOP;
      for (let i = 0; i < N; i++) { re[i] = mono[off + i] * hann[i]; im[i] = 0; }
      fft(re, im);
      let sum = 0, wsum = 0, dsum = 0;
      for (let k = 1; k <= maxBin; k++) {
        const m = Math.log1p(10 * Math.hypot(re[k], im[k]));
        const d = m - prev[k];
        prev[k] = m;
        if (d > 0) {
          sum += d;
          if (k >= pitchLo && k <= pitchHi) { wsum += d * Math.log2(k * binHz); dsum += d; }
        }
      }
      flux[f] = sum;
      pitch[f] = dsum > 0 ? wsum / dsum : NaN;
      if (onProgress && f % 3000 === 0) { onProgress(f / frames); await yieldToBrowser(); }
    }

    // 平均で正規化し、周囲 ±0.25 秒の平均より飛び抜けた所をオンセット候補として拾う
    let mean = 0;
    for (let f = 0; f < frames; f++) mean += flux[f];
    mean = mean / Math.max(1, frames) || 1;
    for (let f = 0; f < frames; f++) flux[f] /= mean;

    const prefix = new Float64Array(frames + 1);
    for (let f = 0; f < frames; f++) prefix[f + 1] = prefix[f] + flux[f];
    const W = Math.max(2, Math.round(0.25 * sr / HOP));
    const frameTime = f => (f * HOP + N / 2) / sr;

    const peaks = [];
    for (let f = 1; f < frames - 1; f++) {
      const v = flux[f];
      if (v <= flux[f - 1] || v < flux[f + 1]) continue;
      const a = Math.max(0, f - W), b = Math.min(frames, f + W + 1);
      const local = (prefix[b] - prefix[a]) / (b - a);
      if (v < Math.max(local * CANDIDATE_SENSITIVITY, 0.8)) continue;
      const p = { time: frameTime(f), value: v, pitch: pitch[Math.min(frames - 1, f + 1)] };
      const last = peaks[peaks.length - 1];
      if (last && p.time - last.time < 0.05) {
        if (p.value > last.value) peaks[peaks.length - 1] = p;
      } else {
        peaks.push(p);
      }
    }

    // 強さを 0〜1 に（上位 2% を 1 とする）
    const vals = peaks.map(p => p.value).sort((x, y) => x - y);
    const top = vals[Math.floor(vals.length * 0.98)] || 1;
    const candidates = peaks.map(p => ({ time: p.time, strength: Math.min(1, p.value / top), pitch: p.pitch }));

    if (onProgress) onProgress(1);
    return { duration: buffer.duration, candidates };
  }
  const CANDIDATE_SENSITIVITY = 1.2;

  // ---- 2. テンポ推定 ----
  // 戻り値: { bpm, offset(拍の頭の時刻, 0〜1拍), fit(16分音符の格子に乗っている割合 0〜1) }
  function estimateTempo(features) {
    const cands = features.candidates;
    const R = 100, n = Math.ceil(features.duration * R) + 2;
    const sig = new Float32Array(n);
    for (const c of cands) sig[Math.round(c.time * R)] += c.strength;

    // 粗い推定：自己相関（125BPM付近をやや優先）
    let best = 70, bestScore = -1;
    for (let bpm = 70; bpm <= 190; bpm += 0.5) {
      const lag = 60 / bpm * R;
      let s = 0;
      for (let i = 0; i + lag + 1 < n; i++) {
        const j = i + lag, j0 = Math.floor(j), f = j - j0;
        s += sig[i] * (sig[j0] * (1 - f) + sig[j0 + 1] * f);
      }
      s /= (n - lag);
      const prior = Math.exp(-0.5 * Math.pow(Math.log2(bpm / 125) / 0.6, 2));
      if (s * prior > bestScore) { bestScore = s * prior; best = bpm; }
    }

    // 細かい推定：曲全体で8分音符の位相がそろうテンポを探す（長い曲ほど正確になる）
    const coherence = bpm => {
      const g = 30 / bpm;
      let cs = 0, sn = 0;
      for (const c of cands) {
        const a = 2 * Math.PI * c.time / g;
        cs += c.strength * Math.cos(a);
        sn += c.strength * Math.sin(a);
      }
      return { r: Math.hypot(cs, sn), angle: Math.atan2(sn, cs) };
    };
    let bpm = best, bestR = -1, angle = 0;
    for (let b = best - 0.6; b <= best + 0.6; b += 0.005) {
      const c = coherence(b);
      if (c.r > bestR) { bestR = c.r; bpm = b; angle = c.angle; }
    }

    // 位相：8分の格子 → 拍の頭がどちらの8分か（強い音が多い方）を選ぶ
    const beat = 60 / bpm, g = beat / 2;
    const off8 = ((angle / (2 * Math.PI)) * g % g + g) % g;
    const onBeat = off => {
      let s = 0;
      for (const c of cands) {
        const d = ((c.time - off) % beat + beat) % beat;
        const dev = Math.min(d, beat - d);
        s += c.strength * Math.exp(-0.5 * Math.pow(dev / 0.03, 2));
      }
      return s;
    };
    const offset = onBeat(off8) >= onBeat(off8 + g) ? off8 : off8 + g;

    // 当てはまり具合：強めの音のうち、16分音符の格子 ±30ms に乗っている割合
    const g16 = beat / 4;
    let on = 0, total = 0;
    for (const c of cands) {
      if (c.strength < 0.4) continue;
      const k = Math.round((c.time - offset) / g16);
      total += c.strength;
      if (Math.abs(c.time - offset - k * g16) <= 0.03) on += c.strength;
    }
    return { bpm: Math.round(bpm * 1000) / 1000, offset: Math.round(offset * 10000) / 10000, fit: total ? on / total : 0 };
  }

  // ---- 2b. 拍の追跡 ----
  // テンポが少しずつ揺れる曲（生演奏・AI生成曲など）でも拍を追えるよう、
  // 「音の強い所を通りつつ、間隔がおおよそ一定」な拍の並びを動的計画法で探す。
  // bpm はおおよその値でよい。戻り値: 拍の時刻（秒）の配列
  function trackBeats(features, bpm, tightness = 300) {
    const R = 100, n = Math.ceil(features.duration * R) + 1;
    const raw = new Float32Array(n);
    for (const c of features.candidates) raw[Math.min(n - 1, Math.round(c.time * R))] += c.strength;
    const env = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      let s = 0;
      for (let k = -4; k <= 4; k++) if (i + k >= 0 && i + k < n) s += raw[i + k] * Math.exp(-0.5 * (k / 1.5) ** 2);
      env[i] = s;
    }
    let m = 0, v = 0;
    for (let i = 0; i < n; i++) m += env[i] / n;
    for (let i = 0; i < n; i++) v += (env[i] - m) ** 2 / n;
    const sd = Math.sqrt(v) || 1;
    for (let i = 0; i < n; i++) env[i] /= sd;

    const tau = 60 / bpm * R;
    const lo = Math.max(1, Math.round(tau * 0.6)), hi = Math.round(tau * 1.6);
    const score = new Float32Array(n), back = new Int32Array(n).fill(-1);
    for (let t = 0; t < n; t++) {
      let best = 0, bp = -1;
      for (let p = Math.max(0, t - hi); p <= t - lo; p++) {
        const s = score[p] - tightness * Math.log((t - p) / tau) ** 2;
        if (s > best) { best = s; bp = p; }
      }
      score[t] = env[t] + best;
      back[t] = bp;
    }
    let end = n - 1;
    for (let t = Math.max(0, n - Math.round(tau)); t < n; t++) if (score[t] > score[end]) end = t;
    const beats = [];
    for (let t = end; t >= 0; t = back[t]) beats.push(t / R);
    beats.reverse();

    // 追跡できなかった曲頭・曲尾は、端の拍間隔で埋める
    if (beats.length >= 2) {
      const first = beats[1] - beats[0], last = beats[beats.length - 1] - beats[beats.length - 2];
      while (beats[0] - first > 0) beats.unshift(beats[0] - first);
      while (beats[beats.length - 1] + last < features.duration) beats.push(beats[beats.length - 1] + last);
    }
    return beats.map(b => Math.round(b * 1000) / 1000);
  }

  // 拍を grid 等分した格子点の時刻列
  function subdivide(beats, grid) {
    const pts = [];
    for (let i = 0; i < beats.length - 1; i++) {
      for (let k = 0; k < grid; k++) pts.push(beats[i] + (beats[i + 1] - beats[i]) * k / grid);
    }
    if (beats.length) pts.push(beats[beats.length - 1]);
    return pts;
  }

  function constantBeats(bpm, offset, duration) {
    const beats = [], b = 60 / bpm;
    for (let t = offset; t < duration + b; t += b) beats.push(t);
    return beats;
  }

  // 強めの音が格子に乗っている度合い（0=でたらめ並み, 1=完全に一致）
  function gridFit(features, beats, grid = 4, tol = 0.02) {
    const pts = subdivide(beats, grid);
    const avgG = (beats[beats.length - 1] - beats[0]) / Math.max(1, pts.length - 1);
    const chance = Math.min(1, 2 * tol / avgG);
    let on = 0, tot = 0;
    for (const c of features.candidates) {
      if (c.strength < 0.4) continue;
      tot++;
      if (Math.abs(c.time - pts[nearestIndex(pts, c.time)]) <= tol) on++;
    }
    const fit = tot ? on / tot : 0;
    return Math.max(0, (fit - chance) / (1 - chance));
  }

  function nearestIndex(arr, t) {
    let a = 0, b = arr.length - 1;
    while (b - a > 1) { const mid = (a + b) >> 1; if (arr[mid] <= t) a = mid; else b = mid; }
    return Math.abs(arr[a] - t) <= Math.abs(arr[b] - t) ? a : b;
  }

  // 各格子点ごとに一番強い音を1つ選び、時刻は格子点に合わせる
  function pickOnGrid(cands, pts) {
    const slots = new Map();
    for (const c of cands) {
      const k = nearestIndex(pts, c.time);
      const g = (pts[Math.min(pts.length - 1, k + 1)] - pts[Math.max(0, k - 1)]) / 2 || 0.1;
      if (Math.abs(c.time - pts[k]) > Math.min(0.045, g * 0.3)) continue;
      const cur = slots.get(k);
      if (!cur || c.strength > cur.strength) slots.set(k, { ...c, time: pts[k] });
    }
    return [...slots.values()].sort((a, b) => a.time - b.time);
  }

  // 格子を使わない場合：minGap 秒以内に重なった音は強い方を残す
  function pickByGap(cands, minGap) {
    const picked = [];
    for (const c of cands) {
      const last = picked[picked.length - 1];
      if (last && c.time - last.time < minGap) {
        if (c.strength > last.strength) picked[picked.length - 1] = c;
      } else picked.push(c);
    }
    return picked;
  }

  // ---- 3. 譜面づくり（軽い処理。難易度ごとに呼ぶ） ----
  // opts:
  //   beats         拍の時刻の配列（trackBeats の結果）。または bpm + offset で一定テンポ
  //   grid          1拍を何分割するか（1=4分音符, 2=8分, 4=16分）。拍が無ければ格子なし
  //   minStrength   この強さ未満の音はノーツにしない（密度の調整）
  //   chordRatio    強い音の上位この割合を2つ同時押しにする
  //   minGap        格子なしの時の最小間隔（秒）
  //   maxEmpty      これより長くノーツが途切れる所は補う（秒）
  function buildChart(features, opts) {
    const lanes = RG.config.lanes;
    const cands = features.candidates;
    const beats = opts.beats || (opts.bpm ? constantBeats(opts.bpm, opts.offset || 0, features.duration) : null);
    const useGrid = beats && beats.length > 1 && opts.grid;
    const pick = list => useGrid ? pickOnGrid(list, subdivide(beats, opts.grid)) : pickByGap(list, opts.minGap || 0.2);
    let picked = pick(cands).filter(c => c.strength >= (opts.minStrength || 0) && c.time > 0.2);

    // 静かな所（イントロ等）で長くノーツが途切れないよう、その区間の中で目立つ音を拍ごとに補う
    const maxEmpty = opts.maxEmpty ?? 4;
    const fillPick = list => pickByGap(useGrid ? pickOnGrid(list, subdivide(beats, 2)) : list, 0.4);
    for (let pass = 0; pass < 3; pass++) {  // 1つ目立つ音を補うと残りがまた空くので数回くり返す
      const bounds = [0.2, ...picked.map(p => p.time), features.duration];
      const extra = [];
      for (let i = 0; i < bounds.length - 1; i++) {
        const a = bounds[i], b = bounds[i + 1];
        if (b - a <= maxEmpty) continue;
        const inGap = cands.filter(c => c.time > a + 0.3 && c.time < b - 0.3);
        const loudest = Math.max(0, ...inGap.map(c => c.strength));
        if (loudest < 0.08) continue;  // ほぼ無音ならそのまま休み
        extra.push(...fillPick(inGap.filter(c => c.strength >= loudest * 0.5)));
      }
      if (!extra.length) break;
      picked = picked.concat(extra).sort((x, y) => x.time - y.time);
    }

    // 音の高さの分布を 4 等分してレーンを決める
    const pitches = picked.map(p => p.pitch).filter(v => !isNaN(v)).sort((x, y) => x - y);
    const cuts = [];
    for (let l = 1; l < lanes; l++) cuts.push(pitches[Math.floor(pitches.length * l / lanes)] ?? Infinity);
    const strengths = picked.map(p => p.strength).sort((x, y) => x - y);
    const chordCut = opts.chordRatio > 0 ? strengths[Math.floor(strengths.length * (1 - opts.chordRatio))] : Infinity;

    const notes = [];
    let lastLane = -1, lastTime = -9;
    for (const p of picked) {
      let lane = isNaN(p.pitch) ? (lastLane + 1) % lanes : cuts.filter(c => p.pitch >= c).length;
      // 同じレーンの速い連打（縦連）を避けて隣のレーンへずらす
      if (lane === lastLane && p.time - lastTime < 0.25) lane = lane < lanes - 1 ? lane + 1 : lane - 1;
      notes.push({ time: p.time, lane, strength: p.strength });
      if (p.strength >= chordCut) notes.push({ time: p.time, lane: (lane + 2) % lanes, strength: p.strength });
      lastLane = lane;
      lastTime = p.time;
    }

    return {
      notes,
      onsets: cands.map(c => ({ time: c.time, strength: c.strength })),
      duration: features.duration,
    };
  }

  // 難易度の目安（1〜12）：1秒あたりのノーツ数をもとに計算
  function rateLevel(chart) {
    const active = Math.max(10, chart.duration - 10);
    const nps = chart.notes.length / active;
    return Math.max(1, Math.min(12, Math.round(nps * 2.2)));
  }

  // まとめて全部やる（テンポ指定がなければ格子なしで作る）
  async function analyze(buffer, opts, onProgress) {
    return buildChart(await extractFeatures(buffer, onProgress), opts);
  }

  RG.ChartGenerator = { extractFeatures, estimateTempo, trackBeats, gridFit, constantBeats, buildChart, rateLevel, analyze };
})();
