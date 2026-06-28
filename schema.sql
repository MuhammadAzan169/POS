-- ============================================================
--  A-POS  —  SQLite database schema
--  One file (pos.db) holds everything. Copy that file to back up.
-- ============================================================

PRAGMA foreign_keys = ON;

-- ---------- Catalogue ----------
CREATE TABLE IF NOT EXISTS products (
    barcode     TEXT PRIMARY KEY,          -- "Barcode/Item Code"
    name        TEXT NOT NULL,
    category    TEXT,
    brand       TEXT,
    size        TEXT,
    color       TEXT,
    cost        REAL DEFAULT 0,            -- what you paid
    price       REAL DEFAULT 0,            -- what you sell for
    stock       INTEGER DEFAULT 0,         -- live quantity on hand
    low_alert   INTEGER DEFAULT 0          -- warn when stock <= this
);

-- ---------- People ----------
CREATE TABLE IF NOT EXISTS customers (
    id          TEXT PRIMARY KEY,          -- CUS-0001
    name        TEXT NOT NULL,
    contact     TEXT,
    whatsapp    TEXT
);

CREATE TABLE IF NOT EXISTS suppliers (
    id          TEXT PRIMARY KEY,          -- VEND-0001
    name        TEXT NOT NULL,
    phone       TEXT,
    address     TEXT
);

-- ---------- Sales (header + line items) ----------
CREATE TABLE IF NOT EXISTS sales (
    invoice       TEXT PRIMARY KEY,        -- INV-000001
    date          TEXT NOT NULL,           -- ISO date 'YYYY-MM-DD'
    cashier       TEXT,
    customer_id   TEXT,
    total_net     REAL DEFAULT 0,
    total_profit  REAL DEFAULT 0,
    FOREIGN KEY (customer_id) REFERENCES customers(id)
);

CREATE TABLE IF NOT EXISTS sale_items (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    invoice     TEXT NOT NULL,
    barcode     TEXT,
    product     TEXT,
    qty         INTEGER NOT NULL DEFAULT 1,
    price       REAL DEFAULT 0,
    discount    REAL DEFAULT 0,
    net         REAL DEFAULT 0,
    profit      REAL DEFAULT 0,
    FOREIGN KEY (invoice) REFERENCES sales(invoice) ON DELETE CASCADE,
    FOREIGN KEY (barcode) REFERENCES products(barcode)
);

-- ---------- Purchases (header + line items) ----------
CREATE TABLE IF NOT EXISTS purchases (
    po_id       TEXT PRIMARY KEY,          -- PO-000001
    po_date     TEXT NOT NULL,
    vend_bill   TEXT,
    bill_date   TEXT,
    vendor_id   TEXT,
    FOREIGN KEY (vendor_id) REFERENCES suppliers(id)
);

CREATE TABLE IF NOT EXISTS purchase_items (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    po_id       TEXT NOT NULL,
    barcode     TEXT,
    item_name   TEXT,
    category    TEXT,
    brand       TEXT,
    size        TEXT,
    color       TEXT,
    qty         INTEGER NOT NULL DEFAULT 0,
    rate        REAL DEFAULT 0,
    amount      REAL DEFAULT 0,
    FOREIGN KEY (po_id) REFERENCES purchases(po_id) ON DELETE CASCADE,
    FOREIGN KEY (barcode) REFERENCES products(barcode)
);

-- Helpful indexes for reports by date
CREATE INDEX IF NOT EXISTS idx_sales_date     ON sales(date);
CREATE INDEX IF NOT EXISTS idx_purchases_date ON purchases(po_date);
CREATE INDEX IF NOT EXISTS idx_saleitems_inv  ON sale_items(invoice);
CREATE INDEX IF NOT EXISTS idx_poitems_po     ON purchase_items(po_id);
