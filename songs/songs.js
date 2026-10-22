// 収録曲の一覧と、曲ごとの難易度設定。曲選択画面では選んだ難易度のレベル順に並び替えて表示する。
//
//  lang         歌詞の言語（曲選択画面のタイトルの下に表示。複数可）
//  bpm          おおよそのテンポ（拍の追跡の手がかり。曲中でテンポが揺れても追従する）
//  difficulties 難易度ごとの設定
//    level        画面に出す難易度の数字（1〜12）
//    grid         ノーツを置く細かさ（1=4分音符, 2=8分音符, 3=3連符, 4=16分音符）
//    minStrength  これより弱い音はノーツにしない（0〜1。上げるとノーツが減る）
//    chordRatio   強い音の上位この割合を2つ同時押しにする
//
// minStrength は「1秒あたりのノーツ数」が狙いの値になるよう、曲ごとに解析して決めた値。
// 目安: EASY 1.1〜1.5個/秒（4分音符のみ）, NORMAL 2.0〜2.8個/秒（8分まで）, HARD 3.2〜4.6個/秒（16分まで＋同時押し）
RG.songs = [
  {
    id: 'ehabumi_song_orchestra',
    title: 'エハブミちゃんの歌 ～オーケストラ～',
    lang: ['日本語'],
    file: 'songs/ehabumi_song_orchestra.mp3',
    bpm: 104,
    difficulties: {
      easy:   { level: 2,  grid: 1, minStrength: 0.44, chordRatio: 0 },
      normal: { level: 4,  grid: 2, minStrength: 0.43, chordRatio: 0.04 },
      hard:   { level: 7,  grid: 4, minStrength: 0.39, chordRatio: 0.08 },
    },
  },
  {
    id: 'absolute_headache',
    title: 'Absolute Headache (decent)',
    lang: ['英語'],
    file: 'songs/absolute_headache.mp3',
    bpm: 136,
    difficulties: {
      easy:   { level: 3,  grid: 1, minStrength: 0.48, chordRatio: 0 },
      normal: { level: 6,  grid: 2, minStrength: 0.43, chordRatio: 0.04 },
      hard:   { level: 9,  grid: 4, minStrength: 0.22, chordRatio: 0.08 },
    },
  },
  {
    id: 'kanzen_kuuki_2',
    title: '完全空気エハブミさん　エンディング',
    lang: ['日本語'],
    file: 'songs/kanzen_kuuki_2.mp3',
    bpm: 140,
    difficulties: {
      easy:   { level: 3,  grid: 1, minStrength: 0.57, chordRatio: 0 },
      normal: { level: 6,  grid: 2, minStrength: 0.49, chordRatio: 0.04 },
      hard:   { level: 9,  grid: 4, minStrength: 0.39, chordRatio: 0.08 },
    },
  },
  {
    id: 'kanzen_kuuki_1',
    title: '完全空気エハブミさん　オープニング',
    lang: ['日本語'],
    file: 'songs/kanzen_kuuki_1.mp3',
    bpm: 150,
    difficulties: {
      easy:   { level: 3,  grid: 1, minStrength: 0.56, chordRatio: 0 },
      normal: { level: 6,  grid: 2, minStrength: 0.46, chordRatio: 0.04 },
      hard:   { level: 10, grid: 4, minStrength: 0.36, chordRatio: 0.08 },
    },
  },
  {
    id: 'identity_survival',
    title: 'Identity Survival (基本版)',
    lang: ['日本語'],
    file: 'songs/identity_survival.mp3',
    bpm: 143,
    difficulties: {
      easy:   { level: 3,  grid: 1, minStrength: 0.42, chordRatio: 0 },
      normal: { level: 6,  grid: 2, minStrength: 0.40, chordRatio: 0.04 },
      hard:   { level: 10, grid: 4, minStrength: 0.36, chordRatio: 0.08 },
    },
  },
  {
    id: 'absolute_headache_wrath',
    title: "Absolute Headache (Berujaman's Wrath)",
    lang: ['英語'],
    file: 'songs/absolute_headache_wrath.mp3',
    bpm: 146,
    difficulties: {
      easy:   { level: 3,  grid: 1, minStrength: 0.28, chordRatio: 0 },
      normal: { level: 6,  grid: 2, minStrength: 0.27, chordRatio: 0.04 },
      hard:   { level: 10, grid: 4, minStrength: 0.31, chordRatio: 0.08 },
    },
  },
  {
    // 速い曲なので HARD も8分音符まで
    id: 'forging_ourselves',
    title: 'Forging Ourselves (MONOZUKURI)',
    lang: ['英語'],
    file: 'songs/forging_ourselves.mp3',
    bpm: 176,
    difficulties: {
      easy:   { level: 3,  grid: 1, minStrength: 0.44, chordRatio: 0 },
      normal: { level: 6,  grid: 2, minStrength: 0.39, chordRatio: 0.04 },
      hard:   { level: 10, grid: 2, minStrength: 0.29, chordRatio: 0.08 },
    },
  },
  {
    id: 'identity_survival_full_armor',
    title: 'Identity Survival (フルアーマー版)',
    lang: ['日本語'],
    file: 'songs/identity_survival_full_armor.mp3',
    bpm: 128,
    difficulties: {
      easy:   { level: 3,  grid: 1, minStrength: 0.44, chordRatio: 0 },
      normal: { level: 5,  grid: 2, minStrength: 0.41, chordRatio: 0.04 },
      hard:   { level: 9,  grid: 4, minStrength: 0.38, chordRatio: 0.08 },
    },
  },
  {
    // 音数が少ない曲なので HARD は Lv8 止まり
    id: 'ehabumi_song_folk',
    title: 'エハブミちゃんの歌 ～フォーク～',
    lang: ['日本語'],
    file: 'songs/ehabumi_song_folk.mp3',
    bpm: 136,
    difficulties: {
      easy:   { level: 3,  grid: 1, minStrength: 0.58, chordRatio: 0 },
      normal: { level: 6,  grid: 2, minStrength: 0.35, chordRatio: 0.04 },
      hard:   { level: 8,  grid: 4, minStrength: 0.20, chordRatio: 0.08 },
    },
  },
  {
    id: 'kioku_ai_si',
    title: '記憶のAI=SI方へ',
    lang: ['日本語'],
    file: 'songs/kioku_ai_si.mp3',
    bpm: 133,
    difficulties: {
      easy:   { level: 3,  grid: 1, minStrength: 0.39, chordRatio: 0 },
      normal: { level: 6,  grid: 2, minStrength: 0.33, chordRatio: 0.04 },
      hard:   { level: 9,  grid: 4, minStrength: 0.21, chordRatio: 0.08 },
    },
  },
  {
    id: 'monozukuri_jp',
    title: '者創り（MONOZUKURI）日本語版',
    lang: ['日本語'],
    file: 'songs/monozukuri_jp.mp3',
    bpm: 140,
    difficulties: {
      easy:   { level: 3,  grid: 1, minStrength: 0.39, chordRatio: 0 },
      normal: { level: 6,  grid: 2, minStrength: 0.35, chordRatio: 0.04 },
      hard:   { level: 9,  grid: 4, minStrength: 0.29, chordRatio: 0.08 },
    },
  },
  {
    id: 'shouri_haiboku',
    title: '勝利への敗北',
    lang: ['日本語', '英語'],
    file: 'songs/shouri_haiboku.mp3',
    bpm: 137,
    difficulties: {
      easy:   { level: 3,  grid: 1, minStrength: 0.63, chordRatio: 0 },
      normal: { level: 6,  grid: 2, minStrength: 0.48, chordRatio: 0.04 },
      hard:   { level: 9,  grid: 4, minStrength: 0.43, chordRatio: 0.08 },
    },
  },
  {
    // 跳ねるリズム（シャッフル）なので NORMAL/HARD は3連符の格子
    id: 'shouri_haiboku_showa',
    title: '勝利への敗北 ～昭和継承風～',
    lang: ['日本語', '英語'],
    file: 'songs/shouri_haiboku_showa.mp3',
    bpm: 146,
    difficulties: {
      easy:   { level: 3,  grid: 1, minStrength: 0.50, chordRatio: 0 },
      normal: { level: 6,  grid: 3, minStrength: 0.48, chordRatio: 0.04 },
      hard:   { level: 10, grid: 3, minStrength: 0.41, chordRatio: 0.08 },
    },
  },
  {
    // 記憶のAI=SI方への韓国語版
    id: 'kioku_ai_si_ko',
    title: '기억 속 AI＝SI절',
    lang: ['韓国語'],
    file: 'songs/kioku_ai_si_ko.mp3',
    bpm: 136,
    difficulties: {
      easy:   { level: 3,  grid: 1, minStrength: 0.39, chordRatio: 0 },
      normal: { level: 6,  grid: 2, minStrength: 0.33, chordRatio: 0.04 },
      hard:   { level: 9,  grid: 4, minStrength: 0.24, chordRatio: 0.08 },
    },
  },
  {
    // 者創りの中国語（繁体字）版
    id: 'monozukuri_zh',
    title: '鑄人（MONOZUKURI）',
    lang: ['中国語'],
    file: 'songs/monozukuri_zh.mp3',
    bpm: 142,
    difficulties: {
      easy:   { level: 3,  grid: 1, minStrength: 0.50, chordRatio: 0 },
      normal: { level: 6,  grid: 2, minStrength: 0.46, chordRatio: 0.04 },
      hard:   { level: 10, grid: 4, minStrength: 0.39, chordRatio: 0.08 },
    },
  },
  {
    id: 'forging_ourselves_robo',
    title: 'Forging Ourselves (MONOZUKURI) おまけロボアニメ風',
    lang: ['英語'],
    file: 'songs/forging_ourselves_robo.mp3',
    bpm: 137,
    difficulties: {
      easy:   { level: 3,  grid: 1, minStrength: 0.49, chordRatio: 0 },
      normal: { level: 6,  grid: 2, minStrength: 0.47, chordRatio: 0.04 },
      hard:   { level: 9,  grid: 4, minStrength: 0.41, chordRatio: 0.08 },
    },
  },
  {
    id: 'lifework_norma',
    title: 'ライフワークノルマの歌',
    lang: ['日本語'],
    file: 'songs/lifework_norma.mp3',
    bpm: 112,
    difficulties: {
      easy:   { level: 3,  grid: 1, minStrength: 0.40, chordRatio: 0 },
      normal: { level: 5,  grid: 2, minStrength: 0.36, chordRatio: 0.04 },
      hard:   { level: 8,  grid: 4, minStrength: 0.31, chordRatio: 0.08 },
    },
  },
];
