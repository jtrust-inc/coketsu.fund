# coketsu.fund Astro migration

- This directory serves the approved Astro production site https://coketsu.fund/ and its workers.dev verification URL.
- Do not configure the production custom domain or change DNS without explicit approval.
- Keep captured source under `migration-source/`; Astro owns routing, shared layout, header, footer and SEO metadata.
- Build the deployable Astro site with `pnpm run build`; deploy it as the Cloudflare Worker `coketsu-fund` using Wrangler static assets.
- Preserve the user-approved Turnstile/Graph forms on production and verification URLs. Automated tests must mock mail delivery; never send customer data during tests. Keep investment/account actions linked to the existing live investor service.
- Do not commit credentials, form submissions, customer data, `.env*`, `node_modules/`, `public/`, or `dist/`.
