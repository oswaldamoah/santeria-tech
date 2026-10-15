# Santeria Tech

The website for Santeria Tech, a Houston reseller that buys used Apple devices. Visitors look up a model, see what you pay, add devices to a sell bag and send a purchase order. The order is emailed to you through Resend, and the visitor is told to expect contact within 12 hours.

Built with React 19, TypeScript, Vite and Motion. It deploys to GitHub Pages with the included workflow.

## Run it on your computer

```bash
npm install
npm run dev
```

Open http://localhost:5173. The order form shows an "email it to us instead" link until you connect the email relay (below).

## Change your details

Everything a visitor sees about the business lives in `src/config.ts`: name, email, phone, address, the 12-hour promise and the "prices as of" month. The phone number is a placeholder (`(713) 555-0100`). Replace it, or set it to `''` to hide it everywhere.

## Prices and products

`src/data/catalog.json` holds every product. Each entry looks like this:

```json
{
  "id": "iphone-17-pro-max",
  "name": "iPhone 17 Pro Max",
  "category": "iphone",
  "series": "iPhone 17 & Air",
  "price": 810,
  "hot": true,
  "image": "https://cdsassets.apple.com/content/services/pub/image?productid=301246&size=640x640",
  "back": "https://cdsassets.apple.com/live/7WUAS350/images/iphone/iphone-17-pro-max-colors.png"
}
```

- `price` is the "My Quote (90%)" column from your sheet. That is the only price on the site.
- `hot: true` gives the product the Hot badge and puts it in the Hot row on the homepage.
- `series` drives the filter chips on each category page.
- `image` is the main photo. `back` is optional: when it's there, the card switches to it on hover, or on tap on a phone.
- `zoom` (for example `1.4`) enlarges a photo with a lot of empty space around it. `tilt: true` shows the product at an angle, which the thin Apple Pencils need.
- To use your own photo, put the file in `public/images/` and set `"image": "images/your-file.webp"`.

Keep your buyer quotes and profit numbers out of this file. Everything in it is downloaded by every visitor's browser.

## Product photos

The photos load straight from Apple's servers: the product images from Apple Support's manuals pages, the back and color views from Apple's "Identify your model" pages, the iPhone Duo from apple.com's compare page, and the Pencil and Magic Keyboard shots you picked from the Apple Store. They are Apple's images, and the footer credits them to Apple.

A few things to know:

- Apple can move or rename these files. If a photo stops loading, the card falls back to a drawn outline, and you can swap in a new URL or your own file.
- iPads, the MacBook Neo, AirPods Max, Vision Pro and the accessories only have one photo, because Apple doesn't publish a separate back view for them.
- Apple hasn't released a regular iPhone 18 yet, so the iPhone 18 (256GB and 512GB) cards use the iPhone 18 Pro photos for now.

## Purchase order emails (Resend)

GitHub Pages only serves static files, and a Resend API key in browser code would let anyone send email from your account. So the site posts orders to a small Cloudflare Worker in `worker/`, which holds the key, rechecks every price against `catalog.json` and sends the email to both inboxes. Replies go straight to the seller because the email's reply-to is their address.

1. **Resend.** Create an account at resend.com, add a domain you own under Domains and add the DNS records it gives you. You can't send from an atomicmail or yopmail address, and until a domain is verified Resend only delivers to your own account email. Then create an API key.
2. **Cloudflare.** Create a free account at cloudflare.com.
3. **Configure the worker.** In `worker/wrangler.toml`, set `FROM_EMAIL` to an address on your verified domain and replace `YOUR-GITHUB-USERNAME` in `ALLOWED_ORIGINS` with your GitHub username (add your custom domain too if you use one). `TO_EMAILS` already lists `santeriatech@atomicmail.io` and `orders.santeriatech@yopmail.com`.
4. **Deploy it.**

   ```bash
   cd worker
   npm install
   npx wrangler login
   npx wrangler secret put RESEND_API_KEY   # paste the key when asked
   npm run deploy
   ```

   Wrangler prints a URL like `https://santeria-orders.<you>.workers.dev`. That is your order endpoint.

5. **Point the site at it.** Add it as a GitHub repository variable named `VITE_ORDER_ENDPOINT` (see the next section). For local testing, copy `.env.example` to `.env.local` and paste it there.

Yopmail inboxes are public. Anyone who types `orders.santeriatech` on yopmail.com can read every order, including sellers' names, emails and phone numbers. Swap it for a private inbox in `TO_EMAILS` when you can.

The worker ignores bots that fill a hidden form field and only accepts posts from the origins you list. If spam becomes a problem, Cloudflare Turnstile or a rate limit rule can be added in front of it.

## Put it on GitHub Pages

1. Create a GitHub repository and push this folder to its `main` branch.
2. In the repository, open **Settings > Pages** and set **Source** to **GitHub Actions**.
3. Open **Settings > Secrets and variables > Actions > Variables** and add `VITE_ORDER_ENDPOINT` with your worker URL.
4. Push again, or run the "Deploy to GitHub Pages" workflow from the Actions tab.

The site appears at `https://<username>.github.io/<repo>/`. It uses hash URLs (`/#/sell/iphone`), so it works from any repository name and page refreshes never 404. For a custom domain, put the domain in a file at `public/CNAME`, set it under Settings > Pages, and add it to `ALLOWED_ORIGINS` in the worker.

## Project layout

```
src/
  config.ts            business details
  data/catalog.json    products and prices
  data/products.ts     categories and helpers
  lib/bag.tsx          sell bag state (saved in the browser)
  lib/order.ts         form checks and sending
  components/          nav, cards, photos, quantity stepper, search, bag sheet, motion helpers
  pages/               home, category, order, sent
worker/                    Resend email relay (Cloudflare Worker)
.github/workflows/deploy.yml
```

## Motion and accessibility

Animations use critically damped springs by default, with a little bounce only where something is thrown (items flying into the bag, the bag icon catching them). The bag sheet can be flicked closed on phones. Everything respects the system's Reduce Motion, Reduce Transparency and Increase Contrast settings.
