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
- WordPressフォーム3件は、個人情報を未承認の環境で収集しないよう、本番側の同一フォームへ遷移する案内に置換した。
- ロゴの見出しを `div` に変更し、全ページのH1を1件に統一した。
- セキュリティヘッダー、キーボードフォーカス、本文スキップリンク、動きを減らす設定を追加した。

## ロールバック

Worker `coketsu-fund` に移行前コミット `8a5ef14` を再デプロイする。今回は本番DNSを変更しないため、本番WordPressの公開には影響しない。

## 未確認・残存課題

- GA4 Measurement IDとGoogle Search Console所有権トークンは、本番・リポジトリ・管理システムのいずれからも確認できない。正規値の提供時に有効化できる実装は追加済み。
- WordPress Contact Form 7はAstroから除去済み。切替前は本番フォームへの安全な引継ぎとし、独立送信基盤の新設は個人情報管理の承認後に行う。
- microCMSは現時点で未使用。ニュース更新を運用する場合は別途設計が必要。

## 検証結果

- Astroビルド・型検査: 成功
- 全公開9URL、`robots.txt`、`sitemap.xml`: AI検証URLでHTTP 200
- 本文・title・画像: 最新本番キャプチャと整合。フォーム引継ぎ、スキップリンク、SEO修正は意図的差分として記録。
- デスクトップ・モバイル表示: 実画面で主要レイアウトと画像を確認
- 文字化け・ローカルリンク切れ・画像欠落: 検出なし
- Cloudflare Workerバージョン: `906f3da6-059c-43b8-80d9-c96e41fdd463`
- 実URL検査: 全9ページでHTTP 200、H1 1件、フォーム0件、canonical・JSON-LDあり
- セキュリティヘッダー: `nosniff`、`strict-origin-when-cross-origin`、`SAMEORIGIN` を確認
- Core Web Vitals: Chrome DevTools計測機能が未接続のため未計測（推測値は記録しない）
