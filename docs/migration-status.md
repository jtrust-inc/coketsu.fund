# Coketsu fund. Astro移行記録

## 確認済み

- 本番URL: `https://coketsu.fund/`
- AI検証URL: `https://coketsu-fund.system-f78.workers.dev/`
- GitHub: `jtrust-inc/coketsu.fund` / `main`
- Cloudflare Worker: `coketsu-fund`
- 公開ページ: 9ページ
- DNS: Cloudflare (`angela.ns.cloudflare.com`, `giancarlo.ns.cloudflare.com`)
- メール: Microsoft 365 MX、SPF、Microsoftドメイン確認TXTを確認。DNS切り替え時は維持必須。
- SSL: 2027-01-26まで有効な公開証明書を確認。

## 実装方針

9ページをAstroの静的ルートとして生成し、レイアウト、ヘッダー、フッター、SEOメタデータを共通コンポーネント化した。本文は視覚的整合性を保つため、最新のWordPressキャプチャからマークアップを取り込む。

## 意図的な変更

- AI検証URLは `noindex, nofollow`、将来の本番Astro環境は `index, follow`とする。現本番WordPressの `noindex, nofollow` はSEO上の重大な不備として是正対象。
- canonical、OGP、Xカード、Organization/WebSite/WebPage JSON-LDをAstro側で明示管理する。
- `robots.txt` と `sitemap.xml` をAstroから生成する。
- WordPressフォーム3件は見た目と文言を保持しつつ、全フィールドの送信用name、submit操作、WordPressフォーム実行コードを除去した。検証版から個人情報は送信されない。
- ロゴの見出しを `div` に変更し、全ページのH1を1件に統一した。
- セキュリティヘッダー、キーボードフォーカス、本文スキップリンク、動きを減らす設定を追加した。

## ロールバック

Worker `coketsu-fund` に移行前コミット `8a5ef14` を再デプロイする。今回は本番DNSを変更しないため、本番WordPressの公開には影響しない。

## 未確認・残存課題

- 専用GA4測定ID `G-17L9BLTJQT` とSearch Console HTML確認タグを実装済み。Search Consoleの最終所有権確認はAstro本番切替後に行う。
- WordPress Contact Form 7の実行コードはAstroから除去済み。フォーム送信基盤の新設は統括承認と個人情報管理の確認後に行う。
- microCMSは現時点で未使用。ニュース更新を運用する場合は別途設計が必要。

## 検証結果

- Astroビルド・型検査: 成功
- 全公開9URL、`robots.txt`、`sitemap.xml`: AI検証URLでHTTP 200
- 本番9ページとの同一ロジック比較: 本文平均99%、リンク・画像・フォーム件数100%一致。フォーム3ページの2%差分は「検証版：送信できません」の安全表示。
- デスクトップ・モバイル表示: 実画面で主要レイアウトと画像を確認
- 文字化け・ローカルリンク切れ・画像欠落: 検出なし
- Cloudflare Workerバージョン: デプロイ後の最新IDは `site-control.json` と作業報告に記録。
- ビルド検査: 全9ページでH1 1件、canonical・JSON-LDあり。フォーム3件は非送信化し、それ以外はフォーム0件。
- セキュリティヘッダー: `nosniff`、`strict-origin-when-cross-origin`、`SAMEORIGIN` を確認
- Core Web Vitals: Chrome DevTools計測機能が未接続のため未計測（推測値は記録しない）
