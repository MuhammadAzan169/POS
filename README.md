# A-POS

A point-of-sale system for a small retail group: several shops, one owner, one
set of books.

It handles the things a shopkeeper actually loses money over — what is on the
shelf, what went out of the till, who owes whom, and what the day added up to —
rather than being a general ledger with a shop bolted on.

---

## What it does

**At the counter**
Scan or search, take cash, card, online or credit, print a receipt. A trading
day is opened and closed by the person on shift, and the cash is counted against
what the system says it should be.

**For the owner**
Every shop's takings and profit in one place, stock across branches, purchase
bills and what is still owed on them, customer accounts, supplier accounts, and
the set-offs between them when the same person is both.

**Paperwork**
Till receipts on roll paper, and A4 bills for trade customers — the ruled
Qty / Particulars / Rate / Amount kind, carrying the customer's running balance.
Both are designed in Settings, and either can be printed or downloaded as a PDF.

**Two kinds of shop**
A retail outlet sells at the shelf price; a wholesale counter sells the same
products at trade rates to outside buyers. It is a sales channel, not a
warehouse — moving stock between your own branches is a transfer.

---

## Running it

```bash
npm install
npm run dev          # http://localhost:8080
```

With no database configured it runs on built-in demo data, so a fresh clone
works immediately. An amber **Demo data** chip in the header says so; nothing is
saved, and a refresh puts everything back.

| | |
|---|---|
| `npm run dev` | development server |
| `npm run build` | production build |
| `npm test` | the full arithmetic suite (240+ checks) |
| `npm run lint` | eslint |
| `npm run format` | prettier |

---

## Connecting a database

Everything is stored in [Supabase](https://supabase.com). Roughly ten minutes:

1. Create a project.
2. **SQL Editor** → run [`supabase/schema.sql`](supabase/schema.sql), then each
   file in [`supabase/migrations/`](supabase/migrations) **in number order**.
3. Copy `.env.example` to `.env` and fill in:

```
VITE_SUPABASE_URL=https://xxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...
```

The first two are public by design — they ship inside the browser bundle, and
row-level security is what keeps that safe. **The third must never carry a
`VITE_` prefix**: it bypasses every security policy, and that prefix is what
compiles a value into the JavaScript every visitor downloads. It is read only by
server functions, the same way `OPENROUTER_API_KEY` is.

For a deployment, set the same three as environment variables on the host.

More detail, including the table layout, is in
[`supabase/README.md`](supabase/README.md).

---

## Accounts

Two doors, deliberately separate pages.

**The owner — `/admin`**
The first person to open it creates the owner account: name, phone, business
name, email, password. After that the same page only signs in. The claim is
refused by the database once an owner exists, and a unique index means two
people pressing the button at the same moment cannot both succeed — so the door
closes itself, permanently, without a setting anyone has to remember.

> Claim it immediately after deploying. Until someone does, whoever finds the
> URL first becomes the owner.

**Shop staff — `/`**
A username and a password, both set by the owner. There is no sign-up. Staff
have no email address: `shop1` becomes `shop1@staff.apos.pk` behind the scenes,
which receives no mail and is confirmed on creation. A worker who forgets their
password asks the owner to set a new one; the owner resets their own by email.

**What a stranger gets.** They can obtain a session — the anon key is in the
page, and nothing can stop that. What they cannot get is a `staff` row, and
without one every table returns nothing. Authentication says who you are; the
database says what you are allowed to be.

### Who can see what

| | Owner | Shop worker | Signed out |
|---|---|---|---|
| Products, shops, suppliers, settings | read + write | read only | nothing |
| Sales, stock, expenses, returns, day book | all shops | their shop only | nothing |
| Transfers | all | either end of their own | nothing |
| Purchases | all | only bills they raised | nothing |
| Customers | all | read, add, edit | nothing |
| Supplier payments, set-offs, adjustments | yes | invisible | nothing |

A cashier can sell at the price but cannot change it. Switching off a worker —
or their shop — ends access on their next action, not when their token expires.

---

## Backups

Free Supabase projects have none, so
[`.github/workflows/backup.yml`](.github/workflows/backup.yml) takes a complete
copy every night at 2am Pakistan time and keeps 90 days of them. It needs one
secret, `SUPABASE_DB_URL` (Supabase → Project Settings → Database → connection
string, with the password filled in), set under the repository's
**Settings → Secrets and variables → Actions**.

Nobody has to remember to press anything, and the job fails loudly if a backup
comes back suspiciously small — a copy that silently holds nothing is worse than
no copy at all.

To restore: download the artifact, then
`psql "$SUPABASE_DB_URL" -f apos-backup-YYYY-MM-DD.sql`.

---

## Handing it to a client

1. Run [`supabase/reset-data.sql`](supabase/reset-data.sql) — empties the
   business records but leaves the structure.
2. Run [`supabase/reset-accounts.sql`](supabase/reset-accounts.sql) — removes
   every login, so the client claims the owner account themselves.
3. Confirm the backup workflow has a green run.
4. Send them to `/admin` to set up.

---

## How it is put together

TanStack Start (React 19, file-based routing), Tailwind v4, Supabase, jsPDF.

```
src/routes/          one file per screen; routeTree.gen.ts is generated
src/lib/store.tsx    all app state and every mutation, in one provider
src/lib/db.ts        Supabase access; snake_case ↔ camelCase in one place
src/lib/auth.ts      sign-in, and reading what the signed-in person may be
src/lib/*.ts         the arithmetic: ledgers, day book, insights, bills
src/components/      shared UI; ui/ is shadcn
supabase/            schema, numbered migrations, reset scripts
scripts/             the test suite and smoke checks
```

Two conventions worth knowing before changing anything:

**The store owns the truth.** Screens read from `useStore()` and call its
mutations; they do not talk to the database. That is why a sale recorded at the
till updates the dashboard, the ledger and the day book without any of them
knowing about each other.

**Balances are derived, never stored.** What a customer owes is computed from
their sales and payments every time it is asked for. A stored total drifts the
first time a sale is edited, and then quietly disagrees with the invoices it was
meant to summarise.

### Tests

`npm test` runs a few hundred assertions against the real modules — no mocks —
covering what a shopkeeper would lose money over: what a sale is worth after two
kinds of discount, what the drawer should hold, what a customer owes, and
whether a bill's account block reconciles.

```bash
npm test              # arithmetic, bills, settings pipeline, paging
npm run test:routes   # every route renders (needs `npm run dev` running)
```

---

## Known limits

- **Loading is not incremental.** Every page load fetches the whole history,
  paged 1,000 rows at a time. Correct, but it will need date-scoping before the
  data reaches tens of megabytes.
- **Password resets need SMTP.** Supabase's built-in sender is rate-limited and
  meant for development. Connect Resend or Brevo (both free at this volume)
  before a client depends on a reset arriving.
- **iOS Safari** may open a downloaded PDF in a new tab rather than saving it —
  a WebKit restriction, not a bug here. Print is unaffected.
