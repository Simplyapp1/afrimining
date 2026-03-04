# Setting up Azure SQL database environment on Netlify

This guide walks you through configuring your Netlify deployment to use an **Azure SQL Database**.

---

## 1. Understand your setup

Your app has:

- **Frontend** (Vite/React) – can be deployed on Netlify.
- **Backend** (Express + Azure SQL) – connects using env vars read in `src/db.js`.

**Two common setups:**

| Setup | Where backend runs | Where to set Azure SQL env vars |
|-------|--------------------|----------------------------------|
| **A** | Same place as frontend (e.g. Netlify Functions or another serverless API) | **Netlify** → Environment variables |
| **B** | Separate host (e.g. Azure App Service, Render, Railway) | **That host’s** env vars (not Netlify). On Netlify you only set `VITE_API_BASE` to your API URL. |

If your **API runs on Netlify** (e.g. as serverless functions or a proxy to an API), use **Setup A** below. If your API runs on another service, set the Azure SQL variables on that service and use the **Frontend-only** section for Netlify.

---

## 2. Get Azure SQL connection details

1. Open [Azure Portal](https://portal.azure.com) and go to your **SQL database** (or create one).
2. Note:
   - **Server name**: e.g. `yourserver.database.windows.net`
   - **Database name**
   - **Authentication**: SQL login (user + password) or Azure AD. This app uses SQL login.
3. If using a **connection string**:
   - In the database blade, go to **Connection strings** and copy the **ADO.NET** (or similar) string.
   - It looks like:  
     `Server=tcp:yourserver.database.windows.net,1433;Initial Catalog=yourdb;User ID=user;Password=***;Encrypt=True;...`
4. Ensure **firewall** allows access:
   - In the SQL server (not the database), open **Networking** / **Firewall rules**.
   - Add your IP for local dev; for **Netlify**, you typically need to **Allow Azure services and resources to access this server** and/or add **0.0.0.0/0** (or Netlify’s outbound IPs if you restrict by IP). Restricting by IP is more secure but requires keeping the list updated.

---

## 3. Set environment variables on Netlify

1. In [Netlify](https://app.netlify.com), open your **site**.
2. Go to **Site configuration** (or **Site settings**) → **Environment variables**.
3. Add the variables your app expects.

Your app (`src/db.js`) supports **two** ways to configure the database.

### Option A – Connection string (simplest)

Add one variable:

| Key | Value | Scopes |
|-----|--------|--------|
| `AZURE_SQL_CONNECTION_STRING` | Your full connection string (see above) | Production, and optionally Branch deploys |

- **Value**: paste the connection string, with the real password.
- **Sensitive**: mark as **Secret** (or equivalent) so it’s masked in the UI.

### Option B – Separate variables

Add these (no connection string):

| Key | Value | Scopes |
|-----|--------|--------|
| `AZURE_SQL_SERVER` | e.g. `yourserver.database.windows.net` | Production (and others if needed) |
| `AZURE_SQL_DATABASE` | Your database name | Production (and others if needed) |
| `AZURE_SQL_USER` | SQL login username | Production (and others if needed) |
| `AZURE_SQL_PASSWORD` | SQL login password (mark as secret) | Production (and others if needed) |
| `AZURE_SQL_PORT` | Optional; default is `1433` | Optional |

Use **either** Option A **or** Option B. If `AZURE_SQL_CONNECTION_STRING` is set, the app uses it and ignores the others.

4. **Scopes**:  
   - **Production**: used for the main site.  
   - **Branch deploys**: enable if you want preview deploys to hit a (e.g. dev) database.  
   - **Build**: only needed if your **build** step runs Node and connects to Azure SQL (e.g. migrations during build). Otherwise you can leave Build unchecked for DB vars.

5. Save. Redeploy the site so the new variables are applied.

---

## 4. When the API runs on Netlify

If your backend runs on Netlify (e.g. Netlify Functions that use `src/db.js`):

- The **same** env vars (`AZURE_SQL_*` or `AZURE_SQL_CONNECTION_STRING`) must be set in Netlify as in step 3.
- Those functions will then connect to Azure SQL using the config in `src/db.js`.
- Ensure the build outputs the serverless functions and that the runtime has access to these env vars (they are usually available at runtime by default).

---

## 5. When the API runs elsewhere (frontend-only on Netlify)

If the Express API is hosted on **another** service (e.g. Azure App Service, Render):

- Set **Azure SQL** env vars on **that** service, not on Netlify.
- On **Netlify**, set only the variable the **frontend** uses to call the API:

| Key | Value | Example |
|-----|--------|--------|
| `VITE_API_BASE` | Full API base URL (including `/api` if your API is under `/api`) | `https://your-api.azurewebsites.net/api` |

Then in your Netlify build:

- Build command should build the Vite app (e.g. `cd client && npm run build`).
- Publish directory: `client/dist` (or wherever Vite outputs).

The built app will use `VITE_API_BASE` at build time so the client points to your real API; the API itself reads Azure SQL from its own environment.

---

## 6. Security checklist

- [ ] Never commit connection strings or passwords to git.
- [ ] Use **Secret** / sensitive flag for `AZURE_SQL_PASSWORD` and `AZURE_SQL_CONNECTION_STRING` in Netlify.
- [ ] Restrict Azure SQL firewall to known IPs where possible (e.g. Netlify outbound IPs or your API host’s IPs).
- [ ] Use different databases (or at least different logins) for production vs branch/preview deploys if you use branch deploys.

---

## 7. Quick reference – env vars your app uses

From `src/db.js`:

- **Option 1:** `AZURE_SQL_CONNECTION_STRING` (full string).
- **Option 2:** `AZURE_SQL_SERVER`, `AZURE_SQL_DATABASE`, `AZURE_SQL_USER`, `AZURE_SQL_PASSWORD`, and optionally `AZURE_SQL_PORT` (default `1433`).

Frontend (for API URL when API is on a different host):

- `VITE_API_BASE` – e.g. `https://your-api.example.com/api`

After changing env vars on Netlify, trigger a **new deploy** so the new values are used.
