// ゲーム全体の調整値。バランス調整はまずここを触る。
window.RG = window.RG || {};

RG.config = {
  // ---- 音ゲー ----
  lanes: 4,
  laneKeys: ['KeyA', 'KeyS', 'KeyD', 'KeyF'],
  laneLabels: ['A', 'S', 'D', 'F'],
  approachTime: 1.4,        // ノーツが出現してから判定ラインに届くまでの秒数（難易度の指定が無い時）
  approachTimes: { easy: 1.7, normal: 1.4, hard: 1.15 },  // 難易度ごとの上の秒数（小さいほどノーツが速く流れる）
  leadIn: 3.0,              // 曲が始まるまでの待ち秒数
  audioOffset: 0.0,         // 判定タイミング補正（秒）。音より判定が遅いと感じたら＋
  showLyrics: true,         // 歌詞を音ゲーの背景に表示する（曲選択画面のチェックで切替）
  judge: { perfect: 0.045, great: 0.09, good: 0.135 }, // 判定幅（秒, ±）
  scores: { perfect: 1000, great: 600, good: 300 },

  // 特典ブロック：各レーンの判定ライン下にあり、残数に応じてそのレーンの得点が増える
  bonusBlocksPerLane: 3,
  bonusPerBlock: 0.30,      // ブロック1個あたりの得点倍率加算（1個 x1.30 / 2個 x1.60 / 3個 x1.90）
  allBrokenPenalty: 1000,   // 全ブロックが壊れている時に攻撃を受けた場合の減点
  attackTravelTime: 0.7,    // 右から飛んでくる攻撃が着弾するまでの秒数

  comboRewardEvery: 10,     // このコンボ数ごとに右のゲームへ報酬を送る
  comboRepairEvery: 25,     // このコンボ数ごとに壊れたブロックを1個修復（0で無効）
  greatRewardEvery: 10,     // GREAT以上の判定がこの回数たまるごとに右のゲームへ報酬（コンボが切れても累計。0で無効）
  repairOverflowBonus: 500, // 右から回復が届いた時、壊れたブロックが無ければこの点数を加算

  // 譜面自動生成の標準設定（収録曲以外のファイル用。収録曲は songs/songs.js の曲ごとの設定を使う）
  //   grid: 1拍の分割数 / minStrength: 弱い音を除く / chordRatio: 同時押しの割合
  //   minGap: テンポが取れない曲（拍に乗らない曲）の場合のノーツの最小間隔
  difficultyNames: { easy: 'EASY', normal: 'NORMAL', hard: 'HARD' },
  difficulty: {
    easy:   { grid: 1, minStrength: 0.45, chordRatio: 0,    minGap: 0.40 },
    normal: { grid: 2, minStrength: 0.42, chordRatio: 0.04, minGap: 0.22 },
    hard:   { grid: 4, minStrength: 0.33, chordRatio: 0.08, minGap: 0.13 },
  },
  minGridFit: 0.3,          // 拍への当てはまりがこれ未満なら、格子を使わずに譜面を作る

  // ---- キャラ育成 ----
  // 選べるキャラ画像。差し替えは file を変えるだけ（正方形の画像がおすすめ。png / jpg / webp / svg）。
  // 並び順の番号がパスワードに入るので、追加は末尾に（最大64個）。途中を消すと既存のパスワードの絵がずれる
  // name は画像のキャラ名（キャラ画面に表示）。名前が決まっていないものは仮の名前
  avatars: [
    { name: '名前未定1', file: 'img/avatars/chara1.webp' },   // 赤い翼の鎧の子
    { name: '名前未定2', file: 'img/avatars/chara2.webp' },   // 銀髪・機械の腕の子
    { name: '名前未定3', file: 'img/avatars/chara3.webp' },   // 着物の子
    { name: '名前未定4', file: 'img/avatars/chara4.webp' },   // 紫の丸いキャラ
    { name: 'ミコト', file: 'img/avatars/mikoto.webp' },
    { name: 'しずく', file: 'img/avatars/shizuku.webp' },
    { name: 'ひなた', file: 'img/avatars/hinata.webp' },
  ],

  // ---- 結果の共有 ----
  share: {
    url: 'https://berujaman.github.io/ehabumi-chaos/',   // 公開したゲームのURL（GitHub Pages）。空なら投稿文・画像にリンクを入れない
    hashtags: ['完全空気エハブミさん', 'エハブミカオス'],
  },

  // ---- 右側のサイドゲーム ----
  sideGameDelay: 10,        // 曲開始から右のゲームが始まるまでの秒数
  sideGameRotateInterval: 40, // この秒数ごとに右のゲームをランダムに切り替える（0で切り替えない）

  shooter: {
    playerSpeed: 300,
    fireInterval: 0.14,
    rapidFireInterval: 0.07,
    rapidDuration: 10,
    spawnMinGap: 0.6,        // 敵の出現間隔の下限（秒）
    spawnMinStrength: 0.3,   // この強さ未満の音では敵を出さない
    bigEnemyStrength: 0.8,   // この強さ以上の音で大型敵
    repairEveryKills: 10,    // この数の敵を倒すごとに、左の壊れた特典ブロックを1個回復（0で無効）
  },
};
