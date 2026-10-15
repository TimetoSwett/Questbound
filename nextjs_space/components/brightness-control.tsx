'use client';

import { useEffect, useState } from 'react';
import { Moon, Sun } from 'lucide-react';
import { cn } from '@/lib/utils';

export function BrightnessControl({ className }: { className?: string }) {
  const [level, setLevel] = useState<number | null>(null);

  useEffect(() => {
    const sync = () => {
      const value = document.documentElement.dataset.brightness;
      setLevel(value && /^[1-5]$/.test(value) ? Number(value) : 1);
    };
    sync();
    const observer = new MutationObserver(sync);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-brightness'] });
    const onStorage = (event: StorageEvent) => {
      if (event.key !== 'qb:brightness') return;
      const value = event.newValue && /^[1-5]$/.test(event.newValue)
        ? event.newValue : window.matchMedia('(prefers-color-scheme: dark)').matches ? '5' : '1';
      document.documentElement.setAttribute('data-brightness', value);
      document.documentElement.style.setProperty('color-scheme', Number(value) >= 3 ? 'dark' : 'light');
    };
    window.addEventListener('storage', onStorage);
    return () => { observer.disconnect(); window.removeEventListener('storage', onStorage); };
  }, []);

  function select(value: number) {
    document.documentElement.setAttribute('data-brightness', String(value));
    document.documentElement.style.setProperty('color-scheme', value >= 3 ? 'dark' : 'light');
    setLevel(value);
    try { localStorage.setItem('qb:brightness', String(value)); } catch { /* Still works when storage is unavailable. */ }
  }

  return (
    <div role="group" aria-label="Brightness" className={cn('inline-flex shrink-0 items-center gap-0.5 rounded-md border border-border bg-card p-0.5', className)}>
      <Sun aria-hidden="true" className="mx-1 hidden h-3 w-3 text-muted-foreground sm:block" />
      {[1, 2, 3, 4, 5].map((value) => (
        <button key={value} type="button" aria-label={`Brightness ${value} of 5`}
          aria-pressed={level === null ? undefined : level === value} onClick={() => select(value)}
          className={cn('h-7 w-6 rounded text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
            level === value ? 'bg-primary text-primary-foreground' : 'text-foreground hover:bg-muted')}>
          {value}
        </button>
      ))}
      <Moon aria-hidden="true" className="mx-1 hidden h-3 w-3 text-muted-foreground sm:block" />
    </div>
  );
}
