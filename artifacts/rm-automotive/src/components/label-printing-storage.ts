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
const LAST_LABEL_SIZE_KEY = 'rm-automotive-label-last-size-v1';

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

function dimensionsKey(widthMm: number, heightMm: number) {
  return `${widthMm}:${heightMm}`;
}

function uniqueCustomSizes(sizes: CustomLabelSize[]) {
  const seen = new Set<string>();
  return sizes.filter((size) => {
    const key = dimensionsKey(size.widthMm, size.heightMm);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
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
  if (!canUseStorage()) return false;
  try {
    window.localStorage.setItem(PRINTER_PROFILES_KEY, JSON.stringify(profiles));
    return true;
  } catch {
    return false;
  }
}

export function loadCustomLabelSizes(): CustomLabelSize[] {
  if (!canUseStorage()) return [];
  try {
    const parsed = readJson(window.localStorage.getItem(CUSTOM_LABEL_SIZES_KEY));
    if (!Array.isArray(parsed)) return [];
    const sizes = parsed.filter(isValidCustomSize).map((size) => ({
      id: size.id,
      name: size.name.trim(),
      widthMm: size.widthMm,
      heightMm: size.heightMm,
    }));
    return uniqueCustomSizes(sizes);
  } catch {
    return [];
  }
}

export function saveCustomLabelSizes(sizes: CustomLabelSize[]) {
  if (!canUseStorage()) return false;
  try {
    window.localStorage.setItem(CUSTOM_LABEL_SIZES_KEY, JSON.stringify(uniqueCustomSizes(sizes)));
    return true;
  } catch {
    return false;
  }
}

/**
 * The last selected format is separate from the size collection so that a
 * manually entered size can remain selected while its fields are being
 * edited. The corresponding custom size is written before this id is saved.
 */
export function loadSelectedLabelSize() {
  if (!canUseStorage()) return undefined;
  try {
    const value = window.localStorage.getItem(LAST_LABEL_SIZE_KEY);
    return value && value.trim().length > 0 ? value : undefined;
  } catch {
    return undefined;
  }
}

export function saveSelectedLabelSize(sizeId: string) {
  if (!canUseStorage()) return false;
  try {
    window.localStorage.setItem(LAST_LABEL_SIZE_KEY, sizeId);
    return true;
  } catch {
    return false;
  }
}

export function createLocalId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}
