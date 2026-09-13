import { useEffect, useState, type FormEvent } from 'react';
import { updatePart } from '@workspace/api-client-react';
import type { Part as ApiPart } from '@workspace/api-client-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

type PartEditDialogProps = {
  part: ApiPart;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: (part: ApiPart) => void;
};

const inputClass = 'h-10 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/20';

export function PartEditDialog({ part, open, onOpenChange, onSaved }: PartEditDialogProps) {
  const [name, setName] = useState(part.name);
  const [code, setCode] = useState(part.code);
  const [price, setPrice] = useState(String(part.price));
  const [location, setLocation] = useState(part.location ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string>();

  useEffect(() => {
    if (!open) return;
    setName(part.name);
    setCode(part.code);
    setPrice(String(part.price));
    setLocation(part.location ?? '');
    setError(undefined);
  }, [open, part.id]);

  function handleOpenChange(nextOpen: boolean) {
    if (saving) return;
    if (!nextOpen) setError(undefined);
    onOpenChange(nextOpen);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    setSaving(true);
    setError(undefined);
    try {
      const updated = await updatePart(part.id, {
        name: name.trim(),
        code: code.trim(),
        price: Number(price),
        location: location.trim() || null,
      });
      onSaved(updated);
      onOpenChange(false);
    } catch {
      setError('Detalės išsaugoti nepavyko. Pabandyk dar kartą.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent data-testid="dialog-edit-public-part">
        <DialogHeader>
          <DialogTitle>Redaguoti detalę</DialogTitle>
          <DialogDescription>
            Atnaujink detalės duomenis. Donoras ir viešas QR identifikatorius yra nekintami.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="grid gap-4">
          <label>
            <span className="mb-1.5 block text-xs font-semibold text-muted-foreground">Donoras</span>
            <input value={part.donorLabel} readOnly className={`${inputClass} bg-muted/45 text-muted-foreground`} data-testid="input-public-part-donor" />
          </label>
          <label>
            <span className="mb-1.5 block text-xs font-semibold text-muted-foreground">Viešas QR ID</span>
            <input value={part.publicId} readOnly className={`${inputClass} bg-muted/45 font-mono-ui text-xs text-muted-foreground`} data-testid="input-public-part-public-id" />
          </label>
          <label>
            <span className="mb-1.5 block text-xs font-semibold text-muted-foreground">Detalės pavadinimas</span>
            <input required value={name} onChange={(event) => setName(event.target.value)} className={inputClass} data-testid="input-public-part-name" />
          </label>
          <div className="grid gap-4 sm:grid-cols-2">
            <label>
              <span className="mb-1.5 block text-xs font-semibold text-muted-foreground">OEM kodas</span>
              <input value={code} onChange={(event) => setCode(event.target.value.toUpperCase())} className={inputClass} data-testid="input-public-part-code" />
            </label>
            <label>
              <span className="mb-1.5 block text-xs font-semibold text-muted-foreground">Kaina, GBP</span>
              <input required type="number" min="0" step="0.01" value={price} onChange={(event) => setPrice(event.target.value)} className={inputClass} data-testid="input-public-part-price" />
            </label>
          </div>
          <label>
            <span className="mb-1.5 block text-xs font-semibold text-muted-foreground">Laikymo vieta</span>
            <input value={location} onChange={(event) => setLocation(event.target.value)} className={inputClass} placeholder="pvz. Lentyna B3 / dėžė 12" data-testid="input-public-part-location" />
          </label>
          {error && (
            <p className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive" role="alert">
              {error}
            </p>
          )}
          <DialogFooter>
            <button type="button" onClick={() => onOpenChange(false)} disabled={saving} className="rounded-lg px-4 py-2.5 text-sm font-semibold text-muted-foreground hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60" data-testid="button-cancel-public-part-edit">Atšaukti</button>
            <button type="submit" disabled={saving} className="rounded-lg bg-primary px-4 py-2.5 text-sm font-bold text-primary-foreground disabled:cursor-not-allowed disabled:opacity-60" data-testid="button-save-public-part">
              {saving ? 'Saugoma...' : 'Išsaugoti pakeitimus'}
            </button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}