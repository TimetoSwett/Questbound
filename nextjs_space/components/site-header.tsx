'use client';

import { LogOut, Shield } from 'lucide-react';
import { signOut } from 'next-auth/react';
import { BrightnessControl } from '@/components/brightness-control';
import { Button } from '@/components/ui/button';
import { HallNav } from '@/components/library/hall-nav';

export function SiteHeader({ userName, current }: { userName: string; current?: string }) {
  return (
    <header className="sticky top-0 z-50 bg-card/80 backdrop-blur-md border-b border-border">
      <div className="max-w-5xl mx-auto flex items-center justify-between px-4 py-3">
        <div className="flex items-center gap-2 cursor-pointer" onClick={() => { window.location.href = '/dashboard'; }}>
          <Shield className="w-7 h-7 text-primary" />
          <span className="font-display text-xl font-bold text-primary tracking-tight">Questbound</span>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <BrightnessControl />
          <HallNav current={current} />
          <span className="text-sm text-muted-foreground hidden sm:block">Welcome, <span className="text-foreground font-medium">{userName}</span></span>
          <Button variant="ghost" size="sm" onClick={async () => { await signOut({ redirect: false }); window.location.href = '/login'; }}>
            <LogOut className="w-4 h-4 mr-1" /> Sign Out
          </Button>
        </div>
      </div>
    </header>
  );
}
