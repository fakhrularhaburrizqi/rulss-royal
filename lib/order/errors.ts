export type OrderErrorCode =
  | "UNAUTHENTICATED"
  | "OUTLET_NOT_FOUND"
  | "OUTLET_ACCESS_DENIED"
  | "INVALID_INPUT"
  | "AMOUNT_OUT_OF_RANGE"
  | "MENU_ITEM_UNAVAILABLE"
  | "TABLE_REQUIRED"
  | "TABLE_NOT_FOUND"
  | "ORDER_NOT_FOUND"
  | "INVALID_TRANSITION"
  | "VERSION_CONFLICT"
  | "ORDER_LIMIT_REACHED"
  | "ORDER_NUMBER_CONFLICT"
  | "INTERNAL_ERROR"
  | "CATEGORY_NOT_FOUND"
  | "MENU_ITEM_NOT_FOUND"
  | "CATEGORY_NAME_CONFLICT"
  | "MENU_NAME_CONFLICT"
  | "CATEGORY_NOT_AVAILABLE"
  | "CATALOG_VERSION_CONFLICT"
  | "CATALOG_STATE_CONFLICT";

const ORDER_ERROR_MESSAGES: Readonly<Record<OrderErrorCode, string>> = {
  UNAUTHENTICATED: "Sesi Anda tidak valid. Silakan masuk kembali.",
  OUTLET_NOT_FOUND: "Outlet tidak ditemukan.",
  OUTLET_ACCESS_DENIED: "Anda tidak memiliki akses ke outlet ini.",
  INVALID_INPUT: "Data yang dikirim tidak valid.",
  AMOUNT_OUT_OF_RANGE: "Nilai nominal melewati batas yang diizinkan.",
  MENU_ITEM_UNAVAILABLE: "Salah satu menu tidak tersedia.",
  TABLE_REQUIRED: "Nomor meja wajib diisi untuk pesanan ini.",
  TABLE_NOT_FOUND: "Meja tidak ditemukan.",
  ORDER_NOT_FOUND: "Pesanan tidak ditemukan.",
  INVALID_TRANSITION: "Perubahan status pesanan tidak diizinkan.",
  VERSION_CONFLICT: "Pesanan telah diperbarui oleh pengguna lain. Muat ulang data terbaru.",
  ORDER_LIMIT_REACHED: "Jumlah pesanan hari ini sudah mencapai batas maksimum.",
  ORDER_NUMBER_CONFLICT: "Gagal membuat nomor pesanan. Silakan coba lagi.",
  INTERNAL_ERROR: "Terjadi kesalahan. Silakan coba lagi.",
  CATEGORY_NOT_FOUND: "Kategori tidak ditemukan.",
  MENU_ITEM_NOT_FOUND: "Menu tidak ditemukan.",
  CATEGORY_NAME_CONFLICT: "Nama kategori sudah digunakan di outlet ini.",
  MENU_NAME_CONFLICT: "Nama menu sudah digunakan di outlet ini.",
  CATEGORY_NOT_AVAILABLE: "Kategori tidak tersedia untuk digunakan.",
  CATALOG_VERSION_CONFLICT:
    "Data katalog telah diperbarui oleh pengguna lain. Muat ulang data terbaru.",
  CATALOG_STATE_CONFLICT: "Status katalog tidak sesuai untuk operasi ini. Muat ulang data terbaru.",
};

export function getOrderErrorMessage(code: OrderErrorCode): string {
  return ORDER_ERROR_MESSAGES[code];
}

export class OrderDomainError extends Error {
  readonly code: OrderErrorCode;

  constructor(code: OrderErrorCode) {
    super(getOrderErrorMessage(code));
    this.name = "OrderDomainError";
    this.code = code;
    Object.setPrototypeOf(this, OrderDomainError.prototype);
  }
}

function getPrismaErrorCode(error: unknown): string | null {
  if (typeof error !== "object" || error === null) {
    return null;
  }
  const code = (error as { code?: unknown }).code;
  return typeof code === "string" ? code : null;
}

function getUniqueTarget(error: unknown): string | null {
  if (typeof error !== "object" || error === null) {
    return null;
  }
  const meta = (error as { meta?: unknown }).meta;
  if (typeof meta !== "object" || meta === null) {
    return null;
  }
  const target = (meta as { target?: unknown }).target;
  if (typeof target === "string") {
    const normalized = target.trim().toLowerCase();
    return normalized === "" ? null : normalized;
  }
  if (Array.isArray(target)) {
    const parts = target.map((item) => String(item).trim().toLowerCase()).filter(Boolean);
    return parts.length > 0 ? parts.join(",") : null;
  }
  return null;
}

const ORDER_NUMBER_UNIQUE_FIELDS = ["tenantid", "outletid", "ordernumber"] as const;

export function isOrderNumberUniqueViolation(error: unknown): boolean {
  if (getPrismaErrorCode(error) !== "P2002") {
    return false;
  }
  const target = getUniqueTarget(error);
  if (target === null) {
    return false;
  }
  return ORDER_NUMBER_UNIQUE_FIELDS.every((field) => target.includes(field));
}

const CATALOG_NAME_UNIQUE_FIELDS = ["tenantid", "outletid", "name"] as const;

const CATALOG_NAME_UNIQUE_CONSTRAINTS = [
  "menucategory_tenantid_outletid_name_key",
  "menuitem_tenantid_outletid_name_key",
] as const;

const CATALOG_NAME_TARGET_SPLIT = /[,+|_\s]+/;

function matchesCatalogNameComposite(parts: readonly string[]): boolean {
  if (parts.length !== CATALOG_NAME_UNIQUE_FIELDS.length) {
    return false;
  }
  const uniqueParts = new Set(parts);
  return CATALOG_NAME_UNIQUE_FIELDS.every((field) => uniqueParts.has(field));
}

export function isCatalogNameUniqueViolation(error: unknown): boolean {
  if (getPrismaErrorCode(error) !== "P2002") {
    return false;
  }

  const meta = (error as { meta?: unknown }).meta;
  if (typeof meta !== "object" || meta === null) {
    return false;
  }
  const target = (meta as { target?: unknown }).target;

  if (Array.isArray(target)) {
    const parts = target
      .map((item) => String(item).trim().toLowerCase())
      .filter((item) => item !== "");
    return matchesCatalogNameComposite(parts);
  }

  if (typeof target === "string") {
    const normalized = target.trim().toLowerCase();
    if (normalized === "") {
      return false;
    }
    if (CATALOG_NAME_UNIQUE_CONSTRAINTS.some((constraint) => normalized === constraint)) {
      return true;
    }
    const parts = normalized
      .replace(/[^a-z0-9,+|_\s]+/g, " ")
      .split(CATALOG_NAME_TARGET_SPLIT)
      .map((part) => part.trim())
      .filter((part) => part !== "");
    return matchesCatalogNameComposite(parts);
  }

  return false;
}

export function toOrderError(error: unknown): OrderDomainError {
  if (error instanceof OrderDomainError) {
    return error;
  }
  const code = getPrismaErrorCode(error);
  if (code === "P2020") {
    return new OrderDomainError("AMOUNT_OUT_OF_RANGE");
  }
  if (code === "P2003") {
    return new OrderDomainError("INVALID_INPUT");
  }
  return new OrderDomainError("INTERNAL_ERROR");
}
