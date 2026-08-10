/**
 * Shared domain types.
 *
 * Split out of store.tsx so seed-data.ts (and the SQL generator that reads it)
 * can import them without a circular dependency back into the provider.
 * store.tsx re-exports everything here, so `from "@/lib/store"` keeps working.
 */

export type Role = "admin" | "shop";

export interface Shop {
  id: string;
  name: string;
  address: string;
  phone: string;
  active: boolean;
}

export interface User {
  id: string;
  name: string;
  email: string;
  role: Role;
  shopId?: string;
  active: boolean;
  lastLogin?: string;
}

export interface Product {
  id: string;
  barcode: string;
  name: string;
  category: string;
  brand: string;
  size?: string;
  color?: string;
  cost: number;
  price: number;
  lowAlert: number;
  active: boolean;
}

export interface InventoryRow {
  productId: string;
  shopId: string;
  qty: number;
}

export interface SaleLine {
  productId: string;
  name: string;
  qty: number;
  price: number;
  cost: number;
  discount: number;
}

export interface Sale {
  id: string;
  invoice: string;
  shopId: string;
  date: string;
  customer: string;
  cashier: string;
  lines: SaleLine[];
  subtotal: number;
  discount: number;
  total: number;
  profit: number;
  payment: "Cash" | "Card" | "Online";
  status: "Completed" | "Returned" | "Partial";
  synced: boolean;
}

/** A wholesaler / vendor you buy stock from. */
export interface Supplier {
  id: string;
  name: string;
  contact: string;
  phone: string;
  email: string;
  address: string;
  notes: string;
  active: boolean;
}

export interface Purchase {
  id: string;
  billNo: string;
  /** Kept alongside supplierId so older bills still read correctly. */
  supplier: string;
  supplierId?: string;
  date: string;
  lines: { productId: string; shopId: string; qty: number; rate: number }[];
  total: number;
}

export interface Expense {
  id: string;
  date: string;
  shopId: string;
  category: string;
  description: string;
  amount: number;
  addedBy: string;
}

/**
 * Two distinct flows share this record:
 *  - "customer": a shopper brings goods back. Stock goes UP, money goes out.
 *  - "supplier": we send goods back to the wholesaler. Stock goes DOWN, we get credit.
 */
export type ReturnKind = "customer" | "supplier";

export interface ReturnRec {
  id: string;
  kind: ReturnKind;
  returnNo: string;
  date: string;
  shopId: string;
  /** Customer returns reference a sale invoice; supplier returns reference a purchase bill. */
  invoice: string;
  /** Supplier returns only. */
  supplier?: string;
  supplierId?: string;
  items: { productId: string; name: string; qty: number }[];
  /** Refund paid to the customer, or credit owed by the supplier. */
  refund: number;
  reason: string;
}

/** Which blocks appear on a printed receipt, and how it's laid out. */
export interface ReceiptDesign {
  showBusinessName: boolean;
  showAddress: boolean;
  showPhone: boolean;
  showHeaderText: boolean;
  showFooterText: boolean;
  showInvoiceNo: boolean;
  showDateTime: boolean;
  showCashier: boolean;
  showCustomer: boolean;
  showShopName: boolean;
  showItemBarcodes: boolean;
  showUnitPrice: boolean;
  showPaymentLine: boolean;
  showThankYouDivider: boolean;
  paperWidth: "58mm" | "80mm" | "A4";
  fontSize: "sm" | "md" | "lg";
  align: "left" | "center";
}

export const DEFAULT_RECEIPT: ReceiptDesign = {
  showBusinessName: true,
  showAddress: true,
  showPhone: true,
  showHeaderText: true,
  showFooterText: true,
  showInvoiceNo: true,
  showDateTime: true,
  showCashier: true,
  showCustomer: true,
  showShopName: true,
  showItemBarcodes: false,
  showUnitPrice: true,
  showPaymentLine: true,
  showThankYouDivider: true,
  paperWidth: "80mm",
  fontSize: "md",
  align: "center",
};

/**
 * Discounts live here rather than on Settings so the Discounts tab owns them.
 * A product's own percentage wins; anything without one uses `overallPct`.
 * Both are capped by `maxPct`.
 */
export interface DiscountRules {
  enabled: boolean;
  overallPct: number;
  maxPct: number;
  perProduct: Record<string, number>;
}

export const DEFAULT_DISCOUNTS: DiscountRules = {
  enabled: true,
  overallPct: 0,
  maxPct: 20,
  perProduct: {},
};

export interface Settings {
  businessName: string;
  currency: string;
  address: string;
  phone: string;
  taxNumber: string;
  invoicePrefix: string;
  receiptHeader: string;
  receiptFooter: string;
  lowStockDefault: number;
  receipt: ReceiptDesign;
}
