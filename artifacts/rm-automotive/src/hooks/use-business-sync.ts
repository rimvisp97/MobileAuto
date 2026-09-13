import { useCallback, useEffect, useRef, useState } from 'react';
import {
  createDonor,
  createPart,
  createVehicle,
  createVehicleExpense,
  deleteDonor,
  deletePart,
  deleteVehicle,
  importDonors,
  importParts,
  importVehicles,
  listDonors,
  listParts,
  listVehicles,
  updateDonor,
  updatePart,
  updateVehicle,
  updateVehicleExpense,
} from '@workspace/api-client-react';
import type {
  Donor,
  Part as ApiPart,
  VehicleInput,
  VehicleUpdate,
} from '@workspace/api-client-react';
import {
  BUSINESS_MIGRATION_KEY,
  legacyDonorsForImport,
  legacyPartsForImport,
  legacyVehiclesForImport,
  mapPartsCar,
  readLegacyBusinessData,
  type Expense,
  type Part,
  type PartsCar,
  type Vehicle,
} from '@/lib/automotive-sync';

type VehicleDraft = Omit<Vehicle, 'id' | 'createdAt' | 'expenses' | 'status' | 'version' | 'updatedAt'> & {
  id?: string;
  version?: number;
};

type DonorDraft = Omit<PartsCar, 'id' | 'createdAt' | 'parts' | 'status' | 'version' | 'updatedAt'> & {
  id?: string;
  version?: number;
};

type ExpenseDraft = Omit<Expense, 'id'>;

function uid(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback;
}

function apiPartToPart(part: ApiPart): Part {
  return {
    id: String(part.id),
    dbId: part.id,
    publicId: part.publicId,
    name: part.name,
    code: part.code,
    price: part.price,
    status: part.status,
    location: part.location ?? undefined,
    createdAt: part.createdAt,
    soldAt: part.soldAt ?? undefined,
    updatedAt: part.updatedAt,
  };
}

function apiVehicleToVehicle(vehicle: Awaited<ReturnType<typeof listVehicles>>[number]): Vehicle {
  return {
    id: vehicle.id,
    year: vehicle.year,
    make: vehicle.make,
    model: vehicle.model,
    engine: vehicle.engine,
    fuel: vehicle.fuel,
    mileage: vehicle.mileage,
    purchasePrice: vehicle.purchasePrice,
    status: vehicle.status,
    salePrice: vehicle.salePrice ?? undefined,
    askingPrice: vehicle.askingPrice ?? undefined,
    purchaseDate: vehicle.purchaseDate ?? undefined,
    vin: vehicle.vin ?? undefined,
    registration: vehicle.registration ?? undefined,
    location: vehicle.location ?? undefined,
    source: vehicle.source ?? undefined,
    notes: vehicle.notes ?? undefined,
    soldAt: vehicle.soldAt ?? undefined,
    version: vehicle.version,
    createdAt: vehicle.createdAt,
    updatedAt: vehicle.updatedAt,
    expenses: vehicle.expenses.map((expense) => ({
      id: expense.id,
      label: expense.label,
      amount: expense.amount,
      date: expense.date,
      category: expense.category ?? undefined,
    })),
  };
}

function apiDonorToDonor(donor: Donor) {
  return {
    id: donor.id,
    year: donor.year,
    make: donor.make,
    model: donor.model,
    engine: donor.engine,
    fuel: donor.fuel,
    mileage: donor.mileage,
    purchasePrice: donor.purchasePrice,
    status: donor.status,
    location: donor.location,
    version: donor.version,
    createdAt: donor.createdAt,
    updatedAt: donor.updatedAt,
  };
}

function hasStoredMigrationMarker() {
  try {
    return window.localStorage.getItem(BUSINESS_MIGRATION_KEY) === 'complete';
  } catch {
    return false;
  }
}

function markMigrationComplete() {
  try {
    window.localStorage.setItem(BUSINESS_MIGRATION_KEY, 'complete');
  } catch {
    // The server remains authoritative if storage is unavailable.
  }
}

export function useBusinessSync() {
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [partsCars, setPartsCars] = useState<PartsCar[]>([]);
  const [serverParts, setServerParts] = useState<ApiPart[]>([]);
  const [syncError, setSyncError] = useState<string>();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [pending, setPending] = useState(0);
  const requestId = useRef(0);
  const mutationGeneration = useRef(0);
  const pendingMutations = useRef(0);
  const queuedRefresh = useRef(false);
  const migrationPromise = useRef<Promise<void> | null>(null);
  const syncRef = useRef<((initial?: boolean) => Promise<void>) | undefined>(undefined);

  const applySnapshot = useCallback((nextVehicles: Awaited<ReturnType<typeof listVehicles>>, nextDonors: Awaited<ReturnType<typeof listDonors>>, nextParts: Awaited<ReturnType<typeof listParts>>) => {
    const normalizedParts = nextParts;
    const localPartsByDonor = new Map<string, Part[]>();
    for (const part of normalizedParts) {
      const list = localPartsByDonor.get(part.donorId) ?? [];
      list.push(apiPartToPart(part));
      localPartsByDonor.set(part.donorId, list);
    }
    setVehicles(nextVehicles.map(apiVehicleToVehicle));
    setServerParts(normalizedParts);
    setPartsCars(nextDonors.map((donor) => mapPartsCar(apiDonorToDonor(donor), localPartsByDonor.get(donor.id) ?? [])));
  }, []);

  const migrateLegacy = useCallback(async () => {
    if (hasStoredMigrationMarker()) return;
    const legacy = readLegacyBusinessData();
    const storageErrors = [legacy.vehicles.error, legacy.donors.error].filter(
      (error): error is string => Boolean(error),
    );
    if (storageErrors.length > 0) {
      throw new Error(storageErrors.join(' '));
    }
    const vehiclePayload = legacyVehiclesForImport(legacy.vehicles.value);
    const donorPayload = legacyDonorsForImport(legacy.donors.value);
    const partPayload = legacyPartsForImport(legacy.donors.value);
    if (
      legacy.vehicles.present &&
      vehiclePayload.length !== legacy.vehicles.value.length
    ) {
      throw new Error('Kai kurie seni automobilio įrašai yra netinkami importui; jie nebuvo pašalinti iš naršyklės saugyklos.');
    }
    if (
      legacy.donors.present &&
      donorPayload.length !== legacy.donors.value.length
    ) {
      throw new Error('Kai kurie seni donoro įrašai yra netinkami importui; jie nebuvo pašalinti iš naršyklės saugyklos.');
    }
    const legacyPartCount = legacy.donors.value.reduce(
      (count, donor) =>
        count +
        (Array.isArray(donor.parts)
          ? donor.parts.filter((part) => !part.dbId).length
          : 0),
      0,
    );
    if (legacy.donors.present && partPayload.length !== legacyPartCount) {
      throw new Error('Kai kurie seni detalių įrašai yra netinkami importui; jie nebuvo pašalinti iš naršyklės saugyklos.');
    }
    // Presence, not fallback content, controls import. Empty stored arrays are
    // still marked complete after the no-op calls below.
    if (legacy.vehicles.present && vehiclePayload.length > 0) {
      await importVehicles({ vehicles: vehiclePayload });
    }
    if (legacy.donors.present && donorPayload.length > 0) {
      await importDonors({ donors: donorPayload });
    }
    if (legacy.donors.present && partPayload.length > 0) {
      await importParts({ parts: partPayload });
    }
    markMigrationComplete();
  }, []);

  const sync = useCallback(async (initial = false) => {
    if (pendingMutations.current > 0) {
      queuedRefresh.current = true;
      return;
    }
    const currentRequest = ++requestId.current;
    const generationAtStart = mutationGeneration.current;
    if (initial) setLoading(true);
    else setRefreshing(true);
    try {
      let migrationErrorMessage: string | undefined;
      if (initial || !hasStoredMigrationMarker()) {
        if (!migrationPromise.current) {
          migrationPromise.current = migrateLegacy().finally(() => {
            migrationPromise.current = null;
          });
        }
        try {
          await migrationPromise.current;
        } catch (migrationError) {
          // Continue loading server records, but keep the error visible and
          // leave the marker unset so the next retry can finish the import.
          migrationErrorMessage = errorMessage(migrationError, 'Senų naršyklės duomenų importuoti nepavyko.');
        }
      }
      const [nextVehicles, nextDonors, nextParts] = await Promise.all([
        listVehicles(),
        listDonors(),
        listParts(),
      ]);
      if (
        currentRequest !== requestId.current ||
        generationAtStart !== mutationGeneration.current ||
        pendingMutations.current > 0
      ) {
        queuedRefresh.current = true;
        return;
      }
      applySnapshot(nextVehicles, nextDonors, nextParts);
      setSyncError(migrationErrorMessage);
    } catch (loadError) {
      if (currentRequest === requestId.current) {
        setSyncError(errorMessage(loadError, 'Serverio duomenų įkelti nepavyko.'));
      }
    } finally {
      if (currentRequest === requestId.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, [applySnapshot, migrateLegacy]);

  useEffect(() => {
    syncRef.current = sync;
    void sync(true);
    const refreshOnFocus = () => {
      void syncRef.current?.(false);
    };
    window.addEventListener('focus', refreshOnFocus);
    const timer = window.setInterval(() => {
      void syncRef.current?.(false);
    }, 10_000);
    return () => {
      window.removeEventListener('focus', refreshOnFocus);
      window.clearInterval(timer);
      syncRef.current = undefined;
    };
  }, [sync]);

  const refresh = useCallback(async () => {
    await syncRef.current?.(false);
  }, []);

  const runMutation = useCallback(async <T,>(operation: () => Promise<T>) => {
    mutationGeneration.current += 1;
    pendingMutations.current += 1;
    setPending((count) => count + 1);
    try {
      const result = await operation();
      queuedRefresh.current = true;
      return result;
    } catch (error) {
      setSyncError(errorMessage(error, 'Serverio pakeitimas nepavyko.'));
      throw error;
    } finally {
      pendingMutations.current = Math.max(0, pendingMutations.current - 1);
      setPending((count) => Math.max(0, count - 1));
      if (pendingMutations.current === 0 && queuedRefresh.current) {
        queuedRefresh.current = false;
        void syncRef.current?.(false);
      }
    }
  }, []);

  const saveVehicle = useCallback(async (payload: VehicleDraft) => {
    await runMutation(async () => {
      if (payload.id) {
        const current = vehicles.find((vehicle) => vehicle.id === payload.id);
        if (!current) throw new Error('Automobilis nerastas serveryje. Įkelkite sąrašą iš naujo.');
        const update: VehicleUpdate = {
          year: payload.year,
          make: payload.make,
          model: payload.model,
          engine: payload.engine,
          fuel: payload.fuel,
          mileage: payload.mileage,
          purchasePrice: payload.purchasePrice,
          askingPrice: payload.askingPrice ?? null,
          purchaseDate: payload.purchaseDate ?? null,
          vin: payload.vin ?? null,
          registration: payload.registration ?? null,
          location: payload.location ?? null,
          source: payload.source ?? null,
          notes: payload.notes ?? null,
          expectedVersion: payload.version ?? current.version ?? 1,
        };
        await updateVehicle(payload.id, update);
      } else {
        const create: VehicleInput = {
          id: uid('veh'),
          year: payload.year,
          make: payload.make,
          model: payload.model,
          engine: payload.engine,
          fuel: payload.fuel,
          mileage: payload.mileage,
          purchasePrice: payload.purchasePrice,
          status: 'active',
          ...(payload.askingPrice !== undefined ? { askingPrice: payload.askingPrice } : {}),
          ...(payload.purchaseDate ? { purchaseDate: payload.purchaseDate } : {}),
          ...(payload.vin ? { vin: payload.vin } : {}),
          ...(payload.registration ? { registration: payload.registration } : {}),
          ...(payload.location ? { location: payload.location } : {}),
          ...(payload.source ? { source: payload.source } : {}),
          ...(payload.notes ? { notes: payload.notes } : {}),
        };
        await createVehicle(create);
      }
    });
  }, [runMutation, vehicles]);

  const addExpense = useCallback(async (vehicleId: string, payload: ExpenseDraft) => {
    await runMutation(() =>
      createVehicleExpense(vehicleId, {
        id: uid('exp'),
        label: payload.label,
        amount: payload.amount,
        date: payload.date,
        ...(payload.category ? { category: payload.category } : {}),
      }),
    );
  }, [runMutation]);

  const markSold = useCallback(async (vehicleId: string, salePrice: number, expectedVersion?: number) => {
    await runMutation(async () => {
      const current = vehicles.find((vehicle) => vehicle.id === vehicleId);
      if (!current) throw new Error('Automobilis nerastas serveryje. Įkelkite sąrašą iš naujo.');
      await updateVehicle(vehicleId, {
        status: 'sold',
        salePrice,
        soldAt: new Date().toISOString().slice(0, 10),
        expectedVersion: expectedVersion ?? current.version ?? 1,
      });
    });
  }, [runMutation, vehicles]);

  const deleteVehicleRecord = useCallback(async (vehicleId: string) => {
    await runMutation(() => deleteVehicle(vehicleId));
  }, [runMutation]);

  const saveDonor = useCallback(async (payload: DonorDraft) => {
    await runMutation(async () => {
      if (payload.id) {
        const current = partsCars.find((donor) => donor.id === payload.id);
        if (!current) throw new Error('Donoras nerastas serveryje. Įkelkite sąrašą iš naujo.');
        await updateDonor(payload.id, {
          year: payload.year,
          make: payload.make,
          model: payload.model,
          engine: payload.engine,
          fuel: payload.fuel,
          mileage: payload.mileage,
          purchasePrice: payload.purchasePrice,
          location: payload.location ?? null,
          expectedVersion: payload.version ?? current.version ?? 1,
        });
      } else {
        await createDonor({
          id: uid('parts'),
          year: payload.year,
          make: payload.make,
          model: payload.model,
          engine: payload.engine,
          fuel: payload.fuel,
          mileage: payload.mileage,
          purchasePrice: payload.purchasePrice,
          status: 'active',
          ...(payload.location ? { location: payload.location } : {}),
        });
      }
    });
  }, [partsCars, runMutation]);

  const deleteDonorRecord = useCallback(async (donorId: string, preserveParts: boolean) => {
    await runMutation(() => deleteDonor(donorId, { preserveParts }));
  }, [runMutation]);

  const addPartRecord = useCallback(async (donorId: string, payload: Pick<Part, 'name' | 'code' | 'price' | 'location'>) => {
    const donor = partsCars.find((item) => item.id === donorId);
    if (!donor) throw new Error('Donoras nerastas serveryje. Įkelkite sąrašą iš naujo.');
    return runMutation(() => createPart({
      donorId: donor.id,
      donorLabel: `${donor.year} ${donor.make} ${donor.model}`,
      name: payload.name,
      code: payload.code,
      price: payload.price,
      ...(payload.location ? { location: payload.location } : {}),
    }));
  }, [partsCars, runMutation]);

  const togglePartRecord = useCallback(async (donorId: string, partId: string) => {
    const part = partsCars.find((donor) => donor.id === donorId)?.parts.find((item) => item.id === partId);
    if (!part?.dbId) throw new Error('Detalė nerasta serveryje. Įkelkite sąrašą iš naujo.');
    await runMutation(() => updatePart(part.dbId!, {
      status: part.status === 'inventory' ? 'sold' : 'inventory',
    }));
  }, [partsCars, runMutation]);

  const updatePartRecord = useCallback(async (donorId: string, partId: string, payload: Pick<Part, 'name' | 'code' | 'price' | 'location'>) => {
    const part = partsCars.find((donor) => donor.id === donorId)?.parts.find((item) => item.id === partId);
    if (!part?.dbId) throw new Error('Detalė nerasta serveryje. Įkelkite sąrašą iš naujo.');
    await runMutation(() => updatePart(part.dbId!, {
      name: payload.name,
      code: payload.code,
      price: payload.price,
      location: payload.location ?? null,
    }));
  }, [partsCars, runMutation]);

  const deletePartRecord = useCallback(async (donorId: string, partId: string) => {
    const part = partsCars.find((donor) => donor.id === donorId)?.parts.find((item) => item.id === partId);
    if (!part?.dbId) throw new Error('Detalė nerasta serveryje. Įkelkite sąrašą iš naujo.');
    await runMutation(() => deletePart(part.dbId!));
  }, [partsCars, runMutation]);

  return {
    vehicles,
    partsCars,
    serverParts,
    syncError,
    loading,
    refreshing,
    pending,
    refresh,
    saveVehicle,
    addExpense,
    markSold,
    deleteVehicle: deleteVehicleRecord,
    saveDonor,
    deleteDonor: deleteDonorRecord,
    addPart: addPartRecord,
    togglePart: togglePartRecord,
    updatePart: updatePartRecord,
    deletePart: deletePartRecord,
  };
}