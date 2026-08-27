# coketsu.fund backup mirror

Static, non-production backup mirror of <https://coketsu.fund/>.

1. `npm run capture` refreshes `migration-source/` from the public site.
2. `npm run build` creates the static `dist/` output.
3. `npm test` verifies the generated mirror.

Forms are disabled in the captured copy. Production DNS and the live investment/login service are out of scope.

Cloudflare Pages project: `coketsu-fund` (`https://coketsu-fund.pages.dev`).
