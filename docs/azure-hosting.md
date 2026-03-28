# Hosting the Thinkers app on Azure

This guide covers running both the **backend** (and optionally the **frontend**) on Azure and connecting to **Azure SQL Database**.

---

## 1. Overview

| Part | Where it runs | What to configure |
|------|----------------|-------------------|
| **Backend** (Node/Express) | Azure App Service (Web App) | App Service env vars → Azure SQL + `SESSION_SECRET` |
| **Frontend** (Vite/React) | Same App Service (static) or Azure Static Web Apps | If separate: set `VITE_API_BASE` to your API URL at build time |
| **Database** | Azure SQL Database | Connection details in backend env vars; firewall allows App Service |

Because both the app and the database are on Azure, you can enable **Allow Azure services and resources to access this server** on the SQL server firewall so the App Service can connect without opening to the whole internet.

---

## 2. Azure SQL Database

1. In [Azure Portal](https://portal.azure.com), create or use an **Azure SQL server** and **database**.
2. Create a **SQL login** (user + password) and ensure that user has access to your database.
3. **Firewall**: SQL server → **Networking** (or **Firewall and virtual networks**):
   - Turn on **Allow Azure services and resources to access this server** so your App Service can connect.
   - For local development, add your own client IP.
4. Note:
   - **Server**: e.g. `yourserver.database.windows.net`
   - **Database name**
   - **User** and **Password**

---

## 3. Backend on Azure App Service

### Deploy the Node API

- Create a **Web App** (Linux or Windows) and set runtime to **Node**.
- Deploy your code (GitHub Actions, Azure CLI, or ZIP deploy) so that the App Service runs `node server.js` (or `npm run server`).
- Set the **start command** if needed (e.g. `node server.js` or `npm start`).

### Environment variables (Application settings)

In the App Service → **Configuration** → **Application settings**, add:

**Runtime (recommended)**

| Name | Value | Slot setting |
|------|--------|--------------|
| `NODE_ENV` | `production` | ✓ |
| `WEBSITE_NODE_DEFAULT_VERSION` | `~20` or `22` (match `package.json` `engines`) | Optional; set in **Configuration** → **General settings** if the stack picker does not match |

**Database – use one of these (same names as local `.env`; `.env` is not deployed)**

**Option A – Connection string**

| Name | Value | Slot setting |
|------|--------|--------------|
| `AZURE_SQL_CONNECTION_STRING` | `Server=tcp:YOUR_SERVER.database.windows.net,1433;Initial Catalog=YOUR_DB;User ID=YOUR_USER;Password=YOUR_PASSWORD;Encrypt=true;TrustServerCertificate=false` | ✓ |

Or **`SQLSERVER_CONNECTION_STRING`** with the same value (see `src/db.js`).

**Option B – Separate variables (preferred when passwords have special characters)**

The app accepts either **`AZURE_SQL_*`** or **`SQLSERVER_*`** (same semantics).

| Name | Value | Slot setting |
|------|--------|--------------|
| `AZURE_SQL_SERVER` or `SQLSERVER_HOST` | `yourserver.database.windows.net` | ✓ |
| `AZURE_SQL_DATABASE` or `SQLSERVER_DATABASE` | Your database name | ✓ |
| `AZURE_SQL_USER` or `SQLSERVER_USER` | SQL login user | ✓ |
| `AZURE_SQL_PASSWORD` or `SQLSERVER_PASSWORD` | SQL login password | ✓ (mark as secret) |
| `AZURE_SQL_PORT` or `SQLSERVER_PORT` | `1433` (optional) | ✓ |

**Required for auth and same-origin SPA**

| Name | Value | Slot setting |
|------|--------|--------------|
| `SESSION_SECRET` | A long random string (e.g. 32+ chars) | ✓ |
| `FRONTEND_ORIGIN` | Your site URL, e.g. `https://your-app.azurewebsites.net` or `https://your-domain.com` (no trailing slash) | ✓ |
| `FRONTEND_ORIGINS` | Optional. Comma-separated extra origins if users reach the app at more than one URL (e.g. `https://www.example.com,https://example.com` or default hostname + custom domain). Must match the browser address bar exactly (including `https`). | |

The API sets **trust proxy** for Azure’s load balancer so `secure` session cookies work over HTTPS.

If the UI shows “Cannot reach the API” in production, the browser is blocking the request (wrong `VITE_API_BASE`, or CORS: set `FRONTEND_ORIGIN` / `FRONTEND_ORIGINS` to the exact origin you use in the browser).

**Optional – email:**  
If you use the app’s email features, add `EMAIL_USER`, `EMAIL_PASS`, `EMAIL_FROM_NAME`, and optionally `EMAIL_HOST`, `EMAIL_PORT`, `EMAIL_SECURE` as in your `.env.example`.

Save **Configuration** so the App Service picks up the new settings. The backend will then connect to Azure SQL using `src/db.js`.

**Startup command** (Linux): under **Configuration** → **General settings**, use **`npm start`** (runs `node server.js` from `package.json`) or `node server.js`.

### GitHub Actions deploy (this repo)

The workflow **`.github/workflows/main_tihlo.yml`** builds on push to `main` and deploys with `azure/webapps-deploy`. It does **not** inject database passwords; you must still set Application settings in the Portal (or use Azure Key Vault references). After changing settings, restart the Web App.

---

## 4. Frontend on Azure

### Option A – Same App Service (API + static files)

- Build the client: `cd client && npm run build`.
- Serve the contents of `client/dist` from your Express app (e.g. `express.static('client/dist')` and a catch‑all for SPA routing).
- Deploy the repo including `client/dist` (or run the build in your deployment pipeline).  
Then one URL serves both API and frontend; no `VITE_API_BASE` needed if the app calls the same origin.

### Option B – Frontend on Azure Static Web Apps

- Deploy the Vite app to **Azure Static Web Apps** (build: `cd client && npm run build`, output: `client/dist`).
- In Static Web Apps **Configuration** (or in the build), set:
  - `VITE_API_BASE` = your backend URL, e.g. `https://your-app.azurewebsites.net/api`
- So the frontend is built with the correct API URL and talks to your App Service backend.

---

## 5. Quick checklist

- [ ] Azure SQL server and database exist; SQL user has access.
- [ ] SQL server firewall: **Allow Azure services and resources to access this server** (and your IP for local dev).
- [ ] App Service **Configuration** → Application settings: `AZURE_SQL_*` or `SQLSERVER_*` or a connection string; `NODE_ENV=production`; `SESSION_SECRET`; `FRONTEND_ORIGIN` = your HTTPS site URL.
- [ ] Backend **Startup Command** `npm start` or `node server.js` (Linux).
- [ ] If frontend is on Static Web Apps, `VITE_API_BASE` points to your App Service API URL.

---

## 6. Local development

Keep using `.env` in the project root with the same variable names (`AZURE_SQL_CONNECTION_STRING` or the individual `AZURE_SQL_*` vars). Add your IP to the Azure SQL firewall so your machine can connect. Do not commit `.env` (it’s in `.gitignore`).
