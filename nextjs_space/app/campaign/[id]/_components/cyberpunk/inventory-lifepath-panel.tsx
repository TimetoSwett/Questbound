'use client';

import { Fragment, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import {
  CYBERPUNK_ARMOR_LOCATIONS,
  CYBERPUNK_ARMOR_LOCATION_INFO,
  CYBERPUNK_CYBERNETICS_COLUMNS,
  CYBERPUNK_GEAR_COLUMNS,
  CYBERPUNK_LIFEPATH_FIELDS,
  CYBERPUNK_LIFEPATH_LABELS,
  CYBERPUNK_LIMITS,
  CYBERPUNK_WEAPON_COLUMNS,
  type CyberpunkArmorLocation,
  type CyberpunkCybernetic,
  type CyberpunkGearItem,
  type CyberpunkLifeEvent,
  type CyberpunkLifepathField,
  type CyberpunkSheet,
  type CyberpunkWeapon,
} from '@/lib/cyberpunk-sheet';

const sectionClass = 'rounded-lg border border-border bg-card p-4';
const sectionStyle = { boxShadow: 'var(--shadow-sm)' };

function parseBounded(
  raw: string,
  integer: boolean,
  range: { min: number; max: number },
): number | null | undefined {
  const trimmed = raw.trim();
  if (trimmed === '') return null;
  if (trimmed === '-' || trimmed === '+' || trimmed === '.' || trimmed === '-.' || trimmed.endsWith('.')) return undefined;
  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed)) return undefined;
  const rounded = integer ? Math.trunc(parsed) : Math.round(parsed * 100) / 100;
  return Math.min(range.max, Math.max(range.min, rounded));
}

function NullableNumberInput({
  id,
  value,
  disabled,
  integer,
  range,
  className,
  ariaLabel,
  onCommit,
}: {
  id: string;
  value: number | null;
  disabled?: boolean;
  integer: boolean;
  range: { min: number; max: number };
  className?: string;
  ariaLabel?: string;
  onCommit: (value: number | null) => void;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const shown = draft ?? (value === null ? '' : String(value));
  return (
    <Input
      id={id}
      type="text"
      inputMode={integer ? 'numeric' : 'decimal'}
      value={shown}
      disabled={disabled}
      aria-label={ariaLabel}
      className={cn('font-mono', className)}
      onFocus={() => setDraft(value === null ? '' : String(value))}
      onBlur={() => setDraft(null)}
      onChange={(event) => {
        const text = event.target.value;
        setDraft(text);
        const parsed = parseBounded(text, integer, range);
        if (parsed !== undefined) onCommit(parsed);
      }}
    />
  );
}

/**
 * Presentation-only row identity, same idea as the Basics skills list.
 * Keys are stable across edits and survive a neighbor being removed; they
 * are never stored — onChange always receives plain model rows.
 */
type PresentedRow<T> = T & { key: string };

function presentRows<T>(rows: readonly T[], prefix: string): PresentedRow<T>[] {
  return rows.map((row, index) => ({ ...row, key: `${prefix}:${index}` }));
}

function appendPresentedRow<T>(rows: readonly PresentedRow<T>[], prefix: string, blank: T): PresentedRow<T>[] {
  const used = new Set(rows.map((row) => row.key));
  let index = 0;
  while (used.has(`${prefix}:${index}`)) index += 1;
  return [...rows, { ...blank, key: `${prefix}:${index}` }];
}

function updatePresentedRow<T>(
  rows: readonly PresentedRow<T>[],
  key: string,
  patch: Partial<T>,
): PresentedRow<T>[] {
  return rows.map((row) => (row.key === key ? { ...row, ...patch } : row));
}

function removePresentedRow<T>(rows: readonly PresentedRow<T>[], key: string): PresentedRow<T>[] {
  return rows.filter((row) => row.key !== key);
}

const BLANK_CYBERNETIC: CyberpunkCybernetic = { type: '', hl: null, cost: null };
const BLANK_GEAR: CyberpunkGearItem = { type: '', cost: null, wt: null };
const BLANK_WEAPON: CyberpunkWeapon = {
  name: '', type: '', wa: null, con: '', avail: '', dammage: '', ammo: '', rndCap: null, rof: null, rel: '',
};
const BLANK_LIFE_EVENT: CyberpunkLifeEvent = { year: null, event: '' };

function storedCybernetics(rows: readonly PresentedRow<CyberpunkCybernetic>[]): CyberpunkCybernetic[] {
  return rows.map(({ type, hl, cost }) => ({ type, hl, cost }));
}

function storedGear(rows: readonly PresentedRow<CyberpunkGearItem>[]): CyberpunkGearItem[] {
  return rows.map(({ type, cost, wt }) => ({ type, cost, wt }));
}

function storedWeapons(rows: readonly PresentedRow<CyberpunkWeapon>[]): CyberpunkWeapon[] {
  return rows.map(({ name, type, wa, con, avail, dammage, ammo, rndCap, rof, rel }) =>
    ({ name, type, wa, con, avail, dammage, ammo, rndCap, rof, rel }));
}

function storedLifeEvents(rows: readonly PresentedRow<CyberpunkLifeEvent>[]): CyberpunkLifeEvent[] {
  return rows.map(({ year, event }) => ({ year, event }));
}

function armorLabel(location: CyberpunkArmorLocation): string {
  const info = CYBERPUNK_ARMOR_LOCATION_INFO[location];
  if (!('side' in info)) return info.label;
  return `${info.label} (${info.side === 'right' ? 'R' : 'L'})`;
}

/** Mirrors lifepathMax in lib/cyberpunk-sheet.ts. */
const LIFEPATH_MULTILINE: readonly CyberpunkLifepathField[] = ['familyBackground', 'motivations', 'traits'];

function lifepathMax(field: CyberpunkLifepathField): number {
  if (field === 'familyBackground' || field === 'motivations') return CYBERPUNK_LIMITS.text.lifepathLong;
  if (field === 'siblings') return CYBERPUNK_LIMITS.text.short;
  return CYBERPUNK_LIMITS.text.lifepath;
}

type ColumnDef = { readonly key: string; readonly label: string; readonly kind: 'text' | 'number'; readonly title?: string };

function SheetRowCells({
  columns,
  values,
  idPrefix,
  disabled,
  showLabels,
  numberRange,
  textMax,
  onPatch,
}: {
  columns: readonly ColumnDef[];
  values: Record<string, string | number | null>;
  idPrefix: string;
  disabled: boolean;
  showLabels: boolean;
  numberRange: (key: string) => { integer: boolean; range: { min: number; max: number } };
  textMax: (key: string) => number;
  onPatch: (key: string, value: string | number | null) => void;
}) {
  return (
    <>
      {columns.map((column) => {
        const label = column.title ?? column.label;
        if (column.kind === 'number') {
          const spec = numberRange(column.key);
          const rawNumber = values[column.key];
          const value = typeof rawNumber === 'number' ? rawNumber : null;
          return (
            <div key={column.key}>
              {showLabels && (
                <Label htmlFor={`${idPrefix}-${column.key}`} className="text-xs" title={column.title}>{column.label}</Label>
              )}
              <NullableNumberInput
                id={`${idPrefix}-${column.key}`}
                value={value}
                disabled={disabled}
                integer={spec.integer}
                range={spec.range}
                className="mt-1"
                ariaLabel={showLabels ? undefined : label}
                onCommit={(next) => onPatch(column.key, next)}
              />
            </div>
          );
        }
        const rawText = values[column.key];
        const value = typeof rawText === 'string' ? rawText : '';
        return (
          <div key={column.key}>
            {showLabels && (
              <Label htmlFor={`${idPrefix}-${column.key}`} className="text-xs" title={column.title}>{column.label}</Label>
            )}
            <Input
              id={`${idPrefix}-${column.key}`}
              value={value}
              disabled={disabled}
              maxLength={textMax(column.key)}
              className="mt-1"
              aria-label={showLabels ? undefined : label}
              onChange={(event) => onPatch(column.key, event.target.value)}
            />
          </div>
        );
      })}
    </>
  );
}

function RemoveButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-sm"
      className="mb-1"
      aria-label={label}
      onClick={onClick}
    >
      <Trash2 className="h-4 w-4 text-destructive" />
    </Button>
  );
}

export function CyberpunkInventoryLifepathPanel({
  sheet,
  editable,
  onChange,
}: {
  sheet: CyberpunkSheet;
  editable: boolean;
  onChange: (next: CyberpunkSheet) => void;
}) {
  const [cybernetics, setCybernetics] = useState<PresentedRow<CyberpunkCybernetic>[]>(() => presentRows(sheet.cybernetics, 'cybernetic'));
  const [gear, setGear] = useState<PresentedRow<CyberpunkGearItem>[]>(() => presentRows(sheet.gear, 'gear'));
  const [weapons, setWeapons] = useState<PresentedRow<CyberpunkWeapon>[]>(() => presentRows(sheet.weapons, 'weapon'));
  const [lifeEvents, setLifeEvents] = useState<PresentedRow<CyberpunkLifeEvent>[]>(() => presentRows(sheet.lifepath.lifeEvents, 'event'));

  const pushCybernetics = (next: PresentedRow<CyberpunkCybernetic>[]) => {
    setCybernetics(next);
    onChange({ ...sheet, cybernetics: storedCybernetics(next) });
  };

  const pushGear = (next: PresentedRow<CyberpunkGearItem>[]) => {
    setGear(next);
    onChange({ ...sheet, gear: storedGear(next) });
  };

  const pushWeapons = (next: PresentedRow<CyberpunkWeapon>[]) => {
    setWeapons(next);
    onChange({ ...sheet, weapons: storedWeapons(next) });
  };

  const pushLifeEvents = (next: PresentedRow<CyberpunkLifeEvent>[]) => {
    setLifeEvents(next);
    onChange({ ...sheet, lifepath: { ...sheet.lifepath, lifeEvents: storedLifeEvents(next) } });
  };

  return (
    <div className="space-y-6">
      <section className={sectionClass} style={sectionStyle}>
        <h3 className="font-display text-lg font-semibold">Money</h3>
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          <div>
            <Label htmlFor="cp-money">Money (eb)</Label>
            <NullableNumberInput
              id="cp-money"
              value={sheet.money}
              disabled={!editable}
              integer={false}
              range={CYBERPUNK_LIMITS.resource}
              className="mt-1"
              onCommit={(money) => onChange({ ...sheet, money })}
            />
          </div>
        </div>
      </section>

      <section className={sectionClass} style={sectionStyle}>
        <h3 className="font-display text-lg font-semibold">Armor</h3>
        <p className="mt-1 text-sm text-muted-foreground">Stopping power (SP) per body location. Blank means no armor there.</p>
        <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-4">
          {CYBERPUNK_ARMOR_LOCATIONS.map((location) => (
            <div key={location}>
              <Label htmlFor={`cp-armor-${location}`} className="font-mono text-xs">{armorLabel(location)}</Label>
              <NullableNumberInput
                id={`cp-armor-${location}`}
                value={sheet.armor[location]}
                disabled={!editable}
                integer
                range={CYBERPUNK_LIMITS.armor}
                className="mt-1 px-2 text-center"
                onCommit={(value) => onChange({ ...sheet, armor: { ...sheet.armor, [location]: value } })}
              />
            </div>
          ))}
        </div>
      </section>

      <section className={sectionClass} style={sectionStyle}>
        <div className="flex items-center justify-between gap-2">
          <h3 className="font-display text-lg font-semibold">Cybernetics</h3>
          {editable && cybernetics.length < CYBERPUNK_LIMITS.cybernetics && (
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => pushCybernetics(appendPresentedRow(cybernetics, 'cybernetic', BLANK_CYBERNETIC))}
            >
              <Plus className="mr-1 h-4 w-4" /> Add cybernetic
            </Button>
          )}
        </div>
        {cybernetics.length === 0 && (
          <p className="mt-3 text-sm text-muted-foreground">No cybernetics yet.</p>
        )}
        <ul className="mt-3 space-y-2">
          {cybernetics.map((row) => (
            <li key={row.key} className="grid grid-cols-1 items-end gap-2 sm:grid-cols-[1fr_6rem_7rem_auto]">
              <SheetRowCells
                columns={CYBERPUNK_CYBERNETICS_COLUMNS}
                values={row}
                idPrefix={`cp-cyber-${row.key}`}
                disabled={!editable}
                showLabels
                numberRange={(key) => key === 'hl'
                  ? { integer: false, range: CYBERPUNK_LIMITS.humanityLoss }
                  : { integer: false, range: CYBERPUNK_LIMITS.resource }}
                textMax={() => CYBERPUNK_LIMITS.text.line}
                onPatch={(key, value) => pushCybernetics(updatePresentedRow(
                  cybernetics,
                  row.key,
                  { [key]: value } as Partial<CyberpunkCybernetic>,
                ))}
              />
              {editable && (
                <RemoveButton
                  label={`Remove ${row.type || 'cybernetic'}`}
                  onClick={() => pushCybernetics(removePresentedRow(cybernetics, row.key))}
                />
              )}
            </li>
          ))}
        </ul>
        <div className="mt-4 grid grid-cols-2 gap-3 sm:max-w-sm">
          <div>
            <Label htmlFor="cp-cyber-total-hl">Total HL</Label>
            <NullableNumberInput
              id="cp-cyber-total-hl"
              value={sheet.cyberneticsTotals.hl}
              disabled={!editable}
              integer={false}
              range={CYBERPUNK_LIMITS.humanityLoss}
              className="mt-1"
              onCommit={(hl) => onChange({ ...sheet, cyberneticsTotals: { ...sheet.cyberneticsTotals, hl } })}
            />
          </div>
          <div>
            <Label htmlFor="cp-cyber-total-euro">Total cost (eb)</Label>
            <NullableNumberInput
              id="cp-cyber-total-euro"
              value={sheet.cyberneticsTotals.euro}
              disabled={!editable}
              integer={false}
              range={CYBERPUNK_LIMITS.resource}
              className="mt-1"
              onCommit={(euro) => onChange({ ...sheet, cyberneticsTotals: { ...sheet.cyberneticsTotals, euro } })}
            />
          </div>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">Totals are entered by hand — not added up from the list above.</p>
      </section>

      <section className={sectionClass} style={sectionStyle}>
        <div className="flex items-center justify-between gap-2">
          <h3 className="font-display text-lg font-semibold">Gear</h3>
          {editable && gear.length < CYBERPUNK_LIMITS.gear && (
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => pushGear(appendPresentedRow(gear, 'gear', BLANK_GEAR))}
            >
              <Plus className="mr-1 h-4 w-4" /> Add gear
            </Button>
          )}
        </div>
        {gear.length === 0 && (
          <p className="mt-3 text-sm text-muted-foreground">No gear yet.</p>
        )}
        <ul className="mt-3 space-y-2">
          {gear.map((row) => (
            <li key={row.key} className="grid grid-cols-1 items-end gap-2 sm:grid-cols-[1fr_7rem_6rem_auto]">
              <SheetRowCells
                columns={CYBERPUNK_GEAR_COLUMNS}
                values={row}
                idPrefix={`cp-gear-${row.key}`}
                disabled={!editable}
                showLabels
                numberRange={() => ({ integer: false, range: CYBERPUNK_LIMITS.resource })}
                textMax={() => CYBERPUNK_LIMITS.text.line}
                onPatch={(key, value) => pushGear(updatePresentedRow(
                  gear,
                  row.key,
                  { [key]: value } as Partial<CyberpunkGearItem>,
                ))}
              />
              {editable && (
                <RemoveButton
                  label={`Remove ${row.type || 'gear'}`}
                  onClick={() => pushGear(removePresentedRow(gear, row.key))}
                />
              )}
            </li>
          ))}
        </ul>
      </section>

      <section className={sectionClass} style={sectionStyle}>
        <div className="flex items-center justify-between gap-2">
          <h3 className="font-display text-lg font-semibold">Weapons</h3>
          {editable && weapons.length < CYBERPUNK_LIMITS.weapons && (
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => pushWeapons(appendPresentedRow(weapons, 'weapon', BLANK_WEAPON))}
            >
              <Plus className="mr-1 h-4 w-4" /> Add weapon
            </Button>
          )}
        </div>
        {weapons.length === 0 && (
          <p className="mt-3 text-sm text-muted-foreground">No weapons yet.</p>
        )}
        {weapons.length > 0 && (
          <div className="mt-3 overflow-x-auto">
            <div className="grid min-w-[57rem] grid-cols-[10rem_6rem_4rem_5rem_5rem_6rem_5rem_4rem_4rem_5rem_2.5rem] gap-2">
              {CYBERPUNK_WEAPON_COLUMNS.map((column) => (
                <p
                  key={column.key}
                  className="font-mono text-xs text-muted-foreground"
                  title={'title' in column ? column.title : undefined}
                >
                  {column.label}
                </p>
              ))}
              <span aria-hidden="true" />
              {weapons.map((row) => (
                <Fragment key={row.key}>
                  <SheetRowCells
                    columns={CYBERPUNK_WEAPON_COLUMNS}
                    values={row}
                    idPrefix={`cp-weapon-${row.key}`}
                    disabled={!editable}
                    showLabels={false}
                    numberRange={(key) => key === 'wa'
                      ? { integer: true, range: CYBERPUNK_LIMITS.wa }
                      : { integer: true, range: CYBERPUNK_LIMITS.counter }}
                    textMax={(key) => key === 'name' ? CYBERPUNK_LIMITS.text.name : CYBERPUNK_LIMITS.text.short}
                    onPatch={(key, value) => pushWeapons(updatePresentedRow(
                      weapons,
                      row.key,
                      { [key]: value } as Partial<CyberpunkWeapon>,
                    ))}
                  />
                  {editable ? (
                    <RemoveButton
                      label={`Remove ${row.name || 'weapon'}`}
                      onClick={() => pushWeapons(removePresentedRow(weapons, row.key))}
                    />
                  ) : (
                    <span aria-hidden="true" />
                  )}
                </Fragment>
              ))}
            </div>
          </div>
        )}
      </section>

      <section className={sectionClass} style={sectionStyle}>
        <h3 className="font-display text-lg font-semibold">Lifepath</h3>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          {CYBERPUNK_LIFEPATH_FIELDS.map((field) => {
            const multiline = LIFEPATH_MULTILINE.includes(field);
            return (
              <div key={field} className={cn(multiline && 'sm:col-span-2')}>
                <Label htmlFor={`cp-lifepath-${field}`}>{CYBERPUNK_LIFEPATH_LABELS[field]}</Label>
                {multiline ? (
                  <Textarea
                    id={`cp-lifepath-${field}`}
                    value={sheet.lifepath[field]}
                    disabled={!editable}
                    maxLength={lifepathMax(field)}
                    rows={3}
                    className="mt-1"
                    onChange={(event) => onChange({ ...sheet, lifepath: { ...sheet.lifepath, [field]: event.target.value } })}
                  />
                ) : (
                  <Input
                    id={`cp-lifepath-${field}`}
                    value={sheet.lifepath[field]}
                    disabled={!editable}
                    maxLength={lifepathMax(field)}
                    className="mt-1"
                    onChange={(event) => onChange({ ...sheet, lifepath: { ...sheet.lifepath, [field]: event.target.value } })}
                  />
                )}
              </div>
            );
          })}
        </div>
        <div className="mt-4 flex items-center justify-between gap-2">
          <h4 className="font-mono text-xs uppercase tracking-widest text-muted-foreground">Life events</h4>
          {editable && lifeEvents.length < CYBERPUNK_LIMITS.lifeEvents && (
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => pushLifeEvents(appendPresentedRow(lifeEvents, 'event', BLANK_LIFE_EVENT))}
            >
              <Plus className="mr-1 h-4 w-4" /> Add life event
            </Button>
          )}
        </div>
        {lifeEvents.length === 0 && (
          <p className="mt-3 text-sm text-muted-foreground">No life events yet.</p>
        )}
        <ul className="mt-3 space-y-2">
          {lifeEvents.map((row) => (
            <li key={row.key} className="grid grid-cols-1 items-end gap-2 sm:grid-cols-[7rem_1fr_auto]">
              <div>
                <Label htmlFor={`cp-event-year-${row.key}`} className="text-xs">Year</Label>
                <NullableNumberInput
                  id={`cp-event-year-${row.key}`}
                  value={row.year}
                  disabled={!editable}
                  integer
                  range={CYBERPUNK_LIMITS.year}
                  className="mt-1"
                  onCommit={(year) => pushLifeEvents(updatePresentedRow(lifeEvents, row.key, { year }))}
                />
              </div>
              <div>
                <Label htmlFor={`cp-event-text-${row.key}`} className="text-xs">Event</Label>
                <Textarea
                  id={`cp-event-text-${row.key}`}
                  value={row.event}
                  disabled={!editable}
                  maxLength={CYBERPUNK_LIMITS.text.event}
                  rows={2}
                  className="mt-1"
                  onChange={(event) => pushLifeEvents(updatePresentedRow(lifeEvents, row.key, { event: event.target.value }))}
                />
              </div>
              {editable && (
                <RemoveButton
                  label={`Remove life event ${row.year ?? ''}`.trim()}
                  onClick={() => pushLifeEvents(removePresentedRow(lifeEvents, row.key))}
                />
              )}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
