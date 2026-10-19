# 地方銀行フードセレクション2026 打刻

QRコードから読み取った **6桁の数字** と **打刻日時** をスプレッドシート(ScanLog)に記録し、
CSVで出力できる打刻システムです。フロントエンドは静的ファイル(GitHub Pages)、
バックエンドは Google Apps Script(GAS)+ Google スプレッドシートで構成します。

## ディレクトリ構成

```
food-selection-scan/
├── scan/
│   └── index.html            # 打刻画面(カメラ読み取り/6桁手入力/未送信キュー/本日の記録一覧/CSV出力)
├── assets/
│   ├── css/style.css         # 打刻画面用スタイル
│   └── js/
│       ├── common.js         # 共通処理(ボタンのローディング切替)
│       ├── api-client.js     # GAS APIとの通信(GAS URLをここで1箇所管理)
│       └── qr-scanner.js     # html5-qrcodeのラッパー
├── gas/
│   └── Code.gs               # GAS側のコード(Apps Scriptエディタにも反映する)
├── robots.txt                # /scan/ を検索エンジンのクロール対象外に指定
├── README.md
└── TESTING.md                # テスト手順書
```

## バックエンド(GAS)のデプロイ手順

### 1. スプレッドシートを作成する

1. Google スプレッドシートを新規作成する(例: 「フードセレクション2026_打刻」)。
2. [拡張機能] > [Apps Script] を開く。

### 2. コードを貼り付ける

デフォルトの `Code.gs` の中身を全て削除し、このリポジトリの `gas/Code.gs` の内容を貼り付けて保存する。

### 3. シートをセットアップする(`setupSheets` の実行)

1. 関数選択ドロップダウンで `setupSheets` を選び、[実行] する(初回は権限承認が必要)。
2. **ScanLog** シート(ID / 打刻日時 / 6桁番号 / 備考)が作成される。
   6桁番号・打刻日時の列はプレインテキスト形式に固定され、先頭0が消えない。

### 4. `ADMIN_API_KEY` を設定する

[プロジェクトの設定] > [スクリプト プロパティ] に以下を追加する。

| プロパティ名 | 値 | 備考 |
|---|---|---|
| `ADMIN_API_KEY` | 推測されにくいランダムな文字列 | `logScan` / `getScanLog` の呼び出しに必須。**打刻画面(`scan/`)の初回表示で入力するキーがこの値。** |
| `SPREADSHEET_ID` | (スタンドアロンScriptの場合のみ) | 手順1〜2のようにスプレッドシートから作成した場合は不要 |

### 5. Webアプリとしてデプロイする

1. [デプロイ] > [新しいデプロイ] > 種類「ウェブアプリ」。
2. 次のユーザーとして実行: **自分(Me)** / アクセスできるユーザー: **全員(Anyone)**。
3. 発行された **ウェブアプリのURL(`.../exec`)** をコピーする。

> **デプロイ後に必ず `assets/js/api-client.js` の `GAS_API_CONFIG.BASE_URL`
> (現在は `YOUR_NEW_GAS_URL` というプレースホルダー)を、上記のURLに差し替えてください。**
> 差し替えるまで打刻画面は通信できません。

`Code.gs` を修正した場合は、[デプロイ] > [デプロイを管理] から新バージョンを作成して
デプロイし直さないとURLに反映されません。

### 6. `test_logScan` で動作確認する

1. `test_logScan` を選んで [実行] し、ログ(`Ctrl+Enter`)を確認する。
2. 以下が出れば正常。
   - `[OK] 6桁番号は先頭の0を含めて正しく保存されました。`(`012345` で記録)
   - `[OK] 重複を検知しました。`
   - `[OK] 不正な値を拒否しました。`
3. ScanLog シートにテスト行(備考 `test_logScan`)が2行追加されるので、確認後に削除する。

## API仕様(`gas/Code.gs`)

すべてのレスポンスは `{ "success": true/false, ... }` 形式のJSON。
いずれも `apiKey` が `ADMIN_API_KEY` と一致しない場合は
`{"success":false,"error":"unauthorized"}` を返す。

POST は CORSプリフライトを避けるため `Content-Type: text/plain` でJSON文字列を送る
(`assets/js/api-client.js` が対応済み)。

| メソッド | action | パラメータ | 概要 |
|---|---|---|---|
| POST | `logScan` | apiKey, code(6桁の数字), note(任意), clientTimestamp(任意) | 6桁番号を記録。`/^\d{6}$/` 以外は `validation_error`。打刻日時はGASサーバー時刻。LockServiceで排他制御。同じ番号が記録済みでも記録し、`duplicate:true` と `previousScannedAt` を返す。`clientTimestamp`(オフライン再送時の端末時刻)は備考に「端末時刻: …」として残す |
| GET | `getScanLog` | apiKey | 打刻記録を全件取得 |

## 打刻画面(`scan/`)の機能

- 初回にAPIキーを入力(`sessionStorage` に保持。タブを閉じると消える)。
- カメラでQR読み取り / カメラ不可時は6桁手入力。6桁数字以外は記録しない。
- 同じ値の連続読み取りは4秒間無視(二重送信防止)。
- 備考欄(端末名・場所のメモ。任意)。
- 通信エラー時は端末(localStorage)に一時保存し、「未送信分を送信」ボタンで再送。
- 本日の記録一覧(新しい順)と CSV ダウンロード(全件)。
  - 列: 打刻日時, 6桁番号, 備考, CSV出力日時 / UTF-8 BOM付き / ファイル名 `foodselection_scan_年月日_時分秒.csv`
  - 6桁番号は `="012345"` 形式で出力し、Excelで開いても先頭0が消えない
    (メモ帳等で開くと `="012345"` と表示される)。

## GitHub Pagesでの公開手順

1. GitHubに空のリポジトリを作成し、リモートを追加して push する。

   ```powershell
   git remote add origin https://github.com/<GitHubユーザー名>/<リポジトリ名>.git
   git push -u origin main
   ```

2. GitHub の [Settings] > [Pages] > Source を **Deploy from a branch**、
   Branch を **main** / **(root)** にして保存する。
3. 数分後、`https://<GitHubユーザー名>.github.io/<リポジトリ名>/scan/` で公開される。

公開前チェックリスト:

- [ ] `assets/js/api-client.js` の `BASE_URL` が `YOUR_NEW_GAS_URL` のままになっていない
- [ ] GAS Webアプリのアクセス権が「全員」になっている
- [ ] `ADMIN_API_KEY` を設定済みで、運用者以外に共有していない
- [ ] `robots.txt` で `/scan/` がクロール対象外になっている(検索結果への表示を避けるための設定であり、
      アクセス制限ではない。URLとAPIキーの取り扱いに注意すること)
