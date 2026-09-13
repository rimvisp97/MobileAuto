import { renderToStaticMarkup } from 'react-dom/server';
import React from 'react';
import { PartLabel, type LabelLayout, type PartLabelData } from '@/components/part-label';

export type LabelPrintWindowOptions = PartLabelData & {
  widthMm: number;
  heightMm: number;
  quantity: number;
  layout?: LabelLayout;
  /** Kept for callers from before the measured geometry was introduced. */
  fontSizeMm?: number;
};

const PRINT_WINDOW_STYLES = `
  @page { size: LABEL_WIDTHmm LABEL_HEIGHTmm; margin: 0; }
  :root { color-scheme: light; }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; background: #fff; color: #000; }
  body { font-family: Arial, Helvetica, sans-serif; }
  .print-actions {
    position: relative; z-index: 10; display: flex; width: fit-content;
    gap: 8px; margin: 0 auto 10px; padding: 8px; border: 1px solid #bbb; border-radius: 8px;
    background: #fff; box-shadow: 0 2px 12px rgb(0 0 0 / 18%);
  }
  .print-actions button {
    min-height: 36px; padding: 7px 12px; border: 1px solid #222;
    border-radius: 6px; background: #fff; color: #000; cursor: pointer;
    font: 600 14px Arial, Helvetica, sans-serif;
  }
  .print-help {
    position: relative; z-index: 10; max-width: 520px; margin: 0 auto 18px;
    padding: 10px 12px; border: 1px solid #bbb; border-radius: 8px;
    background: #fff; color: #222; font: 13px/1.4 Arial, Helvetica, sans-serif;
  }
  .part-print-label {
    break-after: page; page-break-after: always; break-inside: avoid;
  }
  .part-print-label:last-child {
    break-after: auto; page-break-after: auto;
  }
  @media screen {
    body { min-height: 100vh; padding: 24px; }
    .part-print-label { margin: 0 auto 18px; }
  }
  @media print {
    .print-actions, .print-help { display: none !important; }
    body { width: LABEL_WIDTHmm; }
    .part-print-label { margin: 0; }
  }
`;

const PRINT_WINDOW_HELP =
  'Naršyklės lange pasirinkite tikrą spausdintuvą ir jo tvarkyklėje tikslų etiketės dydį. Naudokite 100 % mastelį, be paraščių ir antraščių. Sistemos kopijų skaičius turi būti 1 — kiekį jau pakartojome šiame dokumente.';

function replacePrintTokens(styles: string, widthMm: number, heightMm: number) {
  return styles.replaceAll('LABEL_WIDTH', String(widthMm)).replaceAll('LABEL_HEIGHT', String(heightMm));
}

async function waitForPrintDocument(popup: Window) {
  const timeout = (milliseconds: number) => new Promise<void>((resolve) => {
    window.setTimeout(resolve, milliseconds);
  });
  const documentReady = popup.document.readyState === 'complete'
    ? Promise.resolve()
    : new Promise<void>((resolve) => {
      popup.addEventListener('load', () => resolve(), { once: true });
    });
  await Promise.race([documentReady, timeout(750)]);
  if (popup.document.fonts?.ready) {
    await Promise.race([popup.document.fonts.ready, timeout(500)]);
  }
  const images = Array.from(popup.document.images);
  await Promise.race([
    Promise.all(images.map((image) => image.complete
      ? Promise.resolve()
      : new Promise<void>((resolve) => {
        image.addEventListener('load', () => resolve(), { once: true });
        image.addEventListener('error', () => resolve(), { once: true });
      }))),
    timeout(750),
  ]);
  await Promise.race([
    new Promise<void>((resolve) => popup.requestAnimationFrame(() => resolve())),
    timeout(250),
  ]);
}

export async function openLabelPrintWindow(options: LabelPrintWindowOptions) {
  const popup = window.open('', '_blank', 'popup=yes,width=720,height=760');
  if (!popup || popup.closed) {
    throw new Error('Spausdinimo lango atidaryti nepavyko. Leiskite iššokančius langus ir bandykite dar kartą.');
  }

  try {
    const labels = Array.from({ length: options.quantity }, () => renderToStaticMarkup(
      <PartLabel
        publicId={options.publicId}
        name={options.name}
        donorName={options.donorName}
        code={options.code}
        url={options.url}
        widthMm={options.widthMm}
        heightMm={options.heightMm}
        fontSizeMm={options.fontSizeMm}
        layoutOverride={options.layout}
      />,
    )).join('');
    const styles = replacePrintTokens(PRINT_WINDOW_STYLES, options.widthMm, options.heightMm);
    const help = renderToStaticMarkup(
      <p className="print-help">{PRINT_WINDOW_HELP}</p>,
    );
    const actions = renderToStaticMarkup(
      <div className="print-actions" role="toolbar" aria-label="Spausdinimo veiksmai">
        <button type="button" data-print-action="print">Spausdinti etiketes</button>
        <button type="button" data-print-action="close">Uždaryti</button>
      </div>,
    );

    popup.document.open();
    popup.document.write(`<!doctype html><html lang="lt"><head><meta charset="utf-8"><title>Etikečių spausdinimas</title><style>${styles}</style></head><body>${actions}${help}${labels}</body></html>`);
    popup.document.close();
    popup.addEventListener('afterprint', () => popup.close(), { once: true });
    popup.document.querySelector('[data-print-action="print"]')?.addEventListener('click', () => popup.print());
    popup.document.querySelector('[data-print-action="close"]')?.addEventListener('click', () => popup.close());
    await waitForPrintDocument(popup);
    popup.focus();
    popup.print();
  } catch (error) {
    popup.close();
    throw error instanceof Error ? error : new Error('Etikečių spausdinimo lango paruošti nepavyko.');
  }
  return popup;
}
