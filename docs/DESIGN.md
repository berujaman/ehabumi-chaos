# 設計メモ

## 基本方針
- **左（音ゲー）が主役、右は差し替え可能**。右に入るゲームは何種類にでも増やせる形にしてある。
- 左右のゲームは**お互いを直接知らない**。やり取りはすべてイベントバス（`RG.EventBus`）経由。
  - 右のゲームは「左に何をされるか」を知らずに `side:attack` を投げるだけ
  - 左のコンボ報酬は `{ combo, level }` という汎用の形で届き、**何に変換するかは右の各ゲームが決める**
  - → 新しいゲームを足しても、音ゲー側のコードは変更不要
- 時計は**曲の再生位置**（`audio.time`）。音ゲーの判定も、右の敵の出現も、すべてこれ基準。

## データの流れ
```
音楽ファイル → extractFeatures（FFT・オンセット候補。曲ごとに1回）
            → trackBeats（拍の追跡）→ buildChart（難易度ごと。songs.js の設定を使う）
                                   ├ notes  → RhythmGame（左）
                                   └ onsets → SideGame.start（右：敵の出現タイミングなど）

RhythmGame ──rhythm:comboReward / rhythm:accuracyReward──▶ SideGameManager ─▶ 今の右ゲーム.receiveReward({kind, level})
                                   （右がまだ始まっていなければ貯めておき、開始時に渡す）
右ゲーム ──side:attack {power, lane}──▶ RhythmGame.queueAttack（右端から飛んで着弾、ブロックを壊す）
右ゲーム ──side:repair {count}──────▶ RhythmGame.queueRepair（緑の光が飛んで、壊れたブロックをランダムに直す）
```

## イベント一覧
| イベント | 中身 | 送る側 |
|---|---|---|
| `rhythm:judge` | `{ result, lane, combo }` | 音ゲー |
| `rhythm:comboReward` | `{ combo, level }` | 音ゲー |
| `rhythm:accuracyReward` | `{ count, level }`（GREAT以上の累計の節目） | 音ゲー |
| `rhythm:blockRepaired` | `{ lane, remaining }` | 音ゲー |
| `rhythm:blockBroken` | `{ lane, remaining }` | 音ゲー |
| `side:attack` | `{ power, lane?, source }` | 右のゲーム |
| `side:repair` | `{ count, source }` | 右のゲーム |
| `side:started` | `{ id, name }` | マネージャ |

## 右側のゲームの約束ごと
- 操作は**矢印キーのみ**（A S D F は音ゲーが使う）。押しっぱなしは `this.input.isDown()`、押した瞬間は `onKey(code)`。
- 曲との連動は `this.makeSchedule(info, { minGap, minStrength })` で「10秒前の曲の強い音」の予定表を作り、`pop(t)` で取り出す。
- 左への影響は `side:attack`（壊す）と `side:repair`（直す）の2つだけ。報酬は `receiveReward({ kind, level })` で受け、
  `kind === 'combo' && level % 5 === 0` の時に一番強い効果を出す（4ゲームで共通の約束）。
- `register()` の `controls` に操作説明を書くと、開始・切替時に大きく表示される。
- `register()` に `oncePerPlay: true` を付けると1プレイに1度しか出ない（おみくじ）。
- ゲーム側で `this.finished = true` にすると、切替時間を待たずに次のゲームへ移る。

## 右側にゲームを追加する手順
1. `js/side/games/_template.js` をコピー（例：`puzzle.js`）
2. `start / update / render / receiveReward / getResult` を書く
3. 最後の `RG.SideGames.register({ id, name, weight, create })` の id と name を変える
4. `index.html` の `shooter.js` の下に `<script src="js/side/games/puzzle.js"></script>` を追加

`config.js` の `sideGameRotateInterval` を例えば `30` にすると、30秒ごとに右のゲームがランダムに切り替わる（同じゲームの連続は避ける）。

## 今後の候補（未実装）
- 右側ゲームの追加（パズル、ランゲーム、タワーディフェンス等）と、ゲームごとの左への影響
  - 例：ノーツを速くする / 一時的にレーンを隠す / 判定を厳しくする などの「妨害」イベント
  - 例：右が好調だと左の判定が甘くなる などの「支援」イベント
- ロングノーツ
- 譜面の保存と読み込み（自動生成した譜面を手直しできるように）
- 判定タイミング補正の画面、キー設定の画面
- 効果音・画像素材の差し替え

## 収録曲の調整メモ（2026-10-21）
- 完全空気エハブミさん オープニング／エンディングは曲中でテンポが少し上がっていく（149→150.5、139→140.8）。
  一定テンポの格子では拍がずれるため、拍の追跡（動的計画法）を入れた。拍への当てはまりは 0.03 → 0.92 に改善。
- オーケストラ版は拍への当てはまりが 0.5 程度（生演奏的な揺れ）。判定幅内には収まっている。
- Absolute Headache はイントロが静かで、そのままだと最初の14秒ノーツが無かった → 空白補充で解消。
- `minStrength` は「1秒あたりのノーツ数」が目標値になるよう二分探索で決めた（解析スクリプトはブラウザのコンソールで実行）。
