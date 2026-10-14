<div align="center">

<img src="public/logo/logo.png" width="120" alt="Pune CKP Family Public Trust emblem" />

# Pune CKP Family Public Trust

**समाज हिताय सर्वजनसुखाय**

The trust's public website, its members' corner, and the Trust Management System the trustees work in.
One project, two sites.

<img src="https://github.com/Anmol-Baranwal/Cool-GIFs-For-GitHub/assets/74038190/72903324-cf57-4e90-80a6-ed3c9734e0ed" width="760" alt="" />

`Next.js 14` · `React 18` · `Tailwind CSS` · `PostgreSQL (Neon)` · `Razorpay` · `Nodemailer` · `pdf-lib` · `ExcelJS`

</div>

<img src="https://user-images.githubusercontent.com/74038190/212284100-561aa473-3905-4a80-b561-0d28506553ee.gif" width="100%" alt="" />

## What is in here

| Site | Address | Who it is for |
|---|---|---|
| **Public website** | `puneckptrust.in` | Everyone: the trust's story, projects, events, gallery, membership, donations |
| **Members' corner** | `puneckptrust.in/member` | Members: their membership, payments, statement, family, events, polls |
| **Trust Management System** | `admin.puneckptrust.in` | Trustees only: the books, members, events, meetings, reports |

The management system does not exist on the public address: every one of its pages and APIs answers
"not found" there, so nothing on the public site reveals that it is there (`middleware.js`).

<img src="https://user-images.githubusercontent.com/74038190/219923809-b86dc415-a0c2-4a38-bc88-ad6cf06395a8.gif" width="320" align="right" alt="" />

### Public website
- The trust's history, milestones, projects, 36 past events, the Gaurav Sohala, 37 photo albums and videos
- Events announced by the trustees appear by themselves, with banner, photographs and a Google Maps link
- Join or renew online (Razorpay), donate, and get a PDF receipt by e-mail
- **Renew by membership ID**: any ID on the member's card, new or old, is checked against the register
  first, so nobody is entered or charged twice
- Suggestions and feedback form
- Installable as an app on a phone ("Install the app"), with a friendly offline page
- SEO: metadata, sitemap, structured data, fast static pages

### Members' corner
- Sign in with any trust ID, membership ID, old register number or e-mail address
- Profile and photo, trust ID, every membership held, every payment on record
- Statement as a PDF on the trust's letterhead
- **Family group**: add a spouse, children or parents by their ID; the link is made only after they
  approve it with a code sent to their own e-mail
- Register for events (with guests), withdraw, see the fee
- Polls with a live countdown; one vote per member

### Trust Management System
- Marathi-first, large type, works on a phone; English at one tap
- Donations and receipts, expenses, members and renewals, fixed deposits, schemes, transfers
- **Events**: create, publish, banner and photos, registrations, lists as PDF and Excel, messages to
  everyone registered (e-mail, WhatsApp)
- **Event budget planner**: head-count, entry fee, lines of income and expense, break-even, PDF and Excel
- **Meetings register**: minutes, decisions, tasks with owners and dates, minutes as PDF
- **Polls** and **suggestions inbox**
- **Bank check**: every expense compared with the bank statement
- Reports with Excel export, search by any ID, audit log, full backup
- **Access per login**: the Chairman decides, section by section, who may see or change what
- Home screen with the year month by month, bank balances, deposits, members, coming events,
  birthdays, open tasks and a "worth noticing" block worked out from the records
- Birthday and anniversary greetings e-mailed automatically every morning

<img src="https://user-images.githubusercontent.com/74038190/212284115-f47cd8ff-2ffb-4b04-b5bf-4d1c14c0247f.gif" width="100%" alt="" />

## Run it on your computer

You need Node.js 18 or newer and a PostgreSQL database (a free [Neon](https://neon.tech) project is enough).

```bash
git clone https://github.com/SAI-RANDIVE/Pune-CKP-Family-Public-Trust.git
cd Pune-CKP-Family-Public-Trust
npm install
cp .env.example .env.local        # then fill it in (see below)
npm run db:migrate                # creates every table (sql/schema.sql, then sql/NNN-*.sql in order)
npm run admin:create              # asks for name, e-mail, role and password; nothing is hard-coded
npm run dev
```

| Open | To see |
|---|---|
| http://localhost:3000 | the public website |
| http://localhost:3000/member | the members' corner |
| http://admin.localhost:3000 | the management system |

### Settings (`.env.local`)

Never commit `.env.local`. Anything starting `NEXT_PUBLIC_` is visible in the browser.

| Name | What it is |
|---|---|
| `DATABASE_URL` | Neon "pooled connection" string |
| `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `NEXT_PUBLIC_RAZORPAY_KEY_ID`, `RAZORPAY_WEBHOOK_SECRET` | Razorpay keys. `rzp_test_...` keys never count as trust income |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM_NAME` | Mailbox used to send receipts, codes, logins and greetings. Gmail needs an **App Password** |
| `OTP_PEPPER` | A long random string; salts the one-time codes |
| `NEXT_PUBLIC_TRUST_*` | Name, registration number, PAN, address, phone, e-mail, website (printed on receipts) |
| `NEXT_PUBLIC_ADMIN_HOST` | The management system's host, e.g. `admin.puneckptrust.in` |
| `CRON_SECRET` | A long random string; lets the daily greetings job run |
| `DATA_MODE` | `live` (the real books) or `demo` (see below) |
| `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_ID`, `WHATSAPP_TEMPLATE` | Optional: WhatsApp Business (Cloud API) for event messages |

## Demo mode: show the system without touching the real books

<img src="https://user-images.githubusercontent.com/74038190/221352987-68da234d-4d62-4e9d-9d7f-098dc657c2dc.gif" width="260" align="right" alt="" />

```bash
npm run demo:create     # makes a separate database (ckp_demo) as a copy of the real one
npm run demo:status     # says which database the site is using
npm run demo:drop       # removes the demo database
```

Then put `DATA_MODE=demo` in `.env.local` and restart. While it is set:

- the site reads and writes **only** the demo database; the real one is never touched;
- Aadhaar and PAN numbers in the copy are made up;
- every e-mail goes to `DEMO_MAIL_TO` (or the trust's own mailbox) instead of the member, marked `[DEMO]`;
- a blue "demonstration copy" ribbon is shown on every screen.

To go live, set `DATA_MODE=live` (or remove the line) and restart. Nothing else changes.

## Putting it online

Both addresses are served by the **same** deployment. Add both domains to one project.

### Alpha testing on Vercel, before the domain is bought

No domain is needed to start: Vercel gives every project free `*.vercel.app` addresses, and one
project can carry two of them, one per site.

1. `npm run env:vercel` writes `.env.vercel` (never committed): every setting the hosted site
   needs, copied from `.env.local`, with the alpha values filled in
   (`NEXT_PUBLIC_TRUST_WEBSITE=https://puneckptrust.vercel.app`,
   `NEXT_PUBLIC_ADMIN_HOST=puneckptrust-admin.vercel.app`, `SITE_INDEXING=off`, `DATA_MODE=demo`,
   a fresh `CRON_SECRET`).
2. On vercel.com: **Add New > Project**, import this repository, open **Environment Variables**,
   and paste the whole of `.env.vercel` into the first **Key** box (Vercel splits it into lines).
   Then **Deploy**.
3. **Settings > Domains**: add `puneckptrust.vercel.app` and `puneckptrust-admin.vercel.app`.
   If a name is taken, pick another, put it in `.env.vercel` (and Vercel) and redeploy.
4. Public site: `https://puneckptrust.vercel.app`. Management system: `https://puneckptrust-admin.vercel.app`.

When the domain is bought: `node scripts/make-vercel-env.js --domain puneckptrust.in`, paste the
new values into Vercel, add the three domains below and redeploy.

### Vercel (recommended)

1. Push this repository to GitHub (done) and sign in at [vercel.com](https://vercel.com) with GitHub.
2. **Add New > Project**, pick this repository. Framework: Next.js. Leave the build settings as they are.
3. **Environment Variables**: add every name from the table above (copy the values from your
   `.env.local`). Set `DATA_MODE=live`, `NEXT_PUBLIC_TRUST_WEBSITE=https://puneckptrust.in`,
   `NEXT_PUBLIC_ADMIN_HOST=admin.puneckptrust.in`, and a new random `CRON_SECRET`.
4. **Deploy**.
5. **Settings > Domains**: add `puneckptrust.in`, `www.puneckptrust.in` and `admin.puneckptrust.in`.
   Vercel shows the DNS records to create at your domain registrar (an `A` record for the root and
   `CNAME` records for `www` and `admin`).
6. In the Razorpay dashboard, point the webhook at `https://puneckptrust.in/api/razorpay/webhook`.
7. The daily greetings job is already scheduled in `vercel.json` (9:00 am India time); it runs once
   `CRON_SECRET` is set.
8. Run `npm run db:migrate` and `npm run admin:create` once from your computer against the live database.

### Netlify

1. Sign in at [netlify.com](https://netlify.com), **Add new site > Import an existing project**, pick
   this repository. Netlify detects Next.js and uses its Next.js runtime; build command
   `npm run build`, publish directory `.next`.
2. **Site configuration > Environment variables**: add the same variables as for Vercel.
3. **Deploy site**.
4. **Domain management**: add `puneckptrust.in` as the primary domain and `www.puneckptrust.in` and
   `admin.puneckptrust.in` as domain aliases, then create the DNS records Netlify shows.
5. Netlify does not read `vercel.json`. For the daily greetings, create a free job at a scheduler
   such as cron-job.org that calls `https://puneckptrust.in/api/cron/greetings` once a day with the
   header `Authorization: Bearer <your CRON_SECRET>`.
6. Point the Razorpay webhook at `https://puneckptrust.in/api/razorpay/webhook`.

Either way: keep Razorpay on test keys until the trustees decide to take real payments.

<img src="https://user-images.githubusercontent.com/74038190/212284100-561aa473-3905-4a80-b561-0d28506553ee.gif" width="100%" alt="" />

## How things work

### Trust IDs
Every record gets one uniform, searchable ID, issued in order and never reused (`lib/ids.js`).
Typing any ID, new or old, into Search opens the record.

| ID | For |
|---|---|
| `PCFPT/PER/00001` | a person: this is a member's **trust ID** and never changes |
| `SLV/MEM/0001`, `GLD/MEM/0001`, `PLT/MEM/0001` | a Silver, Gold or Platinum membership |
| `PCFPT/DON/2026-27/0001` | a donation (also `MFE` fee, `SPN` sponsorship, `ADV`, `EVF`, `CSR`, `BKS`, `INT`) |
| `PCFPT/RCP/2026-27/0001` | a receipt |
| `PCFPT/EXP/2026-27/0001` | an expense voucher |
| `PCFPT/FD/0001`, `PCFPT/EVT/2026-27/01` | a fixed deposit, an event |
| `PCFPT/REG/…`, `PCFPT/PLN/…`, `PCFPT/MTG/…`, `PCFPT/POL/…`, `PCFPT/FBK/…` | an event registration, budget plan, meeting, poll, suggestion |

### Membership fees (`lib/pricing.js`)
| | New member | Renewal |
|---|---|---|
| **Silver** | ₹1,000 a year. The first term runs to the next 30 June or 31 December that is at least a year away, so a few extra months are added and charged pro rata (joining in October: 15 months = ₹1,000 + ₹250), plus a ₹100 form fee | ₹1,000 for one more year from the present validity date |
| **Gold** | ₹5,000 for five years, plus a ₹100 form fee | ₹5,000 for five more years |
| **Platinum** | ₹10,000 for life, plus a ₹100 form fee | not needed |

The checkout shows this break-up line by line before payment. A renewal opens six months before the
validity date, and a renewal already paid in the last 24 hours is refused, so a member cannot pay twice.

### Who may see what
Roles: `super_admin` > `admin` > `accountant` > `viewer`. On top of the role, **Settings > Users**
lets a Super Admin hide a section from one login, or make it "may look only", and switch off seeing
Aadhaar/PAN numbers or downloading Excel. Every check is done on the server (`lib/tms/auth.js`,
`lib/tms/access.js`). Editing or removing money, merging people, changing access, sending messages to
many people, exports and backups ask for a six-digit code sent to the user's e-mail, and every change
is written to the audit log.

### Live updates
Open pages listen to a small update stream (`/api/live/events`, Server-Sent Events) and refresh
themselves when a trustee publishes an event, adds a photograph or starts a poll. No reload needed.

### Importing the trust's old registers
The original Excel files are never changed and are **not** in this repository. The pipeline in
`data-migration/etl` reads them, records the file, sheet and row every figure came from, and loads the
result in one transaction:

```bash
python data-migration/etl/10_extract.py          # workbooks -> staging
python data-migration/etl/25_people.py           # one record per person; doubtful matches go to review
python data-migration/etl/30_validate.py
python data-migration/etl/40_load.py --dry-run
python data-migration/etl/40_load.py             # --rollback <batch> undoes a load
python data-migration/etl/50_reconcile.py        # database vs registers vs bank
python data-migration/etl/60_verify_expenses.py --save   # every expense against the bank statements
```

### Useful commands
```bash
npm run db:migrate          # apply new sql/ files (add --dry-run to preview)
npm run admin:create        # create or reset a trustee login
npm run data:purge-test     # remove test payments and codes before going live (--apply to do it)
npm run fonts:fetch         # re-download the bundled fonts
npm run icons:make          # remake the app icons from the logo
node scripts/fetch-old-images.js      # copy the old site's photos into public/gallery
node scripts/receipt-sample.mjs       # print three sample receipts to check the layout
python -m pytest data-migration/tests # tests of the import rules
```

## Project layout

```
app/(site)/        public website and members' corner
app/tms/           Trust Management System (served on the admin host)
app/api/           checkout, receipts, membership lookup, live updates, cron, and /api/tms for trustees
components/        public components;  components/tms/ for the management system
lib/               pricing, receipts, e-mail, WhatsApp, register bridge, family, polls, greetings
lib/tms/           guards, access rules, actions, reports, translations (Marathi and English)
sql/               schema.sql and numbered migrations
scripts/           migrate, create-admin, demo-db, purge-test-data, fonts, icons
data-migration/    the import pipeline for the old registers, with tests
middleware.js      decides by host name which site a request gets
```

<div align="center">
<img src="https://user-images.githubusercontent.com/74038190/214644145-264f4759-7633-441e-9d67-d8dda9d50d26.gif" width="120" alt="" />

Built for the trustees and members of Pune CKP Family Public Trust · Reg. No. E-8167

</div>
