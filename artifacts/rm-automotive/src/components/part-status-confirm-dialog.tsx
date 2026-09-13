import { useState } from 'react';
import { Check, Package } from 'lucide-react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

export type PartStatus = 'inventory' | 'sold';

type PartStatusDetails = {
  name: string;
  status: PartStatus;
};

type PartStatusConfirmDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  partName: string;
  targetStatus: PartStatus;
  onConfirm: () => Promise<boolean | void> | boolean | void;
};

export function PartStatusConfirmDialog({
  open,
  onOpenChange,
  partName,
  targetStatus,
  onConfirm,
}: PartStatusConfirmDialogProps) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string>();
  const targetLabel = targetStatus === 'sold' ? 'parduota' : 'sandėlyje';
  const title = targetStatus === 'sold' ? 'Pažymėti detalę kaip parduotą?' : 'Grąžinti detalę į sandėlį?';
  const description = targetStatus === 'sold'
    ? `Detalė „${partName}“ bus pažymėta kaip parduota.`
    : `Detalė „${partName}“ vėl bus rodoma kaip esanti sandėlyje.`;

  async function confirm() {
    if (saving) return;
    setSaving(true);
    setError(undefined);
    try {
      const result = await onConfirm();
      if (result !== false) onOpenChange(false);
      else setError('Būsenos pakeisti nepavyko. Pabandyk dar kartą.');
    } catch {
      setError('Būsenos pakeisti nepavyko. Pabandyk dar kartą.');
    } finally {
      setSaving(false);
    }
  }

  function handleOpenChange(nextOpen: boolean) {
    if (saving) return;
    if (!nextOpen) setError(undefined);
    onOpenChange(nextOpen);
  }

  return (
    <AlertDialog open={open} onOpenChange={handleOpenChange}>
      <AlertDialogContent data-testid="dialog-confirm-part-status">
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        {error && (
          <p className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive" role="alert">
            {error}
          </p>
        )}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={saving} data-testid="button-cancel-part-status">Atšaukti</AlertDialogCancel>
          <AlertDialogAction
            disabled={saving}
            onClick={(event) => {
              event.preventDefault();
              void confirm();
            }}
            data-testid={`button-confirm-part-status-${targetStatus}`}
          >
            {saving ? 'Saugoma...' : `Patvirtinti: ${targetLabel}`}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

type PartStatusToggleProps = {
  part: PartStatusDetails;
  onConfirm: () => Promise<boolean | void> | boolean | void;
  testId?: string;
};

export function PartStatusToggle({ part, onConfirm, testId }: PartStatusToggleProps) {
  const [open, setOpen] = useState(false);
  const targetStatus: PartStatus = part.status === 'sold' ? 'inventory' : 'sold';

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-wide transition-colors ${part.status === 'sold' ? 'bg-secondary/15 text-secondary' : 'bg-primary/15 text-primary'}`}
        data-testid={testId}
      >
        {part.status === 'sold' ? <Check size={12} /> : <Package size={12} />}
        {part.status === 'sold' ? 'Parduota' : 'Sandėlyje'}
      </button>
      <PartStatusConfirmDialog
        open={open}
        onOpenChange={setOpen}
        partName={part.name}
        targetStatus={targetStatus}
        onConfirm={onConfirm}
      />
    </>
  );
}

type PartStatusControlsProps = {
  part: PartStatusDetails;
  onConfirm: (status: PartStatus) => Promise<boolean | void> | boolean | void;
  testIdPrefix?: string;
};

export function PartStatusControls({ part, onConfirm, testIdPrefix = 'public-part-status' }: PartStatusControlsProps) {
  const [targetStatus, setTargetStatus] = useState<PartStatus>();

  return (
    <>
      <div className="flex flex-wrap gap-2" role="group" aria-label="Keisti detalės būseną">
        <button
          type="button"
          onClick={() => setTargetStatus('inventory')}
          className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-bold transition-colors ${part.status === 'inventory' ? 'border-primary/40 bg-primary/10 text-primary' : 'border-border bg-card text-muted-foreground hover-elevate'}`}
          aria-pressed={part.status === 'inventory'}
          data-testid={`${testIdPrefix}-inventory`}
        >
          <Package size={14} /> Sandėlyje
        </button>
        <button
          type="button"
          onClick={() => setTargetStatus('sold')}
          className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-bold transition-colors ${part.status === 'sold' ? 'border-secondary/40 bg-secondary/10 text-secondary' : 'border-border bg-card text-muted-foreground hover-elevate'}`}
          aria-pressed={part.status === 'sold'}
          data-testid={`${testIdPrefix}-sold`}
        >
          <Check size={14} /> Parduota
        </button>
      </div>
      {targetStatus && (
        <PartStatusConfirmDialog
          open
          onOpenChange={(open) => {
            if (!open) setTargetStatus(undefined);
          }}
          partName={part.name}
          targetStatus={targetStatus}
          onConfirm={() => onConfirm(targetStatus)}
        />
      )}
    </>
  );
}