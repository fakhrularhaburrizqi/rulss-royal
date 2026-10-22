export type DemoOrderStatus = "Diterima" | "Disiapkan" | "Siap Diantar" | "Selesai";

export type DemoOrderItem = {
  name: string;
  quantity: number;
};

export type DemoOrder = {
  id: string;
  tableNumber: string;
  customerName: string | null;
  items: DemoOrderItem[];
  total: number;
  status: DemoOrderStatus;
  note: string | null;
};

export type DemoOrderState = {
  nextSequence: number;
  orders: DemoOrder[];
};

export type DemoOrderInput = {
  tableNumber: string;
  customerName: string | null;
  items: readonly DemoOrderItem[];
  total: number;
  note: string | null;
};

export const DEMO_ORDER_STORAGE_KEY = "rulss-royal-demo-orders-v1";

export const INITIAL_DEMO_ORDERS: readonly DemoOrder[] = [
  {
    id: "WK-001",
    tableNumber: "03",
    customerName: null,
    items: [
      { name: "Nasi Goreng Spesial", quantity: 2 },
      { name: "Es Teh Manis", quantity: 2 },
    ],
    total: 46000,
    status: "Diterima",
    note: "Satu nasi goreng tidak pedas",
  },
  {
    id: "WK-002",
    tableNumber: "07",
    customerName: null,
    items: [
      { name: "Mie Ayam Rulss Royal", quantity: 1 },
      { name: "Pisang Goreng Crispy", quantity: 1 },
    ],
    total: 25000,
    status: "Disiapkan",
    note: null,
  },
  {
    id: "WK-003",
    tableNumber: "12",
    customerName: null,
    items: [
      { name: "Ayam Geprek Sambal", quantity: 2 },
      { name: "Kopi Susu Gula Aren", quantity: 2 },
    ],
    total: 64000,
    status: "Siap Diantar",
    note: "Sambal dipisah",
  },
  {
    id: "WK-004",
    tableNumber: "05",
    customerName: null,
    items: [{ name: "Nasi Goreng Spesial", quantity: 1 }],
    total: 18000,
    status: "Selesai",
    note: null,
  },
];

const NEXT_SEQUENCE_AWAL = 5;

const STATUS_DEMO: readonly DemoOrderStatus[] = [
  "Diterima",
  "Disiapkan",
  "Siap Diantar",
  "Selesai",
];

const PESAN_STORAGE_TIDAK_TERSEDIA = "Penyimpanan demo lokal tidak dapat diakses di browser ini.";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isDemoOrderStatus(value: unknown): value is DemoOrderStatus {
  return STATUS_DEMO.some((status) => status === value);
}

function isDemoOrderItem(value: unknown): value is DemoOrderItem {
  if (!isRecord(value)) return false;
  return (
    typeof value.name === "string" &&
    typeof value.quantity === "number" &&
    Number.isInteger(value.quantity) &&
    value.quantity > 0
  );
}

function isDemoOrder(value: unknown): value is DemoOrder {
  if (!isRecord(value)) return false;
  const { id, tableNumber, customerName, items, total, status, note } = value;
  return (
    typeof id === "string" &&
    typeof tableNumber === "string" &&
    (customerName === null || typeof customerName === "string") &&
    Array.isArray(items) &&
    items.every(isDemoOrderItem) &&
    typeof total === "number" &&
    Number.isFinite(total) &&
    total >= 0 &&
    isDemoOrderStatus(status) &&
    (note === null || typeof note === "string")
  );
}

function isDemoOrderState(value: unknown): value is DemoOrderState {
  if (!isRecord(value)) return false;
  const { nextSequence, orders } = value;
  return (
    typeof nextSequence === "number" &&
    Number.isInteger(nextSequence) &&
    nextSequence > 0 &&
    Array.isArray(orders) &&
    orders.every(isDemoOrder)
  );
}

function salinPesanan(order: DemoOrder): DemoOrder {
  return { ...order, items: order.items.map((item) => ({ ...item })) };
}

function formatIdPesanan(urutan: number): string {
  return `WK-${String(urutan).padStart(3, "0")}`;
}

export function createInitialDemoOrderState(): DemoOrderState {
  return {
    nextSequence: NEXT_SEQUENCE_AWAL,
    orders: INITIAL_DEMO_ORDERS.map(salinPesanan),
  };
}

export function loadDemoOrderState(): DemoOrderState {
  if (typeof window === "undefined") return createInitialDemoOrderState();

  let tersimpan: string | null;
  try {
    tersimpan = window.localStorage.getItem(DEMO_ORDER_STORAGE_KEY);
  } catch {
    throw new Error(PESAN_STORAGE_TIDAK_TERSEDIA);
  }

  if (tersimpan === null) return createInitialDemoOrderState();

  try {
    const hasil: unknown = JSON.parse(tersimpan);
    return isDemoOrderState(hasil) ? hasil : createInitialDemoOrderState();
  } catch {
    return createInitialDemoOrderState();
  }
}

export function saveDemoOrderState(state: DemoOrderState): void {
  if (typeof window === "undefined") return;

  try {
    window.localStorage.setItem(DEMO_ORDER_STORAGE_KEY, JSON.stringify(state));
  } catch {
    throw new Error(PESAN_STORAGE_TIDAK_TERSEDIA);
  }
}

export function addDemoOrder(input: DemoOrderInput): DemoOrder {
  const state = loadDemoOrderState();
  const pesananBaru: DemoOrder = {
    id: formatIdPesanan(state.nextSequence),
    tableNumber: input.tableNumber,
    customerName: input.customerName,
    items: input.items.map((item) => ({ name: item.name, quantity: item.quantity })),
    total: input.total,
    status: "Diterima",
    note: input.note,
  };

  const stateBerikut: DemoOrderState = {
    nextSequence: state.nextSequence + 1,
    orders: [...state.orders, pesananBaru],
  };

  saveDemoOrderState(stateBerikut);
  return pesananBaru;
}

export function updateDemoOrderStatus(orderId: string, status: DemoOrderStatus): DemoOrderState {
  const state = loadDemoOrderState();
  const stateBerikut: DemoOrderState = {
    nextSequence: state.nextSequence,
    orders: state.orders.map((order) => {
      if (order.id !== orderId) return order;
      return { ...order, status };
    }),
  };

  saveDemoOrderState(stateBerikut);
  return stateBerikut;
}

export function resetDemoOrderState(): DemoOrderState {
  const state = createInitialDemoOrderState();
  saveDemoOrderState(state);
  return state;
}
