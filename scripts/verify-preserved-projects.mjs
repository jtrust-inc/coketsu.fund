import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// Compare with captured WordPress, not an intermediate AI redesign.
const archive = readFileSync('migration-source/site/index.html', 'utf8');
const current = readFileSync('src/pages/index.astro', 'utf8');
const compact = value => value.replace(/<[^>]+>/g, '').normalize('NFKC').replace(/\s+/g, '');
const expected = [
  { name: '世田谷区深沢4丁目土地1号プロジェクト', amount: '42,900,000' },
  { name: 'AZXIA BLD. 両国II 1号プロジェクト', amount: '83,600,000' },
];
const sourceCards = [...archive.matchAll(/<div class="project-list-title">([\s\S]*?)<\/ul>/g)].map(m=>m[1]);
const cards = [...current.match(/<section class="projects"[\s\S]*?<\/section>/)[0].matchAll(/<article>([\s\S]*?)<\/article>/g)].map(m=>m[1]);
assert.equal(sourceCards.length, 2);
assert.equal(cards.length, 2);
for (const [i, expectedCard] of expected.entries()) {
  for (const value of [expectedCard.name, expectedCard.amount, '償還済み']) {
    assert.ok(compact(sourceCards[i]).includes(compact(value)), 'Archive evidence missing: '+value);
    assert.ok(compact(cards[i]).includes(compact(value)), 'Published fact differs: '+value);
  }
  assert.match(sourceCards[i], /想定利回り（年利）[\s\S]*?<em>12<\/em>%/);
  assert.match(cards[i], /想定利回り（年利）[\s\S]*?<dd>12<small>%<\/small>/);
  assert.match(sourceCards[i], /想定運用期間[\s\S]*?<em>12<\/em>ヶ月/);
  assert.match(cards[i], /想定運用期間[\s\S]*?<dd>12<small>ヶ月<\/small>/);
}
assert.ok(current.includes('※2026年9月10日時点。当該実績は将来の運用成果を保証するものではありません。'));
assert.ok(!current.includes('2026年9月30日'));
assert.ok(!current.includes('<dt>資本金</dt>'));
const control = JSON.parse(readFileSync('.site-control.json', 'utf8'));
assert.equal(control.companyName, '株式会社ジェイトラスト');
console.log('Both project cards match captured WordPress facts; LP record date and company metadata verified.');
