'use client';

import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { HALL_LINKS } from './halls';

export function HallNav({ current }: { current?: string }) {
  return <nav aria-label="Catalogs" className="flex flex-wrap items-center gap-1">
    {HALL_LINKS.map((link) => (
      <Button key={link.href} asChild variant={current === link.href ? 'secondary' : 'ghost'} size="sm">
        <Link href={link.href} aria-current={current === link.href ? 'page' : undefined}>{link.label}</Link>
      </Button>
    ))}
  </nav>;
}
