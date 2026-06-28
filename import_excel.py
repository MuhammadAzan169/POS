"""
import_excel.py  —  one-time migration from POS.xlsx into pos.db

Run it once to seed the database with the data you already have:

    python import_excel.py

It is SAFE to re-run: it drops and rebuilds the tables from schema.sql,
then re-imports everything from the spreadsheet. (So treat POS.xlsx as the
source of truth only until you start using the web app for real.)
"""

import os
import sqlite3
from datetime import datetime, date

import openpyxl

HERE = os.path.dirname(os.path.abspath(__file__))
XLSX = os.path.join(HERE, "POS.xlsx")
DB = os.path.join(HERE, "pos.db")
SCHEMA = os.path.join(HERE, "schema.sql")


def iso(value):
    """Turn an Excel date/datetime cell into 'YYYY-MM-DD' text."""
    if isinstance(value, (datetime, date)):
        return value.strftime("%Y-%m-%d")
    if value in (None, ""):
        return None
    return str(value)


def num(value, default=0):
    """Best-effort number conversion."""
    if value in (None, ""):
        return default
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


def rows(ws, start=2):
    """Yield rows (1-based index ignored) starting after the header."""
    for row in ws.iter_rows(min_row=start, values_only=True):
        # skip completely empty / placeholder rows
        if row is None or all(c is None or c == "" or c == 0 for c in row):
            continue
        yield row


def main():
    if not os.path.exists(XLSX):
        raise SystemExit(f"Cannot find {XLSX}")

    # Fresh database from schema
    if os.path.exists(DB):
        os.remove(DB)
    con = sqlite3.connect(DB)
    con.execute("PRAGMA foreign_keys = ON")
    with open(SCHEMA, "r", encoding="utf-8") as f:
        con.executescript(f.read())

    wb = openpyxl.load_workbook(XLSX, data_only=True)

    # ---------- Products ----------
    ws = wb["Products"]
    n = 0
    for r in rows(ws):
        # Barcode, Name, Category, Brand, Size, Color, Cost, Price, Stock, LowAlert
        barcode = r[0]
        if barcode in (None, "", 0):
            continue
        con.execute(
            """INSERT OR REPLACE INTO products
               (barcode,name,category,brand,size,color,cost,price,stock,low_alert)
               VALUES (?,?,?,?,?,?,?,?,?,?)""",
            (str(barcode), r[1], r[2], r[3], r[4], r[5],
             num(r[6]), num(r[7]), int(num(r[8])), int(num(r[9]))),
        )
        n += 1
    print(f"  products  : {n}")

    # ---------- Customers ----------
    ws = wb["Customers"]
    n = 0
    for r in rows(ws):
        if r[0] in (None, ""):
            continue
        con.execute(
            "INSERT OR REPLACE INTO customers (id,name,contact,whatsapp) VALUES (?,?,?,?)",
            (str(r[0]), r[1], r[2] and str(r[2]), r[3] and str(r[3])),
        )
        n += 1
    print(f"  customers : {n}")

    # ---------- Suppliers ----------
    ws = wb["Suppliers"]
    n = 0
    for r in rows(ws):
        if r[0] in (None, ""):
            continue
        con.execute(
            "INSERT OR REPLACE INTO suppliers (id,name,phone,address) VALUES (?,?,?,?)",
            (str(r[0]), r[1], r[2] and str(r[2]), r[3]),
        )
        n += 1
    print(f"  suppliers : {n}")

    # ---------- Sales (Excel stores them as flat line rows) ----------
    # Columns: Invoice, Date, Cashier, Customer(name), Barcode, Product, Qty, Price, Discount, Net, Profit
    ws = wb["Sales"]
    # customer name -> id lookup
    name_to_cid = {row[0]: row[1] for row in
                   con.execute("SELECT name,id FROM customers")}
    headers = {}  # invoice -> aggregated header
    items = 0
    for r in rows(ws):
        invoice = r[0]
        if invoice in (None, ""):
            continue
        invoice = str(invoice)
        cust_id = name_to_cid.get(r[3])
        net = num(r[9])
        profit = num(r[10])
        if invoice not in headers:
            headers[invoice] = {
                "date": iso(r[1]), "cashier": r[2], "customer_id": cust_id,
                "net": 0.0, "profit": 0.0,
            }
            con.execute(
                """INSERT OR IGNORE INTO sales
                   (invoice,date,cashier,customer_id,total_net,total_profit)
                   VALUES (?,?,?,?,0,0)""",
                (invoice, headers[invoice]["date"], r[2], cust_id),
            )
        headers[invoice]["net"] += net
        headers[invoice]["profit"] += profit
        con.execute(
            """INSERT INTO sale_items
               (invoice,barcode,product,qty,price,discount,net,profit)
               VALUES (?,?,?,?,?,?,?,?)""",
            (invoice, r[4] and str(r[4]), r[5], int(num(r[6], 1)),
             num(r[7]), num(r[8]), net, profit),
        )
        items += 1
    for inv, h in headers.items():
        con.execute("UPDATE sales SET total_net=?, total_profit=? WHERE invoice=?",
                    (h["net"], h["profit"], inv))
    print(f"  sales     : {len(headers)} invoices, {items} line items")

    # ---------- Purchases (flat line rows) ----------
    # PO ID, PO Date, VEND BILL, BILL DATE, VEND ID, Supplier, Barcode, Item, Cat, Brand, Size, Color, Qty, Rate, Amount
    ws = wb["Purchases"]
    seen_po = set()
    items = 0
    for r in rows(ws):
        po = r[0]
        if po in (None, ""):
            continue
        po = str(po)
        if po not in seen_po:
            con.execute(
                """INSERT OR IGNORE INTO purchases
                   (po_id,po_date,vend_bill,bill_date,vendor_id)
                   VALUES (?,?,?,?,?)""",
                (po, iso(r[1]), r[2] and str(r[2]), iso(r[3]), r[4] and str(r[4])),
            )
            seen_po.add(po)
        con.execute(
            """INSERT INTO purchase_items
               (po_id,barcode,item_name,category,brand,size,color,qty,rate,amount)
               VALUES (?,?,?,?,?,?,?,?,?,?)""",
            (po, r[6] and str(r[6]), r[7], r[8], r[9], r[10], r[11],
             int(num(r[12])), num(r[13]), num(r[14])),
        )
        items += 1
    print(f"  purchases : {len(seen_po)} orders, {items} line items")

    con.commit()
    con.close()
    print(f"\nDone. Database written to {DB}")


if __name__ == "__main__":
    print("Importing POS.xlsx -> pos.db ...")
    main()
