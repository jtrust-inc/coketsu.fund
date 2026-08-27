# coketsu.fund backup mirror

- This directory is a backup and non-production mirror of https://coketsu.fund/.
- Do not configure the production custom domain or change DNS without explicit approval.
- Keep captured source under `migration-source/` and regenerate `public/` with `scripts/prepare-mirror.mjs`.
- Build the deployable static mirror with `npm run build`; deploy `dist/` to Cloudflare Pages project `coketsu-fund`.
- Forms and investment/account actions in the mirror must remain disabled or point to the live service explicitly.
- Do not commit credentials, form submissions, customer data, `.env*`, `node_modules/`, `public/`, or `dist/`.
