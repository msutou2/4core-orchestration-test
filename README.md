# 4core-orchestration-test

4CORE方式で、オーケストレーターと4つの係(設計係・チェック係・コーディング・独立チェック)を自動で回す試運転用リポジトリです。

## 役割分担

- 意味・仕様の正本: Google Drive上の統合正本(Revisionフォルダ内)
- コードの物理版: このリポジトリのcommit
- 工程状態: Google DriveのFolder State(10_design〜90_frozen)

このリポジトリのコード・テスト・commit履歴は正本からの派生物であり、意味・仕様の根拠にはしません。

## 開発

```sh
npm install
npm test          # vitest（単体）＋ playwright（画面。Chromiumを使用）
npm run typecheck # tsc
npm run dev       # メモアプリを起動（表示されたURLをパソコンのブラウザで開く）
npm run build     # dist/ へ出力（npm run preview で確認）
```

メモはブラウザのlocalStorage（開いたURLのオリジンごと）に保存されます。同じURLで開くと、閉じた後も登録済みのメモを読み返せます。
