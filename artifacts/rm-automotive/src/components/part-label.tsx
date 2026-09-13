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
  // Keep the paper edge ink-free. Padding is deliberately small so that the
  // fitting pass can use the whole selected label instead of leaving a fixed
  // 2 mm band around every size.
  const paddingMm = small ? 1 : width <= 40 ? 1.25 : 1.5;
  const gapMm = small ? 0.8 : 1;
  const innerWidthMm = Math.max(0, width - paddingMm * 2);
  const innerHeightMm = Math.max(0, height - paddingMm * 2);
  // A label is intentionally never rotated. A strict width > height check
  // makes square labels deterministic as well: they use the vertical stack.
  const orientation: LabelOrientation = width > height ? 'horizontal' : 'vertical';
  const qrMm = orientation === 'horizontal'
    ? Math.min(innerHeightMm, Math.max(0, innerWidthMm - gapMm - 10))
    : Math.min(innerWidthMm, Math.max(0, innerHeightMm - gapMm - 5));
  const textWidthMm = orientation === 'horizontal'
    ? Math.max(0, innerWidthMm - qrMm - gapMm)
    : innerWidthMm;
  const textHeightMm = orientation === 'horizontal'
    ? innerHeightMm
    : Math.max(0, innerHeightMm - qrMm - gapMm);
  const minimumFontMm = small ? 1.05 : 1.15;
  // This is only the first paint fallback. LabelPrintSetup replaces it with a
  // measured maximum, so it must not act as a typography cap for large paper.
  const initialFontMm = Math.max(
    minimumFontMm,
    Math.min(
      height / 8.8,
      textWidthMm / 8,
    ),
  );
  const lineHeight = 1.2;

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
  }

  return {
    orientation,
    paddingMm,
    gapMm,
    qrMm,
    textWidthMm,
    textHeightMm,
    textFontMm: initialFontMm,
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
  layoutOverride?: LabelLayout;
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
  layoutOverride,
}, ref) {
  const data = { publicId, name, donorName, code, url };
  const layout = layoutOverride ?? getLabelLayout(widthMm, heightMm, data);
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
    border: '0',
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
      data-label-qr-mm={layout.qrMm}
      data-label-font-mm={textFontMm}
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
