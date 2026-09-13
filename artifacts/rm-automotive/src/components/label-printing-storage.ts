export type PrinterProfile = {
  id: string;
  name: string;
};

export type CustomLabelSize = {
  id: string;
  name: string;
  widthMm: number;
  heightMm: number;
};

export const PRESET_LABEL_SIZES = [
  { id: 'preset-30x20', name: '30 × 20 mm', widthMm: 30, heightMm: 20 },
  { id: 'preset-40x30', name: '40 × 30 mm', widthMm: 40, heightMm: 30 },
  { id: 'preset-50x30', name: '50 × 30 mm', widthMm: 50, heightMm: 30 },
  { id: 'preset-60x40', name: '60 × 40 mm', widthMm: 60, heightMm: 40 },
] as const;

export const DEFAULT_PRINTER_PROFILE: PrinterProfile = {
  id: 'printer-phomemo-m421',
  name: 'Phomemo M421',
};

const PRINTER_PROFILES_KEY = 'rm-automotive-label-printer-profiles-v1';
const CUSTOM_LABEL_SIZES_KEY = 'rm-automotive-label-custom-sizes-v1';

function canUseStorage() {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
}

function readJson(value: string | null): unknown {
  if (!value) return undefined;
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return undefined;
  }
}

function isValidName(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0 && value.trim().length <= 80;
}

function isValidDimension(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 10 && value <= 150;
}

function isValidProfile(value: unknown): value is PrinterProfile {
  return typeof value === 'object' && value !== null
    && typeof (value as PrinterProfile).id === 'string'
    && isValidName((value as PrinterProfile).name);
}

function isValidCustomSize(value: unknown): value is CustomLabelSize {
  return typeof value === 'object' && value !== null
    && typeof (value as CustomLabelSize).id === 'string'
    && isValidName((value as CustomLabelSize).name)
    && isValidDimension((value as CustomLabelSize).widthMm)
    && isValidDimension((value as CustomLabelSize).heightMm);
}

export function loadPrinterProfiles(): PrinterProfile[] {
  if (!canUseStorage()) return [DEFAULT_PRINTER_PROFILE];
  try {
    const parsed = readJson(window.localStorage.getItem(PRINTER_PROFILES_KEY));
    if (!Array.isArray(parsed)) return [DEFAULT_PRINTER_PROFILE];
    const profiles = parsed.filter(isValidProfile).map((profile) => ({
      id: profile.id,
      name: profile.name.trim(),
    }));
    return profiles.length > 0 ? profiles : [DEFAULT_PRINTER_PROFILE];
  } catch {
    return [DEFAULT_PRINTER_PROFILE];
  }
}

export function savePrinterProfiles(profiles: PrinterProfile[]) {
  if (!canUseStorage()) return;
  try {
    window.localStorage.setItem(PRINTER_PROFILES_KEY, JSON.stringify(profiles));
  } catch {
    // A private browsing session or a full storage quota must not break printing.
  }
}

export function loadCustomLabelSizes(): CustomLabelSize[] {
  if (!canUseStorage()) return [];
  try {
    const parsed = readJson(window.localStorage.getItem(CUSTOM_LABEL_SIZES_KEY));
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isValidCustomSize).map((size) => ({
      id: size.id,
      name: size.name.trim(),
      widthMm: size.widthMm,
      heightMm: size.heightMm,
    }));
  } catch {
    return [];
  }
}

export function saveCustomLabelSizes(sizes: CustomLabelSize[]) {
  if (!canUseStorage()) return;
  try {
    window.localStorage.setItem(CUSTOM_LABEL_SIZES_KEY, JSON.stringify(sizes));
  } catch {
    // A private browsing session or a full storage quota must not break printing.
  }
}

export function createLocalId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}
