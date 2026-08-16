/**
 * The demo dataset.
 *
 * It is the single source of truth for two things:
 *  1. what the app shows when Supabase isn't configured, and
 *  2. what `scripts/gen-seed-sql.mjs` writes into supabase/seed.sql.
 *
 * Keeping one copy means the rows in Postgres are exactly the rows you see in
 * the UI today — nothing is hand-retyped into SQL and left to drift.
 */
import {
  DEFAULT_RECEIPT,
  type Customer,
  type CustomerPayment,
  type DaySession,
  type Expense,
  type InventoryRow,
  type Message,
  type Product,
  type Role,
  type Purchase,
  type Sale,
  type SaleLine,
  type Settings,
  type Shop,
  type Supplier,
  type User,
} from "./store-types";
import { localDay } from "./dates";

/**
 * "Central Wholesale" is the trade counter: an ordinary selling outlet whose
 * customers are other shopkeepers and bulk buyers, served at wholesale rates
 * rather than the shelf price.
 */
export const SHOPS: Shop[] = [
  { id: "s0", name: "Central Wholesale", kind: "wholesale", address: "Shahalam Market, Lahore", phone: "0300-0000000", active: true },
  { id: "s1", name: "Main Branch", kind: "retail", address: "Liberty Market, Lahore", phone: "0300-1111111", active: true },
  { id: "s2", name: "Gulberg Outlet", kind: "retail", address: "MM Alam Rd, Lahore", phone: "0300-2222222", active: true },
  { id: "s3", name: "DHA Outlet", kind: "retail", address: "Phase 5, DHA, Lahore", phone: "0300-3333333", active: true },
];

/** Only the retail branches ring up walk-in sales in the demo history. */
const RETAIL_SHOPS = SHOPS.filter((s) => s.kind !== "wholesale");

export const USERS: User[] = [
  { id: "u0", name: "Owner", email: "admin@apos.pk", role: "admin", active: true, lastLogin: "2026-06-28 09:14" },
  { id: "u1", name: "Shop 1 Cashier", email: "shop1@apos.pk", role: "shop", shopId: "s1", active: true, lastLogin: "2026-06-28 10:02" },
  { id: "u2", name: "Shop 2 Cashier", email: "shop2@apos.pk", role: "shop", shopId: "s2", active: true, lastLogin: "2026-06-27 18:45" },
  { id: "u3", name: "Shop 3 Cashier", email: "shop3@apos.pk", role: "shop", shopId: "s3", active: true, lastLogin: "2026-06-28 11:20" },
  { id: "u4", name: "Wholesale Counter", email: "wholesale@apos.pk", role: "shop", shopId: "s0", active: true, lastLogin: "2026-06-28 09:40" },
];

/** Wholesale rates sit roughly midway between cost and the retail price. */
export const PRODUCTS: Product[] = [
  { id: "p1", barcode: "8901001", name: "Matte Lipstick — Ruby 02", category: "Cosmetics", brand: "Glow", size: "—", color: "Ruby", cost: 280, price: 450, wholesalePrice: 360, lowAlert: 6, active: true },
  { id: "p2", barcode: "8901002", name: "Kajal Pencil — Black", category: "Cosmetics", brand: "Glow", cost: 80, price: 150, wholesalePrice: 115, lowAlert: 10, active: true },
  { id: "p3", barcode: "8901003", name: "Foundation Stick — Beige", category: "Cosmetics", brand: "Luxe", color: "Beige", cost: 620, price: 1100, wholesalePrice: 860, lowAlert: 4, active: true },
  { id: "p4", barcode: "8901004", name: "Compact Powder", category: "Cosmetics", brand: "Luxe", cost: 480, price: 850, wholesalePrice: 665, lowAlert: 5, active: true },
  { id: "p5", barcode: "8901005", name: "Cotton Kurti — Medium", category: "Clothing", brand: "Aira", size: "M", color: "White", cost: 1100, price: 2200, wholesalePrice: 1650, lowAlert: 3, active: true },
  { id: "p6", barcode: "8901006", name: "Embroidered Shawl", category: "Clothing", brand: "Aira", color: "Maroon", cost: 1800, price: 3500, wholesalePrice: 2650, lowAlert: 3, active: true },
  { id: "p7", barcode: "8901007", name: "Hair Serum 100ml", category: "Hair Care", brand: "Glow", cost: 540, price: 950, wholesalePrice: 745, lowAlert: 5, active: true },
  { id: "p8", barcode: "8901008", name: "Perfume — Rose 50ml", category: "Fragrance", brand: "Luxe", cost: 1500, price: 2800, wholesalePrice: 2150, lowAlert: 3, active: true },
  { id: "p9", barcode: "8901009", name: "Face Wash 150ml", category: "Skin Care", brand: "Glow", cost: 220, price: 420, wholesalePrice: 320, lowAlert: 8, active: true },
  { id: "p10", barcode: "8901010", name: "Nail Polish — Coral", category: "Cosmetics", brand: "Glow", color: "Coral", cost: 90, price: 200, wholesalePrice: 145, lowAlert: 10, active: true },
];

export const SUPPLIERS: Supplier[] = [
  {
    id: "sup1", name: "Glow Cosmetics Pvt", contact: "Bilal Ahmed", phone: "0321-4567890",
    email: "orders@glowcosmetics.pk", address: "Hall Road, Lahore", notes: "Delivers Mon & Thu. 30-day credit.", active: true,
  },
  {
    id: "sup2", name: "Luxe Distributors", contact: "Sana Malik", phone: "0300-9876543",
    email: "sales@luxedist.pk", address: "Shahalam Market, Lahore", notes: "Minimum order Rs 50,000.", active: true,
  },
  {
    id: "sup3", name: "Aira Textiles", contact: "Imran Sheikh", phone: "0333-1122334",
    email: "imran@airatextiles.pk", address: "Faisalabad", notes: "Seasonal stock, 2-week lead time.", active: true,
  },
];

/**
 * Trade buyers — other shopkeepers who buy in bulk at the wholesale counter and
 * mostly settle up later. The two retail names show that a regular walk-in can
 * be saved as a customer too, without any credit line.
 */
export const CUSTOMERS: Customer[] = [
  { id: "c1", name: "Bilal Traders", contact: "Bilal Ahmed", phone: "0321-4567890", address: "Hall Road, Lahore", notes: "Buys every Monday. Reliable payer.", kind: "wholesale", creditLimit: 150000, active: true },
  { id: "c2", name: "Noor Kirana Store", contact: "Noor Ul Haq", phone: "0300-7654321", address: "Shadman, Lahore", notes: "Small orders, pays within a week.", kind: "wholesale", creditLimit: 60000, active: true },
  { id: "c3", name: "Hassan General Store", contact: "Hassan Raza", phone: "0333-2233445", address: "Johar Town, Lahore", notes: "Seasonal buyer.", kind: "wholesale", creditLimit: 80000, active: true },
  { id: "c4", name: "Mehran Cosmetics", contact: "Sadia Mehran", phone: "0345-9988776", address: "Anarkali, Lahore", notes: "Cash only — no credit line.", kind: "wholesale", creditLimit: 0, active: true },
  { id: "c5", name: "Ayesha K.", contact: "Ayesha Khan", phone: "0301-1122334", address: "Gulberg, Lahore", notes: "Regular retail customer.", kind: "retail", creditLimit: 0, active: true },
];

/** The wholesale counter, where trade buyers are served. */
const WHOLESALE_SHOP = SHOPS.find((s) => s.kind === "wholesale")!;

/**
 * Bulk sales made on account at the wholesale counter.
 *
 * Deliberately left partly unpaid by `genCustomerPayments` so the Customers page
 * opens with real outstanding balances rather than a column of zeros.
 */
export function genCreditSales(): Sale[] {
  const buyers = CUSTOMERS.filter((c) => c.kind === "wholesale" && c.creditLimit > 0);
  let counter = 900;

  return buyers.flatMap((customer, ci) =>
    // Two orders each, spread across the fortnight.
    Array.from({ length: 2 }).map((_, k) => {
      const daysBack = 2 + ci * 3 + k * 4;
      const date = new Date();
      date.setDate(date.getDate() - daysBack);
      const businessDate = localDay(date);
      date.setHours(11 + k, 20, 0, 0);

      // Bulk quantities at the wholesale rate — that's what makes it a trade sale.
      const lines: SaleLine[] = [0, 1, 2].map((n) => {
        const p = PRODUCTS[(ci * 3 + k + n) % PRODUCTS.length];
        const price = p.wholesalePrice ?? p.price;
        return { productId: p.id, name: p.name, qty: 12 + n * 6, price, cost: p.cost, discount: 0 };
      });

      const subtotal = lines.reduce((a, l) => a + l.qty * l.price, 0);
      const profit = lines.reduce((a, l) => a + l.qty * (l.price - l.cost), 0);
      counter++;

      return {
        id: `sale-w${counter}`,
        invoice: `INV-W-${String(counter).padStart(6, "0")}`,
        shopId: WHOLESALE_SHOP.id,
        date: date.toISOString(),
        businessDate,
        sessionId: `day-${WHOLESALE_SHOP.id}-${businessDate}`,
        customer: customer.name,
        customerId: customer.id,
        cashier: "Wholesale Counter",
        lines,
        subtotal,
        discount: 0,
        total: subtotal,
        profit,
        // The whole point: goods out, money later.
        payment: "Credit" as const,
        status: "Completed" as const,
        synced: true,
      };
    }),
  );
}

/**
 * Part-payments against those credit sales.
 *
 * Each buyer clears their older invoice in full and pays roughly half of the
 * newer one, which is how a running khata actually looks — never zero, never
 * fully settled.
 */
export function genCustomerPayments(): CustomerPayment[] {
  const credit = genCreditSales();
  const out: CustomerPayment[] = [];
  let n = 0;

  CUSTOMERS.forEach((customer) => {
    const theirs = credit
      .filter((s) => s.customerId === customer.id)
      .sort((a, b) => a.date.localeCompare(b.date));
    if (theirs.length === 0) return;

    theirs.forEach((sale, i) => {
      const isOldest = i === 0;
      const amount = isOldest ? sale.total : Math.round(sale.total * 0.5);
      if (amount <= 0) return;
      const date = new Date(sale.date);
      // Paid a few days after the goods went out.
      date.setDate(date.getDate() + 2);
      const day = localDay(date);
      n++;
      out.push({
        id: `pay-${n}`,
        customerId: customer.id,
        date: day,
        amount,
        method: n % 3 === 0 ? "Online" : "Cash",
        shopId: WHOLESALE_SHOP.id,
        sessionId: `day-${WHOLESALE_SHOP.id}-${day}`,
        note: isOldest ? "Cleared previous bill" : "Part payment",
        receivedBy: "Wholesale Counter",
      });
    });
  });

  return out;
}

export function genInventory(): InventoryRow[] {
  const rows: InventoryRow[] = [];
  PRODUCTS.forEach((p, i) => {
    SHOPS.forEach((s, j) => {
      // The wholesale counter holds the bulk of the stock — it is what the
      // branches are restocked from.
      const base = s.kind === "wholesale" ? 90 : 12;
      rows.push({
        productId: p.id,
        shopId: s.id,
        qty: Math.max(0, base + ((i * 3 + j * 7) % 18) - (s.kind === "wholesale" ? 0 : i % 5 === 0 ? 10 : 0)),
      });
    });
  });
  return rows;
}

/** How many days of demo history the generators produce. */
const HISTORY_DAYS = 14;

export function genSales(): Sale[] {
  const out: Sale[] = [];
  const customers = ["Walk-in", "Ayesha K.", "Fatima R.", "Hassan A.", "Walk-in", "Maria S.", "Walk-in"];
  const payments: Sale["payment"][] = ["Cash", "Cash", "Card", "Cash", "Online", "Card", "Cash"];
  let counter = 100;
  for (let d = 0; d < HISTORY_DAYS; d++) {
    RETAIL_SHOPS.forEach((shop, si) => {
      const n = 2 + ((d + si) % 4);
      for (let k = 0; k < n; k++) {
        const p1 = PRODUCTS[(d + k + si) % PRODUCTS.length];
        const p2 = PRODUCTS[(d + k * 2 + si * 3) % PRODUCTS.length];
        const lines: SaleLine[] = [
          { productId: p1.id, name: p1.name, qty: 1 + (k % 3), price: p1.price, cost: p1.cost, discount: 0 },
          { productId: p2.id, name: p2.name, qty: 1, price: p2.price, cost: p2.cost, discount: 0 },
        ];
        const subtotal = lines.reduce((a, l) => a + l.qty * l.price, 0);
        const profit = lines.reduce((a, l) => a + l.qty * (l.price - l.cost), 0);
        const date = new Date();
        date.setDate(date.getDate() - d);
        // The trading day is the day the shop OPENED. One invoice per shop per
        // day is deliberately rung up after midnight so the day book has a real
        // late-night case to show: its timestamp is the next calendar date while
        // its businessDate stays on the day the shop opened.
        const businessDate = localDay(date);
        const afterMidnight = k === 0 && d % 4 === 1;
        if (afterMidnight) {
          date.setDate(date.getDate() + 1);
          date.setHours(0, 45, 0, 0);
        } else {
          date.setHours(10 + ((k * 3) % 9), (k * 17) % 60, 0, 0);
        }
        counter++;
        out.push({
          id: `sale-${counter}`,
          invoice: `INV-S${si + 1}-${String(counter).padStart(6, "0")}`,
          shopId: shop.id,
          date: date.toISOString(),
          businessDate,
          sessionId: `day-${shop.id}-${businessDate}`,
          customer: customers[(d + k) % customers.length],
          cashier: `Shop ${si + 1}`,
          lines,
          subtotal,
          discount: 0,
          total: subtotal,
          profit,
          payment: payments[(d + k + si) % payments.length],
          status: "Completed",
          synced: true,
        });
      }
    });
  }
  // Bulk sales on account at the wholesale counter live alongside the retail
  // history, so every screen sees one combined sales ledger.
  return [...out, ...genCreditSales()];
}

/**
 * Closed day sessions matching the generated sales, one per retail shop per day.
 *
 * Each night's cash is split the way the owner actually works: most of it is
 * taken away and a float is left in the drawer, which becomes the next morning's
 * opening cash. Ids match the `sessionId` stamped on the sales above.
 */
export function genDaySessions(): DaySession[] {
  const out: DaySession[] = [];
  const sales = genSales();
  const expenses = genExpenses();
  const payments = genCustomerPayments();

  // Every outlet keeps a day book, the wholesale counter included — it takes
  // cash and collects on old credit just like the branches do.
  SHOPS.forEach((shop) => {
    let float = 5000;
    // Oldest first, so each night's leftover float carries into the next day.
    for (let d = HISTORY_DAYS - 1; d >= 0; d--) {
      const day = new Date();
      day.setDate(day.getDate() - d);
      const businessDate = localDay(day);

      // Only CASH sales reach the drawer. Credit sales put goods out and no
      // money in, so they must not appear here or the till would read short by
      // exactly the amount that was lent out.
      const dayCash = sales
        .filter((s) => s.shopId === shop.id && s.businessDate === businessDate && s.payment === "Cash")
        .reduce((a, s) => a + s.total, 0);

      // Cash collected against credit given on an earlier day is real money in.
      const dayCollected = payments
        .filter((p) => p.shopId === shop.id && p.date === businessDate && p.method === "Cash")
        .reduce((a, p) => a + p.amount, 0);

      // Anything paid out of the till that day leaves less cash to count.
      const dayExpenses = expenses
        .filter((e) => e.shopId === shop.id && e.date === businessDate)
        .reduce((a, e) => a + e.amount, 0);

      const openedAt = new Date(day);
      openedAt.setHours(9, 30, 0, 0);
      const closedAt = new Date(day);
      closedAt.setHours(23, 45, 0, 0);

      // The demo tills balance exactly, so any variance you see in the app is
      // one you created rather than noise baked into the seed.
      const counted = Math.max(0, float + dayCash + dayCollected - dayExpenses);
      // The owner leaves a round float behind and takes the rest.
      const leftBehind = Math.min(counted, 5000);
      const taken = counted - leftBehind;

      out.push({
        id: `day-${shop.id}-${businessDate}`,
        shopId: shop.id,
        businessDate,
        openedAt: openedAt.toISOString(),
        openedBy: shop.name,
        openingCash: float,
        // Today is left OPEN so the app boots with a live day to sell into.
        status: d === 0 ? "open" : "closed",
        ...(d === 0
          ? {}
          : {
              closedAt: closedAt.toISOString(),
              closedBy: shop.name,
              countedCash: counted,
              cashTakenByOwner: taken,
              cashLeftInShop: leftBehind,
              notes: "",
            }),
      });

      if (d > 0) float = leftBehind;
    }
  });

  return out.sort((a, b) => b.businessDate.localeCompare(a.businessDate));
}

/**
 * Stock bought in from suppliers, spread across the outlets that need it. The
 * last two are raised by the shopkeepers themselves rather than by the owner,
 * which is what `createdByShopId` records.
 */
export function genPurchases(): Purchase[] {
  return Array.from({ length: 6 }).map((_, i) => {
    const date = new Date();
    date.setDate(date.getDate() - i * 4);
    const supplier = SUPPLIERS[i % SUPPLIERS.length];
    // Most bills stock the wholesale counter; every third goes to a branch.
    const target = i % 3 === 2 ? RETAIL_SHOPS[i % RETAIL_SHOPS.length] : SHOPS[0];
    const byShop = i >= 4;
    const lines = [
      { productId: PRODUCTS[i % PRODUCTS.length].id, shopId: target.id, qty: 20, rate: PRODUCTS[i % PRODUCTS.length].cost },
      { productId: PRODUCTS[(i + 2) % PRODUCTS.length].id, shopId: target.id, qty: 15, rate: PRODUCTS[(i + 2) % PRODUCTS.length].cost },
    ];
    const total = lines.reduce((a, l) => a + l.qty * l.rate, 0);
    return {
      id: `pur-${i + 1}`,
      billNo: `BILL-${2000 + i}`,
      supplier: supplier.name,
      supplierId: supplier.id,
      date: localDay(date),
      lines,
      total,
      createdBy: byShop ? `${target.name} Cashier` : "Owner",
      createdByShopId: byShop ? target.id : undefined,
      paid: i % 4 !== 1,
    };
  });
}

export function genExpenses(): Expense[] {
  const cats = ["Rent", "Salary", "Bills", "Transport", "Misc"];
  return Array.from({ length: 12 }).map((_, i) => {
    const date = new Date();
    date.setDate(date.getDate() - i * 2);
    const shop = RETAIL_SHOPS[i % RETAIL_SHOPS.length];
    const day = localDay(date);
    return {
      id: `exp-${i + 1}`,
      date: day,
      shopId: shop.id,
      category: cats[i % cats.length],
      description: `${cats[i % cats.length]} for ${shop.name}`,
      amount: 1500 + ((i * 350) % 6000),
      addedBy: i % 2 === 0 ? "Owner" : `${shop.name} Cashier`,
      // Ties the spend to that day's till so it shows up in the cash count.
      sessionId: `day-${shop.id}-${day}`,
    };
  });
}

/**
 * A short conversation per shop, so the messages screen has something to show
 * on demo data instead of four empty threads.
 *
 * The last message in each thread is from the shop and unread by the owner —
 * that is the state the screen is actually designed around: someone is waiting
 * on a reply, and the badge says so.
 */
export function genMessages(): Message[] {
  const script: { shopId: string; lines: { role: Role; body: string }[] }[] = [
    {
      shopId: "s1",
      lines: [
        { role: "admin", body: "Morning — new stock of the Glow lipsticks lands with you today. Put them on the front shelf." },
        { role: "shop", body: "Got it. The Ruby 02 shade is nearly finished, only 3 left." },
        { role: "shop", body: "Also a customer asked if we can do a bulk rate on 20 units. What should I quote?" },
      ],
    },
    {
      shopId: "s2",
      lines: [
        { role: "shop", body: "Till was 500 short last night — I think I gave wrong change on the last sale. Noted it in the day book." },
        { role: "admin", body: "Thanks for flagging it. Recount at open tomorrow and let me know." },
      ],
    },
    {
      shopId: "s0",
      lines: [
        { role: "admin", body: "Bilal Traders have hit their credit limit. No more on account until they settle." },
        { role: "shop", body: "Understood. They're coming in tomorrow, I'll ask for payment then." },
      ],
    },
  ];

  const out: Message[] = [];
  let n = 0;
  script.forEach(({ shopId, lines }) => {
    // Anything the other side has already answered counts as seen; only the
    // trailing run — the part still waiting on a reply — stays unread.
    const trailingRole = lines[lines.length - 1].role;
    let firstUnanswered = lines.length - 1;
    while (firstUnanswered > 0 && lines[firstUnanswered - 1].role === trailingRole) firstUnanswered--;

    lines.forEach((line, i) => {
      n++;
      const at = new Date();
      // Spread backwards through the day so the thread reads in order.
      at.setHours(at.getHours() - (lines.length - i) * 2, 15 * (n % 4), 0, 0);
      const fromShop = line.role === "shop";
      const answered = i < firstUnanswered;
      out.push({
        id: `msg-seed-${n}`,
        shopId,
        fromRole: line.role,
        fromUserId: fromShop ? USERS.find((u) => u.shopId === shopId)?.id : "u0",
        fromName: fromShop ? USERS.find((u) => u.shopId === shopId)?.name ?? "Shop" : "Owner",
        body: line.body,
        createdAt: at.toISOString(),
        // The sender has seen their own message; the other side has seen it
        // only if they have since replied.
        readByAdmin: !fromShop || answered,
        readByShop: fromShop || answered,
      });
    });
  });
  return out.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

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
};
