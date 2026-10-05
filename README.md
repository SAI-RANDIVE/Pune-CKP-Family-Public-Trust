# Pune CKP Family Public Trust — Website

A Next.js 14 website for the trust: public pages (About, Membership, Donate,
Contact) plus a working Razorpay checkout that stores members/donations in a
Neon Postgres database and auto-generates a PDF receipt (styled after the
trust's existing receipt book) the moment a payment succeeds.

Colour palette used throughout: `#F4A62C` (saffron), `#D30000` (vermilion),
`#FDF5E7` (cream) — see `tailwind.config.js`.

## 1. What you need before you start

- **Node.js 18+** on your machine (or wherever you deploy — Vercel is the
  easiest option for a Next.js site like this).
- A **Neon** Postgres project — https://neon.tech (free tier is enough to start).
- A **Razorpay** account with API keys — https://dashboard.razorpay.com/app/keys.
  Start in **Test mode** until you're ready to go live.

## 2. Install & configure

```bash
npm install
cp .env.example .env.local
```

Open `.env.local` and fill in:

- `DATABASE_URL` — from Neon: Project → Connection Details → copy the
  **pooled** connection string (it already includes `sslmode=require`).
- `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `NEXT_PUBLIC_RAZORPAY_KEY_ID` —
  from Razorpay → Settings → API Keys.
- The `NEXT_PUBLIC_TRUST_*` values are already filled in from the trust's
  current details; edit them if anything changes.

## 3. Create the database tables

```bash
npm run db:init
```

This runs `sql/schema.sql` against your Neon database (creates `members`,
`payments`, `receipt_counters`). You can also just paste that file's contents
into the Neon SQL editor if you'd rather do it by hand.

## 4. Add the logo

Drop the trust's logo at `public/logo/logo.png`. It's used in the site header
and embedded into the generated PDF receipts. The site works fine without it
(a placeholder medallion is shown instead) — but add it before going live.

## 5. Run it locally

```bash
npm run dev
```

Visit http://localhost:3000. Use a Razorpay **test card** (e.g. `4111 1111
1111 1111`, any future expiry, any CVV) to try the full membership/donation →
payment → receipt flow end-to-end.

## 6. Deploy

The easiest path is **Vercel** (free tier is fine):

1. Push this folder to a GitHub repo.
2. Import it in Vercel, add the same environment variables from `.env.local`
   in Vercel's Project Settings → Environment Variables.
3. Deploy. Point `puneckptrust.org`'s DNS at Vercel when you're ready to
   switch over from the current WordPress/Marathisrushti site.
4. Switch Razorpay from Test mode to Live mode keys once you're happy, and
   re-deploy with the live `RAZORPAY_KEY_ID` / `RAZORPAY_KEY_SECRET`.

## Membership pricing — please review with the trustees

The exact proration rules in the original membership notice are a little
ambiguous in places, so `lib/pricing.js` implements this interpretation
(and documents it at the top of the file):

- **Silver (₹1,000/yr):** a brand-new signup runs from today to the next
  30 June or 31 December that's at least 12 months away, billed at
  ₹1,000⁄12 per month **plus a one-time ₹100 registration fee**. Renewals are
  a flat ₹1,000, extending the existing expiry by exactly one year.
- **Gold (₹5,000):** flat fee, valid 5 years from signup/renewal.
- **Platinum (₹10,000):** flat fee, lifetime, no renewal needed.
- **Donations:** ₹100–₹10,000 only (per your request); anything larger is
  pointed to the bank transfer details instead.

If the trustees want different rounding, a different registration fee for
Gold, or a different proration rule, everything lives in that one file —
nothing else needs to change.

## How renewals find the right member

On the "Renew Existing Membership" form, someone can enter their membership
number (e.g. `SM/24/173`) directly, or leave it blank — in which case the
server looks them up by phone + email matching an existing record. If no
match is found, they're told to double-check their details or sign up fresh.

## What's intentionally NOT built yet

- **No admin dashboard.** Members/payments live in Neon — query them
  directly via the Neon SQL editor, or ask to have a simple `/admin` page
  added next (with password protection) if you'd like one.
- **No automatic email receipts.** The receipt PDF is offered as an instant
  download after payment; wiring up an email (e.g. via Resend or SMTP) is a
  small follow-up if you want it.
- **Gallery.** The Gallery page is available at `/gallery` and currently
  features the supplied trust emblem. Add approved event and community photos
  to `public/gallery/` as they become available.
- **Full historic word-for-word Marathi text** from the old site (Gaurav
  Sohala pages, full donation ledger, etc.) wasn't dumped onto every page —
  the About page carries the trust's story, objectives and a milestones
  timeline; more detail can be added page by page as needed.

## Project structure

```
app/                 Pages (App Router) + API routes
  api/razorpay/       create-order, verify
  api/receipt/[id]/   PDF download
  about, membership, donate, contact, gallery, areas-of-work, gaurav-sohala
components/          UI components (Header, Footer, forms, sections)
lib/                 db.js, pricing.js, razorpay.js, receipt.js, sequences.js, numberToWords.js
sql/schema.sql       Neon table definitions
scripts/init-db.js   Runs schema.sql for you
```

---

## Trust Management System (admin.puneckptrust.in)

One project serves two sites. `middleware.js` decides by host name:

| Host | What it serves |
|---|---|
| `puneckptrust.in` | The public website (`app/(site)`). Every management-system address returns "not found" here. |
| `admin.puneckptrust.in` | The Trust Management System (`app/tms`, `app/api/tms`). Sign-in required, never indexed. |

Locally: public site at `http://localhost:3000`, management system at `http://admin.localhost:3000`.

### Set-up

```bash
npm install
npm run db:migrate            # applies sql/schema.sql and sql/NNN-*.sql in order (add --dry-run to preview)
npm run admin:create          # asks for name, e-mail, role and password; nothing is hard-coded
npm run dev
```

Roles: `super_admin` > `admin` > `accountant` > `viewer`. Editing or removing money entries, merging
people, role changes, exports and backups ask for a six-digit code sent to the user's e-mail, and every
change is written to the audit log (Settings > Audit log).

### Deploying both hosts (Vercel)

1. Add `puneckptrust.in`, `www.puneckptrust.in` and `admin.puneckptrust.in` to the same Vercel project.
2. Set every variable from `.env.example` in Vercel, including `NEXT_PUBLIC_ADMIN_HOST` and `NEXT_PUBLIC_TRUST_WEBSITE`.
3. Run `npm run db:migrate` against the production database, then `npm run admin:create`.

### IDs

Every record gets one uniform, searchable ID, issued in order and never reused (`lib/ids.js`):
`SLV/MEM/0001`, `GLD/MEM/0001`, `PLT/MEM/0001` (members), `PCFPT/PER/00001` (people),
`PCFPT/DON/2026-27/0001` (donations; also `MFE`, `SPN`, `ADV`, `EVF`, `CSR`, `BKS`, `INT`),
`PCFPT/RCP/2026-27/0001` (receipts), `PCFPT/EXP/...` (expenses), `PCFPT/FD/0001` (deposits).
Typing any ID, old or new, into Search opens the record.

### Importing the old registers

The original Excel files are never changed. The pipeline in `data-migration/etl` reads them, records the
file, sheet and row every figure came from, and loads the result in one transaction:

```bash
python data-migration/etl/10_extract.py      # workbooks -> staging
python data-migration/etl/25_people.py       # one record per person; uncertain matches go to review
python data-migration/etl/30_validate.py
python data-migration/etl/40_load.py --dry-run
python data-migration/etl/40_load.py         # --rollback <batch> undoes a load
python data-migration/etl/50_reconcile.py
```

Reports are written to `data-migration/reports/` (not committed: they contain personal data).

### Photographs

Gallery photos are served from the old website until they are copied locally:

```bash
node scripts/fetch-old-images.js             # downloads into public/gallery/<album>/image1.jpg ...
```

### Checking the receipt layout

```bash
node scripts/receipt-sample.mjs              # writes three sample receipts, including a worst case
```
