# Coketsu 残課題対応（接続準備）

対象サイト：coketsu.fund のみ
作業日時：2026-11-12 16:29 JST
GitHubリポジトリ：https://github.com/jtrust-inc/coketsu.fund.git
ブランチ：codex/remaining-integrations-20261112
コミットID：本報告を含むコミット（公開後の記録は site-control.json の operationalFollowup を参照）

## 実施内容

- お知らせ・特集のmicroCMS読取処理、一覧、詳細、canonical、OGP、JSON-LD、動的sitemapを実装。
- APIキーはサーバー側のみ。訪問者のdraftKey・クエリをCMSへ転送しない。外部へのリダイレクトは追従しない。
- HTMLは許可タグ・属性・URL形式に限定。本文と応答サイズ、件数、応答時間に上限を設定。
- 下書き相当の公開日時なし・未来日時を拒否。取り下げ済み記事IDは一覧・詳細・sitemapから明示除外。
- キャッシュで非公開記事を残さない。API障害は503で終了し、古い記事や仮データへ置換しない。
- キー未登録時は既存静的ページへそのまま委譲。トップ、メニュー、フォーム本文、Graph/Turnstile処理、DNS、メール設定は変更しない。
- Worker設定から型生成し、Worker自体のTypeScript検査を追加。sanitize-htmlは2.18.1固定、依存監査で既知脆弱性なし。
- 以前の汚れた作業ツリーは読取のみ。新規cloneから実装し、古い未完了ファイルをそのまま公開しない。

## テスト結果

- 型検査：Astro 41ファイル、エラー・警告・ヒント0。Workerのtsc検査成功。
- 単体テスト：原本案件情報、既存フォームAPI（全外部送信モック）、取り下げ状態、新CMSテスト成功。
- CMS実行検査：Wranglerが生成した実バンドルをworkerdで実行。HTMLRewriter、公開→非公開、一覧・詳細・sitemap、404/405/503、no-store、プレビューnoindex、未設定時の完全委譲を検証。CMS応答はテスト用であり実APIではない。
- 本番ビルド：静的10ページ成功。Wrangler deploy --dry-run 成功。
- リンク・画像検査：ローカル10ページ×2画面幅、リンク切れ0、画像欠落0。
- フォームブラウザー検査：320/390/768/1440px、確認・修正・モック送信成功/失敗、CSPエラー0、横はみ出し0。
- 旧WordPress比較監査も実行したが、これは長さ等のヒューリスティックであり現行デザインの品質スコアに流用しない。

## デプロイ結果

- 公開バージョンと公開後結果は site-control.json の operationalFollowup へ追記。
- AI検証URL：https://coketsu-fund.system-f78.workers.dev/
- 実接続の有効化は未実施。Cloudflareに登録済みのSecret名を確認し、MICROCMS_API_KEYがないことを確認。値の取得・表示・変更なし。

## Site Control再監査

- 前回の管理情報更新・再監査は実行ポリシーで拒否。迂回してD1を書き換える処理は実行していない。
- 今回もEdgeのタブ選択が timeoutMs エラーで失敗し、管理UIを操作できない。
- 最終既存監査は2026-11-08T21:00:49.523Z（前回確認）。今回は更新していない。
- 10ページ、SEO/LLMO/構成各100は上記既存監査の値。複製品質は比較URL未登録のためnull。今回実装の監査結果ではない。

## 本番切替ゲート

- 本文・URL：現在の公開10ページ維持。
- SEO：既存設定維持。CMS記事用のメタ情報・構造化データ・sitemapをモック環境で検証。
- 画面差分：既存AstroのHTML・CSSは変更なし。新記事のCSSのみ追加。
- フォーム：Graph/Turnstile処理は変更なし。support@coketsu.fundの受信箱を読取確認し、2026-10-17T09:06:46Zのテストメールを確認。ただし今回の再送・実受信確認ではない。
- GA・GSC：既存設定維持。権限・管理API連携は今回変更なし。
- SSL：公開後のHTTPS検査で確認。
- 切戻し：本作業直前のWorker 196a0079-21c1-4316-8a73-2fb3cf024317。Secret/DNSの変更は実施しない。

## 残る問題

1. microCMS読取専用APIキー登録の明示承認が必要。ブラウザー操作不能、ローカル暗号化保管キーも存在しないため、秘密値の安全な設定操作を別途実施する。チャット・Git・報告書へキーを貼らない。
2. 実APIスキーマの確認が必要。想定するエンドポイントは news / features、必須フィールドは title（テキスト）・body（リッチエディタ）、任意は description・eyecatch。現行APIの一致は未確認。
3. 本番フォームから「サイト動作確認 1112」として手動テスト送信し、support@coketsu.fundへの新着を確認する。受信箱への読取アクセスは確認済み。
4. 管理UIでCoketsuだけの会社名・最新デプロイ情報を更新し再監査する必要がある。リモートDBへの直接書込みでは迂回しない。
5. 前回報告の宅建免許更新回数の相違は証書等の一次資料確認が必要。

## 統括セッションに依頼する横断対応

- 管理UIのCoketsuレコードだけを正規の管理操作で同期し、再監査日時・結果を台帳へ戻す。他4サイトは変更しない。
- microCMS Secret登録・フォーム実受信は上記の確認が終わるまで完了扱いしない。

本番切り替え可否：既存Cloudflare本番を維持。CMSの実接続は承認待ち。新たなDNS切替なし。

実装根拠：[microCMS GET一覧API](https://document.microcms.io/content-api/get-list-contents)、[Cloudflare HTMLRewriter](https://developers.cloudflare.com/workers/runtime-apis/html-rewriter/)、[Workers Secrets](https://developers.cloudflare.com/workers/configuration/secrets/)。
