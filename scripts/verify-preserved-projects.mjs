import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

// Do not treat a design example as authorization to change investment facts.
const baseline = execFileSync('git', ['show', 'c50e3c6:src/pages/index.astro'], { encoding: 'utf8' });
const current = readFileSync('src/pages/index.astro', 'utf8');
for (const [name, pattern] of [
  ['project cards', /<section class="projects"[\s\S]*?<\/section>/],
  ['record note', /<div class="record">[\s\S]*?<\/section>/],
]) {
  const before = baseline.match(pattern)?.[0];
  const after = current.match(pattern)?.[0];
  assert.ok(before && after, `${name}: missing comparison source`);
  assert.equal(after.replace(/\r/g, ''), before.replace(/\r/g, ''), `${name}: requires explicit content approval`);
}
assert.ok(!current.includes('<dt>資本金</dt>'));
console.log('Project cards and record note unchanged from pre-fix production; unrequested capital row removed.');
