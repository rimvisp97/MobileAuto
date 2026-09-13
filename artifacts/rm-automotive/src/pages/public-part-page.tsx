import { useEffect, useRef, useState } from 'react';
import { getPublicPart, updatePart } from '@workspace/api-client-react';
import type { Part as ApiPart } from '@workspace/api-client-react';
import { Link, useParams } from 'wouter';
import { PartEditDialog } from '@/components/part-edit-dialog';
import { LabelPrintSetup } from '@/components/label-printing';
import { PartStatusControls, type PartStatus } from '@/components/part-status-confirm-dialog';
import { ClipboardList, Pencil, Printer } from 'lucide-react';

function money(value: number) {
  return new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP', maximumFractionDigits: 2 }).format(value);
}

function shortDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? 'Nenurodyta'
    : new Intl.DateTimeFormat('lt-LT', { day: '2-digit', month: 'short', year: 'numeric' }).format(date);
}

function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-xl border border-dashed border-border bg-card/55 px-6 py-16 text-center">
      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-muted text-muted-foreground"><ClipboardList size={22} /></div>
      <h2 className="mt-4 text-lg font-bold">{title}</h2>
      <p className="mx-auto mt-2 max-w-sm text-sm text-muted-foreground">{body}</p>
    </div>
  );
}

export function PublicPartPage() {
  const { publicId } = useParams<{ publicId: string }>();
  const [part, setPart] = useState<ApiPart>();
  const [state, setState] = useState<'loading' | 'ready' | 'not-found' | 'error'>('loading');
  const [editOpen, setEditOpen] = useState(false);
  const [printOpen, setPrintOpen] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [actionError, setActionError] = useState<string>();
  const latestRequest = useRef(0);

  useEffect(() => {
    let disposed = false;

    async function loadPart() {
      const requestId = ++latestRequest.current;
      setState((current) => current === 'ready' ? current : 'loading');
      try {
        const current = await getPublicPart(publicId);
        if (disposed || requestId !== latestRequest.current) return;
        setPart(current);
        setState('ready');
      } catch (error) {
        if (disposed || requestId !== latestRequest.current) return;
        const status = typeof error === 'object' && error && 'status' in error ? Number(error.status) : 0;
        setState(status === 404 ? 'not-found' : 'error');
      }
    }

    function handleFocus() {
      void loadPart();
    }

    void loadPart();
    window.addEventListener('focus', handleFocus);
    return () => {
      disposed = true;
      window.removeEventListener('focus', handleFocus);
    };
  }, [publicId, reloadKey]);

  async function changeStatus(status: PartStatus) {
    if (!part) return false;
    setActionError(undefined);
    try {
      const updated = await updatePart(part.id, { status, expectedVersion: part.version });
      latestRequest.current += 1;
      setPart(updated);
      setState('ready');
      setReloadKey((key) => key + 1);
      return true;
    } catch (error) {
      const status = typeof error === 'object' && error && 'status' in error
        ? Number(error.status)
        : 0;
      setActionError(status === 409
        ? 'Detalę jau pakeitė kitas įrenginys. Perkrauk puslapį ir bandyk dar kartą.'
        : error instanceof Error && error.message
          ? error.message
          : 'Būsenos pakeisti nepavyko. Pabandyk dar kartą.');
      return false;
    }
  }

  function handleSaved(updated: ApiPart) {
    setActionError(undefined);
    latestRequest.current += 1;
    setPart(updated);
    setState('ready');
    setReloadKey((key) => key + 1);
  }

  return (
    <main className="noise min-h-[100dvh] bg-background px-5 py-10 text-foreground">
      <div className="mx-auto max-w-2xl">
        <Link href="/" className="mb-8 inline-flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary font-mono-ui text-sm font-bold text-primary-foreground">RM</span>
          <span><span className="block text-sm font-bold">RM Automotive</span><span className="font-mono-ui text-[9px] uppercase tracking-[0.18em] text-muted-foreground">Detalės kortelė</span></span>
        </Link>
        {state === 'loading' && <div className="rounded-2xl border border-border bg-card p-10 text-center text-sm text-muted-foreground shadow-sm"><span className="mx-auto mb-4 block h-3 w-3 animate-pulse rounded-full bg-primary" />Kraunami naujausi detalės duomenys...</div>}
        {state === 'not-found' && <EmptyState title="Detalė nerasta" body="Šis QR identifikatorius negalioja arba detalė buvo pašalinta." />}
        {state === 'error' && (
          <div className="rounded-xl border border-destructive/30 bg-destructive/10 px-6 py-10 text-center">
            <h2 className="text-lg font-bold">Duomenų įkelti nepavyko</h2>
            <p className="mx-auto mt-2 max-w-sm text-sm text-muted-foreground">Patikrink interneto ryšį ir pabandyk dar kartą.</p>
            <button type="button" onClick={() => setReloadKey((key) => key + 1)} className="mt-5 rounded-lg bg-primary px-4 py-2.5 text-sm font-bold text-primary-foreground" data-testid="button-retry-public-part">Bandyti dar kartą</button>
          </div>
        )}
        {state === 'ready' && part && (
          <>
            <article className="overflow-hidden rounded-2xl border border-border bg-card shadow-xl">
              <div className="border-b border-border p-6">
                <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <div className={`mb-3 inline-flex items-center gap-2 rounded-full px-3 py-1 text-[10px] font-bold uppercase tracking-wide ${part.status === 'sold' ? 'bg-secondary/15 text-secondary' : 'bg-primary/15 text-primary'}`}><span className="h-1.5 w-1.5 rounded-full bg-current" />{part.status === 'sold' ? 'Parduota' : 'Sandėlyje'}</div>
                    <h1 className="text-2xl font-bold sm:text-3xl">{part.name}</h1>
                    <p className="mt-2 text-sm text-muted-foreground">{part.donorLabel}</p>
                  </div>
                  <div className="flex shrink-0 flex-wrap gap-2 sm:flex-col">
                    <button type="button" onClick={() => setEditOpen(true)} className="inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-3 py-2 text-xs font-bold text-primary-foreground" data-testid="button-edit-public-part"><Pencil size={14} /> Redaguoti</button>
                    <button type="button" onClick={() => setPrintOpen(true)} className="inline-flex items-center justify-center gap-2 rounded-lg border border-border px-3 py-2 text-xs font-bold transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary" data-testid="button-print-public-part"><Printer size={14} /> Spausdinti lipduką</button>
                  </div>
                </div>
              </div>
              <dl className="grid sm:grid-cols-2">
                <div className="border-b border-border p-5 sm:border-r"><dt className="font-mono-ui text-[10px] uppercase tracking-[0.14em] text-muted-foreground">OEM kodas</dt><dd className="mt-2 font-mono-ui text-sm font-bold">{part.code || 'Nenurodytas'}</dd></div>
                <div className="border-b border-border p-5"><dt className="font-mono-ui text-[10px] uppercase tracking-[0.14em] text-muted-foreground">Kaina</dt><dd className="mt-2 font-mono-ui text-lg font-bold">{money(part.price)}</dd></div>
                <div className="border-b border-border p-5 sm:border-b-0 sm:border-r"><dt className="font-mono-ui text-[10px] uppercase tracking-[0.14em] text-muted-foreground">Laikymo vieta</dt><dd className="mt-2 text-sm font-semibold">{part.location || 'Nenurodyta'}</dd></div>
                <div className="p-5"><dt className="font-mono-ui text-[10px] uppercase tracking-[0.14em] text-muted-foreground">Atnaujinta</dt><dd className="mt-2 text-sm font-semibold">{shortDate(part.updatedAt)}</dd></div>
              </dl>
              <div className="border-t border-border bg-muted/35 px-5 py-4">
                <p className="mb-3 text-xs font-semibold text-muted-foreground">Būsena</p>
                <PartStatusControls part={part} onConfirm={changeStatus} />
                {actionError && <p className="mt-3 text-sm text-destructive" role="alert">{actionError}</p>}
              </div>
              <div className="border-t border-border px-5 py-4"><p className="break-all font-mono-ui text-[9px] uppercase tracking-wide text-muted-foreground">QR ID · {part.publicId}</p></div>
            </article>
            <PartEditDialog part={part} open={editOpen} onOpenChange={setEditOpen} onSaved={handleSaved} />
            {printOpen && <LabelPrintSetup open={printOpen} onOpenChange={setPrintOpen} data={{
              publicId: part.publicId,
              name: part.name,
              donorName: part.donorLabel,
              code: part.code,
              url: `${window.location.origin}${import.meta.env.BASE_URL.replace(/\/$/, '')}/detale/${part.publicId}`,
            }} />}
          </>
        )}
      </div>
    </main>
  );
}