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
