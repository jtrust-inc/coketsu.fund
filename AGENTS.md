# coketsu.fund Astro migration

- This directory is the Astro migration and non-production validation build of https://coketsu.fund/.
- Do not configure the production custom domain or change DNS without explicit approval.
- Keep captured source under `migration-source/`; Astro owns routing, shared layout, header, footer and SEO metadata.
- Build the deployable Astro site with `pnpm run build`; deploy it as the Cloudflare Worker `coketsu-fund` using Wrangler static assets.
- Forms and investment/account actions in the mirror must remain disabled or point to the live service explicitly.
- Do not commit credentials, form submissions, customer data, `.env*`, `node_modules/`, `public/`, or `dist/`.
