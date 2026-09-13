import { QRCodeSVG } from 'qrcode.react';
import { QrCode } from 'lucide-react';
import { Link } from 'wouter';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';

type PartQrDialogProps = {
  publicId: string;
  name: string;
  code?: string;
  url: string;
};

export function PartQrDialog({ publicId, name, code, url }: PartQrDialogProps) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <button
          type="button"
          className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-border bg-background text-muted-foreground transition-colors hover:border-foreground/30 hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
          aria-label={`Rodyti ${name} QR kodą`}
          data-testid={`button-part-qr-${publicId}`}
        >
          <QrCode size={17} aria-hidden="true" />
        </button>
      </DialogTrigger>
      <DialogContent className="w-[calc(100%-2rem)] max-w-sm rounded-xl p-5 sm:p-6">
        <DialogHeader className="pr-6">
          <DialogTitle>Detalės QR kodas</DialogTitle>
          <DialogDescription>
            Nuskaitykite kodą, kad atidarytumėte detalės puslapį.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col items-center gap-4">
          <div className="flex w-full justify-center rounded-lg border border-border bg-white p-3">
            <QRCodeSVG
              value={url}
              size={240}
              level="M"
              marginSize={4}
              fgColor="#000000"
              bgColor="#ffffff"
              className="h-auto w-full max-w-[240px]"
            />
          </div>
          <div className="w-full rounded-lg border border-border bg-muted/35 px-4 py-3">
            <p className="text-sm font-semibold">{name}</p>
            <p className="mt-1 font-mono-ui text-xs text-muted-foreground">
              OEM kodas · {code || 'Nenurodytas'}
            </p>
            <p className="mt-1 break-all font-mono-ui text-[10px] uppercase tracking-wide text-muted-foreground">
              QR ID · {publicId}
            </p>
          </div>
          <Link
            href={`/detale/${publicId}`}
            className="inline-flex min-h-9 items-center justify-center rounded-lg border border-border px-3 py-2 text-xs font-bold text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
          >
            Atidaryti detalės puslapį
          </Link>
        </div>
      </DialogContent>
    </Dialog>
  );
}