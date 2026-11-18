#!/usr/bin/env node
// Runs every DB-free test:* script (all but test:cp-guardrails, which needs a
// live app) and exits non-zero if any fails. Mirrors the CI job's enumeration
// so a new test:<name> script is picked up automatically. No database, no
// network: each suite is responsible for staying DB-free, and the vars that
// would switch a suite onto a live database or server are unset first,
// exactly like CI does.
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const skip = new Set(['test:cp-guardrails']);
const names = Object.keys(pkg.scripts ?? {}).filter((name) => name.startsWith('test:') && !skip.has(name));
if (names.length === 0) {
  console.error('No DB-free test scripts found');
  process.exit(1);
}
delete process.env.DATABASE_URL;
delete process.env.REALTIME_BASE;
delete process.env.BASE;
const failures = [];
for (const name of names) {
  console.log(`\n=== ${name} ===`);
  const result = spawnSync('npm', ['run', name], { stdio: 'inherit', env: process.env });
  if (result.error || result.status !== 0) failures.push(name);
}
if (failures.length > 0) {
  console.error(`\nFAILED: ${failures.join(', ')}`);
  process.exit(1);
}
console.log(`\nAll ${names.length} test suites passed.`);
