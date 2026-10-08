import { defineConfig } from "astro/config";

export default defineConfig({
  site: "https://coketsu.fund",
  output: "static",
  trailingSlash: "always",
  build: { format: "directory" },
});
