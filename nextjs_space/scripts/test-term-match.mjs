import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = mkdtempSync(join(tmpdir(), 'term-match-'));
const require = createRequire(import.meta.url);
try {
  const ts = require('typescript');
  const source = readFileSync(join(root, 'lib/library-term-match.ts'), 'utf8');
  const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } });
  writeFileSync(join(out, 'm.js'), outputText);
  const { buildTermIndex, matchTerms } = require(join(out, 'm.js'));
  const index = buildTermIndex([
    { term: 'Grab', entryId: 'g', kind: 'rule' },
    { term: 'Greater Grab', entryId: 'gg', kind: 'rule' },
    { term: 'Rend', entryId: 'r', kind: 'rule' },
    { term: 'Pounce', entryId: 'p', kind: 'rule' },
  ]);
  const linked = (text) => matchTerms(text, index).filter(s => s.match).map(s => `${s.text}=${s.match.entryId}`);
  assert.deepEqual(linked('grab (bite)'), ['grab=g']);
  assert.deepEqual(linked('Greater Grab, rend (2 claws, 1d8+6)'), ['Greater Grab=gg', 'rend=r']);
  assert.deepEqual(linked('pounce (grab, rend) grabbing regrab'), ['pounce=p']);
  assert.deepEqual(linked('GRAB; Rend.'), ['GRAB=g', 'Rend=r']);
  assert.deepEqual(linked('((grab) rend) grab'), ['grab=g']);
  assert.deepEqual(linked(''), []);
  const text = 'rend (2 claws), grab';
  assert.equal(matchTerms(text, index).map(s => s.text).join(''), text);
  console.log('term-match tests passed');
} finally {
  rmSync(out, { recursive: true, force: true });
}
