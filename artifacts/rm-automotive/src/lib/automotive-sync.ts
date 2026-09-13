import type {
  DonorImportInput,
  PartImportInput,
  VehicleImportInput,
} from '@workspace/api-client-react';

export type Expense = {
  id: string;
  label: string;
  amount: number;
  date: string;
  category?: string;
};

export type Vehicle = {
  id: string;
  year: number;
  make: string;
  model: string;
  engine: string;
  fuel: string;
  mileage: number;
  purchasePrice: number;
  expenses: Expense[];
  status: 'active' | 'sold';
  salePrice?: number;
  askingPrice?: number;
  purchaseDate?: string;
  vin?: string;
  registration?: string;
  location?: string;
  source?: string;
  notes?: string;
  createdAt: string;
  soldAt?: string;
  version?: number;
  updatedAt?: string;
};

export type Part = {
  id: string;
  dbId?: number;
  publicId?: string;
  name: string;
  code: string;
  price: number;
  status: 'inventory' | 'sold';
  location?: string;
  createdAt: string;
  soldAt?: string;
  updatedAt?: string;
};

export type PartsCar = {
  id: string;
  year: number;
  make: string;
  model: string;
  engine: string;
  fuel: string;
  mileage: number;
  purchasePrice: number;
  status: 'active' | 'closed';
  parts: Part[];
  location?: string;
  createdAt: string;
  version?: number;
  updatedAt?: string;
};

type LegacyStorage<T> = {
  present: boolean;
  value: T[];
  error?: string;
};

const VEHICLES_KEY = 'rm-automotive-vehicles-v1';
const PARTS_KEY = 'rm-automotive-partscars-v1';
export const BUSINESS_MIGRATION_KEY = 'rm-automotive-business-import-v1';

function browserStorage() {
  return typeof window !== 'undefined' ? window.localStorage : undefined;
}

function readArray<T>(key: string): LegacyStorage<T> {
  const storage = browserStorage();
  if (!storage) return { present: false, value: [] };
  const raw = storage.getItem(key);
  if (raw === null) return { present: false, value: [] };
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return {
        present: true,
        value: [],
        error: `Naršyklės saugyklos įrašas „${key}“ nėra masyvas.`,
      };
    }
    return { present: true, value: parsed as T[] };
  } catch (error) {
    return {
      present: true,
      value: [],
      error: `Naršyklės saugyklos įrašo „${key}“ nepavyko perskaityti: ${error instanceof Error ? error.message : 'neteisingas JSON'}`,
    };
  }
}

export function readLegacyBusinessData() {
  return {
    vehicles: readArray<Vehicle>(VEHICLES_KEY),
    donors: readArray<PartsCar>(PARTS_KEY),
  };
}

function isoDate(value: string | undefined, fallback = new Date().toISOString()) {
  if (!value) return fallback;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? fallback : parsed.toISOString();
}

function validVehicle(value: Vehicle): VehicleImportInput['vehicles'][number] | null {
  if (!value || typeof value.id !== 'string' || !value.id.trim()) return null;
  if (!value.make || !value.model || !value.engine || !value.fuel) return null;
  return {
    id: value.id,
    year: Number(value.year),
    make: value.make,
    model: value.model,
    engine: value.engine,
    fuel: value.fuel,
    mileage: Number(value.mileage),
    purchasePrice: Number(value.purchasePrice),
     status: value.status === 'sold' ? 'sold' : 'active',
    ...(value.salePrice !== undefined ? { salePrice: Number(value.salePrice) } : {}),
    ...(value.askingPrice !== undefined ? { askingPrice: Number(value.askingPrice) } : {}),
    ...(value.purchaseDate !== undefined ? { purchaseDate: value.purchaseDate } : {}),
    ...(value.vin !== undefined ? { vin: value.vin } : {}),
    ...(value.registration !== undefined ? { registration: value.registration } : {}),
    ...(value.location !== undefined ? { location: value.location } : {}),
    ...(value.source !== undefined ? { source: value.source } : {}),
    ...(value.notes !== undefined ? { notes: value.notes } : {}),
    ...(value.soldAt !== undefined ? { soldAt: value.soldAt } : {}),
    createdAt: isoDate(value.createdAt),
    expenses: (Array.isArray(value.expenses) ? value.expenses : [])
      .filter((expense) => expense && typeof expense.id === 'string')
      .map((expense) => ({
        id: expense.id,
        label: expense.label,
        amount: Number(expense.amount),
         date: isoDate(expense.date).slice(0, 10),
        ...(expense.category !== undefined ? { category: expense.category } : {}),
        createdAt: isoDate(expense.date),
      })),
  };
}

function validDonor(value: PartsCar): DonorImportInput['donors'][number] | null {
  if (!value || typeof value.id !== 'string' || !value.id.trim()) return null;
  if (!value.make || !value.model || !value.engine || !value.fuel) return null;
  return {
    id: value.id,
    year: Number(value.year),
    make: value.make,
    model: value.model,
    engine: value.engine,
    fuel: value.fuel,
    mileage: Number(value.mileage),
    purchasePrice: Number(value.purchasePrice),
     status: value.status === 'closed' ? 'closed' : 'active',
    location: value.location,
    createdAt: isoDate(value.createdAt),
  };
}

export function legacyVehiclesForImport(values: Vehicle[]) {
  return values
    .map(validVehicle)
    .filter((value): value is NonNullable<typeof value> => Boolean(value));
}

export function legacyDonorsForImport(values: PartsCar[]) {
  return values
    .map(validDonor)
    .filter((value): value is NonNullable<typeof value> => Boolean(value));
}

export function legacyPartsForImport(donors: PartsCar[]): PartImportInput['parts'] {
  return donors
    .flatMap((donor) =>
      (Array.isArray(donor.parts) ? donor.parts : [])
        .filter((part) => !part.dbId && typeof part.id === 'string' && part.id.length > 0)
        .map((part) => ({
          legacyId: part.id,
          donorId: donor.id,
          donorLabel: `${donor.year} ${donor.make} ${donor.model}`,
          name: part.name,
          code: part.code,
          price: Number(part.price),
          status: part.status === 'sold' ? 'sold' : 'inventory',
          ...(part.location ? { location: part.location } : {}),
          createdAt: isoDate(part.createdAt),
          ...(part.soldAt ? { soldAt: isoDate(part.soldAt) } : {}),
        })),
    );
}

export function mapPartsCar(
  donor: {
    id: string;
    year: number;
    make: string;
    model: string;
    engine: string;
    fuel: string;
    mileage: number;
    purchasePrice: number;
    status: 'active' | 'closed';
    location?: string | null;
    createdAt: string;
    version: number;
    updatedAt: string;
  },
  parts: Part[],
): PartsCar {
  return {
    ...donor,
    location: donor.location ?? undefined,
    parts,
  };
}