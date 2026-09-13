import { Link } from 'wouter';
import { AlertCircle } from 'lucide-react';

export default function NotFound() {
  return (
    <div className="noise flex min-h-screen w-full items-center justify-center bg-background p-6 text-foreground">
      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-8 text-center shadow-xl">
        <AlertCircle className="mx-auto h-10 w-10 text-primary" />
        <p className="mt-5 font-mono-ui text-[10px] uppercase tracking-[0.2em] text-secondary">404 / Nerasta</p>
        <h1 className="mt-2 text-2xl font-bold">Šis puslapis neegzistuoja</h1>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">Patikrink nuorodą arba grįžk į pagrindinį RM Automotive langą.</p>
        <Link href="/" className="mt-6 inline-flex rounded-lg bg-primary px-4 py-2.5 text-sm font-bold text-primary-foreground">Grįžti į pagrindinį</Link>
      </div>
    </div>
  );
}
