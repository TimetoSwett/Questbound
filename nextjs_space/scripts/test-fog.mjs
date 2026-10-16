import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';
const require = createRequire(import.meta.url);
const ts = require('typescript');
const source = readFileSync(new URL('../lib/fog-tools.ts', import.meta.url), 'utf8');
const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
const fog = {}; runInNewContext(js, { exports: fog });
const { rectCells, brushCells, allCells, applyFog, fogModeAt } = fog;

assert.deepEqual([...rectCells(1, 1, 2, 2, 10, 10)], ['1,1', '2,1', '1,2', '2,2']);
assert.deepEqual([...rectCells(2, 2, 1, 1, 10, 10)], ['1,1', '2,1', '1,2', '2,2']); // reverse drag
assert.deepEqual([...rectCells(3, 0, 1, 0, 10, 10)], ['1,0', '2,0', '3,0']);
assert.deepEqual([...rectCells(4, 4, 4, 4, 10, 10)], ['4,4']);
assert.deepEqual([...rectCells(-3, -3, 1, 0, 3, 3)], ['0,0', '1,0']); // clipped
assert.equal(rectCells(0, 0, 99, 99, 4, 3).length, 12);
assert.equal(rectCells(0, 0, 1, 1, 0, 0).length, 0);
assert.deepEqual([...brushCells(5, 5, 1, 10, 10)], ['5,5']);
assert.equal(brushCells(5, 5, 3, 10, 10).length, 9);
assert.equal(brushCells(5, 5, 5, 10, 10).length, 25);
assert.equal(brushCells(0, 0, 3, 10, 10).length, 4); // corner clip
assert.equal(brushCells(0, 0, 5, 10, 10).length, 9);
assert.equal(brushCells(20, 0, 3, 10, 10).length, 0);
assert.equal(allCells(5, 4).length, 20);
assert.deepEqual([...applyFog(['0,0'], ['0,0', '1,0'], 'cover')], ['0,0', '1,0']);
assert.deepEqual([...applyFog(['0,0', '1,0', '2,0'], ['1,0', '9,9'], 'reveal')], ['0,0', '2,0']);
assert.deepEqual([...applyFog(['0,0', '0,0'], [], 'cover')], ['0,0']);
assert.equal(fogModeAt(['1,1'], 1, 1), 'reveal');
assert.equal(fogModeAt(['1,1'], 0, 1), 'cover');
console.log('Fog tool tests passed');
