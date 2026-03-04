# Deploy frontend + backend on Render (easiest – one place)

[Render](https://render.com) can host **both** your React frontend and Express backend as **one Web Service**. Same URL, no CORS setup, one set of env vars.

---

## 1. Prepare the repo

- Code is in **GitHub** (or GitLab/Bitbucket).
- The repo already has:
  - **Build:** installs deps, builds the Vite client.
  - **Start:** runs `node server.js`, which serves the API and the built frontend.

---

## 2. Create the Web Service on Render

1. Go to [render.com](https://render.com) and sign in (GitHub is easiest).
2. **Dashboard** → **New** → **Web Service**.
3. **Connect** your repository (e.g. `thinkers-app`).
4. Use these settings:

   | Field | Value |
   |--------|--------|
   | **Name** | `thinkers-app` (or any name) |
   | **Region** | Choose nearest to your users |
   | **Branch** | `main` (or your default branch) |
   | **Runtime** | **Node** |
   | **Build Command** | `npm install && cd client && npm ci && npm run build` |
   | **Start Command** | `node server.js` |
   | **Instance Type** | **Free** (or paid for always-on) |

5. Click **Advanced** and add **Environment Variables** (see below).
6. Click **Create Web Service**. Render will build and deploy. Your app will be at `https://<your-service-name>.onrender.com`.

---

## 3. Environment variables (Render dashboard)

In your Web Service → **Environment** tab, add:

| Key | Value | Secret? |
|-----|--------|--------|
| `NODE_ENV` | `production` | No |
| `PORT` | (Render sets this automatically; you can leave it unset) | — |
| `SESSION_SECRET` | A long random string (e.g. from `openssl rand -hex 32`) | Yes |
| `AZURE_SQL_CONNECTION_STRING` | Your full Azure SQL connection string | Yes |
| or use separate vars | `AZURE_SQL_SERVER`, `AZURE_SQL_DATABASE`, `AZURE_SQL_USER`, `AZURE_SQL_PASSWORD` | Yes for password |
| `FRONTEND_ORIGIN` | `https://<your-service-name>.onrender.com` (same as the app URL) | No |
| (optional) `EMAIL_USER` | Your SMTP email | Yes |
| (optional) `EMAIL_PASS` | Your SMTP app password | Yes |
| (optional) `EMAIL_HOST` | e.g. `smtp.office365.com` | No |

You can copy other vars from your local `.env` (never commit `.env` to git).

---

## 4. After first deploy

- Open `https://<your-service-name>.onrender.com`.
- You should see the login page; API and frontend are on the same origin so no CORS or `VITE_API_BASE` needed.
- **Free tier:** the service sleeps after ~15 min of no traffic; the first request may take 30–60 seconds to wake it up.

---

## 5. Azure SQL firewall

In **Azure Portal** → your SQL server → **Networking** / **Firewall**:

- Either enable **Allow Azure services and resources to access this server**,  
- Or add **outbound IPs** that Render uses (see [Render docs](https://render.com/docs/static-outbound-ip-addresses); not all plans have static IPs).

---

## 6. Quick checklist

- [ ] Repo connected on Render, branch correct.
- [ ] Build command: `npm install && cd client && npm ci && npm run build`
- [ ] Start command: `node server.js`
- [ ] `SESSION_SECRET` and Azure SQL vars set (as secret where needed).
- [ ] `FRONTEND_ORIGIN` = your Render URL (optional when frontend and backend are same origin; can help with cookies).
- [ ] Azure SQL firewall allows Render (or “Allow Azure services”).

That’s it. One platform, one URL, frontend and backend together.
