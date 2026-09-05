/**
 * What a brand new business starts with.
 *
 * Settings only — no shops, no products, no invented sales. An empty system
 * is the correct state for an install nobody has set up yet, and the app is
 * expected to show it as empty rather than fill it with something plausible.
 */
import type { Settings } from "./store-types";
import { DEFAULT_INVOICE, DEFAULT_RECEIPT } from "./store-types";

export const DEFAULT_SETTINGS: Settings = {
  businessName: "A-POS Retail",
  currency: "Rs",
  address: "Lahore, Pakistan",
  phone: "0300-1234567",
  taxNumber: "",
  invoicePrefix: "INV",
  receiptHeader: "Thank you for shopping with us",
  receiptFooter: "Thank You! Visit again",
  lowStockDefault: 5,
  receipt: DEFAULT_RECEIPT,
  invoiceNote: "",
  invoiceTerms: "Goods once sold are not returnable. Please check items on delivery.",
  invoiceTitle: "INVOICE / BILL",
  invoiceSignatory: "Authorised signature",
  invoiceCopyLabel: "ORIGINAL",
  invoiceLogo: "",
  invoice: DEFAULT_INVOICE,
};
