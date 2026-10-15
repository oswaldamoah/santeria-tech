# Santeria Tech

The website for Santeria Tech, a Houston reseller that buys used Apple devices. Visitors look up a model, see what you pay, add devices to a sell bag and send a purchase order. Each order is saved to your Neon database, emailed to you through Resend, and managed from a private dashboard.

All your settings live in one file, `.env`, and one command publishes everything: `npm run deploy`.

## Get it running

You need free accounts at **Neon** (database), **Resend** (email), **Cloudflare** (runs the private part, see below) and **GitHub** (hosts the site). Then:

1. **Install.** In this folder: `npm install`
2. **Fill in `.env`.** Copy `.env.example` to `.env`. Every line says where its value comes from. You only need two to start:
   - `RESEND_API_KEY`: resend.com > **API Keys** > Create API Key
   - `DATABASE_URL`: console.neon.tech > your project > **Connect**, the whole `postgresql://...` string

   Add `PRICE_SHEET_URL` (your Google Sheet link) for live prices. Leave `SITE_URL`, `ALLOWED_ORIGINS` and `VITE_API_URL` empty: the deploy fills them in.
3. **Create your dashboard login.** In Neon, open **SQL Editor**, paste `database/create-login.sql`, change the email, name and password on the `INSERT` line, and click **Run**.
4. **Point GitHub Pages at the right branch.** In your GitHub repo: **Settings > Pages > Source: Deploy from a branch**, branch `gh-pages`, folder `/ (root)`. (The branch appears after your first deploy. If it isn't in the list yet, do step 5 first, then come back.)
5. **Deploy.** `npm run deploy`. The first time, your browser opens to sign in to Cloudflare; click Allow. It then:
   - uploads your private settings and publishes the API
   - saves the API's address into `.env` for you
   - checks the database, your login and your sheet, and tells you if anything's off
   - builds the site and publishes it to GitHub Pages
6. **Open `https://<username>.github.io/<repo>/#/admin`** and sign in.

Changed something in `.env`, or edited the site? Run `npm run deploy` again. (`npm run deploy:site` only republishes the website; `npm run deploy:api` only the API.)

To get order emails in every inbox, verify a domain you own in Resend (**Domains**, then add the DNS records it shows) and put an address on it in `FROM_EMAIL`. Until then, Resend only delivers to the email you signed up with.

### Why there's a private part at all

GitHub Pages only hosts files, and everything in the website's code can be read by anyone who opens it. Resend and Neon both need secret keys, and Resend refuses calls made straight from a browser ("Send the emails on the server-side to not expose your API keys"). If the keys sat in the website, anyone could send email as you or read and delete every seller's details.

So the private part is a small API in `server/` that runs on Cloudflare's free tier. You don't manage it: it reads its settings from your `.env`, and `npm run deploy` publishes it. Only the `VITE_API_URL` line from `.env` goes into the public site.

## Run it on your computer

```bash
npm run dev
```

Open http://localhost:5173. It uses the API you deployed (from `VITE_API_URL` in `.env`). Before the first deploy, the order form offers an "email it to us instead" link and the site uses the built-in prices.

`npm run dev:api` runs the API on your computer too (at http://localhost:8787, using your real database). `npm run test:api` tests it against a temporary in-memory database.

## Change your details

Everything a visitor sees about the business lives in `src/config.ts`: name, email, phone, address, the 12-hour promise and the "prices as of" month. To hide the phone number everywhere, set it to `''`.

## Your price list (Santeria Tech Prices.xlsx)

The spreadsheet is where you set prices. The website reads it through the API, so you change a price in Google Sheets and the site shows it a minute later, with no code and no redeploy.

### The four tabs

| Tab | What it's for | Do you edit it? |
| --- | --- | --- |
| **My Workings** | Every model with its retail price, your buyer quote, your price (My Quote) and your profit | Yes, this is the only tab you edit |
| **Site Prices** | A copy of My Workings without retail, buyer quote or profit. This is what the site reads | No, it fills itself in |
| **Settings** | The 90% share: My Quote = Buyer Quote x 90% | Only if you change your margin |
| **How to use** | A short version of this section | No |

### Columns in My Workings

| Column | What it does |
| --- | --- |
| ID | The model's permanent name, like `iphone-17-pro-max`. It links the row to the website and to bags people have already filled. Never change an existing one |
| Model | The name shown on the site. Safe to edit |
| Category | iPhone, iPad, Mac, Apple Watch, AirPods, Vision Pro or Accessories (pick from the dropdown) |
| Series | The filter chip it sits under on its category page, like `iPhone 17 & Air` |
| Retail Price | Apple's price, for your reference only |
| Buyer Quote | The number you type. Everything else is worked out from it |
| My Quote (90%) | What the site shows sellers. Formula, don't type here |
| My Profit (10%) | Buyer Quote minus My Quote. Formula |
| Hot | `yes` shows the Hot badge and puts the model in the homepage's Hot row |
| Show on site | `no` hides the model. Use this instead of deleting a row |
| Image URL / Back image URL | The main photo and the photo shown on hover or tap. Leave blank for a drawn outline |
| Notes | For you. How the price was set |

### Everyday tasks

- **Change a price:** type a new Buyer Quote. My Quote and the site follow.
- **Mark a model as Hot:** type `yes` under Hot. Remove it to take the badge off.
- **Stop buying a model:** type `no` under Show on site.
- **Add a model:** add a row at the bottom with a new ID (lowercase words joined by dashes, like `iphone-19-pro-256gb`), the Model name, Category, Series and Buyer Quote. Add an Image URL if you have one. The Site Prices tab already has formulas waiting for up to 500 rows.
- **Change your margin:** change the 90% on the Settings tab. Every price updates.

### Connecting it

1. Upload the file to Google Drive and open it with Google Sheets (you've done this).
2. Click **Share** and set **General access** to **Anyone with the link: Viewer**. The API needs this to read the sheet.
3. Put the sheet's link in `.env` as `PRICE_SHEET_URL`, then run `npm run deploy`.

Keep **Site Prices** as the first tab. The API reads the first tab and only passes ID, model, category, series, your price, Hot, Show and photos to the website. Your retail prices, buyer quotes and profit never reach the site.

Anyone who has the sheet's link itself can open the whole document, margins included. The link only lives in your `.env` and the API's private settings, so don't post or share it. If you'd rather keep the document fully private, use **File > Share > Publish to web**, publish only the Site Prices tab as CSV, set General access back to **Restricted**, and use that publish link as `PRICE_SHEET_URL` instead.

If the sheet can't be read, the site uses the last prices it loaded, then the built-in ones in `src/data/catalog.json`. That file is also where the photos' zoom and angle settings live.

## Product photos

The photos load straight from Apple's servers: product images from Apple Support's manuals pages, back and color views from Apple's "Identify your model" pages, the iPhone Duo from apple.com's compare page, and the Pencil and Magic Keyboard shots you picked from the Apple Store. They're Apple's images, and the footer credits them to Apple.

- Apple can move these files. If a photo stops loading, the card shows a drawn outline; paste a new URL into the sheet or use your own photo (put it in `public/images/` and use `images/your-file.webp` as the URL).
- iPads, the MacBook Neo, AirPods Max, Vision Pro and the accessories only have one photo, because Apple doesn't publish a separate back view for them.
- Apple hasn't released a regular iPhone 18 yet, so those cards use the iPhone 18 Pro photos for now.

Every purchase order is saved to Neon first, then emailed. If the email fails, the order is still saved and the dashboard flags it. The email's reply-to is the seller, so you can answer straight from your inbox.

## The order dashboard

Open `https://<your-site>/#/admin` and sign in with the email and password you created below. You stay signed in for 12 hours on that device. Search engines are told not to index it, and every request is checked by the API.

### Dashboard logins

Logins are stored in your Neon database, with passwords hashed by Postgres (bcrypt), never as plain text.

1. Open your project at neon.tech and click **SQL Editor**.
2. Paste the contents of `database/create-login.sql`.
3. On the `INSERT` line, change the email, name and password (keep the quotes).
4. Click **Run**, then sign in at `/#/admin`.

Running it again with the same email changes that password and signs that login out everywhere. The bottom of the file has short commands to add a second person, list logins, remove someone and sign everyone out. Each change to an order is recorded in its history with the name of whoever made it.

If sign-in fails, the dashboard tells you why in plain words: wrong email or password, no logins created yet, the API address is wrong or unreachable, or a database setting is off. Opening your `VITE_API_URL` address in a browser shows the same checklist the deploy prints.

### Using it

- **The four numbers at the top:** orders waiting for a reply (turns red when any have passed your 12-hour promise), orders in progress, the total payout of open orders, and what you've paid out this month. Click the first two to filter.
- **Filters and search:** filter by status, or search by name, email, phone, order number, model or your own notes. Press `/` to jump to search.
- **Each order:** click a row to open it. From there you can:
  - Change its status. The statuses are New, Contacted, Scheduled, Received, Paid and Cancelled.
  - Email, call or text the seller in one click. The email opens a ready-written reply in your mail app.
  - Set the final payout after you've checked the device.
  - Keep private notes.
  - See the order's full history.
- **New orders** show a countdown to your 12-hour promise, then how long they're overdue.
- **Download** (the arrow at the top) saves every order as a CSV you can open in Excel or Google Sheets.
- The list refreshes itself every 45 seconds and whenever you come back to the tab.

## GitHub Pages

`npm run deploy` publishes the built site to the `gh-pages` branch, so GitHub Pages must be set to **Deploy from a branch: gh-pages, / (root)** (step 4 above). No workflow file is needed.

The site appears at `https://<username>.github.io/<repo>/`. It uses hash URLs (`/#/sell/iphone`), so it works from any repository name and page refreshes never 404. For a custom domain, put the domain in `public/CNAME` and set it under **Settings > Pages**; the next deploy picks it up for `SITE_URL` and `ALLOWED_ORIGINS` if those are empty.

Your `.env` and `.xlsx` files are ignored by git on purpose: one has your keys, the other your margins, and this repository may be public.

## Also on Vercel

The site builds on Vercel as it is (Vercel detects Vite). It just needs to know where the API is:

1. In Vercel, open the project, then **Settings > Environment Variables**.
2. Add `VITE_API_URL` with the same value as in your `.env` (your `https://…workers.dev` address), for Production and Preview. That's the only one Vercel needs. The private keys stay in `.env` and are uploaded to the API by `npm run deploy`, never to Vercel.
3. **Deployments**, then on the latest one **⋯ > Redeploy**. (Variables only apply to new builds.)
4. Make sure your Vercel address is in `ALLOWED_ORIGINS` in `.env`, then run `npm run deploy:api`. A `*` matches any one part of an address, so `https://santeria-tech*.vercel.app` covers your Vercel address and its preview links.

After that, pushing to GitHub updates Vercel by itself. `npm run deploy` is still how you publish the API and the GitHub Pages copy.

## Project layout

```
.env.example            every setting, with where to find it (copy to .env)
src/                    the website
  config.ts             business details
  data/catalog.json     built-in products, prices and photo settings
  data/products.ts      categories, and applying prices from your sheet
  lib/bag.tsx           sell bag (saved in the visitor's browser)
  lib/order.ts          order form checks and sending
  lib/priceSheet.ts     reads the sheet (shared with the API)
  components/           nav, cards, photos, quantity stepper, search, bag sheet, motion helpers
  pages/                home, category, order, sent
  admin/                the order dashboard (its own bundle; shoppers never load it)
server/                 the private API (orders, emails, prices, dashboard)
  index.ts              routes, plus the setup checklist at /
  db.ts                 Neon tables and queries
  email.ts              the order email (Resend)
  auth.ts               dashboard sign-in
  prices.ts             prices from your sheet, without your margins
  test/run.mjs          tests against an in-memory Postgres
database/
  create-login.sql      run in Neon's SQL Editor to create or reset a dashboard login
  schema.sql            every table (the API also creates them by itself)
scripts/deploy.mjs      what npm run deploy does
wrangler.toml           tells Cloudflare where the API code is (no settings in it)
```

## Motion and accessibility

Animations use critically damped springs by default, with a little bounce only where something is thrown (items flying into the bag, the bag icon catching them). The bag sheet can be flicked closed on phones. Everything respects the system's Reduce Motion, Reduce Transparency and Increase Contrast settings.
