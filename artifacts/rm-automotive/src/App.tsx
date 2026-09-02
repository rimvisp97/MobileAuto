import { type FormEvent, type ReactNode, useEffect, useMemo, useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ClerkProvider, SignIn, SignUp, useAuth, useClerk, useUser } from '@clerk/react';
import { publishableKeyFromHost } from '@clerk/react/internal';
import { shadcn } from '@clerk/themes';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import {
  Activity,
  ArrowDownLeft,
  ArrowUpRight,
  BadgeEuro,
  Bell,
  CarFront,
  Check,
  ChevronDown,
  CircleDollarSign,
  CirclePlus,
  ClipboardList,
  Gauge,
  LayoutDashboard,
  Menu,
  Package,
  Pencil,
  Plus,
  Search,
  Settings2,
  ShoppingCart,
  Trash2,
  TrendingUp,
  Wrench,
  X,
} from 'lucide-react';
import { Link, Redirect, Route, Router as WouterRouter, Switch, useLocation } from 'wouter';

type Expense = { id: string; label: string; amount: number; date: string; category?: string };
type Vehicle = {
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
};
type Part = {
  id: string;
  name: string;
  code: string;
  price: number;
  status: 'inventory' | 'sold';
  location?: string;
  createdAt: string;
  soldAt?: string;
};
type PartsCar = {
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
};

const queryClient = new QueryClient();
const VEHICLES_KEY = 'rm-automotive-vehicles-v1';
const PARTS_KEY = 'rm-automotive-partscars-v1';
const basePath = import.meta.env.BASE_URL.replace(/\/$/, '');
const clerkPubKey = publishableKeyFromHost(
  window.location.hostname,
  import.meta.env.VITE_CLERK_PUBLISHABLE_KEY,
);
const clerkProxyUrl = import.meta.env.VITE_CLERK_PROXY_URL;

if (!clerkPubKey) {
  throw new Error('Trūksta Clerk prisijungimo rakto.');
}

const seedVehicles: Vehicle[] = [
  {
    id: 'veh-audi',
    year: 2014,
    make: 'Audi',
    model: 'A4 Avant',
    engine: '2.0 TDI · 110 kW',
    fuel: 'Dyzelinas',
    mileage: 226400,
    purchasePrice: 5450,
    expenses: [
      { id: 'exp-audi-1', label: 'Sankabos komplektas', amount: 380, date: '2024-05-14' },
      { id: 'exp-audi-2', label: 'Kėbulo paruošimas', amount: 215, date: '2024-05-18' },
    ],
    status: 'active',
    askingPrice: 7200,
    purchaseDate: '2024-05-08',
    registration: 'ABC 412',
    location: 'Aikštelė A',
    source: 'Vokietija',
    createdAt: '2024-05-08',
  },
  {
    id: 'veh-bmw',
    year: 2011,
    make: 'BMW',
    model: '320d Touring',
    engine: '2.0 · 135 kW',
    fuel: 'Dyzelinas',
    mileage: 281800,
    purchasePrice: 4200,
    expenses: [
      { id: 'exp-bmw-1', label: 'Techninė apžiūra', amount: 42, date: '2024-04-12' },
      { id: 'exp-bmw-2', label: 'Padangos', amount: 260, date: '2024-04-16' },
    ],
    status: 'sold',
    salePrice: 5850,
    purchaseDate: '2024-04-09',
    registration: 'KLM 320',
    location: 'Parduota',
    createdAt: '2024-04-09',
    soldAt: '2024-05-02',
  },
  {
    id: 'veh-volvo',
    year: 2016,
    make: 'Volvo',
    model: 'V60 D4',
    engine: '2.0 · 140 kW',
    fuel: 'Dyzelinas',
    mileage: 194600,
    purchasePrice: 7900,
    expenses: [],
    status: 'active',
    askingPrice: 10400,
    purchaseDate: '2024-05-23',
    registration: 'HJK 608',
    location: 'Aikštelė B',
    source: 'Lietuva',
    createdAt: '2024-05-23',
  },
];

const seedPartsCars: PartsCar[] = [
  {
    id: 'parts-vw',
    year: 2010,
    make: 'Volkswagen',
    model: 'Passat B6',
    engine: '2.0 TDI · 103 kW',
    fuel: 'Dyzelinas',
    mileage: 318000,
    purchasePrice: 1680,
    status: 'active',
    createdAt: '2024-05-11',
    parts: [
      { id: 'part-vw-1', name: 'Priekinis kairės pusės žibintas', code: '3C1941005', price: 95, status: 'sold', createdAt: '2024-05-13' },
      { id: 'part-vw-2', name: 'RNS navigacija', code: '3C0035684', price: 170, status: 'inventory', createdAt: '2024-05-13' },
      { id: 'part-vw-3', name: 'Kuro purkštukas', code: '03G130073', price: 120, status: 'inventory', createdAt: '2024-05-15' },
      { id: 'part-vw-4', name: 'Galinės durys, dešinė', code: '3C0833056', price: 140, status: 'inventory', createdAt: '2024-05-17' },
    ],
  },
  {
    id: 'parts-opel',
    year: 2013,
    make: 'Opel',
    model: 'Astra J',
    engine: '1.7 CDTI · 81 kW',
    fuel: 'Dyzelinas',
    mileage: 246500,
    purchasePrice: 920,
    status: 'active',
    createdAt: '2024-05-27',
    parts: [],
  },
];

function uid(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function readStored<T>(key: string, fallback: T): T {
  try {
    const value = localStorage.getItem(key);
    return value ? JSON.parse(value) as T : fallback;
  } catch {
    return fallback;
  }
}

function money(value: number) {
  return new Intl.NumberFormat('lt-LT', { style: 'currency', currency: 'EUR', maximumFractionDigits: 2 }).format(value);
}

function shortDate(value: string) {
  return new Intl.DateTimeFormat('lt-LT', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(value));
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function monthLabel(value = today()) {
  return new Intl.DateTimeFormat('lt-LT', { month: 'long', year: 'numeric' }).format(new Date(value));
}

function totalExpenses(vehicle: Vehicle) {
  return vehicle.expenses.reduce((sum, expense) => sum + expense.amount, 0);
}

function vehicleCost(vehicle: Vehicle) {
  return vehicle.purchasePrice + totalExpenses(vehicle);
}

function AppShell() {
  const [location, setLocation] = useLocation();
  const [vehicles, setVehicles] = useState<Vehicle[]>(() => readStored(VEHICLES_KEY, seedVehicles));
  const [partsCars, setPartsCars] = useState<PartsCar[]>(() => readStored(PARTS_KEY, seedPartsCars));
  const [mobileOpen, setMobileOpen] = useState(false);
  const [modal, setModal] = useState<'vehicle' | 'expense' | 'sell' | 'partsCar' | 'part' | null>(null);
  const [selectedVehicleId, setSelectedVehicleId] = useState<string>();
  const [selectedPartsCarId, setSelectedPartsCarId] = useState<string>();
  const [selectedPartId, setSelectedPartId] = useState<string>();
  const [toast, setToast] = useState<string>();

  useEffect(() => localStorage.setItem(VEHICLES_KEY, JSON.stringify(vehicles)), [vehicles]);
  useEffect(() => localStorage.setItem(PARTS_KEY, JSON.stringify(partsCars)), [partsCars]);
  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(undefined), 2800);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const totals = useMemo(() => {
    const vehicleSpent = vehicles.reduce((sum, vehicle) => sum + vehicleCost(vehicle), 0);
    const donorSpent = partsCars.reduce((sum, car) => sum + car.purchasePrice, 0);
    const vehicleRevenue = vehicles.reduce((sum, vehicle) => sum + (vehicle.salePrice ?? 0), 0);
    const partsRevenue = partsCars.reduce((sum, car) => sum + car.parts.filter((part) => part.status === 'sold').reduce((partSum, part) => partSum + part.price, 0), 0);
    return {
      spent: vehicleSpent + donorSpent,
      vehicleRevenue,
      partsRevenue,
      vehicleProfit: vehicleRevenue - vehicleSpent,
      partsProfit: partsRevenue - donorSpent,
      profit: vehicleRevenue + partsRevenue - vehicleSpent - donorSpent,
    };
  }, [vehicles, partsCars]);

  const activity = useMemo(() => {
    const rows: MoneyRow[] = [];
    vehicles.forEach((vehicle) => {
       rows.push({ id: `${vehicle.id}-purchase`, date: vehicle.purchaseDate ?? vehicle.createdAt, label: `Nupirktas ${vehicle.make} ${vehicle.model}`, detail: 'Automobilis', amount: -vehicle.purchasePrice, kind: 'out' });
      vehicle.expenses.forEach((expense) => rows.push({ id: expense.id, date: expense.date, label: expense.label, detail: `${vehicle.make} ${vehicle.model}`, amount: -expense.amount, kind: 'out' }));
      if (vehicle.status === 'sold' && vehicle.salePrice) rows.push({ id: `${vehicle.id}-sale`, date: vehicle.soldAt ?? vehicle.createdAt, label: `Parduotas ${vehicle.make} ${vehicle.model}`, detail: 'Automobilis', amount: vehicle.salePrice, kind: 'in' });
    });
    partsCars.forEach((car) => {
      rows.push({ id: `${car.id}-purchase`, date: car.createdAt, label: `Nupirktas donoras ${car.make} ${car.model}`, detail: 'Ardomas automobilis', amount: -car.purchasePrice, kind: 'out' });
       car.parts.filter((part) => part.status === 'sold').forEach((part) => rows.push({ id: part.id, date: part.soldAt ?? part.createdAt, label: `Parduota detalė · ${part.name}`, detail: `${car.make} ${car.model}`, amount: part.price, kind: 'in' }));
    });
    return rows.sort((a, b) => b.date.localeCompare(a.date));
  }, [vehicles, partsCars]);

  function flash(message: string) {
    setToast(message);
  }

  function openModal(name: typeof modal, id?: string, partId?: string) {
    setModal(name);
    if (name === 'vehicle' || name === 'expense' || name === 'sell') setSelectedVehicleId(id);
    if (name === 'partsCar' || name === 'part') setSelectedPartsCarId(id);
    if (name === 'part') setSelectedPartId(partId);
  }

  function saveVehicle(payload: Omit<Vehicle, 'id' | 'createdAt' | 'expenses' | 'status'> & { id?: string }) {
    if (payload.id) {
      setVehicles((current) => current.map((vehicle) => vehicle.id === payload.id ? { ...vehicle, ...payload } : vehicle));
      flash('Automobilio duomenys atnaujinti');
    } else {
      setVehicles((current) => [{ ...payload, id: uid('veh'), createdAt: today(), expenses: [], status: 'active' }, ...current]);
      flash('Automobilis pridėtas į knygą');
    }
    setModal(null);
  }

  function addExpense(vehicleId: string, payload: Omit<Expense, 'id'>) {
    setVehicles((current) => current.map((vehicle) => vehicle.id === vehicleId ? { ...vehicle, expenses: [...vehicle.expenses, { ...payload, id: uid('exp') }] } : vehicle));
    setModal(null);
    flash('Išlaidos įrašytos');
  }

  function markSold(vehicleId: string, salePrice: number) {
    setVehicles((current) => current.map((vehicle) => vehicle.id === vehicleId ? { ...vehicle, status: 'sold', salePrice, soldAt: today() } : vehicle));
    setModal(null);
    flash('Automobilis pažymėtas kaip parduotas');
  }

  function deleteVehicle(id: string) {
    if (!window.confirm('Pašalinti šį automobilį ir visas jo išlaidas?')) return;
    setVehicles((current) => current.filter((vehicle) => vehicle.id !== id));
    flash('Automobilis pašalintas');
  }

  function savePartsCar(payload: Omit<PartsCar, 'id' | 'createdAt' | 'parts' | 'status'> & { id?: string }) {
    if (payload.id) {
      setPartsCars((current) => current.map((car) => car.id === payload.id ? { ...car, ...payload } : car));
      flash('Donoro duomenys atnaujinti');
    } else {
      setPartsCars((current) => [{ ...payload, id: uid('parts'), createdAt: today(), parts: [], status: 'active' }, ...current]);
      flash('Donoras pridėtas');
    }
    setModal(null);
  }

  function addPart(carId: string, payload: Omit<Part, 'id' | 'createdAt' | 'status'>) {
    setPartsCars((current) => current.map((car) => car.id === carId ? { ...car, parts: [...car.parts, { ...payload, id: uid('part'), createdAt: today(), status: 'inventory' }] } : car));
    setModal(null);
    flash('Detalė pridėta į sandėlį');
  }

  function togglePart(carId: string, partId: string) {
    setPartsCars((current) => current.map((car) => car.id === carId ? {
      ...car,
      parts: car.parts.map((part) => part.id === partId
        ? { ...part, status: part.status === 'inventory' ? 'sold' : 'inventory', soldAt: part.status === 'inventory' ? today() : undefined }
        : part),
    } : car));
    flash('Detalės būsena atnaujinta');
  }

  function updatePart(carId: string, partId: string, payload: Omit<Part, 'id' | 'createdAt' | 'status' | 'soldAt'>) {
    setPartsCars((current) => current.map((car) => car.id === carId
      ? { ...car, parts: car.parts.map((part) => part.id === partId ? { ...part, ...payload } : part) }
      : car));
    setModal(null);
    flash('Detalės duomenys atnaujinti');
  }

  function deletePart(carId: string, partId: string) {
    if (!window.confirm('Pašalinti šią detalę iš sandėlio?')) return;
    setPartsCars((current) => current.map((car) => car.id === carId ? { ...car, parts: car.parts.filter((part) => part.id !== partId) } : car));
    flash('Detalė pašalinta');
  }

  function deletePartsCar(id: string) {
    if (!window.confirm('Pašalinti donorą ir visas jo detales?')) return;
    setPartsCars((current) => current.filter((car) => car.id !== id));
    flash('Donoras pašalintas');
  }

  const page = location === '/automobiliai' ? 'vehicles' : location === '/dalys' ? 'parts' : 'dashboard';

  return (
    <div className="noise min-h-[100dvh] bg-background text-foreground">
      <Sidebar page={page} mobileOpen={mobileOpen} closeMobile={() => setMobileOpen(false)} />
      <main className="min-h-[100dvh] lg:pl-[272px]">
        <header className="sticky top-0 z-30 flex h-[72px] items-center justify-between border-b border-border/70 bg-background/90 px-5 backdrop-blur-md sm:px-8">
          <div className="flex items-center gap-3">
            <button className="rounded-lg p-2 hover-elevate lg:hidden" onClick={() => setMobileOpen(true)} aria-label="Atidaryti meniu" data-testid="button-open-menu"><Menu size={21} /></button>
            <div className="hidden items-center gap-2 text-sm text-muted-foreground sm:flex"><span className="font-mono-ui text-[11px] uppercase tracking-[0.18em]">RM /</span><span>{page === 'dashboard' ? 'Pagrindinis' : page === 'vehicles' ? 'Automobiliai' : 'Dalys'}</span></div>
            <div className="flex items-center gap-2 sm:hidden"><span className="font-mono-ui text-[11px] font-bold tracking-[0.14em]">RM</span><span className="text-muted-foreground">/</span><span className="text-sm font-semibold">{page === 'dashboard' ? 'Pagrindinis' : page === 'vehicles' ? 'Automobiliai' : 'Dalys'}</span></div>
          </div>
          <div className="flex items-center gap-3">
            <div className="hidden items-center gap-2 rounded-full border border-border bg-card px-3 py-1.5 text-xs text-muted-foreground md:flex"><span className="h-1.5 w-1.5 rounded-full bg-secondary" /> Duomenys saugomi šiame įrenginyje</div>
            <button className="relative rounded-lg p-2 text-muted-foreground hover-elevate" aria-label="Pranešimai" data-testid="button-notifications"><Bell size={18} /><span className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-primary" /></button>
             <AccountMenu />
          </div>
        </header>
        <div className="app-shell min-h-[calc(100dvh-72px)] p-5 sm:p-8">
          {page === 'dashboard' && <Dashboard totals={totals} activity={activity} vehicles={vehicles} partsCars={partsCars} navigate={setLocation} />}
          {page === 'vehicles' && <VehiclesPage vehicles={vehicles} openModal={openModal} deleteVehicle={deleteVehicle} />}
          {page === 'parts' && <PartsPage partsCars={partsCars} openModal={openModal} togglePart={togglePart} deletePartsCar={deletePartsCar} deletePart={deletePart} />}
        </div>
      </main>
      {modal === 'vehicle' && <VehicleModal vehicle={vehicles.find((vehicle) => vehicle.id === selectedVehicleId)} close={() => setModal(null)} save={saveVehicle} />}
      {modal === 'expense' && <ExpenseModal vehicle={vehicles.find((vehicle) => vehicle.id === selectedVehicleId)} close={() => setModal(null)} save={addExpense} />}
      {modal === 'sell' && <SellModal vehicle={vehicles.find((vehicle) => vehicle.id === selectedVehicleId)} close={() => setModal(null)} save={markSold} />}
      {modal === 'partsCar' && <PartsCarModal car={partsCars.find((car) => car.id === selectedPartsCarId)} close={() => setModal(null)} save={savePartsCar} />}
      {modal === 'part' && <PartModal car={partsCars.find((car) => car.id === selectedPartsCarId)} part={partsCars.find((car) => car.id === selectedPartsCarId)?.parts.find((part) => part.id === selectedPartId)} close={() => setModal(null)} save={addPart} update={updatePart} />}
      {toast && <div className="fixed bottom-5 right-5 z-[60] flex items-center gap-2 rounded-xl border border-secondary/30 bg-card px-4 py-3 text-sm font-medium shadow-lg reveal" role="status" data-testid="status-toast"><span className="flex h-5 w-5 items-center justify-center rounded-full bg-secondary text-secondary-foreground"><Check size={13} /></span>{toast}</div>}
    </div>
  );
}

type PageName = 'dashboard' | 'vehicles' | 'parts';
function Sidebar({ page, mobileOpen, closeMobile }: { page: PageName; mobileOpen: boolean; closeMobile: () => void }) {
  return (
    <>
      {mobileOpen && <button className="fixed inset-0 z-40 bg-foreground/40 lg:hidden" onClick={closeMobile} aria-label="Uždaryti meniu" data-testid="button-close-overlay" />}
      <aside className={`fixed inset-y-0 left-0 z-50 flex w-[272px] flex-col bg-sidebar text-sidebar-foreground transition-transform duration-200 lg:translate-x-0 ${mobileOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="flex h-[72px] items-center justify-between border-b border-sidebar-border px-6">
          <Link href="/" className="flex items-center gap-3" onClick={closeMobile} data-testid="link-brand">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-sidebar-primary font-mono-ui text-sm font-bold text-sidebar-primary-foreground">RM</span>
            <span><span className="block text-[15px] font-bold tracking-tight">RM Automotive</span><span className="font-mono-ui text-[9px] uppercase tracking-[0.18em] text-sidebar-foreground/50">operator's ledger</span></span>
          </Link>
          <button className="rounded-md p-1.5 text-sidebar-foreground/60 hover:bg-sidebar-accent lg:hidden" onClick={closeMobile} aria-label="Uždaryti meniu" data-testid="button-close-menu"><X size={18} /></button>
        </div>
        <div className="flex-1 px-4 py-7">
          <p className="mb-3 px-3 font-mono-ui text-[10px] uppercase tracking-[0.18em] text-sidebar-foreground/40">Darbo stalas</p>
          <nav className="space-y-1">
            <NavLink href="/" icon={<LayoutDashboard size={18} />} active={page === 'dashboard'} label="Pagrindinis" onClick={closeMobile} testId="link-dashboard" />
            <NavLink href="/automobiliai" icon={<CarFront size={18} />} active={page === 'vehicles'} label="Automobiliai" onClick={closeMobile} testId="link-vehicles" />
            <NavLink href="/dalys" icon={<Package size={18} />} active={page === 'parts'} label="Dalys" onClick={closeMobile} />
          </nav>
          <p className="mb-3 mt-10 px-3 font-mono-ui text-[10px] uppercase tracking-[0.18em] text-sidebar-foreground/40">Sistema</p>
          <nav className="space-y-1">
            <button className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-sidebar-foreground/45" disabled data-testid="button-settings"><Settings2 size={18} /> Nustatymai <span className="ml-auto font-mono-ui text-[9px] uppercase">greitai</span></button>
          </nav>
        </div>
        <div className="mx-4 mb-5 rounded-xl border border-sidebar-border bg-sidebar-accent/55 p-4">
          <div className="mb-3 flex items-center justify-between"><span className="font-mono-ui text-[10px] uppercase tracking-[0.16em] text-sidebar-foreground/45">Šiandien</span><Activity size={15} className="text-sidebar-primary" /></div>
          <p className="text-sm font-medium text-sidebar-foreground/85">Tvarkinga knyga.</p>
          <p className="mt-1 text-xs leading-5 text-sidebar-foreground/50">Kiekvienas pirkimas, remontas ir pardavimas vienoje vietoje.</p>
        </div>
      </aside>
    </>
  );
}

function NavLink({ href, icon, label, active, onClick, testId }: { href: string; icon: ReactNode; label: string; active: boolean; onClick: () => void; testId?: string }) {
  return <Link href={href} onClick={onClick} className={`group flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors ${active ? 'bg-sidebar-primary font-semibold text-sidebar-primary-foreground' : 'text-sidebar-foreground/65 hover:bg-sidebar-accent hover:text-sidebar-foreground'}`} data-testid={testId ?? `link-${label}`}>{icon}<span>{label}</span>{active && <span className="ml-auto h-1.5 w-1.5 rounded-full bg-sidebar-primary-foreground/70" />}</Link>;
}

type MoneyRow = { id: string; date: string; label: string; detail: string; amount: number; kind: 'in' | 'out' };
type DashboardProps = { totals: { spent: number; vehicleRevenue: number; partsRevenue: number; vehicleProfit: number; partsProfit: number; profit: number }; activity: MoneyRow[]; vehicles: Vehicle[]; partsCars: PartsCar[]; navigate: (path: string) => void };
function Dashboard({ totals, activity, vehicles, partsCars, navigate }: DashboardProps) {
  const [historyFilter, setHistoryFilter] = useState<'all' | 'in' | 'out'>('all');
  const [showAllHistory, setShowAllHistory] = useState(false);
  const soldVehicles = vehicles.filter((vehicle) => vehicle.status === 'sold');
  const inventoryValue = vehicles.filter((vehicle) => vehicle.status === 'active').reduce((sum, vehicle) => sum + vehicleCost(vehicle), 0) + partsCars.reduce((sum, car) => sum + car.parts.filter((part) => part.status === 'inventory').reduce((p, part) => p + part.price, 0), 0);
  const filteredActivity = activity.filter((row) => historyFilter === 'all' || row.kind === historyFilter);
  const visibleActivity = showAllHistory ? filteredActivity : filteredActivity.slice(0, 10);
  const activeVehicles = vehicles.filter((vehicle) => vehicle.status === 'active');
  const forecastProfit = activeVehicles.reduce((sum, vehicle) => sum + ((vehicle.askingPrice ?? 0) - vehicleCost(vehicle)), 0);
  return (
    <section className="mx-auto max-w-[1480px]">
      <div className="mb-8 flex flex-col justify-between gap-5 md:flex-row md:items-end">
        <div className="reveal"><p className="mb-3 font-mono-ui text-[11px] uppercase tracking-[0.2em] text-secondary">RM / {monthLabel()}</p><h1 className="text-3xl font-bold tracking-tight sm:text-[38px]">Pagrindinis<span className="text-primary">.</span></h1><p className="mt-2 max-w-md text-sm text-muted-foreground">Tavo dirbtuvių knyga, kur skaičiai kalba tiesiai.</p></div>
        <div className="flex gap-2 reveal reveal-delay-1"><button onClick={() => navigate('/automobiliai')} className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-bold text-primary-foreground shadow-sm transition-transform hover:-translate-y-0.5" data-testid="button-add-vehicle"><Plus size={17} /> Naujas automobilis</button><button onClick={() => navigate('/dalys')} className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-4 py-2.5 text-sm font-semibold hover-elevate" data-testid="button-open-parts"><Package size={16} /> Dalys</button></div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Išleista" value={totals.spent} hint="pirkimai + išlaidos" icon={<ArrowDownLeft size={18} />} tone="orange" />
         <MetricCard label="Suprekiauta dalimis" value={totals.partsRevenue} hint="parduotos detalės" profit={totals.partsProfit} icon={<Package size={18} />} tone="teal" />
         <MetricCard label="Suprekiauta automobiliais" value={totals.vehicleRevenue} hint="parduoti automobiliai" profit={totals.vehicleProfit} icon={<CarFront size={18} />} tone="blue" />
         <MetricCard label="Uždirbta" value={totals.profit} hint="realus rezultatas" icon={<TrendingUp size={18} />} tone="dark" />
      </div>
      <div className="mt-8 grid gap-6 xl:grid-cols-[1.4fr_0.8fr]">
        <div className="rounded-xl border border-border bg-card shadow-sm reveal reveal-delay-1">
           <div className="flex flex-col gap-4 border-b border-border px-5 py-5 sm:px-6 md:flex-row md:items-end md:justify-between"><div><p className="font-mono-ui text-[10px] uppercase tracking-[0.18em] text-muted-foreground">Pinigų srautas</p><h2 className="mt-1 text-lg font-bold">Visa istorija</h2></div><div className="flex items-center gap-1 rounded-lg border border-border bg-background p-1" role="group" aria-label="Istorijos filtras">{(['all', 'in', 'out'] as const).map((option) => <button key={option} onClick={() => setHistoryFilter(option)} className={`rounded-md px-2.5 py-1.5 text-[11px] font-bold transition-colors ${historyFilter === option ? 'bg-foreground text-background' : 'text-muted-foreground hover:text-foreground'}`} data-testid={`button-history-${option}`}>{option === 'all' ? 'Visos' : option === 'in' ? 'Įplaukos' : 'Išlaidos'}</button>)}</div></div>
           <div className="overflow-x-auto scrollbar-thin"><table className="w-full min-w-[560px] text-left"><thead><tr className="border-b border-border/80 text-[10px] uppercase tracking-[0.14em] text-muted-foreground"><th className="px-5 py-3 font-mono-ui sm:px-6">Data</th><th className="px-3 py-3 font-mono-ui">Įrašas</th><th className="px-3 py-3 font-mono-ui">Tipas</th><th className="px-5 py-3 text-right font-mono-ui sm:px-6">Suma</th></tr></thead><tbody>{visibleActivity.map((row) => <tr key={row.id} className="border-b border-border/60 last:border-0 transition-colors hover:bg-muted/35" data-testid={`row-activity-${row.id}`}><td className="whitespace-nowrap px-5 py-4 text-xs text-muted-foreground sm:px-6">{shortDate(row.date)}</td><td className="px-3 py-4"><p className="text-sm font-semibold">{row.label}</p><p className="mt-0.5 text-xs text-muted-foreground">{row.detail}</p></td><td className="px-3 py-4"><span className={`inline-flex items-center rounded-full px-2 py-1 text-[10px] font-bold uppercase tracking-wide ${row.kind === 'in' ? 'bg-accent text-accent-foreground' : 'bg-muted text-muted-foreground'}`}>{row.kind === 'in' ? 'Įplaukos' : 'Išlaidos'}</span></td><td className={`whitespace-nowrap px-5 py-4 text-right font-mono-ui text-sm font-bold sm:px-6 ${row.kind === 'in' ? 'text-secondary' : 'text-foreground'}`}>{row.amount > 0 ? '+' : '−'} {money(Math.abs(row.amount))}</td></tr>)}</tbody></table></div>
           {visibleActivity.length === 0 && <EmptyState title="Kol kas nėra pinigų įrašų" body="Pridėk pirmą automobilį, kad pradėtum sekti srautą." />}
           <div className="flex items-center justify-between gap-3 border-t border-border px-5 py-4 sm:px-6"><span className="font-mono-ui text-[10px] uppercase tracking-[0.15em] text-muted-foreground">{filteredActivity.length} įrašai · vietinė knyga</span>{filteredActivity.length > 10 && <button onClick={() => setShowAllHistory(!showAllHistory)} className="text-xs font-bold text-secondary hover:underline" data-testid="button-toggle-history">{showAllHistory ? 'Rodyti mažiau' : `Rodyti visus (${filteredActivity.length})`}</button>}</div>
        </div>
        <div className="space-y-6">
          <div className="rounded-xl border border-border bg-foreground p-5 text-background shadow-sm reveal reveal-delay-2 sm:p-6"><div className="flex items-center justify-between"><p className="font-mono-ui text-[10px] uppercase tracking-[0.18em] text-background/45">Dabar dirbtuvėse</p><Gauge size={17} className="text-primary" /></div><div className="mt-6 grid grid-cols-2 gap-5"><div><p className="text-3xl font-bold">{vehicles.filter((v) => v.status === 'active').length}</p><p className="mt-1 text-xs text-background/55">automobiliai</p></div><div><p className="text-3xl font-bold">{partsCars.length}</p><p className="mt-1 text-xs text-background/55">ardomi donorai</p></div></div><div className="mt-6 border-t border-background/15 pt-4"><div className="flex justify-between text-xs"><span className="text-background/55">Turto vertė sandėlyje</span><span className="font-mono-ui text-primary">{money(inventoryValue)}</span></div></div></div>
           <div className="rounded-xl border border-border bg-card p-5 shadow-sm reveal reveal-delay-3 sm:p-6"><div className="flex items-center justify-between"><div><p className="font-mono-ui text-[10px] uppercase tracking-[0.18em] text-muted-foreground">Pardavimų kontrolė</p><h2 className="mt-1 text-lg font-bold">Rezultatai</h2></div><CircleDollarSign size={20} className="text-primary" /></div><div className="mt-5 grid grid-cols-2 gap-4 border-b border-border pb-4"><div><p className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground">Uždaryti sandoriai</p><p className="mt-1 font-mono-ui text-lg font-bold">{soldVehicles.length}</p></div><div><p className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground">Planuojamas pelnas</p><p className={`mt-1 font-mono-ui text-lg font-bold ${forecastProfit >= 0 ? 'text-secondary' : 'text-destructive'}`}>{forecastProfit >= 0 ? '+' : '−'}{money(Math.abs(forecastProfit))}</p></div></div>{soldVehicles.length > 0 ? <div className="mt-5 space-y-4">{soldVehicles.slice(0, 3).map((vehicle) => { const profit = (vehicle.salePrice ?? 0) - vehicleCost(vehicle); return <div key={vehicle.id} className="flex items-center justify-between gap-3"><div className="min-w-0"><p className="truncate text-sm font-semibold">{vehicle.make} {vehicle.model}</p><p className="text-xs text-muted-foreground">{shortDate(vehicle.soldAt ?? vehicle.createdAt)}</p></div><span className={`font-mono-ui text-sm font-bold ${profit >= 0 ? 'text-secondary' : 'text-destructive'}`}>{profit >= 0 ? '+' : '−'}{money(Math.abs(profit))}</span></div>; })}</div> : <p className="mt-5 text-sm text-muted-foreground">Pirmasis pardavimas dar laukia.</p>}</div>
        </div>
      </div>
    </section>
  );
}

function MetricCard({ label, value, hint, profit, icon, tone }: { label: string; value: number; hint: string; profit?: number; icon: ReactNode; tone: 'orange' | 'teal' | 'blue' | 'dark' }) {
  const styles = tone === 'orange' ? 'bg-primary text-primary-foreground' : tone === 'teal' ? 'bg-secondary text-secondary-foreground' : tone === 'blue' ? 'bg-accent text-accent-foreground' : 'bg-foreground text-background';
  return <div className={`lift rounded-xl border border-transparent p-5 shadow-sm ${styles}`}><div className="flex items-start justify-between"><span className="text-xs font-semibold opacity-75">{label}</span><span className="opacity-80">{icon}</span></div><p className="mt-6 font-mono-ui text-[25px] font-bold tracking-tight">{money(value)}</p><p className="mt-1 text-xs opacity-65">{hint}</p>{profit !== undefined && <div className="mt-4 flex items-center justify-between gap-2 border-t border-current/20 pt-3"><span className="text-xs opacity-70">Uždirbta</span><span className={`font-mono-ui text-sm font-bold ${profit < 0 ? 'text-destructive' : 'text-current'}`}>{profit >= 0 ? '+' : '−'}{money(Math.abs(profit))}</span></div>}</div>;
}

function SectionHeader({ eyebrow, title, body, action, actionLabel, onAction }: { eyebrow: string; title: string; body: string; action?: ReactNode; actionLabel?: string; onAction?: () => void }) {
  return <div className="mb-7 flex flex-col justify-between gap-4 sm:flex-row sm:items-end"><div><p className="mb-2 font-mono-ui text-[10px] uppercase tracking-[0.2em] text-secondary">{eyebrow}</p><h1 className="text-3xl font-bold tracking-tight">{title}<span className="text-primary">.</span></h1><p className="mt-2 text-sm text-muted-foreground">{body}</p></div>{onAction && <button onClick={onAction} className="inline-flex w-fit items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-bold text-primary-foreground transition-transform hover:-translate-y-0.5" data-testid={`button-${actionLabel?.toLowerCase().replaceAll(' ', '-')}`}>{action}{actionLabel}</button>}</div>;
}

function VehiclesPage({ vehicles, openModal, deleteVehicle }: { vehicles: Vehicle[]; openModal: (name: 'vehicle' | 'expense' | 'sell', id?: string) => void; deleteVehicle: (id: string) => void }) {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<'all' | 'active' | 'sold'>('all');
  const filtered = vehicles.filter((vehicle) => `${vehicle.make} ${vehicle.model} ${vehicle.year} ${vehicle.engine}`.toLowerCase().includes(query.toLowerCase()) && (filter === 'all' || vehicle.status === filter));
  return <section className="mx-auto max-w-[1480px]"><SectionHeader eyebrow="Inventorius / 01" title="Automobiliai" body="Pirk, taisyk, parduok. Kiekvienas euras turi savo vietą." action={<Plus size={17} />} actionLabel="Pridėti automobilį" onAction={() => openModal('vehicle')} /><div className="mb-6 flex flex-col gap-3 md:flex-row md:items-center md:justify-between"><label className="relative block max-w-md flex-1"><Search size={17} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Ieškoti pagal markę, modelį ar metus..." className="h-11 w-full rounded-lg border border-border bg-card pl-10 pr-3 text-sm outline-none transition-colors placeholder:text-muted-foreground/70 focus:border-primary focus:ring-2 focus:ring-primary/20" data-testid="input-search-vehicles" /></label><div className="flex rounded-lg border border-border bg-card p-1">{(['all', 'active', 'sold'] as const).map((option) => <button key={option} onClick={() => setFilter(option)} className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${filter === option ? 'bg-foreground text-background' : 'text-muted-foreground hover:text-foreground'}`} data-testid={`button-filter-${option}`}>{option === 'all' ? 'Visi' : option === 'active' ? 'Aktyvūs' : 'Parduoti'}</button>)}</div></div>{filtered.length === 0 ? <EmptyState title={query ? 'Nieko neradome' : 'Automobilių sąrašas tuščias'} body={query ? 'Pabandyk kitą paieškos frazę.' : 'Pridėk pirmą automobilį ir pradėk vesti jo istoriją.'} action={<button onClick={() => openModal('vehicle')} className="mt-4 inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-bold text-primary-foreground" data-testid="button-empty-add-vehicle"><Plus size={16} /> Pridėti automobilį</button>} /> : <div className="grid gap-4 lg:grid-cols-2">{filtered.map((vehicle, index) => <VehicleCard key={vehicle.id} vehicle={vehicle} index={index} openModal={openModal} deleteVehicle={deleteVehicle} />)}</div>}</section>;
}

function VehicleCard({ vehicle, index, openModal, deleteVehicle }: { vehicle: Vehicle; index: number; openModal: (name: 'vehicle' | 'expense' | 'sell', id?: string) => void; deleteVehicle: (id: string) => void }) {
  const cost = vehicleCost(vehicle);
  const profit = vehicle.status === 'sold' ? (vehicle.salePrice ?? 0) - cost : 0;
  const forecast = (vehicle.askingPrice ?? 0) - cost;
  return <article className={`lift rounded-xl border border-border bg-card shadow-sm reveal reveal-delay-${Math.min(index + 1, 3)}`} data-testid={`card-vehicle-${vehicle.id}`}><div className="border-b border-border p-5 sm:p-6"><div className="flex items-start justify-between gap-4"><div><div className="mb-2 flex flex-wrap items-center gap-2"><span className={`h-2 w-2 rounded-full ${vehicle.status === 'sold' ? 'bg-secondary' : 'bg-primary'}`} /><span className="font-mono-ui text-[10px] uppercase tracking-[0.15em] text-muted-foreground">{vehicle.status === 'sold' ? 'Parduotas' : 'Aktyvus'}</span>{vehicle.location && <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">{vehicle.location}</span>}</div><h2 className="text-xl font-bold">{vehicle.year} {vehicle.make} {vehicle.model}</h2><p className="mt-1 text-sm text-muted-foreground">{vehicle.engine} <span className="mx-1">·</span> {vehicle.fuel} <span className="mx-1">·</span> {vehicle.mileage.toLocaleString('lt-LT')} km</p><p className="mt-2 font-mono-ui text-[10px] uppercase tracking-[0.12em] text-muted-foreground/75">{vehicle.registration || 'Registracija nenurodyta'} {vehicle.vin ? ` · VIN ${vehicle.vin.slice(-6)}` : ''}</p></div><div className="flex gap-1"><button onClick={() => openModal('vehicle', vehicle.id)} className="rounded-lg p-2 text-muted-foreground hover-elevate" aria-label="Redaguoti automobilį" data-testid={`button-edit-vehicle-${vehicle.id}`}><Pencil size={16} /></button><button onClick={() => deleteVehicle(vehicle.id)} className="rounded-lg p-2 text-muted-foreground hover:bg-destructive/10 hover:text-destructive" aria-label="Pašalinti automobilį" data-testid={`button-delete-vehicle-${vehicle.id}`}><Trash2 size={16} /></button></div></div><div className="mt-6 grid grid-cols-3 gap-3"><InfoCell label="Pirkimas" value={money(vehicle.purchasePrice)} /><InfoCell label="Išlaidos" value={money(totalExpenses(vehicle))} /><InfoCell label="Savikaina" value={money(cost)} strong /></div></div><div className="flex flex-wrap items-center justify-between gap-3 bg-muted/35 px-5 py-4 sm:px-6">{vehicle.status === 'sold' ? <div><p className="text-[10px] uppercase tracking-[0.13em] text-muted-foreground">Rezultatas</p><p className={`font-mono-ui text-lg font-bold ${profit >= 0 ? 'text-secondary' : 'text-destructive'}`}>{profit >= 0 ? '+' : '−'} {money(Math.abs(profit))}</p></div> : <div><p className="text-[10px] uppercase tracking-[0.13em] text-muted-foreground">Prognozė</p>{vehicle.askingPrice ? <p className={`font-mono-ui text-lg font-bold ${forecast >= 0 ? 'text-secondary' : 'text-destructive'}`}>{forecast >= 0 ? '+' : '−'} {money(Math.abs(forecast))}</p> : <p className="text-sm font-semibold">Tikslinė kaina nenustatyta</p>}</div>}<div className="flex gap-2">{vehicle.status === 'active' && <><button onClick={() => openModal('expense', vehicle.id)} className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-2 text-xs font-bold hover-elevate" data-testid={`button-add-expense-${vehicle.id}`}><Wrench size={14} /> Išlaidos</button><button onClick={() => openModal('sell', vehicle.id)} className="inline-flex items-center gap-1.5 rounded-lg bg-foreground px-3 py-2 text-xs font-bold text-background hover:opacity-90" data-testid={`button-sell-vehicle-${vehicle.id}`}><BadgeEuro size={14} /> Parduoti</button></>}</div></div>{vehicle.expenses.length > 0 && <div className="border-t border-border px-5 py-4 sm:px-6"><p className="mb-2 font-mono-ui text-[10px] uppercase tracking-[0.14em] text-muted-foreground">Išlaidų žurnalas</p><div className="space-y-2">{vehicle.expenses.slice().reverse().map((expense) => <div key={expense.id} className="flex items-center justify-between text-sm"><span className="text-muted-foreground">{expense.label}</span><span className="font-mono-ui text-xs">− {money(expense.amount)}</span></div>)}</div></div>}</article>;
}

function InfoCell({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return <div><p className="mb-1 text-[10px] uppercase tracking-[0.12em] text-muted-foreground">{label}</p><p className={`font-mono-ui text-xs ${strong ? 'font-bold text-foreground' : ''}`}>{value}</p></div>;
}

function PartsPage({ partsCars, openModal, togglePart, deletePartsCar, deletePart }: { partsCars: PartsCar[]; openModal: (name: 'partsCar' | 'part', id?: string, partId?: string) => void; togglePart: (carId: string, partId: string) => void; deletePartsCar: (id: string) => void; deletePart: (carId: string, partId: string) => void }) {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<'all' | 'inventory' | 'sold'>('all');
  const filtered = partsCars.filter((car) => `${car.make} ${car.model} ${car.year} ${car.engine}`.toLowerCase().includes(query.toLowerCase()) && (filter === 'all' || car.parts.some((part) => part.status === filter)));
  const inventoryCount = partsCars.reduce((sum, car) => sum + car.parts.filter((part) => part.status === 'inventory').length, 0);
  const soldCount = partsCars.reduce((sum, car) => sum + car.parts.filter((part) => part.status === 'sold').length, 0);
  return <section className="mx-auto max-w-[1480px]"><SectionHeader eyebrow="Inventorius / 02" title="Dalys" body="Donorai kelyje į antrą gyvenimą. Parduotų detalių pinigai grįžta į knygą." action={<Plus size={17} />} actionLabel="Pridėti donorą" onAction={() => openModal('partsCar')} /><div className="mb-6 flex flex-col gap-3 md:flex-row md:items-center md:justify-between"><label className="relative block max-w-md flex-1"><Search size={17} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Ieškoti donorų..." className="h-11 w-full rounded-lg border border-border bg-card pl-10 pr-3 text-sm outline-none placeholder:text-muted-foreground/70 focus:border-primary focus:ring-2 focus:ring-primary/20" data-testid="input-search-parts" /></label><div className="flex items-center justify-between gap-3"><div className="flex rounded-lg border border-border bg-card p-1">{(['all', 'inventory', 'sold'] as const).map((option) => <button key={option} onClick={() => setFilter(option)} className={`rounded-md px-2.5 py-1.5 text-[11px] font-semibold transition-colors ${filter === option ? 'bg-foreground text-background' : 'text-muted-foreground hover:text-foreground'}`} data-testid={`button-filter-parts-${option}`}>{option === 'all' ? 'Visi' : option === 'inventory' ? 'Sandėlyje' : 'Parduotos'}</button>)}</div><span className="hidden font-mono-ui text-[10px] uppercase tracking-[0.14em] text-muted-foreground sm:block">{inventoryCount} sandėlyje · {soldCount} parduotos</span></div></div>{filtered.length === 0 ? <EmptyState title="Donorų neradome" body="Pridėk automobilį ardymui arba pakeisk paiešką." action={<button onClick={() => openModal('partsCar')} className="mt-4 inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-bold text-primary-foreground" data-testid="button-empty-add-donor"><Plus size={16} /> Pridėti donorą</button>} /> : <div className="space-y-5">{filtered.map((car, index) => <PartsCarCard key={car.id} car={car} index={index} openModal={openModal} togglePart={togglePart} deletePartsCar={deletePartsCar} deletePart={deletePart} />)}</div>}</section>;
}

function PartsCarCard({ car, index, openModal, togglePart, deletePartsCar, deletePart }: { car: PartsCar; index: number; openModal: (name: 'partsCar' | 'part', id?: string, partId?: string) => void; togglePart: (carId: string, partId: string) => void; deletePartsCar: (id: string) => void; deletePart: (carId: string, partId: string) => void }) {
  const sold = car.parts.filter((part) => part.status === 'sold').reduce((sum, part) => sum + part.price, 0);
  const inventory = car.parts.filter((part) => part.status === 'inventory').reduce((sum, part) => sum + part.price, 0);
  const recovery = car.purchasePrice ? sold / car.purchasePrice * 100 : 0;
  return <article className={`lift overflow-hidden rounded-xl border border-border bg-card shadow-sm reveal reveal-delay-${Math.min(index + 1, 3)}`} data-testid={`card-parts-car-${car.id}`}><div className="flex flex-col gap-5 border-b border-border p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6"><div className="flex items-start gap-4"><div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-accent text-accent-foreground"><CarFront size={21} /></div><div><div className="mb-1 flex flex-wrap items-center gap-2"><span className="font-mono-ui text-[10px] uppercase tracking-[0.15em] text-secondary">Donoras · {shortDate(car.createdAt)}</span>{car.location && <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">{car.location}</span>}</div><h2 className="text-xl font-bold">{car.year} {car.make} {car.model}</h2><p className="mt-1 text-sm text-muted-foreground">{car.engine} <span className="mx-1">·</span> {car.mileage.toLocaleString('lt-LT')} km <span className="mx-1">·</span> pirkta už {money(car.purchasePrice)}</p></div></div><div className="flex items-center gap-2"><button onClick={() => openModal('partsCar', car.id)} className="rounded-lg p-2 text-muted-foreground hover-elevate" aria-label="Redaguoti donorą" data-testid={`button-edit-donor-${car.id}`}><Pencil size={16} /></button><button onClick={() => deletePartsCar(car.id)} className="rounded-lg p-2 text-muted-foreground hover:bg-destructive/10 hover:text-destructive" aria-label="Pašalinti donorą" data-testid={`button-delete-donor-${car.id}`}><Trash2 size={16} /></button><button onClick={() => openModal('part', car.id)} className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-xs font-bold text-primary-foreground" data-testid={`button-add-part-${car.id}`}><Plus size={15} /> Pridėti detalę</button></div></div><div className="grid border-b border-border bg-muted/30 sm:grid-cols-4"><div className="border-b border-border px-5 py-3 sm:border-b-0 sm:border-r sm:px-6"><p className="text-[10px] uppercase tracking-[0.13em] text-muted-foreground">Parduota</p><p className="mt-1 font-mono-ui text-sm font-bold text-secondary">{money(sold)}</p></div><div className="border-b border-border px-5 py-3 sm:border-b-0 sm:border-r sm:px-6"><p className="text-[10px] uppercase tracking-[0.13em] text-muted-foreground">Sandėlyje</p><p className="mt-1 font-mono-ui text-sm font-bold">{money(inventory)}</p></div><div className="border-b border-border px-5 py-3 sm:border-b-0 sm:border-r sm:px-6"><p className="text-[10px] uppercase tracking-[0.13em] text-muted-foreground">Atsipirkimas</p><p className={`mt-1 font-mono-ui text-sm font-bold ${recovery >= 100 ? 'text-secondary' : 'text-foreground'}`}>{Math.round(recovery)}%</p></div><div className="px-5 py-3 sm:px-6"><p className="text-[10px] uppercase tracking-[0.13em] text-muted-foreground">Detalių</p><p className="mt-1 font-mono-ui text-sm font-bold">{car.parts.length}</p></div></div>{car.parts.length > 0 ? <div className="overflow-x-auto"><table className="w-full min-w-[680px] text-left"><thead><tr className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground"><th className="px-5 py-3 font-mono-ui sm:px-6">Detalė</th><th className="px-3 py-3 font-mono-ui">Kodas</th><th className="px-3 py-3 font-mono-ui">Vieta</th><th className="px-3 py-3 font-mono-ui">Kaina</th><th className="px-5 py-3 text-right font-mono-ui sm:px-6">Būsena</th></tr></thead><tbody>{car.parts.map((part) => <tr key={part.id} className="border-t border-border/70 hover:bg-muted/30" data-testid={`row-part-${part.id}`}><td className="px-5 py-3.5 text-sm font-semibold sm:px-6">{part.name}</td><td className="px-3 py-3.5 font-mono-ui text-xs text-muted-foreground">{part.code || '—'}</td><td className="px-3 py-3.5 text-xs text-muted-foreground">{part.location || '—'}</td><td className="px-3 py-3.5 font-mono-ui text-xs">{money(part.price)}</td><td className="px-5 py-3.5 text-right sm:px-6"><div className="flex items-center justify-end gap-1.5"><button onClick={() => openModal('part', car.id, part.id)} className="rounded-md p-1.5 text-muted-foreground hover-elevate" aria-label="Redaguoti detalę" data-testid={`button-edit-part-${part.id}`}><Pencil size={14} /></button><button onClick={() => deletePart(car.id, part.id)} className="rounded-md p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive" aria-label="Pašalinti detalę" data-testid={`button-delete-part-${part.id}`}><Trash2 size={14} /></button><button onClick={() => togglePart(car.id, part.id)} className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-wide transition-colors ${part.status === 'sold' ? 'bg-secondary/15 text-secondary' : 'bg-primary/15 text-primary'}`} data-testid={`button-toggle-part-${part.id}`}>{part.status === 'sold' ? <Check size={12} /> : <Package size={12} />}{part.status === 'sold' ? 'Parduota' : 'Sandėlyje'}</button></div></td></tr>)}</tbody></table></div> : <div className="paper-line px-6 py-8 text-center"><Package size={24} className="mx-auto text-muted-foreground/50" /><p className="mt-3 text-sm font-semibold">Detalės dar nesurašytos</p><p className="mt-1 text-xs text-muted-foreground">Pridėk pirmą detalę iš šio donoro.</p></div>}</article>;
}

function EmptyState({ title, body, action }: { title: string; body: string; action?: ReactNode }) {
  return <div className="rounded-xl border border-dashed border-border bg-card/55 px-6 py-16 text-center"><div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-muted text-muted-foreground"><ClipboardList size={22} /></div><h2 className="mt-4 text-lg font-bold">{title}</h2><p className="mx-auto mt-2 max-w-sm text-sm text-muted-foreground">{body}</p>{action}</div>;
}

function AccountMenu() {
  const { user } = useUser();
  const { signOut } = useClerk();
  const [open, setOpen] = useState(false);
  const initials = `${user?.firstName?.[0] ?? ''}${user?.lastName?.[0] ?? user?.primaryEmailAddress?.emailAddress?.[0] ?? 'R'}`.toUpperCase();

  return <div className="relative">
    <button onClick={() => setOpen((current) => !current)} className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-sm font-bold text-primary-foreground" aria-label="Atidaryti paskyros meniu" data-testid="button-account-menu">{initials.slice(0, 2)}</button>
    {open && <div className="absolute right-0 top-11 z-50 w-64 rounded-xl border border-border bg-card p-3 shadow-xl">
      <p className="truncate text-sm font-semibold">{user?.fullName || 'Naudotojas'}</p>
      <p className="mt-1 truncate text-xs text-muted-foreground">{user?.primaryEmailAddress?.emailAddress}</p>
      <div className="my-3 border-t border-border" />
      <button onClick={() => signOut({ redirectUrl: basePath || '/' })} className="w-full rounded-lg px-3 py-2 text-left text-sm font-semibold text-destructive hover:bg-destructive/10" data-testid="button-sign-out">Atsijungti</button>
    </div>}
  </div>;
}

function Modal({ title, eyebrow, children, close }: { title: string; eyebrow: string; children: ReactNode; close: () => void }) {
  return <div className="fixed inset-0 z-[55] flex items-end justify-center bg-foreground/45 p-0 backdrop-blur-[2px] sm:items-center sm:p-5"><div className="max-h-[92dvh] w-full max-w-xl overflow-y-auto rounded-t-2xl border border-border bg-card shadow-2xl sm:rounded-2xl"><div className="flex items-start justify-between border-b border-border px-5 py-5 sm:px-6"><div><p className="font-mono-ui text-[10px] uppercase tracking-[0.18em] text-secondary">{eyebrow}</p><h2 className="mt-1 text-xl font-bold">{title}</h2></div><button onClick={close} className="rounded-lg p-2 text-muted-foreground hover-elevate" aria-label="Uždaryti langą" data-testid="button-close-modal"><X size={19} /></button></div>{children}</div></div>;
}

function Field({ label, children, wide = false }: { label: string; children: ReactNode; wide?: boolean }) {
  return <label className={wide ? 'sm:col-span-2' : ''}><span className="mb-1.5 block text-xs font-semibold text-muted-foreground">{label}</span>{children}</label>;
}

const inputClass = 'h-10 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/20';
const selectClass = `${inputClass} appearance-none`;

function VehicleModal({ vehicle, close, save }: { vehicle?: Vehicle; close: () => void; save: (payload: Omit<Vehicle, 'id' | 'createdAt' | 'expenses' | 'status'> & { id?: string }) => void }) {
  const [form, setForm] = useState({ year: String(vehicle?.year ?? 2020), make: vehicle?.make ?? '', model: vehicle?.model ?? '', engine: vehicle?.engine ?? '', fuel: vehicle?.fuel ?? 'Dyzelinas', mileage: String(vehicle?.mileage ?? ''), purchasePrice: String(vehicle?.purchasePrice ?? ''), askingPrice: String(vehicle?.askingPrice ?? ''), purchaseDate: vehicle?.purchaseDate ?? vehicle?.createdAt ?? today(), vin: vehicle?.vin ?? '', registration: vehicle?.registration ?? '', location: vehicle?.location ?? 'Aikštelė', source: vehicle?.source ?? '', notes: vehicle?.notes ?? '' });
  function submit(event: FormEvent) { event.preventDefault(); save({ ...form, id: vehicle?.id, year: Number(form.year), mileage: Number(form.mileage), purchasePrice: Number(form.purchasePrice), askingPrice: form.askingPrice ? Number(form.askingPrice) : undefined, purchaseDate: form.purchaseDate || undefined }); }
  return <Modal title={vehicle ? 'Redaguoti automobilį' : 'Naujas automobilis'} eyebrow={vehicle ? 'Atnaujinti įrašą' : 'Pirkimo žurnalas'} close={close}><form onSubmit={submit} className="grid gap-4 p-5 sm:grid-cols-2 sm:p-6"><div className="sm:col-span-2 rounded-lg border border-secondary/20 bg-accent/45 px-3 py-2.5 text-xs leading-5 text-accent-foreground">Kuo tiksliau suvesk pirkimo duomenis — vėliau savikaina ir marža bus paskaičiuotos automatiškai.</div><Field label="Metai"><input required type="number" min="1950" max="2030" value={form.year} onChange={(e) => setForm({ ...form, year: e.target.value })} className={inputClass} data-testid="input-vehicle-year" /></Field><Field label="Pirkimo data"><input required type="date" value={form.purchaseDate} onChange={(e) => setForm({ ...form, purchaseDate: e.target.value })} className={inputClass} data-testid="input-vehicle-purchase-date" /></Field><Field label="Markė"><input required value={form.make} onChange={(e) => setForm({ ...form, make: e.target.value })} className={inputClass} placeholder="pvz. Audi" data-testid="input-vehicle-make" /></Field><Field label="Modelis"><input required value={form.model} onChange={(e) => setForm({ ...form, model: e.target.value })} className={inputClass} placeholder="pvz. A4 Avant" data-testid="input-vehicle-model" /></Field><Field label="Variklis"><input required value={form.engine} onChange={(e) => setForm({ ...form, engine: e.target.value })} className={inputClass} placeholder="pvz. 2.0 TDI · 110 kW" data-testid="input-vehicle-engine" /></Field><Field label="Kuras"><div className="relative"><select value={form.fuel} onChange={(e) => setForm({ ...form, fuel: e.target.value })} className={selectClass} data-testid="select-vehicle-fuel"><option>Dyzelinas</option><option>Benzinas</option><option>Hibridas</option><option>Elektra</option><option>Dujos</option></select><ChevronDown size={15} className="pointer-events-none absolute right-3 top-3 text-muted-foreground" /></div></Field><Field label="Rida, km"><input required type="number" min="0" value={form.mileage} onChange={(e) => setForm({ ...form, mileage: e.target.value })} className={inputClass} data-testid="input-vehicle-mileage" /></Field><Field label="Pirkimo kaina, EUR"><input required type="number" min="0" step="0.01" value={form.purchasePrice} onChange={(e) => setForm({ ...form, purchasePrice: e.target.value })} className={inputClass} placeholder="0,00" data-testid="input-vehicle-purchase-price" /></Field><Field label="Tikslinė pardavimo kaina, EUR"><input type="number" min="0" step="0.01" value={form.askingPrice} onChange={(e) => setForm({ ...form, askingPrice: e.target.value })} className={inputClass} placeholder="Neprivaloma" data-testid="input-vehicle-asking-price" /></Field><Field label="Laikymo vieta"><input value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} className={inputClass} placeholder="pvz. Aikštelė A" data-testid="input-vehicle-location" /></Field><Field label="Valstybinis numeris"><input value={form.registration} onChange={(e) => setForm({ ...form, registration: e.target.value.toUpperCase() })} className={inputClass} placeholder="ABC 123" data-testid="input-vehicle-registration" /></Field><Field label="VIN kodas"><input value={form.vin} onChange={(e) => setForm({ ...form, vin: e.target.value.toUpperCase() })} className={inputClass} placeholder="17 simbolių" data-testid="input-vehicle-vin" /></Field><Field label="Pirkta iš"><input value={form.source} onChange={(e) => setForm({ ...form, source: e.target.value })} className={inputClass} placeholder="pvz. Vokietija / privatus" data-testid="input-vehicle-source" /></Field><Field label="Pastabos" wide><textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} className={`${inputClass} h-20 py-2.5`} placeholder="Defektai, susitarimai, dokumentai..." data-testid="input-vehicle-notes" /></Field><div className="mt-2 flex justify-end gap-2 border-t border-border pt-4 sm:col-span-2"><button type="button" onClick={close} className="rounded-lg px-4 py-2.5 text-sm font-semibold text-muted-foreground hover:bg-muted" data-testid="button-cancel-vehicle">Atšaukti</button><button type="submit" className="rounded-lg bg-primary px-4 py-2.5 text-sm font-bold text-primary-foreground" data-testid="button-save-vehicle">{vehicle ? 'Išsaugoti pakeitimus' : 'Pridėti automobilį'}</button></div></form></Modal>;
}

function ExpenseModal({ vehicle, close, save }: { vehicle?: Vehicle; close: () => void; save: (vehicleId: string, payload: Omit<Expense, 'id'>) => void }) {
  const [form, setForm] = useState({ label: '', amount: '', date: today(), category: 'Remontas' });
  function submit(event: FormEvent) { event.preventDefault(); if (vehicle) save(vehicle.id, { label: form.label, amount: Number(form.amount), date: form.date, category: form.category }); }
  return <Modal title="Pridėti išlaidas" eyebrow={`${vehicle?.make ?? ''} ${vehicle?.model ?? ''}`} close={close}><form onSubmit={submit} className="grid gap-4 p-5 sm:p-6"><Field label="Kas buvo atlikta?"><input required value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} className={inputClass} placeholder="pvz. Tepalai ir filtrai" data-testid="input-expense-label" /></Field><div className="grid gap-4 sm:grid-cols-2"><Field label="Kategorija"><div className="relative"><select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} className={selectClass} data-testid="select-expense-category"><option>Remontas</option><option>Transportas</option><option>Dokumentai</option><option>Detalės</option><option>Reklama</option><option>Kita</option></select><ChevronDown size={15} className="pointer-events-none absolute right-3 top-3 text-muted-foreground" /></div></Field><Field label="Suma, EUR"><input required type="number" min="0" step="0.01" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} className={inputClass} placeholder="0,00" data-testid="input-expense-amount" /></Field></div><Field label="Data"><input required type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} className={inputClass} data-testid="input-expense-date" /></Field><div className="mt-2 flex justify-end gap-2 border-t border-border pt-4"><button type="button" onClick={close} className="rounded-lg px-4 py-2.5 text-sm font-semibold text-muted-foreground hover:bg-muted" data-testid="button-cancel-expense">Atšaukti</button><button type="submit" className="rounded-lg bg-primary px-4 py-2.5 text-sm font-bold text-primary-foreground" data-testid="button-save-expense">Įrašyti išlaidas</button></div></form></Modal>;
}

function SellModal({ vehicle, close, save }: { vehicle?: Vehicle; close: () => void; save: (vehicleId: string, salePrice: number) => void }) {
  const [price, setPrice] = useState('');
  function submit(event: FormEvent) { event.preventDefault(); if (vehicle) save(vehicle.id, Number(price)); }
  const cost = vehicle ? vehicleCost(vehicle) : 0;
  return <Modal title="Pažymėti parduotą" eyebrow={`${vehicle?.make ?? ''} ${vehicle?.model ?? ''}`} close={close}><form onSubmit={submit} className="p-5 sm:p-6"><div className="rounded-lg bg-muted/60 p-4"><div className="flex justify-between text-sm"><span className="text-muted-foreground">Dabartinė savikaina</span><span className="font-mono-ui font-bold">{money(cost)}</span></div><p className="mt-2 text-xs text-muted-foreground">Pardavimo kaina bus naudojama realiam pelnui apskaičiuoti.</p></div><div className="mt-5"><Field label="Pardavimo kaina, EUR"><input required autoFocus type="number" min="0" step="0.01" value={price} onChange={(e) => setPrice(e.target.value)} className={inputClass} placeholder="0,00" data-testid="input-sale-price" /></Field></div><div className="mt-6 flex justify-end gap-2 border-t border-border pt-4"><button type="button" onClick={close} className="rounded-lg px-4 py-2.5 text-sm font-semibold text-muted-foreground hover:bg-muted" data-testid="button-cancel-sale">Atšaukti</button><button type="submit" className="rounded-lg bg-secondary px-4 py-2.5 text-sm font-bold text-secondary-foreground" data-testid="button-save-sale">Patvirtinti pardavimą</button></div></form></Modal>;
}

function PartsCarModal({ car, close, save }: { car?: PartsCar; close: () => void; save: (payload: Omit<PartsCar, 'id' | 'createdAt' | 'parts' | 'status'> & { id?: string }) => void }) {
  const [form, setForm] = useState({ year: String(car?.year ?? 2015), make: car?.make ?? '', model: car?.model ?? '', engine: car?.engine ?? '', fuel: car?.fuel ?? 'Dyzelinas', mileage: String(car?.mileage ?? ''), purchasePrice: String(car?.purchasePrice ?? ''), location: car?.location ?? 'Dalių sandėlis' });
  function submit(event: FormEvent) { event.preventDefault(); save({ ...form, id: car?.id, year: Number(form.year), mileage: Number(form.mileage), purchasePrice: Number(form.purchasePrice) }); }
  return <Modal title={car ? 'Redaguoti donorą' : 'Naujas donoras'} eyebrow="Dalių žurnalas" close={close}><form onSubmit={submit} className="grid gap-4 p-5 sm:grid-cols-2 sm:p-6"><div className="sm:col-span-2 rounded-lg border border-secondary/20 bg-accent/45 px-3 py-2.5 text-xs leading-5 text-accent-foreground">Donoro vertė atsiperka palaipsniui — pažymėk kiekvieną parduotą detalę ir matysi realų atsipirkimą.</div><Field label="Metai"><input required type="number" value={form.year} onChange={(e) => setForm({ ...form, year: e.target.value })} className={inputClass} data-testid="input-donor-year" /></Field><Field label="Rida, km"><input required type="number" value={form.mileage} onChange={(e) => setForm({ ...form, mileage: e.target.value })} className={inputClass} data-testid="input-donor-mileage" /></Field><Field label="Markė"><input required value={form.make} onChange={(e) => setForm({ ...form, make: e.target.value })} className={inputClass} placeholder="pvz. Volkswagen" data-testid="input-donor-make" /></Field><Field label="Modelis"><input required value={form.model} onChange={(e) => setForm({ ...form, model: e.target.value })} className={inputClass} placeholder="pvz. Passat B6" data-testid="input-donor-model" /></Field><Field label="Variklis"><input required value={form.engine} onChange={(e) => setForm({ ...form, engine: e.target.value })} className={inputClass} placeholder="pvz. 2.0 TDI · 103 kW" data-testid="input-donor-engine" /></Field><Field label="Kuras"><div className="relative"><select value={form.fuel} onChange={(e) => setForm({ ...form, fuel: e.target.value })} className={selectClass} data-testid="select-donor-fuel"><option>Dyzelinas</option><option>Benzinas</option><option>Hibridas</option><option>Elektra</option></select><ChevronDown size={15} className="pointer-events-none absolute right-3 top-3 text-muted-foreground" /></div></Field><Field label="Pirkimo kaina, EUR"><input required type="number" min="0" step="0.01" value={form.purchasePrice} onChange={(e) => setForm({ ...form, purchasePrice: e.target.value })} className={inputClass} data-testid="input-donor-purchase-price" /></Field><Field label="Laikymo vieta"><input value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} className={inputClass} placeholder="pvz. Lentyna B3" data-testid="input-donor-location" /></Field><div className="mt-2 flex justify-end gap-2 border-t border-border pt-4 sm:col-span-2"><button type="button" onClick={close} className="rounded-lg px-4 py-2.5 text-sm font-semibold text-muted-foreground hover:bg-muted" data-testid="button-cancel-donor">Atšaukti</button><button type="submit" className="rounded-lg bg-primary px-4 py-2.5 text-sm font-bold text-primary-foreground" data-testid="button-save-donor">{car ? 'Išsaugoti pakeitimus' : 'Pridėti donorą'}</button></div></form></Modal>;
}

function PartModal({ car, part, close, save, update }: { car?: PartsCar; part?: Part; close: () => void; save: (carId: string, payload: Omit<Part, 'id' | 'createdAt' | 'status'>) => void; update: (carId: string, partId: string, payload: Omit<Part, 'id' | 'createdAt' | 'status' | 'soldAt'>) => void }) {
  const [form, setForm] = useState({ name: part?.name ?? '', code: part?.code ?? '', price: String(part?.price ?? ''), location: part?.location ?? '' });
  function submit(event: FormEvent) { event.preventDefault(); if (!car) return; const payload = { name: form.name, code: form.code, price: Number(form.price), location: form.location || undefined }; if (part) update(car.id, part.id, payload); else save(car.id, payload); }
  return <Modal title={part ? 'Redaguoti detalę' : 'Pridėti detalę'} eyebrow={`${car?.make ?? ''} ${car?.model ?? ''}`} close={close}><form onSubmit={submit} className="grid gap-4 p-5 sm:p-6"><Field label="Detalės pavadinimas"><input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className={inputClass} placeholder="pvz. Generatorius" data-testid="input-part-name" /></Field><div className="grid gap-4 sm:grid-cols-2"><Field label="OEM kodas"><input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })} className={inputClass} placeholder="nebūtina" data-testid="input-part-code" /></Field><Field label="Kaina, EUR"><input required type="number" min="0" step="0.01" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} className={inputClass} placeholder="0,00" data-testid="input-part-price" /></Field></div><Field label="Laikymo vieta"><input value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} className={inputClass} placeholder="pvz. Lentyna B3 / dėžė 12" data-testid="input-part-location" /></Field><div className="mt-2 flex justify-end gap-2 border-t border-border pt-4"><button type="button" onClick={close} className="rounded-lg px-4 py-2.5 text-sm font-semibold text-muted-foreground hover:bg-muted" data-testid="button-cancel-part">Atšaukti</button><button type="submit" className="rounded-lg bg-primary px-4 py-2.5 text-sm font-bold text-primary-foreground" data-testid="button-save-part">{part ? 'Išsaugoti pakeitimus' : 'Pridėti detalę'}</button></div></form></Modal>;
}

function AuthLoading() {
  return <div className="flex min-h-[100dvh] items-center justify-center bg-background"><div className="flex items-center gap-3 rounded-xl border border-border bg-card px-5 py-4 text-sm text-muted-foreground shadow-sm"><span className="h-2 w-2 animate-pulse rounded-full bg-primary" /> Tikrinamas prisijungimas...</div></div>;
}

function AuthLanding() {
  const [, setLocation] = useLocation();
  return <main className="noise flex min-h-[100dvh] items-center justify-center bg-background px-5 py-10">
    <section className="w-full max-w-4xl overflow-hidden rounded-2xl border border-border bg-card shadow-2xl">
      <div className="grid md:grid-cols-[1.05fr_0.95fr]">
        <div className="bg-foreground p-8 text-background sm:p-12">
          <div className="flex items-center gap-3"><span className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary font-mono-ui text-sm font-bold text-primary-foreground">RM</span><div><p className="text-sm font-bold">RM Automotive</p><p className="font-mono-ui text-[9px] uppercase tracking-[0.18em] text-background/45">operator's ledger</p></div></div>
          <p className="mt-16 font-mono-ui text-[10px] uppercase tracking-[0.2em] text-primary">Privati darbo erdvė</p>
          <h1 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">Tavo automobilių verslo knyga.</h1>
          <p className="mt-4 max-w-md text-sm leading-6 text-background/65">Pirkimai, remontai, pardavimai ir dalių sandėlis vienoje saugioje vietoje.</p>
        </div>
        <div className="flex flex-col justify-center p-8 sm:p-12">
          <p className="font-mono-ui text-[10px] uppercase tracking-[0.18em] text-secondary">Prisijungimas</p>
          <h2 className="mt-2 text-2xl font-bold">Sveikas sugrįžęs.</h2>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">Prisijunk, kad atidarytum savo RM Automotive darbo stalą.</p>
          <button onClick={() => setLocation('/sign-in')} className="mt-7 inline-flex items-center justify-center rounded-lg bg-primary px-4 py-3 text-sm font-bold text-primary-foreground transition-transform hover:-translate-y-0.5" data-testid="button-open-sign-in">Prisijungti</button>
          <p className="mt-5 text-center text-xs leading-5 text-muted-foreground">
            Neturi paskyros?{' '}
            <a href={`${basePath}/sign-up`} className="font-bold text-foreground underline decoration-primary decoration-2 underline-offset-4 hover:text-primary" data-testid="link-open-sign-up">
              Sukurti paskyrą
            </a>
          </p>
        </div>
      </div>
    </section>
  </main>;
}

function SignInPage() {
  return <div className="auth-page flex min-h-[100dvh] items-center justify-center bg-background px-4 py-8"><SignIn routing="path" path={`${basePath}/sign-in`} signUpUrl={`${basePath}/sign-up`} /></div>;
}

function SignUpPage() {
  return <div className="auth-page flex min-h-[100dvh] items-center justify-center bg-background px-4 py-8"><SignUp routing="path" path={`${basePath}/sign-up`} signInUrl={`${basePath}/sign-in`} /></div>;
}

function HomeRoute() {
  const { isLoaded, isSignedIn } = useAuth();
  if (!isLoaded) return <AuthLoading />;
  return isSignedIn ? <ErrorBoundary resetKey={window.location.pathname}><AppShell /></ErrorBoundary> : <AuthLanding />;
}

function ProtectedApp() {
  const { isLoaded, isSignedIn } = useAuth();
  if (!isLoaded) return <AuthLoading />;
  if (!isSignedIn) return <Redirect to="/sign-in" />;
  return <ErrorBoundary resetKey={window.location.pathname}><AppShell /></ErrorBoundary>;
}

function Router() {
  return <Switch>
    <Route path="/" component={HomeRoute} />
    <Route path="/sign-in/*?" component={SignInPage} />
    <Route path="/sign-up/*?" component={SignUpPage} />
    <Route path="/automobiliai" component={ProtectedApp} />
    <Route path="/dalys" component={ProtectedApp} />
    <Route component={ProtectedApp} />
  </Switch>;
}

function ClerkApp() {
  const [, setLocation] = useLocation();
  function stripBase(path: string) {
    return basePath && path.startsWith(basePath) ? path.slice(basePath.length) || '/' : path;
  }

  return <ClerkProvider
    publishableKey={clerkPubKey}
    proxyUrl={clerkProxyUrl}
    appearance={{
      theme: shadcn,
      cssLayerName: 'clerk',
      options: {
        logoPlacement: 'inside',
        logoLinkUrl: basePath || '/',
        logoImageUrl: `${window.location.origin}${basePath}/logo.svg`,
      },
      variables: {
        colorPrimary: '#f7941d',
        colorForeground: '#202630',
        colorMutedForeground: '#6d727b',
        colorBackground: '#fbfaf8',
        colorInput: '#f7f4ef',
        colorInputForeground: '#202630',
        colorNeutral: '#d9d2c7',
        fontFamily: 'DM Sans, sans-serif',
        borderRadius: '0.75rem',
      },
      elements: {
        rootBox: 'w-full flex justify-center',
        cardBox: 'bg-[#fbfaf8] rounded-2xl w-[440px] max-w-full overflow-hidden',
        card: '!shadow-none !border-0 !bg-transparent !rounded-none',
        footer: '!shadow-none !border-0 !bg-transparent !rounded-none',
        headerTitle: 'text-[#202630]',
        headerSubtitle: 'text-[#6d727b]',
        formFieldLabel: 'text-[#202630]',
        footerActionLink: 'text-[#157a77]',
        footerActionText: 'text-[#6d727b]',
        dividerText: 'text-[#6d727b]',
        footerAction: 'hidden',
        formButtonPrimary: 'bg-[#f7941d] text-[#202630] hover:bg-[#df7d0e]',
        formFieldInput: 'bg-[#f7f4ef] border-[#d9d2c7] text-[#202630]',
        socialButtonsBlockButton: 'border-[#d9d2c7] bg-[#fbfaf8] text-[#202630]',
      },
    }}
    signInUrl={`${basePath}/sign-in`}
    signUpUrl={`${basePath}/sign-up`}
    routerPush={(to) => setLocation(stripBase(to))}
    routerReplace={(to) => setLocation(stripBase(to), { replace: true })}
  >
    <QueryClientProvider client={queryClient}><TooltipProvider><Router /><Toaster /></TooltipProvider></QueryClientProvider>
  </ClerkProvider>;
}

function App() {
  return <WouterRouter base={basePath}><ClerkApp /></WouterRouter>;
}

export default App;