import { getCapturedPages } from "../lib/site";
export const prerender = true;
export async function GET() { const pages = await getCapturedPages(); const urls = pages.map((page) => `<url><loc>${new URL(page.route, "https://coketsu.fund/").href}</loc></url>`).join(""); return new Response(`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls}</urlset>`, { headers: { "content-type": "application/xml; charset=utf-8" } }); }
