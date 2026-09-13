import { QRCodeSVG } from 'qrcode.react';
import React, { forwardRef, type CSSProperties } from 'react';

export type PartLabelData = {
  publicId: string;
  name: string;
  donorName: string;
  code?: string;
  url: string;
};

export type LabelLayout = {
  paddingMm: number;
  gapMm: number;
  qrMm: number;
  textFontMm: number;
  minimumTextFontMm: number;
  lineHeight: number;
  canPrint: boolean;
  warnings: string[];
  blockingReason?: string;
};

const MIN_DIMENSION_MM = 10;
const MAX_DIMENSION_MM = 150;

export function isValidLabelDimension(value: number) {
  return Number.isFinite(value) && value >= MIN_DIMENSION_MM && value <= MAX_DIMENSION_MM;
}

function estimateLineCount(value: string, availableWidthMm: number, fontMm: number) {
  const charactersPerLine = Math.max(1, Math.floor(availableWidthMm / (fontMm * 0.6)));
  return Math.max(1, Math.ceil(Math.max(1, value.length) / charactersPerLine));
}

/**
 * The same deterministic layout calculation is used by the preview and by the
 * static print document. A real DOM measurement adds the final fit check
 * rather than hiding an unusually long value with an ellipsis.
 */
export function getLabelLayout(
  widthMm: number,
  heightMm: number,
  data: PartLabelData,
): LabelLayout {
  const width = isValidLabelDimension(widthMm) ? widthMm : 60;
  const height = isValidLabelDimension(heightMm) ? heightMm : 40;
  const small = width <= 30 && height <= 20;
  const paddingMm = small ? 1.25 : width <= 40 ? 1.6 : 2;
  const gapMm = small ? 1 : 1.5;
  const borderMm = 0.25;
  const innerWidthMm = width - paddingMm * 2 - borderMm * 2;
  const innerHeightMm = height - paddingMm * 2 - borderMm * 2;
  const qrMm = Math.min(innerHeightMm, innerWidthMm * (small ? 0.38 : 0.41));
  const textWidthMm = Math.max(1, innerWidthMm - qrMm - gapMm);
  const values = [
    data.name,
    `Donoras · ${data.donorName}`,
    `OEM · ${data.code || 'Nenurodytas'}`,
    `QR ID · ${data.publicId}`,
  ];
  const minimumFontMm = small ? 1.05 : 1.25;
  const initialFontMm = small ? 1.55 : width <= 40 ? 1.85 : 2.15;
  let textFontMm = initialFontMm;
  let contentHeightMm = Number.POSITIVE_INFINITY;

  while (textFontMm > minimumFontMm) {
    const lines = values.reduce(
      (total, value) => total + estimateLineCount(value, textWidthMm, textFontMm),
      0,
    );
    contentHeightMm = lines * textFontMm * 1.25 + values.length * textFontMm * 0.24;
    if (contentHeightMm <= innerHeightMm) break;
    textFontMm = Math.round((textFontMm - 0.05) * 100) / 100;
  }
  textFontMm = Math.max(textFontMm, minimumFontMm);

  const warnings: string[] = [];
  if (qrMm < 11) {
    warnings.push('QR laukelis mažas — prieš spausdindami patikrinkite, ar jį patogu nuskaityti.');
  }
  if (small) {
    warnings.push(
      `30 × 20 mm etiketė yra maža; ilgas URL (${data.url.length} simb.) gali būti sunkiau nuskaitomas.`,
    );
  }
  if (data.url.length > 140) {
    warnings.push('Šis QR URL ilgas, todėl mažame QR laukelyje nuskaitymas gali būti jautresnis.');
  }

  let blockingReason: string | undefined;
  if (qrMm < 8) {
    blockingReason = 'Pasirinktas dydis nepalieka minimalaus 8 mm QR laukelio.';
  }

  return {
    paddingMm,
    gapMm,
    qrMm,
    textFontMm,
    minimumTextFontMm: minimumFontMm,
    lineHeight: 1.2,
    canPrint: !blockingReason,
    warnings,
    blockingReason,
  };
}

function fontValue(valueMm: number) {
  return `${valueMm}mm`;
}

export type PartLabelProps = PartLabelData & {
  widthMm: number;
  heightMm: number;
  fontSizeMm?: number;
};

export const PartLabel = forwardRef<HTMLDivElement, PartLabelProps>(function PartLabel({
  widthMm,
  heightMm,
  fontSizeMm,
  publicId,
  name,
  donorName,
  code,
  url,
}, ref) {
  const data = { publicId, name, donorName, code, url };
  const layout = getLabelLayout(widthMm, heightMm, data);
  const labelWidth = isValidLabelDimension(widthMm) ? widthMm : 60;
  const labelHeight = isValidLabelDimension(heightMm) ? heightMm : 40;
  const textFontMm = fontSizeMm ?? layout.textFontMm;
  const rootStyle: CSSProperties = {
    width: `${labelWidth}mm`,
    height: `${labelHeight}mm`,
    aspectRatio: `${labelWidth} / ${labelHeight}`,
    boxSizing: 'border-box',
    display: 'flex',
    alignItems: 'center',
    gap: `${layout.gapMm}mm`,
    padding: `${layout.paddingMm}mm`,
    backgroundColor: '#ffffff',
    color: '#000000',
    border: '0.25mm solid #000000',
    fontFamily: 'Arial, Helvetica, sans-serif',
  };
  const textStyle: CSSProperties = {
    minWidth: 0,
    flex: '1 1 auto',
    overflowWrap: 'anywhere',
    wordBreak: 'break-word',
    fontSize: fontValue(textFontMm),
    lineHeight: layout.lineHeight,
  };
  const lineLabelStyle: CSSProperties = {
    display: 'block',
    overflowWrap: 'anywhere',
    wordBreak: 'break-word',
  };

  return (
    <div ref={ref} className="part-print-label" style={rootStyle} data-label-width={labelWidth} data-label-height={labelHeight}>
      <div
        data-label-qr="true"
        style={{
          flex: `0 0 ${layout.qrMm}mm`,
          width: `${layout.qrMm}mm`,
          height: `${layout.qrMm}mm`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          minWidth: 0,
        }}
      >
        <QRCodeSVG
          value={url}
          level="M"
          marginSize={4}
          fgColor="#000000"
          bgColor="#ffffff"
          width="100%"
          height="100%"
          style={{ display: 'block', width: '100%', height: '100%' }}
          aria-label={`QR kodas: ${name}`}
        />
      </div>
      <div data-label-text="true" style={textStyle}>
        <strong style={{ ...lineLabelStyle, fontSize: fontValue(textFontMm * 1.08) }}>
          {name}
        </strong>
        <span style={lineLabelStyle}>Donoras · {donorName}</span>
        <span style={lineLabelStyle}>OEM · {code || 'Nenurodytas'}</span>
        <span style={lineLabelStyle}>QR ID · {publicId}</span>
      </div>
    </div>
  );
});
PartLabel.displayName = 'PartLabel';
