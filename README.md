# Coketsu fund. Astro site

Astro migration and AI validation build for <https://coketsu.fund/>.

1. `pnpm run capture` refreshes the migration input from the current production site.
2. `pnpm run build` renders all public routes through Astro.
3. `pnpm run check && pnpm test && pnpm run audit` verifies types, links, assets and content parity.
4. `pnpm run deploy` deploys the AI validation build to Cloudflare Workers.

The shared layout, header, footer, routing and SEO metadata are managed in Astro. The existing page body markup and assets are retained as migration input to preserve production parity.

The three WordPress forms are preserved visually in the AI validation build, but their field names and submit behavior are removed. This keeps page parity without transmitting or collecting personal information. Production DNS and the live investment/login service are not changed by this repository.

Optional deployment-time public variables:

- `PUBLIC_GA4_MEASUREMENT_ID`: overrides the configured Coketsu GA4 measurement ID.
- `PUBLIC_GOOGLE_SITE_VERIFICATION`: overrides the configured Search Console HTML verification token.

The verified public identifiers are emitted by default; no credentials or secrets are stored in this repository.

Cloudflare Worker: `coketsu-fund`. Static files are served through the Worker's asset binding; the production URL is assigned by Cloudflare on deploy.
