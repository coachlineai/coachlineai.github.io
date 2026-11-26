import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {test} from 'node:test';

test('pricing page requests the matching version of its rendering script', () => {
  const html = readFileSync(new URL('../plans.html', import.meta.url), 'utf8');
  const script = readFileSync(new URL('../plans.js', import.meta.url));
  const version = createHash('sha256').update(script).digest('hex').slice(0, 12);
  assert.ok(html.includes('src="./plans.js?v=' + version + '"'));
});
