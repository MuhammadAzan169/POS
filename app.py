"""
A-POS  —  Local web-based Point of Sale
=======================================
Run it:           python app.py
Open on this PC:  http://localhost:5000
Open on another device on the same Wi-Fi:  http://<this-pc-ip>:5000
(the IP is printed in the terminal when the app starts)
"""

import os
import socket
import sqlite3
from datetime import datetime, date

from flask import (Flask, g, render_template, request, redirect,
                   url_for, jsonify, flash)

HERE = os.path.dirname(os.path.abspath(__file__))
DB = os.path.join(HERE, "pos.db")

app = Flask(__name__)
app.secret_key = "change-this-to-anything-random"   # used for flash messages


# ----------------------------------------------------------------------
#  Database helpers
# ----------------------------------------------------------------------
def get_db():
    """One connection per request, stored on Flask's `g`."""
    if "db" not in g:
        g.db = sqlite3.connect(DB)
        g.db.row_factory = sqlite3.Row          # rows behave like dicts
        g.db.execute("PRAGMA foreign_keys = ON")
    return g.db


@app.teardown_appcontext
def close_db(exc):
    db = g.pop("db", None)
    if db is not None:
        db.close()


def query(sql, args=(), one=False):
    cur = get_db().execute(sql, args)
    rv = cur.fetchall()
    cur.close()
    return (rv[0] if rv else None) if one else rv


def execute(sql, args=()):
    db = get_db()
    cur = db.execute(sql, args)
    db.commit()
    return cur


def next_id(table, column, prefix, width=6):
    """Generate the next sequential id like INV-000007."""
    rows = query(f"SELECT {column} AS v FROM {table} WHERE {column} LIKE ?",
                 (prefix + "%",))
    nums = []
    for r in rows:
        tail = str(r["v"]).replace(prefix, "")
        if tail.isdigit():
            nums.append(int(tail))
    nxt = (max(nums) + 1) if nums else 1
    return f"{prefix}{nxt:0{width}d}"


# ----------------------------------------------------------------------
#  Dashboard
# ----------------------------------------------------------------------
@app.route("/")
def dashboard():
    today = date.today().isoformat()
    stats = {
        "products": query("SELECT COUNT(*) c FROM products", one=True)["c"],
        "customers": query("SELECT COUNT(*) c FROM customers", one=True)["c"],
        "suppliers": query("SELECT COUNT(*) c FROM suppliers", one=True)["c"],
        "sales_today": query(
            "SELECT COALESCE(SUM(total_net),0) v FROM sales WHERE date=?",
            (today,), one=True)["v"],
        "profit_today": query(
            "SELECT COALESCE(SUM(total_profit),0) v FROM sales WHERE date=?",
            (today,), one=True)["v"],
    }
    low_stock = query(
        "SELECT * FROM products WHERE stock <= low_alert ORDER BY stock ASC")
    recent = query(
        """SELECT s.invoice, s.date, s.total_net, c.name AS customer
           FROM sales s LEFT JOIN customers c ON c.id = s.customer_id
           ORDER BY s.date DESC, s.invoice DESC LIMIT 8""")
    return render_template("dashboard.html", stats=stats,
                           low_stock=low_stock, recent=recent, today=today)


# ----------------------------------------------------------------------
#  Products
# ----------------------------------------------------------------------
@app.route("/products")
def products():
    q = request.args.get("q", "").strip()
    if q:
        like = f"%{q}%"
        rows = query(
            """SELECT * FROM products
               WHERE barcode LIKE ? OR name LIKE ? OR brand LIKE ? OR category LIKE ?
               ORDER BY name""", (like, like, like, like))
    else:
        rows = query("SELECT * FROM products ORDER BY name")
    return render_template("products.html", products=rows, q=q)


@app.route("/products/new", methods=["GET", "POST"])
@app.route("/products/<barcode>/edit", methods=["GET", "POST"])
def product_form(barcode=None):
    product = None
    if barcode:
        product = query("SELECT * FROM products WHERE barcode=?", (barcode,), one=True)

    if request.method == "POST":
        f = request.form
        data = (f["name"], f["category"], f["brand"], f["size"], f["color"],
                float(f["cost"] or 0), float(f["price"] or 0),
                int(f["stock"] or 0), int(f["low_alert"] or 0))
        if barcode:   # update
            execute("""UPDATE products SET name=?,category=?,brand=?,size=?,color=?,
                       cost=?,price=?,stock=?,low_alert=? WHERE barcode=?""",
                    data + (barcode,))
            flash(f"Product {barcode} updated.", "ok")
        else:         # create
            new_code = f["barcode"].strip()
            execute("""INSERT INTO products
                       (barcode,name,category,brand,size,color,cost,price,stock,low_alert)
                       VALUES (?,?,?,?,?,?,?,?,?,?)""", (new_code,) + data)
            flash(f"Product {new_code} added.", "ok")
        return redirect(url_for("products"))

    return render_template("product_form.html", product=product)


@app.route("/products/<barcode>/delete", methods=["POST"])
def product_delete(barcode):
    execute("DELETE FROM products WHERE barcode=?", (barcode,))
    flash(f"Product {barcode} deleted.", "ok")
    return redirect(url_for("products"))


# ----------------------------------------------------------------------
#  Customers
# ----------------------------------------------------------------------
@app.route("/customers", methods=["GET", "POST"])
def customers():
    if request.method == "POST":
        f = request.form
        cid = f.get("id") or next_id("customers", "id", "CUS-", 4)
        execute("INSERT OR REPLACE INTO customers (id,name,contact,whatsapp) VALUES (?,?,?,?)",
                (cid, f["name"], f["contact"], f["whatsapp"]))
        flash(f"Customer {cid} saved.", "ok")
        return redirect(url_for("customers"))
    rows = query("SELECT * FROM customers ORDER BY name")
    return render_template("customers.html", customers=rows)


# ----------------------------------------------------------------------
#  Suppliers
# ----------------------------------------------------------------------
@app.route("/suppliers", methods=["GET", "POST"])
def suppliers():
    if request.method == "POST":
        f = request.form
        sid = f.get("id") or next_id("suppliers", "id", "VEND-", 4)
        execute("INSERT OR REPLACE INTO suppliers (id,name,phone,address) VALUES (?,?,?,?)",
                (sid, f["name"], f["phone"], f["address"]))
        flash(f"Supplier {sid} saved.", "ok")
        return redirect(url_for("suppliers"))
    rows = query("SELECT * FROM suppliers ORDER BY name")
    return render_template("suppliers.html", suppliers=rows)


# ----------------------------------------------------------------------
#  Sale / Checkout
# ----------------------------------------------------------------------
@app.route("/sale")
def sale():
    customers_list = query("SELECT id,name FROM customers ORDER BY name")
    return render_template("sale.html", customers=customers_list)


@app.route("/api/product/<barcode>")
def api_product(barcode):
    """Barcode-scanner lookup. Scanner 'types' the code + Enter -> this is called."""
    p = query("SELECT * FROM products WHERE barcode=?", (barcode,), one=True)
    if not p:
        return jsonify(found=False)
    return jsonify(found=True, barcode=p["barcode"], name=p["name"],
                   price=p["price"], cost=p["cost"], stock=p["stock"])


@app.route("/api/sale", methods=["POST"])
def api_sale():
    """Save a completed sale. Body: {customer_id, cashier, items:[{barcode,qty,price,discount}]}"""
    data = request.get_json(force=True)
    items = data.get("items", [])
    if not items:
        return jsonify(ok=False, error="No items in cart"), 400

    invoice = next_id("sales", "invoice", "INV-", 6)
    today = date.today().isoformat()
    cashier = (data.get("cashier") or "").strip() or "Counter"
    customer_id = data.get("customer_id") or None

    total_net = total_profit = 0.0
    db = get_db()
    db.execute("""INSERT INTO sales (invoice,date,cashier,customer_id,total_net,total_profit)
                  VALUES (?,?,?,?,0,0)""", (invoice, today, cashier, customer_id))

    for it in items:
        p = query("SELECT * FROM products WHERE barcode=?", (it["barcode"],), one=True)
        qty = int(it.get("qty", 1))
        price = float(it.get("price", p["price"] if p else 0))
        discount = float(it.get("discount", 0))
        net = price * qty - discount
        cost = (p["cost"] if p else 0)
        profit = net - cost * qty
        total_net += net
        total_profit += profit
        db.execute("""INSERT INTO sale_items
                      (invoice,barcode,product,qty,price,discount,net,profit)
                      VALUES (?,?,?,?,?,?,?,?)""",
                   (invoice, it["barcode"], p["name"] if p else it.get("name"),
                    qty, price, discount, net, profit))
        if p:   # reduce stock
            db.execute("UPDATE products SET stock = stock - ? WHERE barcode=?",
                       (qty, it["barcode"]))

    db.execute("UPDATE sales SET total_net=?, total_profit=? WHERE invoice=?",
               (total_net, total_profit, invoice))
    db.commit()
    return jsonify(ok=True, invoice=invoice, total_net=total_net)


@app.route("/sales")
def sales_list():
    rows = query("""SELECT s.*, c.name AS customer
                    FROM sales s LEFT JOIN customers c ON c.id=s.customer_id
                    ORDER BY s.date DESC, s.invoice DESC LIMIT 200""")
    return render_template("sales_list.html", sales=rows)


@app.route("/sales/<invoice>")
def sale_detail(invoice):
    head = query("""SELECT s.*, c.name AS customer, c.contact, c.whatsapp
                    FROM sales s LEFT JOIN customers c ON c.id=s.customer_id
                    WHERE s.invoice=?""", (invoice,), one=True)
    items = query("SELECT * FROM sale_items WHERE invoice=?", (invoice,))
    return render_template("receipt.html", head=head, items=items)


# ----------------------------------------------------------------------
#  Reports
# ----------------------------------------------------------------------
@app.route("/reports")
def reports():
    today = date.today().isoformat()
    frm = request.args.get("from", today)
    to = request.args.get("to", today)
    kind = request.args.get("kind", "sales")

    sales = purchases = None
    totals = {}
    if kind == "sales":
        sales = query("""SELECT s.invoice,s.date,s.cashier,c.name AS customer,
                                s.total_net,s.total_profit
                         FROM sales s LEFT JOIN customers c ON c.id=s.customer_id
                         WHERE s.date BETWEEN ? AND ?
                         ORDER BY s.date, s.invoice""", (frm, to))
        totals["net"] = sum(r["total_net"] for r in sales)
        totals["profit"] = sum(r["total_profit"] for r in sales)
    elif kind == "purchases":
        purchases = query("""SELECT p.po_id,p.po_date,sup.name AS supplier,
                                    SUM(pi.amount) AS amount
                             FROM purchases p
                             LEFT JOIN suppliers sup ON sup.id=p.vendor_id
                             LEFT JOIN purchase_items pi ON pi.po_id=p.po_id
                             WHERE p.po_date BETWEEN ? AND ?
                             GROUP BY p.po_id ORDER BY p.po_date""", (frm, to))
        totals["amount"] = sum((r["amount"] or 0) for r in purchases)

    inventory = None
    if kind == "inventory":
        inventory = query("""SELECT barcode,name,category,brand,size,color,
                                    stock,low_alert,cost,price,
                                    CASE WHEN stock<=low_alert THEN 'LOW STOCK' ELSE 'OK' END status
                             FROM products ORDER BY status DESC, name""")

    return render_template("reports.html", kind=kind, frm=frm, to=to,
                           sales=sales, purchases=purchases,
                           inventory=inventory, totals=totals)


# ----------------------------------------------------------------------
#  Entry point
# ----------------------------------------------------------------------
def local_ip():
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except Exception:
        return "127.0.0.1"


if __name__ == "__main__":
    if not os.path.exists(DB):
        print("\n  pos.db not found. Run this first:  python import_excel.py\n")
    ip = local_ip()
    print("=" * 56)
    print("  A-POS is running")
    print(f"  On this PC:        http://localhost:5000")
    print(f"  On other devices:  http://{ip}:5000")
    print("  Press CTRL+C to stop")
    print("=" * 56)
    app.run(host="0.0.0.0", port=5000, debug=True)
