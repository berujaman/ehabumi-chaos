# オフライン版（ネットもサーバーも無しで、index.html をダブルクリックするだけで遊べるもの）を作る。
#   python tools/build_offline.py [出力先フォルダ]
# 出力先（省略時はこのリポジトリの1つ上の「エハブミカオス_オフライン版」）にフォルダと zip を作る。
# 曲の mp3 と歌詞は songs/offline/<曲ID>.js に文字として埋め込む（js/core/offline.js が読む）。
import base64
import json
import os
import re
import shutil
import sys
import zipfile
from datetime import date

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
NAME = 'エハブミカオス_オフライン版'
COPY = ['index.html', 'help.html', 'css', 'js', 'img', 'songs/songs.js']

README = """エハブミカオス オフライン版（{day} 時点）

■ 遊び方
1. この zip を好きな場所に展開（解凍）してください。
2. フォルダの中の index.html をダブルクリックすると、ブラウザでゲームが始まります。
   （Chrome または Edge をおすすめします。インターネットにつながっていなくても遊べます）

■ 注意
- フォルダの中のファイルは動かしたり消したりしないでください（songs/offline に曲が入っています）。
- 自己ベストやキャラ育成のデータは、そのブラウザの中に保存されます。
  公開ページ（https://berujaman.github.io/ehabumi-chaos/）のデータとは別になります。
  キャラはパスワードで公開ページとオフライン版の間を移せます（キャラ画面の「パスワードからキャラを復元」）。
- 結果の共有ボタン（X / LINE など）はインターネットにつながっている時だけ使えます。
- スマホでは zip の中の index.html を開けない場合があります。スマホは公開ページで遊んでください。
"""


def main():
    out = os.path.abspath(sys.argv[1]) if len(sys.argv) > 1 else os.path.join(os.path.dirname(ROOT), NAME)
    if os.path.exists(out):
        shutil.rmtree(out)
    os.makedirs(out)

    for rel in COPY:
        src = os.path.join(ROOT, rel)
        dst = os.path.join(out, rel)
        if os.path.isdir(src):
            shutil.copytree(src, dst, ignore=shutil.ignore_patterns('__pycache__'))
        else:
            os.makedirs(os.path.dirname(dst), exist_ok=True)
            shutil.copy2(src, dst)

    # 曲の一覧は songs.js から id と file を読む（id: '...', ... file: 'songs/....mp3'）
    text = open(os.path.join(ROOT, 'songs', 'songs.js'), encoding='utf-8').read()
    ids = re.findall(r"id:\s*'([^']+)'", text)
    files = re.findall(r"file:\s*'([^']+)'", text)
    assert len(ids) == len(files), '曲の id と file の数が合いません'

    off_dir = os.path.join(out, 'songs', 'offline')
    os.makedirs(off_dir)
    for sid, f in zip(ids, files):
        audio = base64.b64encode(open(os.path.join(ROOT, f), 'rb').read()).decode('ascii')
        lyr_path = os.path.join(ROOT, 'songs', 'lyrics', sid + '.json')
        lyrics = json.load(open(lyr_path, encoding='utf-8')) if os.path.exists(lyr_path) else None
        with open(os.path.join(off_dir, sid + '.js'), 'w', encoding='utf-8', newline='\n') as w:
            w.write('// オフライン版の曲データ（tools/build_offline.py が作成）\n')
            w.write(f"RG.offlineSongs[{json.dumps(sid)}] = {{ lyrics: {json.dumps(lyrics, ensure_ascii=False)}, audio: '{audio}' }};\n")
        print('曲', sid)

    day = date.today().isoformat()
    with open(os.path.join(out, 'はじめにお読みください.txt'), 'w', encoding='utf-8-sig', newline='\r\n') as w:
        w.write(README.format(day=day))

    zip_path = out + '.zip'
    if os.path.exists(zip_path):
        os.remove(zip_path)
    with zipfile.ZipFile(zip_path, 'w', zipfile.ZIP_DEFLATED, compresslevel=6) as z:
        for base, _, names in os.walk(out):
            for n in names:
                full = os.path.join(base, n)
                z.write(full, os.path.join(NAME, os.path.relpath(full, out)))
    print('フォルダ', out)
    print('zip', zip_path, round(os.path.getsize(zip_path) / 1e6, 1), 'MB')


if __name__ == '__main__':
    main()
