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
npm test          # vitest
npm run typecheck # tsc
```
