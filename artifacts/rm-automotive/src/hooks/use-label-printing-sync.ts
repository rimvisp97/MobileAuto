import { useCallback, useEffect, useRef, useState } from 'react';
import {
  deleteSyncSetting,
  listSyncSettings,
  upsertSyncSetting,
  type SyncSetting,
} from '@workspace/api-client-react';
import {
  addLabelSyncTombstone,
  DEFAULT_PRINTER_PROFILE,
  loadCustomLabelSizes,
  loadLabelSyncMigrationComplete,
  loadLabelSyncTombstones,
  loadPrinterProfiles,
  markLabelSyncMigrationComplete,
  saveCustomLabelSizes,
  saveLabelSyncTombstones,
  savePrinterProfiles,
  type CustomLabelSize,
  type LabelSyncTombstones,
  type PrinterProfile,
} from '@/components/label-printing-storage';

const PROFILE_KEY_PREFIX = 'rm-automotive-label-printing/profile/';
const SIZE_KEY_PREFIX = 'rm-automotive-label-printing/size/';
const TOMBSTONE_KEY = 'rm-automotive-label-printing/tombstones';
const PROFILE_KIND = 'printer-profile';
const SIZE_KIND = 'custom-label-size';
const TOMBSTONE_KIND = 'label-printing-tombstones';

type LabelSettingValue = {
  kind?: string;
  profile?: PrinterProfile;
  size?: CustomLabelSize;
};

type ParsedSettings = {
  profiles: Map<string, { value: PrinterProfile; version: number }>;
  sizes: Map<string, { value: CustomLabelSize; version: number }>;
  tombstones: LabelSyncTombstones;
  tombstoneVersion?: number;
};

type SyncMutation = () => Promise<void>;

function profileKey(id: string) {
  return `${PROFILE_KEY_PREFIX}${encodeURIComponent(id)}`;
}

function sizeKey(id: string) {
  return `${SIZE_KEY_PREFIX}${encodeURIComponent(id)}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function validName(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0 && value.trim().length <= 80;
}

function validDimension(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 10 && value <= 150;
}

function parseProfile(value: unknown): PrinterProfile | undefined {
  if (!isRecord(value) || typeof value.id !== 'string' || !validName(value.name)) return undefined;
  return { id: value.id, name: value.name.trim() };
}

function parseSize(value: unknown): CustomLabelSize | undefined {
  if (
    !isRecord(value)
    || typeof value.id !== 'string'
    || !validName(value.name)
    || !validDimension(value.widthMm)
    || !validDimension(value.heightMm)
  ) {
    return undefined;
  }
  return {
    id: value.id,
    name: value.name.trim(),
    widthMm: value.widthMm,
    heightMm: value.heightMm,
  };
}

function normalizeTombstones(value: unknown): LabelSyncTombstones {
  if (!isRecord(value)) return { profiles: [], sizes: [] };
  const profiles = Array.isArray(value.profiles)
    ? value.profiles.filter((id): id is string => typeof id === 'string' && id.length > 0)
    : [];
  const sizes = Array.isArray(value.sizes)
    ? value.sizes.filter((id): id is string => typeof id === 'string' && id.length > 0)
    : [];
  return {
    profiles: Array.from(new Set(profiles)),
    sizes: Array.from(new Set(sizes)),
  };
}

function sameIds(left: string[], right: string[]) {
  if (left.length !== right.length) return false;
  const rightSet = new Set(right);
  return left.every((id) => rightSet.has(id));
}

function mergeTombstones(left: LabelSyncTombstones, right: LabelSyncTombstones): LabelSyncTombstones {
  return {
    profiles: Array.from(new Set([...left.profiles, ...right.profiles])),
    sizes: Array.from(new Set([...left.sizes, ...right.sizes])),
  };
}

function parseSettings(settings: SyncSetting[]): ParsedSettings {
  const profiles = new Map<string, { value: PrinterProfile; version: number }>();
  const sizes = new Map<string, { value: CustomLabelSize; version: number }>();
  let tombstones: LabelSyncTombstones = { profiles: [], sizes: [] };
  let tombstoneVersion: number | undefined;

  settings.forEach((setting) => {
    if (setting.key === TOMBSTONE_KEY) {
      tombstones = normalizeTombstones(setting.value);
      tombstoneVersion = setting.version;
      return;
    }
    if (setting.key.startsWith(PROFILE_KEY_PREFIX)) {
      const value = setting.value as LabelSettingValue;
      const profile = parseProfile(value.profile);
      if (profile && profile.id !== DEFAULT_PRINTER_PROFILE.id) {
        profiles.set(profile.id, { value: profile, version: setting.version });
      }
      return;
    }
    if (setting.key.startsWith(SIZE_KEY_PREFIX)) {
      const value = setting.value as LabelSettingValue;
      const size = parseSize(value.size);
      if (size) sizes.set(size.id, { value: size, version: setting.version });
    }
  });

  return { profiles, sizes, tombstones, tombstoneVersion };
}

function errorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message) return error.message;
  return fallback;
}

function hasStatus(error: unknown, status: number) {
  return isRecord(error) && error.status === status;
}

function customProfiles(profiles: PrinterProfile[]) {
  return profiles.filter((profile) => profile.id !== DEFAULT_PRINTER_PROFILE.id);
}

function normalizeProfiles(profiles: PrinterProfile[]) {
  const seen = new Set<string>();
  return profiles.filter((profile) => {
    if (profile.id === DEFAULT_PRINTER_PROFILE.id || seen.has(profile.id)) return false;
    seen.add(profile.id);
    return true;
  });
}

function normalizeSizes(sizes: CustomLabelSize[]) {
  const seenIds = new Set<string>();
  const seenDimensions = new Set<string>();
  return sizes.filter((size) => {
    const dimensions = `${size.widthMm}:${size.heightMm}`;
    if (seenIds.has(size.id) || seenDimensions.has(dimensions)) return false;
    seenIds.add(size.id);
    seenDimensions.add(dimensions);
    return true;
  });
}

export function useLabelPrintingSync(open: boolean) {
  const localProfiles = useState<PrinterProfile[]>(loadPrinterProfiles)[0];
  const localSizes = useState<CustomLabelSize[]>(loadCustomLabelSizes)[0];
  const [profiles, setProfiles] = useState<PrinterProfile[]>(localProfiles);
  const [customSizes, setCustomSizes] = useState<CustomLabelSize[]>(localSizes);
  const [syncError, setSyncError] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const requestIdRef = useRef(0);
  const pendingMutationsRef = useRef(0);
  const queuedRefreshRef = useRef(false);
  const versionsRef = useRef<ParsedSettings>({
    profiles: new Map(),
    sizes: new Map(),
    tombstones: loadLabelSyncTombstones(),
  });
  const hadLocalProfilesRef = useRef(customProfiles(localProfiles).length > 0);
  const hadLocalSizesRef = useRef(localSizes.length > 0);

  const applySnapshot = useCallback((parsed: ParsedSettings, persistCache: boolean) => {
    const nextProfiles = [
      DEFAULT_PRINTER_PROFILE,
      ...normalizeProfiles(
        Array.from(parsed.profiles.values())
          .filter(({ value }) => !parsed.tombstones.profiles.includes(value.id))
          .map(({ value }) => value),
      ),
    ];
    const nextSizes = normalizeSizes(
      Array.from(parsed.sizes.values())
        .filter(({ value }) => !parsed.tombstones.sizes.includes(value.id))
        .map(({ value }) => value),
    );
    versionsRef.current = parsed;
    setProfiles(nextProfiles);
    setCustomSizes(nextSizes);
    if (customProfiles(nextProfiles).length > 0) hadLocalProfilesRef.current = true;
    if (nextSizes.length > 0) hadLocalSizesRef.current = true;

    // Do not create a default-only local collection as a side effect of the
    // dialog mounting. Once a user has local data, or migration is complete,
    // the browser cache can safely follow the server snapshot.
    if (
      persistCache
      && (customProfiles(nextProfiles).length > 0 || hadLocalProfilesRef.current)
    ) {
      savePrinterProfiles(nextProfiles);
    }
    if (
      persistCache
      && (nextSizes.length > 0 || hadLocalSizesRef.current)
    ) {
      saveCustomLabelSizes(nextSizes);
    }
    if (
      parsed.tombstones.profiles.length > 0
      || parsed.tombstones.sizes.length > 0
      || parsed.tombstoneVersion !== undefined
    ) {
      saveLabelSyncTombstones(parsed.tombstones);
    }
  }, []);

  const importLocalSettings = useCallback(async (settings: SyncSetting[]) => {
    const migrationComplete = loadLabelSyncMigrationComplete();
    const localTombstones = loadLabelSyncTombstones();
    let parsed = parseSettings(settings);
    const mergedTombstones = mergeTombstones(parsed.tombstones, localTombstones);

    // Settings have no API tombstone table (the existing tombstone table is
    // for business records), so retain deletion IDs in a shared registry
    // setting. This prevents an old browser cache from re-importing a setting
    // deleted on another device.
    if (
      !sameIds(mergedTombstones.profiles, parsed.tombstones.profiles)
      || !sameIds(mergedTombstones.sizes, parsed.tombstones.sizes)
    ) {
      const tombstone = await upsertSyncSetting(TOMBSTONE_KEY, {
        value: { kind: TOMBSTONE_KIND, ...mergedTombstones },
        ...(parsed.tombstoneVersion === undefined ? {} : { expectedVersion: parsed.tombstoneVersion }),
      });
      settings = settings.filter((setting) => setting.key !== TOMBSTONE_KEY);
      settings.push(tombstone);
      parsed = parseSettings(settings);
    }

    if (!migrationComplete) {
      const importedProfiles = customProfiles(localProfiles).filter(
        (profile) => !parsed.tombstones.profiles.includes(profile.id) && !parsed.profiles.has(profile.id),
      );
      const importedSizes = localSizes.filter(
        (size) => !parsed.tombstones.sizes.includes(size.id) && !parsed.sizes.has(size.id),
      );

      for (const profile of importedProfiles) {
        try {
          const created = await upsertSyncSetting(profileKey(profile.id), {
            value: { kind: PROFILE_KIND, profile },
          });
          settings.push(created);
        } catch (error) {
          // A second browser may have created this id while migration was in
          // flight. The server's value wins; any other error must be visible.
          if (!hasStatus(error, 409)) throw error;
        }
      }
      for (const size of importedSizes) {
        try {
          const created = await upsertSyncSetting(sizeKey(size.id), {
            value: { kind: SIZE_KIND, size },
          });
          settings.push(created);
        } catch (error) {
          if (!hasStatus(error, 409)) throw error;
        }
      }
      markLabelSyncMigrationComplete();
      settings = await listSyncSettings();
      parsed = parseSettings(settings);
    }

    return parsed;
  }, [localProfiles, localSizes]);

  const syncNow = useCallback(async (initial = false) => {
    const requestId = ++requestIdRef.current;
    if (initial) setLoading(true);
    try {
      const settings = await listSyncSettings();
      const parsed = await importLocalSettings(settings);
      if (requestId !== requestIdRef.current) return;
      applySnapshot(parsed, true);
      setSyncError('');
    } catch (error) {
      if (requestId === requestIdRef.current) {
        setSyncError(errorMessage(error, 'Etikečių nustatymų iš serverio įkelti nepavyko.'));
      }
      throw error;
    } finally {
      if (requestId === requestIdRef.current && initial) setLoading(false);
    }
  }, [applySnapshot, importLocalSettings]);

  const refresh = useCallback(async () => {
    if (pendingMutationsRef.current > 0) {
      queuedRefreshRef.current = true;
      return;
    }
    try {
      await syncNow(false);
    } catch {
      // The visible syncError contains the actionable API error.
    }
  }, [syncNow]);

  useEffect(() => {
    if (!open) return undefined;
    let cancelled = false;
    const load = async () => {
      try {
        await syncNow(true);
      } catch {
        // The dialog renders syncError and keeps the local draft values.
      }
    };
    void load();
    const refreshOnFocus = () => {
      if (!cancelled) void refresh();
    };
    const timer = window.setInterval(() => {
      if (!cancelled) void refresh();
    }, 8_000);
    window.addEventListener('focus', refreshOnFocus);
    return () => {
      cancelled = true;
      window.removeEventListener('focus', refreshOnFocus);
      window.clearInterval(timer);
      requestIdRef.current += 1;
    };
  }, [open, refresh, syncNow]);

  const runMutation = useCallback(async (operation: SyncMutation) => {
    pendingMutationsRef.current += 1;
    setSaving(true);
    try {
      await operation();
      await syncNow(false);
    } catch (error) {
      const message = errorMessage(error, 'Etikečių nustatymo išsaugoti nepavyko.');
      setSyncError(message);
      // Pull the winning revision after a conflict without hiding the
      // mutation error that the editor is displaying.
      try {
        await syncNow(false);
      } catch {
        // Keep the original mutation error visible.
      }
      throw new Error(message);
    } finally {
      pendingMutationsRef.current = Math.max(0, pendingMutationsRef.current - 1);
      setSaving(pendingMutationsRef.current > 0);
      if (pendingMutationsRef.current === 0 && queuedRefreshRef.current) {
        queuedRefreshRef.current = false;
        void refresh();
      }
    }
  }, [refresh, syncNow]);

  const saveProfile = useCallback(async (profile: PrinterProfile, expectedVersion?: number) => {
    if (profile.id === DEFAULT_PRINTER_PROFILE.id) {
      throw new Error('Numatytojo profilio keisti negalima.');
    }
    if (versionsRef.current.tombstones.profiles.includes(profile.id)) {
      throw new Error('Šis profilis ištrintas kitame įrenginyje. Įkelkite profilių sąrašą iš naujo.');
    }
    const currentVersion = expectedVersion ?? versionsRef.current.profiles.get(profile.id)?.version;
    await runMutation(async () => {
      await upsertSyncSetting(profileKey(profile.id), {
        value: { kind: PROFILE_KIND, profile },
        ...(currentVersion === undefined ? {} : { expectedVersion: currentVersion }),
      });
    });
  }, [runMutation]);

  const saveSize = useCallback(async (size: CustomLabelSize, expectedVersion?: number) => {
    if (versionsRef.current.tombstones.sizes.includes(size.id)) {
      throw new Error('Šis formatas ištrintas kitame įrenginyje. Įkelkite formatų sąrašą iš naujo.');
    }
    const currentVersion = expectedVersion ?? versionsRef.current.sizes.get(size.id)?.version;
    await runMutation(async () => {
      await upsertSyncSetting(sizeKey(size.id), {
        value: { kind: SIZE_KIND, size },
        ...(currentVersion === undefined ? {} : { expectedVersion: currentVersion }),
      });
    });
  }, [runMutation]);

  const deleteSetting = useCallback(async (kind: keyof LabelSyncTombstones, id: string) => {
    const current = versionsRef.current;
    const nextTombstones = mergeTombstones(current.tombstones, {
      profiles: kind === 'profiles' ? [id] : [],
      sizes: kind === 'sizes' ? [id] : [],
    });
    await runMutation(async () => {
      // Persist the tombstone first. Even if an old browser is still open,
      // its next migration will see this ID and will not recreate the item.
      const tombstone = await upsertSyncSetting(TOMBSTONE_KEY, {
        value: { kind: TOMBSTONE_KIND, ...nextTombstones },
        ...(current.tombstoneVersion === undefined ? {} : { expectedVersion: current.tombstoneVersion }),
      });
      versionsRef.current.tombstones = nextTombstones;
      versionsRef.current.tombstoneVersion = tombstone.version;
      const key = kind === 'profiles' ? profileKey(id) : sizeKey(id);
      try {
        await deleteSyncSetting(key);
      } catch (error) {
        // Deleting an item already removed by another device is an
        // idempotent success; the shared tombstone is still authoritative.
        if (!hasStatus(error, 404)) throw error;
      }
      addLabelSyncTombstone(kind, id);
    });
  }, [runMutation]);

  return {
    profiles,
    customSizes,
    loading,
    saving,
    syncError,
    refresh,
    saveProfile,
    saveSize,
    profileRevision: (id: string) => versionsRef.current.profiles.get(id)?.version,
    sizeRevision: (id: string) => versionsRef.current.sizes.get(id)?.version,
    deleteProfile: (id: string) => deleteSetting('profiles', id),
    deleteSize: (id: string) => deleteSetting('sizes', id),
  };
}