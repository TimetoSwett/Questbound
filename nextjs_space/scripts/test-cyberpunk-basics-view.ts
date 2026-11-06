// Basics presentation: derived autofill and official skill rows. No server.
// Run: npm run test:cyberpunk-basics
import assert from 'node:assert/strict';
import { CYBERPUNK_DEFAULT_SKILLS, CYBERPUNK_SKILL_GROUPS, defaultCyberpunkSheet, type CyberpunkSkill } from '../lib/cyberpunk-sheet';
import {
  CYBERPUNK_SKILL_STAT_OPTIONS,
  applyDerivedEdit,
  applyStatEdit,
  displayedDerived,
  inferDerivedManual,
  presentCyberpunkSkills,
} from '../app/campaign/[id]/_components/cyberpunk/basics-view';

const fresh = defaultCyberpunkSheet();
assert.deepEqual(fresh.stats, { INT: 5, REF: 5, TECH: 5, COOL: 5, ATTR: 5, LUCK: 5, MA: 5, BODY: 5, EMP: 5 });
assert.deepEqual(inferDerivedManual(fresh), { run: false, leap: false, carry: false, lift: false });
assert.deepEqual(displayedDerived(fresh, inferDerivedManual(fresh)), { run: 15, leap: 3.75, carry: 50, lift: 200 });

const raised = applyStatEdit(fresh, inferDerivedManual(fresh), 'MA', 7);
assert.equal(raised.sheet.stats.MA, 7);
assert.equal(raised.sheet.stats.BODY, 5);
assert.equal(raised.sheet.derived.run, 21);
assert.equal(raised.sheet.derived.leap, 5.25);
assert.equal(raised.manual.run, false);
assert.equal(raised.manual.leap, false);
assert.equal(raised.sheet.skills.length, 0);

const overridden = applyDerivedEdit(raised.sheet, raised.manual, 'run', 10);
assert.equal(overridden.manual.run, true);
assert.equal(overridden.sheet.derived.run, 10);
assert.equal(overridden.sheet.derived.leap, 2.5);
assert.equal(overridden.manual.leap, false);

const maAgain = applyStatEdit(overridden.sheet, overridden.manual, 'MA', 8);
assert.equal(maAgain.sheet.derived.run, 10);
assert.equal(maAgain.sheet.derived.leap, 2.5);
assert.equal(maAgain.manual.run, true);

const leapHeld = applyDerivedEdit(maAgain.sheet, maAgain.manual, 'leap', 9);
const bodyMove = applyStatEdit(leapHeld.sheet, leapHeld.manual, 'BODY', 4);
assert.equal(bodyMove.sheet.derived.leap, 9);
assert.equal(bodyMove.manual.leap, true);
assert.equal(bodyMove.sheet.derived.carry, 40);
assert.equal(bodyMove.sheet.derived.lift, 160);
assert.equal(bodyMove.manual.carry, false);

const cleared = applyDerivedEdit(bodyMove.sheet, bodyMove.manual, 'run', null);
assert.equal(cleared.manual.run, false);
assert.equal(cleared.sheet.derived.run, null);
assert.equal(cleared.sheet.derived.leap, 9);
assert.equal(displayedDerived(cleared.sheet, cleared.manual).run, 24);

const refOnly = applyStatEdit(fresh, inferDerivedManual(fresh), 'REF', null);
assert.equal(refOnly.sheet.stats.REF, null);
assert.equal(refOnly.sheet.derived.run, null);
assert.equal(refOnly.sheet.stats.INT, 5);

const manualSheet = defaultCyberpunkSheet();
manualSheet.derived.run = 99;
assert.equal(inferDerivedManual(manualSheet).run, true);
assert.equal(displayedDerived(manualSheet, inferDerivedManual(manualSheet)).run, 99);
assert.equal(displayedDerived(manualSheet, inferDerivedManual(manualSheet)).leap, 24.75);

assert.deepEqual([...CYBERPUNK_SKILL_STAT_OPTIONS], [...CYBERPUNK_SKILL_GROUPS, 'OTHER']);
assert.equal(CYBERPUNK_SKILL_STAT_OPTIONS.includes('LUCK' as 'ATTR'), false);
assert.equal(CYBERPUNK_SKILL_STAT_OPTIONS.includes('MA' as 'ATTR'), false);

const presented = presentCyberpunkSkills([]);
assert.deepEqual(presented.map((skill) => skill.name), CYBERPUNK_DEFAULT_SKILLS.map((skill) => skill.name));
assert.equal(presented.every((skill) => skill.value === null && skill.chipped === false), true);

const chipped = presentCyberpunkSkills([{ name: 'Personal Grooming', stat: 'ATTR', value: 2, chipped: true }]);
assert.equal(chipped[0].name, 'Personal Grooming');
assert.equal(chipped[0].value, 2);
assert.equal(chipped[0].chipped, true);

const languages = presentCyberpunkSkills([
  { name: 'Language: Japanese', stat: 'INT', value: 4, chipped: false },
  { name: 'Language: Spanish', stat: 'INT', value: 2, chipped: true },
  { name: 'Language: French', stat: 'INT', value: 1, chipped: false },
  { name: 'Language: German', stat: 'INT', value: 3, chipped: false },
]);
const officialLanguages = languages.slice(0, CYBERPUNK_DEFAULT_SKILLS.length).filter((skill) => skill.stat === 'INT' && (skill.name === 'Language' || skill.name.startsWith('Language: ')));
assert.deepEqual(officialLanguages.map((skill) => skill.name), ['Language: Japanese', 'Language: Spanish', 'Language: French']);
assert.equal(officialLanguages[0].value, 4);
assert.equal(officialLanguages[1].chipped, true);
assert.deepEqual(languages.at(-1), { name: 'Language: German', stat: 'INT', value: 3, chipped: false });

const custom = presentCyberpunkSkills([{ name: 'Streetfight', stat: 'REF', value: 6, chipped: false }]);
assert.equal(custom.length, CYBERPUNK_DEFAULT_SKILLS.length + 1);
assert.deepEqual(custom.at(-1), { name: 'Streetfight', stat: 'REF', value: 6, chipped: false });

const luck = presentCyberpunkSkills([{ name: 'Gamble', stat: 'LUCK' as CyberpunkSkill['stat'], value: 1, chipped: false }]);
const officialGamble = luck.slice(0, CYBERPUNK_DEFAULT_SKILLS.length).find((skill) => skill.name === 'Gamble');
assert.equal(officialGamble?.stat, 'INT');
assert.equal(officialGamble?.value, null);
assert.deepEqual(luck.at(-1), { name: 'Gamble', stat: 'OTHER', value: 1, chipped: false });

const expert = presentCyberpunkSkills([{ name: 'Expert: Street Drugs', stat: 'INT', value: 5, chipped: false }]);
const officialExpert = expert.slice(0, CYBERPUNK_DEFAULT_SKILLS.length).find((skill) => skill.name.startsWith('Expert'));
assert.equal(officialExpert?.name, 'Expert: Street Drugs');
assert.equal(officialExpert?.value, 5);
assert.equal(expert.length, CYBERPUNK_DEFAULT_SKILLS.length);

console.log('CYBERPUNK BASICS VIEW: PASS');
