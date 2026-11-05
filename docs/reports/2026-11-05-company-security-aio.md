# Coketsu fund：会社情報修正・セキュリティ/AIO対応

## 対象と反映

- 本番: https://coketsu.fund/
- 検証: https://coketsu-fund.system-f78.workers.dev/
- GitHub: https://github.com/jtrust-inc/coketsu.fund （main）
- 実装: Astro / Cloudflare Workers
- 会社情報修正: 5a2f40c
- セキュリティ実装: 5c9eea1、既存Cloudflare Analytics互換性修正: 2b1c697
- 最終Worker: f2835a0f-bdee-4a3a-9e9c-aa00519148d0
- 本番反映済み。DNS・ネームサーバー・メールDNS・秘密情報・旧WordPress・他サイトは変更していない。

## 修正内容

代表者を岩本 圭賢へ訂正。設立2017年6月、資本金1億円、従業員100名（パート・アルバイト・子会社含む）、FAX 03-6690-6652を補完。公式会社概要 https://jtrust-inc.jp/company-profile/ を2026-11-05に確認。

全9ページのOrganization構造化データを、誤っていた株式会社COKETSUから株式会社ジェイトラストへ修正。公式会社URL・連絡先・所在地を関連付け、JSON-LDのHTMLエスケープを追加。既存canonical、サイトマップ、GA4、Search Consoleタグ、見出し・FAQ・リスク説明を維持。検証ドメインはX-Robots-Tagでnoindexにした。AI検索への掲載・順位を保証するものではない。

フォームにOrigin/Fetch Metadata確認、実受信64KiB制限、Graph認証要求のタイムアウト、トークン有効期限の厳密化、405のAllowヘッダーを追加。既存CSPをReport-Onlyから実効モードへ変更し、Turnstile・GA4・Cloudflare Web Analyticsの必要な配信先を許可した。既存のHSTS、レート制限、ハニーポット、サーバー側Turnstile検証、固定宛先のGraph送信を維持。

CSPは既存インラインスクリプト互換性のためunsafe-inlineを許可しており、完全なXSS防止を意味しない。アカウント側WAFやMicrosoft Entra権限は今回変更・監査していない。

## 検証結果

- Astroチェック: エラー・警告0。ビルド成功、9ページと75取得アセットの参照検証成功。
- Worker回帰テスト: Origin、不正メソッド、レート超過、宣言/実データサイズ、Turnstile無効/ホスト/用途不一致、正常multipart/urlencoded送信、HTMLエスケープ、Graph失敗応答、レスポンスヘッダーを検証。外部APIは全てモック。
- ローカルWorker上で320/390/768/1440pxの表示、画像、フォーム成功/失敗、CSP違反0を確認。問い合わせ・資料請求・法人フォームのモック検証成功。ログインは6幅で導線確認済み。
- 本番と検証の各9ページ: HTTP200、生成HTMLと一致、会社構造化データ正常、実効CSP有効。本番はnoindexなし、検証はnoindexあり。
- 本番と検証の不正Originは403、認証トークンなしは400。メールは送られていない。
- 本番ブラウザーで本物のTurnstile API、GA4設定のdataLayer初期化、岩本 圭賢の表示を確認。文書のCSP違反0。
- GitHub Actionsの5a2f40cおよび5c9eea1はsuccess。CloudflareはローカルCLIから反映し、実サイトの応答まで確認。
- 同一デプロイ間の本文一致率100%。新デザインと旧WPの整合率・全画面ピクセル一致率は未計測で、100%とはしていない。

## 残る確認事項・制限

- 実メールの送受信は今回再テストしていない。宛先等の既存Secretは変更していない。管理記録上の宛先はsupport@coketsu.fund。
- 住所の建物名は公式会社概要の「エムズクロス人形町10F」を維持。デザイン参照の「プライム人形町10F」と異なるため、参照画像だけで変更していない。
- 宅建免許の更新回数は公式会社概要が（1）、現行LP・指定参照が（2）。法的情報を推測変更せず現行（2）を保持。正しい最新登録に基づく照合が必要。
- GA4はブラウザー初期化確認。管理画面でのイベント受信は未確認。Search Consoleは既存の確認済みという管理記録とHTMLタグを維持し、今回管理画面へ再ログインしていない。
- 指定されていたGドライブのCoordinationテンプレートは今回存在せず、共有ドライブの報告書更新は行えていない。site-control.jsonと本リポジトリ内報告を更新。systemadmin管理画面の再取込は今回未確認。
- 従来のastro-auditは旧キャプチャとの長さ・要素数比較であり、現デザインの意味的/視覚的一致率ではないことを明記した。

## セキュリティ診断

Codex Security skillに従い、独立レビューを含む変更前worker/index.tsの限定静的監査を完了。scanId: 4ae77911-2030-4103-bef0-ece2f12c436b、対象revision: 8f1b7b4。報告対象の脆弱性0件。対象外のフロントエンド・依存パッケージ・クラウドアカウントを安全と保証する結果ではない。監査中に会社情報のみ先行公開したためHEAD変更警告があるが、監査対象Workerはその監査完了まで変更していない。

監査計測（完了ツール報告値）: totalTokens 4,066,635、inputTokens 4,046,577、cachedInputTokens 3,789,056。4タスクの集計値で、今回の修正だけの料金見積りではない。

## ロールバック

セキュリティ追加前・会社情報修正済みのWorker 17125a48-7c25-412e-a50a-cba15694f54e（ソース5a2f40c）へ復帰可能。DNS変更は不要。接続先サービスや秘密情報を変更していないため、それらを削除・復元する操作は不要。

## 根拠

- 会社情報: https://jtrust-inc.jp/company-profile/
- CSP互換性: https://developers.cloudflare.com/fundamentals/reference/policies-compliances/content-security-policies/
- Turnstile: https://developers.cloudflare.com/turnstile/reference/content-security-policy/
- AI検索の基本方針: https://developers.google.com/search/docs/appearance/ai-features
