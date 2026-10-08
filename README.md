# Coketsu fund. Astro site

Astro migration and AI validation build for <https://coketsu.fund/>.

1. `pnpm run capture` refreshes the migration input from the current production site.
2. `pnpm run build` renders all public routes through Astro.
3. `pnpm run check && pnpm test && pnpm run audit` verifies types, links, assets and content parity.
4. `pnpm run deploy` deploys the AI validation build to Cloudflare Workers.

The shared layout, header, footer, routing and SEO metadata are managed in Astro. The existing page body markup and assets are retained as migration input to preserve production parity while remaining WordPress-dependent forms are replaced.

WordPress forms are replaced in the AI validation build with an explicit handoff to the corresponding live production form. This avoids collecting personal information in an unapproved preview backend. Production DNS and the live investment/login service are not changed by this repository.

Optional deployment-time public variables:

- `PUBLIC_GA4_MEASUREMENT_ID`: GA4 measurement ID supplied by the site owner.
- `PUBLIC_GOOGLE_SITE_VERIFICATION`: Search Console HTML-tag verification token supplied by the verified property owner.

The build intentionally emits neither integration until its authoritative value is provided.

Cloudflare Worker: `coketsu-fund`. Static files are served through the Worker's asset binding; the production URL is assigned by Cloudflare on deploy.
