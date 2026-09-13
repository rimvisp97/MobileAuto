import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, Info, Pencil, Plus, Printer, RotateCcw, Trash2, X } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  PartLabel,
  getLabelLayout,
  isValidLabelDimension,
  type LabelLayout,
  type PartLabelData,
} from '@/components/part-label';
import {
  createLocalId,
  DEFAULT_PRINTER_PROFILE,
  loadCustomLabelSizes,
  loadSelectedLabelSize,
  loadPrinterProfiles,
  PRESET_LABEL_SIZES,
  saveCustomLabelSizes,
  saveSelectedLabelSize,
  savePrinterProfiles,
  type CustomLabelSize,
  type PrinterProfile,
} from '@/components/label-printing-storage';
import { openLabelPrintWindow } from '@/components/label-printing-window';

type LabelPrintSetupProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  data: PartLabelData;
};

type ProfileDraft = { id?: string; name: string };
type SizeDraft = { id?: string; name: string; widthMm: string; heightMm: string };
type LabelGeometry = { status: 'pending' | 'checked'; fits: boolean; reason?: string };
type FitCandidate = { layout: LabelLayout; fontMm: number };
type FitResult = { candidate: FitCandidate; score: number };
type FittingState = {
  key: string;
  candidateIndex: number;
  lowMm: number;
  highMm: number;
  probeMm: number;
  results: FitResult[];
};

const defaultSizeId = 'preset-60x40';

function fieldClass(hasError = false) {
  return `mt-1 block min-h-9 w-full rounded-lg border bg-background px-3 py-2 text-sm outline-none transition-colors focus-visible:ring-2 focus-visible:ring-primary ${hasError ? 'border-destructive' : 'border-input'}`;
}

function layoutWithGeometry(base: LabelLayout, qrMm: number, fontMm: number): LabelLayout {
  const textWidthMm = base.orientation === 'horizontal'
    ? Math.max(0, base.textWidthMm + base.qrMm - qrMm)
    : base.textWidthMm;
  const textHeightMm = base.orientation === 'vertical'
    ? Math.max(0, base.textHeightMm + base.qrMm - qrMm)
    : base.textHeightMm;
  return {
    ...base,
    qrMm,
    textWidthMm,
    textHeightMm,
    textFontMm: fontMm,
    canPrint: true,
    blockingReason: undefined,
  };
}

function getFitCandidates(base: LabelLayout, widthMm: number, heightMm: number): FitCandidate[] {
  const innerWidthMm = Math.max(0, widthMm - base.paddingMm * 2);
  const innerHeightMm = Math.max(0, heightMm - base.paddingMm * 2);
  const minimumTextHeightMm = base.minimumTextFontMm * base.lineHeight * 4.2;
  const minimumTextWidthMm = Math.max(7, base.minimumTextFontMm * 4);
  const maximumQrMm = base.orientation === 'horizontal'
    ? Math.min(innerHeightMm, innerWidthMm - base.gapMm - minimumTextWidthMm)
    : Math.min(innerWidthMm, innerHeightMm - base.gapMm - minimumTextHeightMm);
  // In a vertical label, the baseline QR intentionally starts large. Let the
  // constrained search try smaller squares too, otherwise a square 100 × 100
  // label could leave only a few millimetres for its four text fields.
  const baselineMinimumQrMm = base.orientation === 'vertical'
    ? Math.min(base.qrMm, innerWidthMm * 0.35)
    : Math.min(base.qrMm, innerHeightMm * 0.55);
  const minimumQrMm = Math.max(
    8,
    Math.min(baselineMinimumQrMm, Math.max(8, maximumQrMm)),
  );
  const usableMaximumQrMm = Math.max(minimumQrMm, maximumQrMm);
  const qrValues = Array.from({ length: 5 }, (_, index) => {
    const progress = index / 4;
    return minimumQrMm + (usableMaximumQrMm - minimumQrMm) * progress;
  });
  const uniqueQrValues = Array.from(new Set(qrValues.map((value) => Math.round(value * 100) / 100)));
  const maximumFontMm = Math.min(
    32,
    Math.max(6, Math.min(widthMm, heightMm) * 0.4),
  );
  return uniqueQrValues.map((qrMm) => ({
    layout: layoutWithGeometry(base, qrMm, base.minimumTextFontMm),
    fontMm: maximumFontMm,
  }));
}

function measureLabelGeometry(
  label: HTMLDivElement,
  widthMm: number,
  layout: ReturnType<typeof getLabelLayout>,
): { fits: boolean; reason?: string } {
  const root = label.getBoundingClientRect();
  if (root.width <= 0 || root.height <= 0) {
    return { fits: false, reason: 'Etiketės geometrijos nepavyko išmatuoti.' };
  }
  const styles = window.getComputedStyle(label);
  const borderLeft = Number.parseFloat(styles.borderLeftWidth) || 0;
  const borderRight = Number.parseFloat(styles.borderRightWidth) || 0;
  const borderTop = Number.parseFloat(styles.borderTopWidth) || 0;
  const borderBottom = Number.parseFloat(styles.borderBottomWidth) || 0;
  const bounds = {
    left: root.left + borderLeft,
    right: root.right - borderRight,
    top: root.top + borderTop,
    bottom: root.bottom - borderBottom,
  };
  const tolerance = 0.75;
  const children = [
    label.querySelector<HTMLElement>('[data-label-qr="true"]'),
    label.querySelector<HTMLElement>('[data-label-text="true"]'),
    ...Array.from(label.querySelectorAll<HTMLElement>('[data-label-text="true"] *')),
  ].filter((element): element is HTMLElement => Boolean(element));
  const childOverflow = children.some((element) => {
    const rect = element.getBoundingClientRect();
    return rect.left < bounds.left - tolerance
      || rect.right > bounds.right + tolerance
      || rect.top < bounds.top - tolerance
      || rect.bottom > bounds.bottom + tolerance;
  });
  const scrollOverflow = label.scrollWidth > label.clientWidth + 1
    || label.scrollHeight > label.clientHeight + 1;
  const qr = label.querySelector<HTMLElement>('[data-label-qr="true"]');
  const expectedQrPx = layout.qrMm * root.width / widthMm;
  const qrRect = qr?.getBoundingClientRect();
  const qrTooSmall = qrRect
    ? qrRect.width < expectedQrPx - tolerance
      || qrRect.height < expectedQrPx - tolerance
      || Math.abs(qrRect.width - qrRect.height) > tolerance
    : true;
  if (childOverflow || scrollOverflow) {
    return { fits: false, reason: 'Tekstas arba QR kodas netelpa pasirinktoje etiketėje.' };
  }
  if (qrTooSmall) {
    return { fits: false, reason: 'QR laukelio dydis neatitinka pasirinkto maketo.' };
  }
  return { fits: true };
}

function ScaledLabelPreview({
  widthMm,
  heightMm,
  layoutOverride,
  ...data
}: PartLabelData & { widthMm: number; heightMm: number; layoutOverride: LabelLayout }) {
  const stageRef = useRef<HTMLDivElement>(null);
  const labelRef = useRef<HTMLDivElement>(null);
  const [metrics, setMetrics] = useState({ width: widthMm * 3.7795, height: heightMm * 3.7795, scale: 1 });

  useLayoutEffect(() => {
    const measure = () => {
      const stage = stageRef.current;
      const label = labelRef.current;
      if (!stage || !label) return;
      const naturalWidth = label.offsetWidth || widthMm * 3.7795;
      const naturalHeight = label.offsetHeight || heightMm * 3.7795;
      const availableWidth = stage.clientWidth || naturalWidth;
      const scale = Math.min(1, availableWidth / naturalWidth);
      setMetrics({ width: naturalWidth, height: naturalHeight, scale });
    };
    measure();
    if (typeof ResizeObserver === 'undefined' || !stageRef.current) return undefined;
    const observer = new ResizeObserver(measure);
    observer.observe(stageRef.current);
    return () => observer.disconnect();
  }, [heightMm, layoutOverride.qrMm, layoutOverride.textFontMm, widthMm]);

  return (
    <div ref={stageRef} className="w-full" data-testid="label-preview-stage">
      <div
        style={{
          width: metrics.width * metrics.scale,
          height: metrics.height * metrics.scale,
          margin: '0 auto',
          position: 'relative',
        }}
      >
        <div style={{ width: metrics.width, height: metrics.height, transform: `scale(${metrics.scale})`, transformOrigin: 'top left' }}>
          <PartLabel
            ref={labelRef}
            {...data}
            widthMm={widthMm}
            heightMm={heightMm}
            layoutOverride={layoutOverride}
          />
        </div>
      </div>
    </div>
  );
}

export function LabelPrintSetup({ open, onOpenChange, data }: LabelPrintSetupProps) {
  const [profiles, setProfiles] = useState<PrinterProfile[]>(loadPrinterProfiles);
  const [customSizes, setCustomSizes] = useState<CustomLabelSize[]>(loadCustomLabelSizes);
  const [selectedProfileId, setSelectedProfileId] = useState(DEFAULT_PRINTER_PROFILE.id);
  const [sizeId, setSizeId] = useState(() => loadSelectedLabelSize() ?? defaultSizeId);
  const [manualWidth, setManualWidth] = useState('60');
  const [manualHeight, setManualHeight] = useState('40');
  const [quantity, setQuantity] = useState('1');
  const [profileEditor, setProfileEditor] = useState<ProfileDraft | null>(null);
  const [sizeEditor, setSizeEditor] = useState<SizeDraft | null>(null);
  const [profileError, setProfileError] = useState('');
  const [sizeError, setSizeError] = useState('');
  const [printError, setPrintError] = useState('');
  const [sizeSaveNotice, setSizeSaveNotice] = useState('');
  const [isPrinting, setIsPrinting] = useState(false);
  const [labelGeometry, setLabelGeometry] = useState<LabelGeometry>({
    status: 'pending',
    fits: false,
  });
  const [fittedLayout, setFittedLayout] = useState<LabelLayout | null>(null);
  const [fittingState, setFittingState] = useState<FittingState | null>(null);
  const measurementRef = useRef<HTMLDivElement>(null);
  const manualFocusCountRef = useRef(0);
  const manualDirtyRef = useRef(false);
  const manualSaveTimerRef = useRef<number | undefined>(undefined);

  useEffect(() => () => {
    if (manualSaveTimerRef.current !== undefined) window.clearTimeout(manualSaveTimerRef.current);
  }, []);

  const selectedProfile = profiles.find((profile) => profile.id === selectedProfileId) ?? profiles[0];
  const selectedSize = sizeId === 'manual'
    ? undefined
    : [...PRESET_LABEL_SIZES, ...customSizes].find((size) => size.id === sizeId);
  const widthMm = sizeId === 'manual' ? Number(manualWidth) : selectedSize?.widthMm ?? 60;
  const heightMm = sizeId === 'manual' ? Number(manualHeight) : selectedSize?.heightMm ?? 40;
  const dimensionsValid = isValidLabelDimension(widthMm) && isValidLabelDimension(heightMm);
  const printWidthMm = dimensionsValid ? widthMm : 60;
  const printHeightMm = dimensionsValid ? heightMm : 40;
  const layout = useMemo(
    () => getLabelLayout(printWidthMm, printHeightMm, data),
    [data.code, data.donorName, data.name, data.publicId, data.url, printHeightMm, printWidthMm],
  );
  const fittingKey = JSON.stringify([
    printWidthMm,
    printHeightMm,
    data.code,
    data.donorName,
    data.name,
    data.publicId,
    data.url,
  ]);
  const fitCandidates = useMemo(
    () => getFitCandidates(layout, printWidthMm, printHeightMm),
    [layout, printHeightMm, printWidthMm],
  );
  const activeFittingState = fittingState?.key === fittingKey ? fittingState : null;
  const activeCandidate = activeFittingState
    ? fitCandidates[activeFittingState.candidateIndex]
    : undefined;
  const activeMeasurementLayout = activeCandidate && activeFittingState
    ? layoutWithGeometry(activeCandidate.layout, activeCandidate.layout.qrMm, activeFittingState.probeMm)
    : layout;
  const effectiveLayout = fittedLayout ?? layout;

  useLayoutEffect(() => {
    const availableSize = [...PRESET_LABEL_SIZES, ...customSizes].some((size) => size.id === sizeId);
    if (sizeId !== 'manual' && !availableSize) {
      setSizeId(defaultSizeId);
    }
  }, [customSizes, sizeId]);

  useLayoutEffect(() => {
    const firstCandidate = fitCandidates[0];
    if (!firstCandidate) {
      setFittingState(null);
      setFittedLayout(null);
      setLabelGeometry({ status: 'checked', fits: false, reason: layout.blockingReason });
      return;
    }
    const highMm = firstCandidate.fontMm;
    const lowMm = Math.max(0.65, layout.minimumTextFontMm);
    setFittedLayout(null);
    setLabelGeometry({ status: 'pending', fits: false });
    setFittingState({
      key: fittingKey,
      candidateIndex: 0,
      lowMm,
      highMm,
      probeMm: (lowMm + highMm) / 2,
      results: [],
    });
  }, [fitCandidates, fittingKey, layout.blockingReason, layout.minimumTextFontMm]);

  useLayoutEffect(() => {
    if (!activeFittingState || !activeCandidate || activeFittingState.key !== fittingKey) return undefined;
    let cancelled = false;
    const measure = async () => {
      if (document.fonts?.ready) await document.fonts.ready;
      await new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve()));
      if (cancelled || !measurementRef.current) return;
      const result = measureLabelGeometry(measurementRef.current, printWidthMm, activeMeasurementLayout);
      if (cancelled) return;

      const precisionMm = 0.08;
      const isAtSearchBoundary = activeFittingState.highMm - activeFittingState.lowMm <= precisionMm;
      if (!isAtSearchBoundary) {
        const nextLowMm = result.fits
          ? activeFittingState.probeMm
          : activeFittingState.lowMm;
        const nextHighMm = result.fits
          ? activeFittingState.highMm
          : activeFittingState.probeMm;
        setFittingState((current) => {
          if (!current || current.key !== fittingKey) return current;
          return {
            ...current,
            lowMm: nextLowMm,
            highMm: nextHighMm,
            probeMm: (nextLowMm + nextHighMm) / 2,
          };
        });
        return;
      }

      // Binary search assumes that its lower bound fits. Verify that
      // assumption explicitly for long values on the smallest labels instead
      // of accepting an infeasible candidate at the minimum font.
      if (!result.fits && activeFittingState.lowMm <= layout.minimumTextFontMm + precisionMm
        && activeFittingState.probeMm > layout.minimumTextFontMm + 0.001) {
        setFittingState((current) => {
          if (!current || current.key !== fittingKey) return current;
          return {
            ...current,
            lowMm: layout.minimumTextFontMm,
            highMm: current.probeMm,
            probeMm: layout.minimumTextFontMm,
          };
        });
        return;
      }

      const finalFontMm = result.fits
        ? activeFittingState.probeMm
        : activeFittingState.lowMm;
      const finalFits = result.fits
        || activeFittingState.lowMm > layout.minimumTextFontMm + precisionMm;
      const finalLayout = layoutWithGeometry(activeCandidate.layout, activeCandidate.layout.qrMm, finalFontMm);
      const candidateResult = finalFits
        ? {
            candidate: { layout: finalLayout, fontMm: finalFontMm },
            // Favor a large QR, but give a long name enough horizontal room
            // to keep all four fields comfortably legible.
            score: finalLayout.qrMm * 0.55 + finalFontMm * 5,
          }
        : undefined;
      const nextResults = candidateResult
        ? [...activeFittingState.results, candidateResult]
        : activeFittingState.results;
      const nextIndex = activeFittingState.candidateIndex + 1;
      const nextCandidate = fitCandidates[nextIndex];
      if (nextCandidate) {
        const nextLowMm = Math.max(0.65, layout.minimumTextFontMm);
        setFittingState({
          key: fittingKey,
          candidateIndex: nextIndex,
          lowMm: nextLowMm,
          highMm: nextCandidate.fontMm,
          probeMm: (nextLowMm + nextCandidate.fontMm) / 2,
          results: nextResults,
        });
        return;
      }

      const best = nextResults.reduce<FitResult | undefined>(
        (current, candidate) => !current || candidate.score > current.score ? candidate : current,
        undefined,
      );
      if (best) {
        setFittedLayout(best.candidate.layout);
        setLabelGeometry({ status: 'checked', fits: true });
      } else {
        setFittedLayout(null);
        setLabelGeometry({
          status: 'checked',
          fits: false,
          reason: 'Tekstas arba QR kodas netelpa pasirinktoje etiketėje.',
        });
      }
      setFittingState(null);
    };
    void measure();
    return () => {
      cancelled = true;
    };
  }, [
    activeCandidate,
    activeFittingState,
    activeMeasurementLayout,
    fittingKey,
    fitCandidates,
    layout,
    printWidthMm,
  ]);
  const quantityNumber = Number(quantity);
  const quantityValid = Number.isInteger(quantityNumber) && quantityNumber >= 1 && quantityNumber <= 100;
  const geometryBlockingReason = labelGeometry.status === 'checked' && !labelGeometry.fits
    ? labelGeometry.reason
    : undefined;
  const canPrint = Boolean(selectedProfile)
    && dimensionsValid
    && quantityValid
    && layout.canPrint
    && fittedLayout !== null
    && fittingState === null
    && labelGeometry.status === 'checked'
    && labelGeometry.fits
    && !isPrinting;

  function sameDimensions(left: { widthMm: number; heightMm: number }, right: { widthMm: number; heightMm: number }) {
    return left.widthMm === right.widthMm && left.heightMm === right.heightMm;
  }

  function persistManualSize(showNotice = true) {
    if (manualSaveTimerRef.current !== undefined) {
      window.clearTimeout(manualSaveTimerRef.current);
      manualSaveTimerRef.current = undefined;
    }
    if (sizeId !== 'manual' || !dimensionsValid) return false;

    const nextDimensions = { widthMm, heightMm };
    const storedSizes = loadCustomLabelSizes();
    const matchingPreset = PRESET_LABEL_SIZES.find((size) => sameDimensions(size, nextDimensions));
    if (matchingPreset) {
      const nextSizes = storedSizes.filter((size) => !sameDimensions(size, nextDimensions));
      const collectionSaved = nextSizes.length === storedSizes.length || saveCustomLabelSizes(nextSizes);
      const selectionSaved = saveSelectedLabelSize(matchingPreset.id);
      if (!collectionSaved || !selectionSaved) {
        setSizeError('Formato nepavyko išsaugoti naršyklės saugykloje.');
        return false;
      }
      setCustomSizes(nextSizes);
      setSizeError('');
      if (showNotice) setSizeSaveNotice(`Formatas ${matchingPreset.widthMm} × ${matchingPreset.heightMm} mm išsaugotas.`);
      manualDirtyRef.current = false;
      return true;
    }

    const matchingCustom = storedSizes.find((size) => sameDimensions(size, nextDimensions));
    const nextId = matchingCustom?.id
      ?? `manual-${String(widthMm).replace('.', '_')}-${String(heightMm).replace('.', '_')}`;
    const nextSize: CustomLabelSize = matchingCustom ?? {
      id: nextId,
      name: `Rankinis ${widthMm} × ${heightMm} mm`,
      widthMm,
      heightMm,
    };
    const withoutDuplicateDimensions = storedSizes.filter((size) => (
      size.id === nextSize.id
      || (!sameDimensions(size, nextDimensions) && !size.id.startsWith('manual-'))
    ));
    const nextSizes = withoutDuplicateDimensions.some((size) => size.id === nextSize.id)
      ? withoutDuplicateDimensions.map((size) => size.id === nextSize.id ? nextSize : size)
      : [...withoutDuplicateDimensions, nextSize];
    const collectionSaved = saveCustomLabelSizes(nextSizes);
    const selectionSaved = saveSelectedLabelSize(nextId);
    if (!collectionSaved || !selectionSaved) {
      setSizeError('Formatas nepavyko išsaugoti naršyklės saugykloje.');
      return false;
    }
    setCustomSizes(nextSizes);
    setSizeError('');
    if (showNotice) setSizeSaveNotice(`Formatas ${widthMm} × ${heightMm} mm išsaugotas.`);
    manualDirtyRef.current = false;
    return true;
  }

  function scheduleManualSizeSave() {
    if (!manualDirtyRef.current || manualFocusCountRef.current > 0) return;
    if (manualSaveTimerRef.current !== undefined) window.clearTimeout(manualSaveTimerRef.current);
    manualSaveTimerRef.current = window.setTimeout(() => {
      manualSaveTimerRef.current = undefined;
      if (manualFocusCountRef.current > 0) return;
      persistManualSize();
    }, 500);
  }

  function handleManualFocus() {
    manualFocusCountRef.current += 1;
  }

  function handleManualBlur() {
    manualFocusCountRef.current = Math.max(0, manualFocusCountRef.current - 1);
    scheduleManualSizeSave();
  }

  function selectSize(nextId: string) {
    if (manualSaveTimerRef.current !== undefined) {
      window.clearTimeout(manualSaveTimerRef.current);
      manualSaveTimerRef.current = undefined;
    }
    if (nextId !== 'manual') manualDirtyRef.current = false;
    setSizeId(nextId);
    setSizeError('');
    setPrintError('');
    setSizeSaveNotice('');
    if (!saveSelectedLabelSize(nextId)) {
      setSizeError('Formato nepavyko išsaugoti naršyklės saugykloje.');
    }
    if (nextId === 'manual') return;
    const nextSize = [...PRESET_LABEL_SIZES, ...customSizes].find((size) => size.id === nextId);
    if (nextSize) {
      setManualWidth(String(nextSize.widthMm));
      setManualHeight(String(nextSize.heightMm));
    }
  }

  function beginAddProfile() {
    setProfileError('');
    setProfileEditor({ name: '' });
  }

  function beginEditProfile() {
    if (!selectedProfile) return;
    setProfileError('');
    setProfileEditor({ id: selectedProfile.id, name: selectedProfile.name });
  }

  function saveProfile() {
    if (!profileEditor || profileEditor.name.trim().length === 0) {
      setProfileError('Įrašykite profilio pavadinimą.');
      return;
    }
    const name = profileEditor.name.trim();
    const storedProfiles = loadPrinterProfiles();
    let nextProfiles: PrinterProfile[];
    if (profileEditor.id) {
      nextProfiles = storedProfiles.map((profile) => profile.id === profileEditor.id ? { ...profile, name } : profile);
    } else {
      const profile = { id: createLocalId('printer'), name };
      nextProfiles = [...storedProfiles, profile];
    }
    if (!savePrinterProfiles(nextProfiles)) {
      setProfileError('Profilio nepavyko išsaugoti naršyklės saugykloje.');
      return;
    }
    setProfiles(nextProfiles);
    if (!profileEditor.id) {
      setSelectedProfileId(nextProfiles[nextProfiles.length - 1].id);
    }
    setProfileEditor(null);
    setProfileError('');
  }

  function deleteProfile() {
    if (!selectedProfile) return;
    const storedProfiles = loadPrinterProfiles();
    if (storedProfiles.length <= 1) {
      setProfileError('Palikite bent vieną profilio pavadinimą spausdinimo nustatymams.');
      return;
    }
    const remaining = storedProfiles.filter((profile) => profile.id !== selectedProfile.id);
    if (!savePrinterProfiles(remaining)) {
      setProfileError('Profilio nepavyko išsaugoti naršyklės saugykloje.');
      return;
    }
    setProfiles(remaining);
    setSelectedProfileId(remaining[0].id);
    setProfileError('');
  }

  function beginAddSize() {
    setSizeError('');
    setSizeEditor({ name: '', widthMm: '60', heightMm: '40' });
  }

  function beginEditSize() {
    const size = customSizes.find((item) => item.id === sizeId);
    if (!size) return;
    setSizeError('');
    setSizeEditor({
      id: size.id,
      name: size.name,
      widthMm: String(size.widthMm),
      heightMm: String(size.heightMm),
    });
  }

  function validateSizeDraft(draft: SizeDraft): { error: string } | { width: number; height: number } {
    const width = Number(draft.widthMm);
    const height = Number(draft.heightMm);
    if (!draft.name.trim()) return { error: 'Įrašykite dydžio pavadinimą.' };
    if (!isValidLabelDimension(width) || !isValidLabelDimension(height)) {
      return { error: 'Plotis ir aukštis turi būti nuo 10 iki 150 mm.' };
    }
    return { width, height };
  }

  function saveSize() {
    if (!sizeEditor) return;
    const result = validateSizeDraft(sizeEditor);
    if ('error' in result) {
      setSizeError(result.error);
      return;
    }
    if (PRESET_LABEL_SIZES.some((size) => size.widthMm === result.width && size.heightMm === result.height)) {
      setSizeError('Toks formatas jau yra numatytųjų dydžių sąraše.');
      return;
    }
    const nextSize = {
      id: sizeEditor.id ?? createLocalId('label-size'),
      name: sizeEditor.name.trim(),
      widthMm: result.width,
      heightMm: result.height,
    };
    const storedSizes = loadCustomLabelSizes();
    const withoutDuplicateDimensions = storedSizes.filter((size) => (
      size.id === nextSize.id || !sameDimensions(size, nextSize)
    ));
    const nextSizes = sizeEditor.id
      ? withoutDuplicateDimensions.map((size) => size.id === sizeEditor.id ? nextSize : size)
      : [...withoutDuplicateDimensions, nextSize];
    if (!saveCustomLabelSizes(nextSizes)) {
      setSizeError('Dydžio nepavyko išsaugoti naršyklės saugykloje.');
      return;
    }
    setCustomSizes(nextSizes);
    setSizeId(nextSize.id);
    setManualWidth(String(nextSize.widthMm));
    setManualHeight(String(nextSize.heightMm));
    setSizeEditor(null);
    setSizeError('');
  }

  function deleteSize() {
    const storedSizes = loadCustomLabelSizes();
    const size = storedSizes.find((item) => item.id === sizeId);
    if (!size) return;
    const nextSizes = storedSizes.filter((item) => item.id !== size.id);
    const collectionSaved = saveCustomLabelSizes(nextSizes);
    const selectionSaved = saveSelectedLabelSize(defaultSizeId);
    if (!collectionSaved || !selectionSaved) {
      setSizeError('Dydžio nepavyko išsaugoti naršyklės saugykloje.');
      return;
    }
    setCustomSizes(nextSizes);
    setSizeId(defaultSizeId);
    setSizeError('');
  }

  async function printLabels() {
    setPrintError('');
    if (sizeId === 'manual') persistManualSize(false);
    if (!dimensionsValid) {
      setPrintError('Plotis ir aukštis turi būti nuo 10 iki 150 mm.');
      return;
    }
    if (!quantityValid) {
      setPrintError('Kiekis turi būti sveikas skaičius nuo 1 iki 100.');
      return;
    }
    if (!layout.canPrint) {
      setPrintError(layout.blockingReason ?? 'Etiketės išdėstymas netelpa pasirinktame dydyje.');
      return;
    }
    if (labelGeometry.status !== 'checked' || !labelGeometry.fits) {
      setPrintError(labelGeometry.reason ?? 'Palaukite, kol bus patikrintas etiketės išdėstymas.');
      return;
    }
    if (!selectedProfile) {
      setPrintError('Pasirinkite spausdintuvo profilio pavadinimą.');
      return;
    }
    setIsPrinting(true);
    try {
      await openLabelPrintWindow({
        ...data,
        widthMm: printWidthMm,
        heightMm: printHeightMm,
        quantity: quantityNumber,
         layout: fittedLayout ?? layout,
      });
    } catch (error) {
      setPrintError(error instanceof Error ? error.message : 'Spausdinimo lango atidaryti nepavyko.');
    } finally {
      setIsPrinting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="w-[calc(100%-1rem)] max-w-5xl rounded-xl p-4 sm:p-6"
        data-testid="dialog-label-print-setup"
      >
        <DialogHeader className="pr-7">
          <DialogTitle className="flex items-center gap-2"><Printer size={19} aria-hidden="true" /> Spausdinti lipduką</DialogTitle>
          <DialogDescription>
            Pasirinkite etiketės maketą ir kiekį. QR kodas bei visi detalės duomenys išlieka nepakitę.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(280px,0.9fr)]">
          <div className="space-y-5">
            <section className="rounded-xl border border-border bg-card p-4" aria-labelledby="label-printer-heading">
              <div className="mb-3 flex items-start justify-between gap-3">
                <div>
                  <h2 id="label-printer-heading" className="text-sm font-bold">Spausdintuvo profilis</h2>
                  <p className="mt-1 text-xs text-muted-foreground">Tai tik išsaugotas pavadinimas, ne OS spausdintuvo pasirinkimas.</p>
                </div>
                <Printer size={17} className="text-secondary" aria-hidden="true" />
              </div>
              <label htmlFor="label-printer-profile" className="text-xs font-semibold">Profilis</label>
              <select
                id="label-printer-profile"
                value={selectedProfile?.id ?? ''}
                onChange={(event) => setSelectedProfileId(event.target.value)}
                className={fieldClass()}
                data-testid="select-printer-profile"
              >
                {profiles.map((profile) => <option key={profile.id} value={profile.id}>{profile.name}</option>)}
              </select>
              <p className="mt-2 text-xs leading-5 text-muted-foreground">
                Tikras spausdintuvas pasirenkamas vėliau atsidariusiame vietiniame sistemos spausdinimo lange.
                Programa nepretenduoja į Bluetooth ar kitą tiesioginį aparatinės įrangos ryšį.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <button type="button" onClick={beginAddProfile} className="inline-flex min-h-8 items-center gap-1.5 rounded-lg border border-border px-2.5 text-xs font-semibold hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary" data-testid="button-add-printer-profile"><Plus size={14} /> Pridėti</button>
                <button type="button" onClick={beginEditProfile} disabled={!selectedProfile} className="inline-flex min-h-8 items-center gap-1.5 rounded-lg border border-border px-2.5 text-xs font-semibold hover:bg-muted disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary" data-testid="button-edit-printer-profile"><Pencil size={13} /> Redaguoti</button>
                <button type="button" onClick={deleteProfile} disabled={!selectedProfile || profiles.length <= 1} className="inline-flex min-h-8 items-center gap-1.5 rounded-lg border border-destructive/40 px-2.5 text-xs font-semibold text-destructive hover:bg-destructive/10 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary" data-testid="button-delete-printer-profile"><Trash2 size={13} /> Ištrinti</button>
              </div>
              {profileEditor && (
                <form className="mt-4 rounded-lg border border-secondary/30 bg-accent/30 p-3" onSubmit={(event) => { event.preventDefault(); saveProfile(); }} data-testid="form-printer-profile">
                  <label htmlFor="printer-profile-name" className="text-xs font-semibold">Pavadinimas</label>
                  <input id="printer-profile-name" autoFocus value={profileEditor.name} maxLength={80} onChange={(event) => setProfileEditor({ ...profileEditor, name: event.target.value })} className={fieldClass(Boolean(profileError))} data-testid="input-printer-profile-name" />
                  {profileError && <p className="mt-1 text-xs text-destructive" role="alert">{profileError}</p>}
                  <div className="mt-3 flex gap-2">
                    <button type="submit" className="min-h-8 rounded-lg bg-primary px-3 text-xs font-bold text-primary-foreground" data-testid="button-save-printer-profile">Išsaugoti</button>
                    <button type="button" onClick={() => setProfileEditor(null)} className="min-h-8 rounded-lg border border-border px-3 text-xs font-semibold" data-testid="button-cancel-printer-profile">Atšaukti</button>
                  </div>
                </form>
              )}
              {!profileEditor && profileError && <p className="mt-2 text-xs text-destructive" role="alert">{profileError}</p>}
            </section>

            <section className="rounded-xl border border-border bg-card p-4" aria-labelledby="label-size-heading">
              <div className="mb-3 flex items-start justify-between gap-3">
                <div>
                  <h2 id="label-size-heading" className="text-sm font-bold">Etiketės dydis</h2>
                  <p className="mt-1 text-xs text-muted-foreground">Numatytasis dydis yra 60 × 40 mm — ne A4.</p>
                </div>
                <span className="font-mono-ui text-[10px] uppercase tracking-[0.12em] text-secondary">mm</span>
              </div>
              <label htmlFor="label-size" className="text-xs font-semibold">Formatas</label>
              <select id="label-size" value={sizeId} onChange={(event) => selectSize(event.target.value)} className={fieldClass(Boolean(sizeError) || (sizeId === 'manual' && !dimensionsValid))} data-testid="select-label-size">
                {PRESET_LABEL_SIZES.map((size) => <option key={size.id} value={size.id}>{size.name}{size.id === defaultSizeId ? ' · numatytasis' : ''}</option>)}
                {customSizes.length > 0 && <optgroup label="Mano dydžiai">{customSizes.map((size) => <option key={size.id} value={size.id}>{size.name} · {size.widthMm} × {size.heightMm} mm</option>)}</optgroup>}
                <option value="manual">Rankinis dydis</option>
              </select>
              {sizeId === 'manual' && (
                <div className="mt-3 grid grid-cols-2 gap-3">
                  <div>
                    <label htmlFor="manual-label-width" className="text-xs font-semibold">Plotis (mm)</label>
                   <input
                     id="manual-label-width"
                     type="number"
                     min={10}
                     max={150}
                     step="0.1"
                     value={manualWidth}
                     onFocus={handleManualFocus}
                     onBlur={handleManualBlur}
                     onChange={(event) => { manualDirtyRef.current = true; setSizeSaveNotice(''); setManualWidth(event.target.value); }}
                     className={fieldClass(!isValidLabelDimension(widthMm))}
                     aria-invalid={!isValidLabelDimension(widthMm)}
                     data-testid="input-label-width"
                   />
                  </div>
                  <div>
                    <label htmlFor="manual-label-height" className="text-xs font-semibold">Aukštis (mm)</label>
                   <input
                     id="manual-label-height"
                     type="number"
                     min={10}
                     max={150}
                     step="0.1"
                     value={manualHeight}
                     onFocus={handleManualFocus}
                     onBlur={handleManualBlur}
                     onChange={(event) => { manualDirtyRef.current = true; setSizeSaveNotice(''); setManualHeight(event.target.value); }}
                     className={fieldClass(!isValidLabelDimension(heightMm))}
                     aria-invalid={!isValidLabelDimension(heightMm)}
                     data-testid="input-label-height"
                   />
                  </div>
                </div>
              )}
               {sizeId === 'manual' && !dimensionsValid && <p className="mt-2 text-xs text-destructive" role="alert">Įveskite plotį ir aukštį nuo 10 iki 150 mm.</p>}
               {sizeId === 'manual' && dimensionsValid && (
                 <button
                   type="button"
                   onClick={() => { persistManualSize(); }}
                   className="mt-3 inline-flex min-h-8 items-center rounded-lg bg-primary px-3 text-xs font-bold text-primary-foreground"
                   data-testid="button-save-manual-label-size"
                 >
                   Išsaugoti formatą
                 </button>
               )}
               {sizeSaveNotice && <p className="mt-2 text-xs font-semibold text-secondary" role="status" data-testid="status-label-size-saved">{sizeSaveNotice}</p>}
              <div className="mt-3 flex flex-wrap gap-2">
                <button type="button" onClick={beginAddSize} className="inline-flex min-h-8 items-center gap-1.5 rounded-lg border border-border px-2.5 text-xs font-semibold hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary" data-testid="button-add-label-size"><Plus size={14} /> Išsaugoti dydį</button>
                <button type="button" onClick={beginEditSize} disabled={!customSizes.some((size) => size.id === sizeId)} className="inline-flex min-h-8 items-center gap-1.5 rounded-lg border border-border px-2.5 text-xs font-semibold hover:bg-muted disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary" data-testid="button-edit-label-size"><Pencil size={13} /> Redaguoti</button>
                <button type="button" onClick={deleteSize} disabled={!customSizes.some((size) => size.id === sizeId)} className="inline-flex min-h-8 items-center gap-1.5 rounded-lg border border-destructive/40 px-2.5 text-xs font-semibold text-destructive hover:bg-destructive/10 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary" data-testid="button-delete-label-size"><Trash2 size={13} /> Ištrinti</button>
                <button type="button" onClick={() => selectSize(defaultSizeId)} className="inline-flex min-h-8 items-center gap-1.5 rounded-lg border border-border px-2.5 text-xs font-semibold hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary" data-testid="button-restore-label-presets"><RotateCcw size={13} /> Atkurti 60 × 40</button>
              </div>
              {sizeEditor && (
                <form className="mt-4 rounded-lg border border-secondary/30 bg-accent/30 p-3" onSubmit={(event) => { event.preventDefault(); saveSize(); }} data-testid="form-label-size">
                  <label htmlFor="label-size-name" className="text-xs font-semibold">Dydžio pavadinimas</label>
                  <input id="label-size-name" autoFocus maxLength={80} value={sizeEditor.name} onChange={(event) => setSizeEditor({ ...sizeEditor, name: event.target.value })} className={fieldClass(Boolean(sizeError))} data-testid="input-label-size-name" />
                  <div className="mt-3 grid grid-cols-2 gap-3">
                    <div><label htmlFor="custom-label-width" className="text-xs font-semibold">Plotis (mm)</label><input id="custom-label-width" type="number" min={10} max={150} step="0.1" value={sizeEditor.widthMm} onChange={(event) => setSizeEditor({ ...sizeEditor, widthMm: event.target.value })} className={fieldClass(Boolean(sizeError))} data-testid="input-custom-label-width" /></div>
                    <div><label htmlFor="custom-label-height" className="text-xs font-semibold">Aukštis (mm)</label><input id="custom-label-height" type="number" min={10} max={150} step="0.1" value={sizeEditor.heightMm} onChange={(event) => setSizeEditor({ ...sizeEditor, heightMm: event.target.value })} className={fieldClass(Boolean(sizeError))} data-testid="input-custom-label-height" /></div>
                  </div>
                  {sizeError && <p className="mt-2 text-xs text-destructive" role="alert">{sizeError}</p>}
                  <div className="mt-3 flex gap-2">
                    <button type="submit" className="min-h-8 rounded-lg bg-primary px-3 text-xs font-bold text-primary-foreground" data-testid="button-save-label-size">Išsaugoti</button>
                    <button type="button" onClick={() => setSizeEditor(null)} className="min-h-8 rounded-lg border border-border px-3 text-xs font-semibold" data-testid="button-cancel-label-size">Atšaukti</button>
                  </div>
                </form>
              )}
              <p className="mt-3 text-xs leading-5 text-muted-foreground">Numatyti 30 × 20, 40 × 30, 50 × 30 ir 60 × 40 mm dydžiai lieka pasiekiami; papildomi dydžiai saugomi tik šioje naršyklėje.</p>
            </section>

            <section className="rounded-xl border border-border bg-card p-4" aria-labelledby="label-quantity-heading">
              <h2 id="label-quantity-heading" className="text-sm font-bold">Kiekis</h2>
              <label htmlFor="label-quantity" className="mt-3 block text-xs font-semibold">Etikečių skaičius</label>
              <input id="label-quantity" type="number" inputMode="numeric" min={1} max={100} step={1} value={quantity} onChange={(event) => setQuantity(event.target.value)} className={fieldClass(!quantityValid)} aria-invalid={!quantityValid} data-testid="input-label-quantity" />
              {!quantityValid && <p className="mt-1 text-xs text-destructive" role="alert">Kiekis turi būti sveikas skaičius nuo 1 iki 100.</p>}
            </section>
          </div>

          <aside className="space-y-4 lg:sticky lg:top-0 lg:self-start">
            <section className="rounded-xl border border-border bg-muted/30 p-4" aria-labelledby="label-preview-heading">
              <div className="mb-3 flex items-start justify-between gap-3">
                <div>
                  <h2 id="label-preview-heading" className="text-sm font-bold">Peržiūra</h2>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {printWidthMm} × {printHeightMm} mm · {quantityValid ? quantityNumber : '—'} vnt. ·{' '}
                    <span data-testid="label-layout-indicator" className="font-semibold text-foreground">
                      {layout.orientation === 'horizontal' ? 'Horizontalus' : 'Vertikalus'}
                    </span>
                  </p>
                </div>
                <span className="rounded-full border border-border bg-background px-2 py-1 font-mono-ui text-[10px] font-bold text-muted-foreground">1:1 maketas</span>
              </div>
              <div className="rounded-lg border border-border bg-white p-3 shadow-inner" data-testid="label-preview">
                 <ScaledLabelPreview
                   {...data}
                   widthMm={printWidthMm}
                   heightMm={printHeightMm}
                   layoutOverride={effectiveLayout}
                 />
              </div>
              <p className="mt-3 text-xs leading-5 text-muted-foreground">Peržiūroje naudojamas tas pats SVG QR, milimetrinis DOM maketas ir pritaikytas šriftas, kuris bus siunčiamas spausdinti.</p>
            </section>

            {(layout.warnings.length > 0 || layout.blockingReason || geometryBlockingReason) && (
              <section className={`rounded-xl border p-4 ${layout.blockingReason || geometryBlockingReason ? 'border-destructive/45 bg-destructive/10' : 'border-primary/35 bg-primary/10'}`} aria-live="polite" data-testid="label-print-warnings">
                <div className="flex items-start gap-2">
                  {layout.blockingReason || geometryBlockingReason ? <AlertTriangle size={17} className="mt-0.5 shrink-0 text-destructive" aria-hidden="true" /> : <Info size={17} className="mt-0.5 shrink-0 text-primary" aria-hidden="true" />}
                  <div className="space-y-2 text-xs leading-5">
                    {layout.warnings.map((warning) => <p key={warning}>{warning}</p>)}
                    {(layout.blockingReason || geometryBlockingReason) && <p className="font-bold text-destructive">{layout.blockingReason ?? geometryBlockingReason} Spausdinimas užblokuotas, kol pasirinksite tinkamą dydį.</p>}
                  </div>
                </div>
              </section>
            )}

            <section className="rounded-xl border border-border bg-card p-4">
              <h2 className="text-sm font-bold">Prieš spausdinant</h2>
              <ul className="mt-2 space-y-2 text-xs leading-5 text-muted-foreground">
                <li>1. Paspauskite spausdinimo mygtuką ir pasirinkite tikrą spausdintuvą sistemos lange.</li>
                <li>2. Tvarkyklėje nustatykite tikslų {printWidthMm} × {printHeightMm} mm etiketės dydį, 100 % mastelį, be paraščių ir antraščių.</li>
                <li>3. Sistemos kopijas palikite 1 — {quantityValid ? quantityNumber : 'pasirinktas kiekis'} kopijų jau sudėta į dokumentą.</li>
              </ul>
            </section>

            {printError && <p className="rounded-lg border border-destructive/45 bg-destructive/10 px-3 py-2 text-xs leading-5 text-destructive" role="alert" data-testid="status-label-print-error">{printError}</p>}
            <button type="button" onClick={() => void printLabels()} disabled={!canPrint} className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-3 text-sm font-bold text-primary-foreground shadow-sm transition-transform hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2" data-testid="button-print-labels">
              <Printer size={17} aria-hidden="true" /> {isPrinting ? 'Ruošiama…' : `Spausdinti ${quantityValid ? quantityNumber : ''} lipduką${quantityNumber === 1 ? '' : 'us'}`}
            </button>
            <button type="button" onClick={() => onOpenChange(false)} className="inline-flex min-h-9 w-full items-center justify-center gap-2 rounded-lg border border-border px-4 py-2 text-xs font-bold hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2" data-testid="button-close-label-print-setup"><X size={14} aria-hidden="true" /> Uždaryti nustatymus</button>
          </aside>
        </div>
        <div
          aria-hidden="true"
          style={{
            position: 'fixed',
            left: '-100000px',
            top: 0,
            visibility: 'hidden',
            pointerEvents: 'none',
          }}
          data-testid="label-geometry-measurement"
        >
          <PartLabel
            ref={measurementRef}
            {...data}
            widthMm={printWidthMm}
            heightMm={printHeightMm}
            layoutOverride={activeMeasurementLayout}
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}
