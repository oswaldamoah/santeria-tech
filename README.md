# Santeria Tech

The website for Santeria Tech, a Houston reseller that buys used Apple devices. Visitors look up a model, see what you pay, add devices to a sell bag and send a purchase order. You get the order by email, it's saved to your database, and you manage it from a private dashboard.

There are two parts:

- **The website** (this folder). React 19, TypeScript, Vite and Motion, hosted free on GitHub Pages.
- **The API** (`worker/`). A Cloudflare Worker that saves orders to Neon (Postgres), emails them through Resend, reads your prices from your Google Sheet and powers the dashboard. It holds all your secrets, so none of them end up in the website's code.

## Run it on your computer

```bash
npm install
npm run dev
```

Open http://localhost:5173. Until the API is connected, the order form offers an "email it to us instead" link and the site uses the built-in prices.

## Change your details

Everything a visitor sees about the business lives in `src/config.ts`: name, email, phone, address, the 12-hour promise and the "prices as of" month. The phone number is a placeholder (`(713) 555-0100`). Replace it, or set it to `''` to hide it everywhere. `apiUrl` is where your worker's address goes once it's deployed.

## Your price list (Santeria Tech Prices.xlsx)

The spreadsheet is where you set prices. The website reads it through the worker, so you change a price in Google Sheets and the site shows it a minute later, with no code and no redeploy.

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
2. Click **Share** and set **General access** to **Anyone with the link: Viewer**. The worker needs this to read the sheet.
3. Put the sheet's link in `worker/.dev.vars` as `PRICE_SHEET_URL`, then run `npm run secrets` in the `worker` folder (see "Set up the API").

Keep **Site Prices** as the first tab. The worker reads the first tab and only passes ID, model, category, series, your price, Hot, Show and photos to the website. Your retail prices, buyer quotes and profit never reach the site.

Anyone who has the sheet's link itself can open the whole document, margins included. The link only lives in the worker's secrets, so don't post or share it. If you'd rather keep the document fully private, use **File > Share > Publish to web**, publish only the Site Prices tab as CSV, set General access back to **Restricted**, and use that publish link as `PRICE_SHEET_URL` instead.

If the sheet can't be read, the site uses the last prices it loaded, then the built-in ones in `src/data/catalog.json`. That file is also where the photos' zoom and angle settings live.

## Product photos

The photos load straight from Apple's servers: product images from Apple Support's manuals pages, back and color views from Apple's "Identify your model" pages, the iPhone Duo from apple.com's compare page, and the Pencil and Magic Keyboard shots you picked from the Apple Store. They're Apple's images, and the footer credits them to Apple.

- Apple can move these files. If a photo stops loading, the card shows a drawn outline; paste a new URL into the sheet or use your own photo (put it in `public/images/` and use `images/your-file.webp` as the URL).
- iPads, the MacBook Neo, AirPods Max, Vision Pro and the accessories only have one photo, because Apple doesn't publish a separate back view for them.
- Apple hasn't released a regular iPhone 18 yet, so those cards use the iPhone 18 Pro photos for now.

## Set up the API (Neon, Resend, Cloudflare)

You need three free accounts: **Neon** (the database), **Resend** (email) and **Cloudflare** (runs the worker).

1. **Neon.** Create a project at neon.tech. On the dashboard click **Connect** and copy the connection string (`postgresql://...`). The worker creates its tables the first time it runs.
2. **Resend.** At resend.com, add a domain you own under **Domains** and add the DNS records it shows you. Then create an API key under **API Keys**. Until a domain is verified, Resend only delivers to the email you signed up with, and you can't send *from* a Gmail or atomicmail address.
3. **Fill in the worker's settings.** In `worker/wrangler.toml`:
   - `FROM_EMAIL`: an address on your verified domain, like `Santeria Tech Orders <orders@yourdomain.com>`
   - `TO_EMAILS`: already `santeriatech@atomicmail.io,oswaldamoah00@gmail.com`
   - `ALLOWED_ORIGINS`: replace `YOUR-GITHUB-USERNAME` with your GitHub username
   - `SITE_URL`: your site's full address, for the "Open in dashboard" button in each email
4. **Add your secrets.** In the `worker` folder, copy `.dev.vars.example` to `.dev.vars` and fill in `RESEND_API_KEY`, `DATABASE_URL`, `ADMIN_PASSWORD`, `SESSION_SECRET` and `PRICE_SHEET_URL`. `.dev.vars` is ignored by git, so it never goes to GitHub.
5. **Deploy.**

   ```bash
   cd worker
   npm install
   npx wrangler login
   npm run deploy      # prints your worker's address, like https://santeria-orders.<you>.workers.dev
   npm run secrets     # uploads everything in .dev.vars to Cloudflare
   ```

Rather click through Cloudflare's website than run commands? Follow `worker/dashboard/README.md` instead of step 5: you paste one file into Cloudflare's editor and type the settings into its form.

6. **Point the site at it.** Put the worker's address in `apiUrl` in `src/config.ts`, or add it as a GitHub repository variable named `VITE_API_URL`.

Every purchase order is saved to Neon first, then emailed. If the email fails, the order is still saved and the dashboard flags it. The email's reply-to is the seller, so you can answer straight from your inbox.

To try the worker locally with your real database: `npm run dev` in `worker/` (it reads `.dev.vars`). To run the worker's tests against a temporary in-memory database: `npm test`.

## The order dashboard

Open `https://<your-site>/#/admin` and sign in with your `ADMIN_PASSWORD`. You stay signed in for 12 hours on that device. Search engines are told not to index it, and every request is checked by the worker.

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

## Put it on GitHub Pages

Pick one of these two ways.

**A. Automatic (deploys every time you push)**

1. Move `deploy.yml` from the project root into a folder called `.github/workflows/`, so the path is `.github/workflows/deploy.yml`. Or on GitHub's website click **Add file > Create new file**, name it `.github/workflows/deploy.yml`, and paste the file's contents.
2. In the repository, open **Settings > Pages** and set **Source** to **GitHub Actions**. Missing this step is the usual reason a first deploy fails.
3. Under **Settings > Secrets and variables > Actions > Variables**, add `VITE_API_URL` with your worker's address (unless you put it in `src/config.ts`).
4. Push to `main` (or `master`), or open the **Actions** tab, pick "Deploy to GitHub Pages" and click **Run workflow**. If a run fails, click it to see which step went red.

**B. From your computer, no workflow needed**

1. In **Settings > Pages**, set **Source** to **Deploy from a branch**, branch `gh-pages`, folder `/ (root)`.
2. Run `npm install` once, then `npm run deploy` whenever you want to publish.

The site appears at `https://<username>.github.io/<repo>/`. It uses hash URLs (`/#/sell/iphone`), so it works from any repository name and page refreshes never 404. For a custom domain, put the domain in `public/CNAME`, set it under Settings > Pages, and add it to `ALLOWED_ORIGINS` and `SITE_URL` in the worker.

Your `.xlsx` files are ignored by git on purpose: the price workbook contains your margins, and this repository may be public.

## Project layout

```
src/
  config.ts             business details and the worker's address
  data/catalog.json     built-in products, prices and photo settings
  data/products.ts      categories, and applying prices from your sheet
  lib/bag.tsx           sell bag (saved in the visitor's browser)
  lib/order.ts          order form checks and sending
  lib/priceSheet.ts     reads the sheet (shared with the worker)
  components/           nav, cards, photos, quantity stepper, search, bag sheet, motion helpers
  pages/                home, category, order, sent
  admin/                the order dashboard (its own bundle; shoppers never load it)
worker/
  src/index.ts          routes: orders, prices, dashboard
  src/db.ts             Neon tables and queries
  src/email.ts          the order email (Resend)
  src/auth.ts           dashboard sign-in
  src/prices.ts         prices from your sheet
  test/run.mjs          tests against an in-memory Postgres
deploy.yml              GitHub Pages workflow (move into .github/workflows/)
```

## Motion and accessibility

Animations use critically damped springs by default, with a little bounce only where something is thrown (items flying into the bag, the bag icon catching them). The bag sheet can be flicked closed on phones. Everything respects the system's Reduce Motion, Reduce Transparency and Increase Contrast settings.
