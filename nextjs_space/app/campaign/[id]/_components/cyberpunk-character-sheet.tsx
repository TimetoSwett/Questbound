'use client';

import { useEffect, useState } from 'react';

// Placeholder for Cyberpunk 2020 campaigns until the real sheet exists.
export function CyberpunkCharacterSheet({ characterId }: { characterId: string }) {
  const [name, setName] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    fetch(`/api/characters/single?id=${characterId}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => { if (active && typeof data?.name === 'string') setName(data.name); })
      .catch(() => { /* name is optional */ });
    return () => { active = false; };
  }, [characterId]);

  return (
    <div className="rounded-lg border p-6">
      {name && <h2 className="text-xl font-semibold mb-1">{name}</h2>}
      <p className="text-muted-foreground">Cyberpunk 2020 sheet — coming soon</p>
    </div>
  );
}
