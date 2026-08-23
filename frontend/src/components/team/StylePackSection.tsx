import { useState } from 'react';
import type { StylePackDto } from '@/lib/api/stylePacks';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface StylePackSectionProps {
  stylePacks: StylePackDto[];
  currentId: string | undefined;
  canManageTeam: boolean;
  isSaving: boolean;
  onSave: (id: string | undefined) => void;
}

/** Radix Select has no empty-string value, so "no pack" needs its own sentinel. */
const NONE_STYLE_PACK = 'none';

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
          <Select
            value={selected ?? NONE_STYLE_PACK}
            onValueChange={(value) => setSelected(value === NONE_STYLE_PACK ? undefined : value)}
          >
            <SelectTrigger className="min-w-48" aria-label="Default style pack">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE_STYLE_PACK}>None</SelectItem>
              {stylePacks.map((pack) => (
                <SelectItem key={pack._id} value={pack._id}>
                  {pack.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
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
