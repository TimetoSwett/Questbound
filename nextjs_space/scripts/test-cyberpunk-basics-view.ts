// Basics presentation: derived autofill and official skill rows. No server.
// Run: npm run test:cyberpunk-basics
import assert from 'node:assert/strict';
import { CYBERPUNK_DEFAULT_SKILLS, CYBERPUNK_SKILL_GROUPS, defaultCyberpunkSheet, type CyberpunkSkill } from '../lib/cyberpunk-sheet';
import {
  CYBERPUNK_SKILL_STAT_OPTIONS,
  applyDerivedEdit,
  applyStatEdit,
  displayedDerived,
  appendCustomSkill,
  inferDerivedManual,
  presentCyberpunkSkills,
  removePresentedSkill,
  storedCyberpunkSkills,
  updatePresentedSkill,
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
assert.equal(presented.every((skill) => skill.source === 'official' && skill.value === null && skill.chipped === false), true);
const presentedAgain = presentCyberpunkSkills(storedCyberpunkSkills(presented));
assert.equal(presentedAgain.filter((skill) => skill.source === 'official').length, CYBERPUNK_DEFAULT_SKILLS.length);
assert.equal(presentedAgain.filter((skill) => skill.source === 'custom').length, 0);

const chipped = presentCyberpunkSkills([{ name: 'Personal Grooming', stat: 'ATTR', value: 2, chipped: true }]);
const officialGrooming = chipped.find((skill) => skill.source === 'official' && skill.name === 'Personal Grooming');
const customGrooming = chipped.filter((skill) => skill.source === 'custom');
assert.equal(officialGrooming?.value, null);
assert.equal(officialGrooming?.chipped, false);
assert.deepEqual(customGrooming.map(({ name, stat, value, chipped: marked }) => ({ name, stat, value, chipped: marked })), [
  { name: 'Personal Grooming', stat: 'ATTR', value: 2, chipped: true },
]);

const languages = presentCyberpunkSkills([
  { name: 'Language: Japanese', stat: 'INT', value: 4, chipped: false },
  { name: 'Language: Spanish', stat: 'INT', value: 2, chipped: true },
  { name: 'Language: French', stat: 'INT', value: 1, chipped: false },
  { name: 'Language: German', stat: 'INT', value: 3, chipped: false },
]);
const officialLanguages = languages.filter((skill) => skill.source === 'official' && skill.name === 'Language');
assert.equal(officialLanguages.length, 3);
assert.equal(officialLanguages.every((skill) => skill.value === null), true);
assert.deepEqual(
  languages.filter((skill) => skill.source === 'custom').map((skill) => skill.name),
  ['Language: Japanese', 'Language: Spanish', 'Language: French', 'Language: German'],
);

const custom = presentCyberpunkSkills([{ name: 'Streetfight', stat: 'REF', value: 6, chipped: false }]);
assert.equal(custom.filter((skill) => skill.source === 'custom').length, 1);
assert.equal(custom.at(-1)?.name, 'Streetfight');
assert.equal(custom.at(-1)?.source, 'custom');

const luck = presentCyberpunkSkills([{ name: 'Gamble', stat: 'LUCK' as CyberpunkSkill['stat'], value: 1, chipped: false }]);
const officialGamble = luck.find((skill) => skill.source === 'official' && skill.name === 'Gamble');
assert.equal(officialGamble?.stat, 'INT');
assert.equal(officialGamble?.value, null);
assert.deepEqual(
  luck.filter((skill) => skill.source === 'custom').map(({ name, stat, value, chipped: marked }) => ({ name, stat, value, chipped: marked })),
  [{ name: 'Gamble', stat: 'OTHER', value: 1, chipped: false }],
);

const expert = presentCyberpunkSkills([{ name: 'Expert: Street Drugs', stat: 'INT', value: 5, chipped: false }]);
const officialExpert = expert.find((skill) => skill.source === 'official' && skill.name === 'Expert');
assert.equal(officialExpert?.value, null);
assert.equal(expert.filter((skill) => skill.source === 'custom' && skill.name === 'Expert: Street Drugs').length, 1);

const legacy = presentCyberpunkSkills([{ name: 'Handgun', stat: 'REF', value: 8, chipped: false }]);
const legacyCustom = legacy.filter((skill) => skill.source === 'custom');
assert.equal(legacyCustom.length, 1);
assert.equal(legacyCustom[0].value, 8);
assert.equal(legacy.find((skill) => skill.source === 'official' && skill.name === 'Handgun')?.value, null);
const handgunKey = legacyCustom[0].key;
const officialKeys = legacy.filter((skill) => skill.source === 'official').map((skill) => skill.key);
let edited = updatePresentedSkill(legacy, handgunKey, { name: 'Pistol' });
edited = updatePresentedSkill(edited, handgunKey, { stat: 'TECH' });
edited = appendCustomSkill(edited, { name: 'Handgun', stat: 'REF', value: 2, chipped: false });
edited = appendCustomSkill(edited, { name: 'Shadowrun', stat: 'COOL', value: 4, chipped: true });
edited = appendCustomSkill(edited, { name: 'Shadowrun', stat: 'COOL', value: 1, chipped: false });
const duplicateKeys = edited.filter((skill) => skill.source === 'custom' && skill.name === 'Shadowrun').map((skill) => skill.key);
assert.equal(duplicateKeys.length, 2);
assert.notEqual(duplicateKeys[0], duplicateKeys[1]);
const removed = removePresentedSkill(edited, duplicateKeys[0]);
assert.deepEqual(removed.filter((skill) => skill.source === 'official').map((skill) => skill.key), officialKeys);
assert.equal(removed.some((skill) => skill.key === handgunKey && skill.name === 'Pistol' && skill.stat === 'TECH' && skill.value === 8), true);
assert.equal(removed.some((skill) => skill.key === duplicateKeys[1] && skill.name === 'Shadowrun' && skill.value === 1), true);
assert.equal(removed.some((skill) => skill.key === duplicateKeys[0]), false);
assert.equal(removed.filter((skill) => skill.source === 'custom' && skill.name === 'Handgun' && skill.value === 2).length, 1);
const reloaded = presentCyberpunkSkills(storedCyberpunkSkills(removed));
assert.equal(reloaded.filter((skill) => skill.source === 'official').length, CYBERPUNK_DEFAULT_SKILLS.length);
assert.equal(reloaded.find((skill) => skill.source === 'official' && skill.name === 'Handgun')?.value, null);
assert.equal(reloaded.some((skill) => skill.source === 'custom' && skill.name === 'Pistol' && skill.stat === 'TECH' && skill.value === 8), true);
assert.equal(reloaded.filter((skill) => skill.source === 'custom' && skill.name === 'Handgun').length, 1);
assert.equal(reloaded.filter((skill) => skill.source === 'custom' && skill.name === 'Shadowrun').length, 1);

console.log('CYBERPUNK BASICS VIEW: PASS');
