import { useState } from 'react';
import type { StylePackDto } from '@/lib/api/stylePacks';
import { Button } from '@/components/ui/button';

interface StylePackSectionProps {
  stylePacks: StylePackDto[];
  currentId: string | undefined;
  canManageTeam: boolean;
  isSaving: boolean;
  onSave: (id: string | undefined) => void;
}

export function StylePackSection({ stylePacks, currentId, canManageTeam, isSaving, onSave }: StylePackSectionProps) {
  // The parent remounts this component (via `key`) whenever `currentId` changes underneath it
  // after a save, so this only ever needs to seed its initial draft — no resync effect needed.
  const [selected, setSelected] = useState<string | undefined>(currentId);

  const dirty = selected !== currentId;
  const currentPack = stylePacks.find((p) => p._id === currentId);

  return (
    <section className="glass-card flex flex-col gap-4 rounded-xl p-6">
      <div>
        <h2 className="text-lg font-semibold">Default style pack</h2>
        <p className="text-sm text-muted-foreground">
          Preselected in the Generate editor — still overridable per session there.
        </p>
      </div>

      {canManageTeam ? (
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={selected ?? ''}
            onChange={(e) => setSelected(e.target.value || undefined)}
            className="h-9 min-w-48 rounded-md border border-input bg-transparent px-2 text-sm text-foreground outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 dark:bg-input/30"
          >
            <option value="" className="bg-background text-foreground">
              None
            </option>
            {stylePacks.map((pack) => (
              <option key={pack._id} value={pack._id} className="bg-background text-foreground">
                {pack.name}
              </option>
            ))}
          </select>
          <Button
            type="button"
            disabled={!dirty || isSaving}
            onClick={() => onSave(selected)}
            variant="outline"
          >
            {isSaving ? 'Saving…' : 'Save style pack'}
          </Button>
        </div>
      ) : (
        <p className="text-sm">
          {currentPack ? currentPack.name : 'None selected'}
          <span className="ml-2 text-xs text-muted-foreground">Ask a team admin to change this.</span>
        </p>
      )}
    </section>
  );
}
