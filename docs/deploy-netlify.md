# Deploying Thinkers on Netlify

This guide covers deploying the **Thinkers** app so the **frontend** runs on Netlify. The **backend** (Express + Azure SQL) must run on a different host.

---

## 1. Architecture

| Part | Where it runs | Notes |
|------|----------------|--------|
| **Frontend** (Vite/React) | **Netlify** | Static site from `client/dist` |
| **Backend** (Express API) | **Another service** | e.g. Render, Railway, Azure App Service, Fly.io |

Netlify does not run long-running Node servers. Your `server.js` must be deployed to a service that supports Node (Render, Railway, Azure App Service, etc.). The frontend on Netlify will call that API using `VITE_API_BASE`.

---

## 2. Deploy the backend first

Deploy your Express API to one of these (pick one):

- **Render** – [render.com](https://render.com): New → Web Service → connect repo, set root to project root, build `npm install`, start `node server.js`, add env vars (including Azure SQL and `SESSION_SECRET`).
- **Railway** – [railway.app](https://railway.app): New project → deploy from GitHub → same idea: set start command and env vars.
- **Azure App Service** – Create a Web App, deploy via GitHub Actions or Azure CLI; set env vars in Configuration.

On that host, set at least:

- `AZURE_SQL_CONNECTION_STRING` (or `AZURE_SQL_SERVER`, `AZURE_SQL_DATABASE`, `AZURE_SQL_USER`, `AZURE_SQL_PASSWORD`)
- `SESSION_SECRET` (strong random string)
- `FRONTEND_ORIGIN` = your Netlify URL (e.g. `https://your-site.netlify.app`) so CORS allows the frontend
- Any other vars from your root `.env` (e.g. `EMAIL_*`, `PORT`)

Note the **API base URL** (e.g. `https://your-api.onrender.com` or `https://your-app.azurewebsites.net`). The frontend will need to call `/api` on that origin, so the base URL is either that origin + `/api` or the same if the server serves under `/api`.

---

## 3. Deploy the frontend to Netlify

### Option A – Connect with Netlify UI

1. **Push your code** to GitHub/GitLab/Bitbucket (if you haven’t already).

2. **Log in to [Netlify](https://app.netlify.com)** and click **Add new site** → **Import an existing project**.

3. **Connect your repo** and choose the repository and branch.

4. **Build settings** (the repo’s `netlify.toml` already sets these; you can confirm):
   - **Base directory:** (leave empty)
   - **Build command:** `cd client && npm ci && npm run build`
   - **Publish directory:** `client/dist`

5. **Environment variables** (Site configuration → Environment variables → Add):
   - **Key:** `VITE_API_BASE`
   - **Value:** Your API base URL including `/api`, e.g.  
     `https://your-api.onrender.com/api`  
     or  
     `https://your-app.azurewebsites.net/api`  
   - **Scopes:** Production (and Branch deploys if you use previews).

6. **Deploy.** Netlify will run the build and publish `client/dist`. The SPA redirect in `netlify.toml` ensures all routes serve `index.html`.

### Option B – Netlify CLI

```bash
# Install CLI once: npm install -g netlify-cli
cd /path/to/thinkers-app
netlify login
netlify init   # link to existing site or create new
# Set env var (one-time)
netlify env:set VITE_API_BASE "https://your-api.onrender.com/api"
# Deploy
netlify deploy --prod
```

---

## 4. CORS and cookies

Your Express server must allow the Netlify origin. In `server.js` you have something like:

```js
app.use(cors({ origin: process.env.FRONTEND_ORIGIN || 'http://localhost:5173', credentials: true }));
```

On the backend host, set:

- **`FRONTEND_ORIGIN`** = `https://your-site-name.netlify.app` (no trailing slash).

So the frontend (Netlify) and API (Render/Railway/Azure) can talk with credentials (cookies).

---

## 5. Checklist

- [ ] Backend deployed and healthy (e.g. `https://your-api.onrender.com/api/health` returns `{"ok":true}`).
- [ ] Backend env: `AZURE_SQL_*` or `AZURE_SQL_CONNECTION_STRING`, `SESSION_SECRET`, `FRONTEND_ORIGIN` (your Netlify URL).
- [ ] Netlify env: `VITE_API_BASE` = backend base URL including `/api`.
- [ ] Netlify build: `client/dist` published, SPA redirect in place (from `netlify.toml`).
- [ ] Azure SQL firewall allows the backend host’s outbound IP (or “Allow Azure services” if the API is on Azure).

---

## 6. Optional: custom domain

In Netlify: **Domain management** → **Add custom domain** and follow DNS instructions. No code changes needed; keep `VITE_API_BASE` pointing at your API URL. If you move the frontend to a custom domain, set `FRONTEND_ORIGIN` on the backend to that domain (e.g. `https://app.thinkersafrika.co.za`).

---

## 7. Troubleshooting

| Issue | What to check |
|-------|----------------|
| Blank page or 404 on refresh | Redirects in `netlify.toml` should serve `index.html` for `/*` (status 200). |
| “Cannot reach the API” | `VITE_API_BASE` must be set in Netlify and rebuilt; check Network tab for the request URL. |
| CORS errors | Backend `FRONTEND_ORIGIN` must match the Netlify URL (or custom domain) exactly. |
| 401 on API calls | Session cookie: ensure same-site/cross-origin and `credentials: 'include'`; backend and frontend must use HTTPS in production. |

For Azure SQL and env var details, see [netlify-azure-database-setup.md](./netlify-azure-database-setup.md).
