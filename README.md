# A-POS — Local Point of Sale

A small browser-based POS for a single shop. Runs on your shop PC; any other
device on the same Wi-Fi (counter PC, laptop, phone) can use it too. Works
offline — it only needs your local network, not the internet.

Built with **Python + Flask + SQLite**. All data lives in one file: `pos.db`.

---

## 1. First-time setup (do this once)

Open **PowerShell** in this folder and run:

```powershell
pip install -r requirements.txt   # install Flask + openpyxl
python import_excel.py            # load your POS.xlsx data into pos.db
```

## 2. Start the app (every time you open the shop)

```powershell
python app.py
```

You'll see something like:

```
  On this PC:        http://localhost:5000
  On other devices:  http://192.168.1.20:5000
```

- On the shop PC, open **http://localhost:5000**
- On another device, open the **http://192.168.x.x:5000** address shown

Press **CTRL+C** in the terminal to stop the server.

> First time another device connects, Windows may ask to allow Python through
> the firewall — click **Allow** (Private networks).

---

## 3. Daily use

| Screen | What it does |
|--------|--------------|
| **New Sale** | Scan/type a barcode → it's added to the cart. Edit qty/discount, then **Complete Sale** (or press **F9**). Stock is reduced automatically and a printable receipt opens. |
| **Sales** | Every invoice; click one to reprint the receipt. |
| **Products** | Add / edit / delete items; search by code, name, brand. Low-stock rows are highlighted. |
| **Customers / Suppliers** | Add and view; IDs (CUS-0001, VEND-0001) are generated automatically. |
| **Reports** | Sales / Purchases by date range, and an Inventory summary with low-stock status. |
| **Dashboard** | Today's sales & profit, low-stock list, recent sales. |

### Barcode scanner
A USB barcode scanner works out of the box — it just "types" the code and
presses Enter. On the **New Sale** screen, keep the cursor in the scan box
(it re-focuses itself) and scan away. You can also type a code by hand.

---

## 4. Back up your data
Your entire shop is in **`pos.db`**. To back up, just copy that file somewhere
safe (USB drive, another folder, cloud). To restore, copy it back.

> Note: after you start selling through the app, **`pos.db` is the real data** —
> `POS.xlsx` is only the original seed. Don't re-run `import_excel.py` again, or
> it will wipe `pos.db` and reload from the spreadsheet.

---

## 5. Project layout
```
A-POS/
  app.py            # the web server + all routes/API
  schema.sql        # database tables
  import_excel.py   # one-time: POS.xlsx -> pos.db
  requirements.txt  # Python packages
  pos.db            # your live database (created by the import)
  templates/        # the HTML pages
  static/           # style.css + sale.js (checkout/barcode logic)
```

## 6. Ideas for later
- Login per cashier
- Purchase-order entry screen (so buying stock raises inventory in-app)
- WhatsApp receipt link, thermal-printer formatting
- "Make it auto-start" — pin the `python app.py` command to a desktop shortcut
