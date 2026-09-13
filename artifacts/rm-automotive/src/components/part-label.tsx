import { QRCodeSVG } from 'qrcode.react';
import React, { forwardRef, type CSSProperties } from 'react';

export type PartLabelData = {
  publicId: string;
  name: string;
  donorName: string;
  code?: string;
  url: string;
};

export type LabelOrientation = 'horizontal' | 'vertical';

export type LabelLayout = {
  orientation: LabelOrientation;
  paddingMm: number;
  gapMm: number;
  qrMm: number;
  textWidthMm: number;
  textHeightMm: number;
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

function labelValues(data: PartLabelData) {
  return [
    data.name,
    `Donoras · ${data.donorName}`,
    `OEM · ${data.code || 'Nenurodytas'}`,
    `QR ID · ${data.publicId}`,
  ];
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
  const innerWidthMm = Math.max(0, width - paddingMm * 2 - borderMm * 2);
  const innerHeightMm = Math.max(0, height - paddingMm * 2 - borderMm * 2);
  // A label is intentionally never rotated. A strict width > height check
  // makes square labels deterministic as well: they use the vertical stack.
  const orientation: LabelOrientation = width > height ? 'horizontal' : 'vertical';
  const qrMm = orientation === 'horizontal'
    ? Math.min(innerHeightMm, innerWidthMm * (small ? 0.38 : 0.41))
    : Math.min(innerWidthMm * 0.52, Math.max(0, (innerHeightMm - gapMm) * 0.6));
  const textWidthMm = orientation === 'horizontal'
    ? Math.max(0, innerWidthMm - qrMm - gapMm)
    : innerWidthMm;
  const textHeightMm = orientation === 'horizontal'
    ? innerHeightMm
    : Math.max(0, innerHeightMm - qrMm - gapMm);
  const values = labelValues(data);
  const minimumFontMm = small ? 1.05 : 1.25;
  const initialFontMm = small ? 1.55 : width <= 40 ? 1.85 : 2.15;
  const lineHeight = 1.2;

  function contentHeightAt(fontMm: number) {
    return values.reduce((total, value, index) => {
      const valueFontMm = index === 0 ? fontMm * 1.08 : fontMm;
      return total + estimateLineCount(value, textWidthMm, valueFontMm) * valueFontMm * lineHeight;
    }, 0);
  }

  let textFontMm = initialFontMm;
  let contentHeightMm = contentHeightAt(textFontMm);

  while (contentHeightMm > textHeightMm && textFontMm > minimumFontMm) {
    textFontMm = Math.round((textFontMm - 0.05) * 100) / 100;
    contentHeightMm = contentHeightAt(textFontMm);
  }
  textFontMm = Math.max(textFontMm, minimumFontMm);
  // Only four single-line fields are considered for this early structural
  // guard. Longer values are deliberately left to the measured DOM fitting
  // pipeline, which can decide whether the actual glyphs fit at minimum size.
  const absoluteMinimumContentHeightMm = minimumFontMm * lineHeight * (1.08 + 3);

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
  if (innerWidthMm <= 0 || innerHeightMm <= 0) {
    blockingReason = 'Pasirinktas dydis nepalieka vietos etiketės turiniui.';
  } else if (qrMm < 8) {
    blockingReason = 'Pasirinktas dydis nepalieka minimalaus 8 mm QR laukelio.';
  } else if (textWidthMm < 3 || textHeightMm < 1) {
    blockingReason = 'Pasirinktas dydis nepalieka minimalaus teksto laukelio.';
  } else if (absoluteMinimumContentHeightMm > textHeightMm + 0.1) {
    blockingReason = 'Keturi etiketės laukai netelpa pasirinktame dydyje.';
  }

  return {
    orientation,
    paddingMm,
    gapMm,
    qrMm,
    textWidthMm,
    textHeightMm,
    textFontMm,
    minimumTextFontMm: minimumFontMm,
    lineHeight,
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
    flexDirection: layout.orientation === 'horizontal' ? 'row' : 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: `${layout.gapMm}mm`,
    padding: `${layout.paddingMm}mm`,
    backgroundColor: '#ffffff',
    color: '#000000',
    border: '0.25mm solid #000000',
    fontFamily: 'Arial, Helvetica, sans-serif',
    flexShrink: 0,
  };
  const textStyle: CSSProperties = {
    boxSizing: 'border-box',
    width: `${layout.textWidthMm}mm`,
    height: layout.orientation === 'vertical' ? `${layout.textHeightMm}mm` : 'auto',
    minWidth: 0,
    minHeight: 0,
    flex: layout.orientation === 'horizontal'
      ? `0 0 ${layout.textWidthMm}mm`
      : `0 0 ${layout.textHeightMm}mm`,
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
    <div
      ref={ref}
      className="part-print-label"
      style={rootStyle}
      data-label-width={labelWidth}
      data-label-height={labelHeight}
      data-label-orientation={layout.orientation}
    >
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
          minHeight: 0,
          boxSizing: 'border-box',
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
          style={{ display: 'block', width: '100%', height: '100%', aspectRatio: '1 / 1' }}
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
