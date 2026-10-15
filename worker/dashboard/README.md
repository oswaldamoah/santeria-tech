# Set up the API in the Cloudflare dashboard

Use this if you'd rather click through Cloudflare's website than run commands. It does the same job as `npm run deploy` and `npm run secrets` in the `worker` folder.

1. In the Cloudflare dashboard, open **Workers & Pages** and create a Worker (any name, for example `santeria-orders`). Click **Deploy** on the starter, then **Edit code**.
2. Delete everything in the editor, paste the whole contents of `worker.js` from this folder, and click **Deploy**.
3. Open the Worker's **Settings > Variables and Secrets** and add these. Use **Secret** for the first five so nobody can read them back.

   | Name | Type | Value |
   | --- | --- | --- |
   | `RESEND_API_KEY` | Secret | your Resend API key |
   | `DATABASE_URL` | Secret | your Neon connection string (`postgresql://...`) |
   | `ADMIN_PASSWORD` | Secret | the password for the order dashboard |
   | `SESSION_SECRET` | Secret | any long random text |
   | `PRICE_SHEET_URL` | Secret | your Google Sheet link |
   | `FROM_EMAIL` | Text | `Santeria Tech Orders <orders@your-verified-domain.com>` |
   | `TO_EMAILS` | Text | `santeriatech@atomicmail.io,oswaldamoah00@gmail.com` |
   | `ALLOWED_ORIGINS` | Text | `https://YOUR-GITHUB-USERNAME.github.io` |
   | `SITE_URL` | Text | your site's full address, like `https://YOUR-GITHUB-USERNAME.github.io/santeria-tech/` |

4. Under **Settings > Runtime**, make sure **Compatibility flags** includes `nodejs_compat`.
5. Copy the Worker's address from its overview page (it looks like `https://santeria-orders.your-name.workers.dev`). Put it in `apiUrl` in `src/config.ts`, or in the `VITE_API_URL` GitHub variable.

Your `worker/.dev.vars` file holds the same secrets, so you can copy them from there.

If the worker's code changes later, regenerate `worker.js` (the command is at the top of the file) and paste it again. Price changes in your Google Sheet never need a repaste.
