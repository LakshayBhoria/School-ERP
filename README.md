# Corvus ERP — Deploy Guide (Firebase + Render)

This package has two pieces:

```
backend/erp-backend/   Express API — Firestore + Firebase Auth, runs on Render
frontend/index.html    Single-file app — talks to the API, hosted as a static site
render.yaml             Optional one-click Blueprint for both services
```

Firebase provides your **database (Firestore)** and **login (Auth)**.
Render runs the **API** and can also host the **static frontend** — you
don't need Firebase Hosting or Cloud Functions at all.

---

## 1. Create the Firebase project (5 min)

1. Go to [console.firebase.google.com](https://console.firebase.google.com) → **Add project**.
2. **Build → Authentication → Get started → Sign-in method → Email/Password → Enable.**
3. **Build → Firestore Database → Create database → Production mode** (any region).
4. **Project settings (gear icon) → General → Your apps → Web app (`</>`)** — register an app
   (no need to check "Firebase Hosting"). Copy the `firebaseConfig` object it shows you —
   you'll paste this into `frontend/index.html`.
5. **Project settings → Service accounts → Generate new private key.** This downloads a
   JSON file — you'll paste its contents into a Render environment variable in step 3.
   Keep this file private; never commit it.
6. Publish the included security rules so Firestore actually enforces per-company access —
   easiest via the Firebase CLI from the `backend/erp-backend` folder:
   ```bash
   npm install -g firebase-tools
   firebase login
   firebase use --add        # pick your project
   firebase deploy --only firestore:rules,firestore:indexes
   ```
   (You can also paste `firestore.rules` into Firebase console → Firestore → Rules manually.)

---

## 2. Push this code to a Git repo

Render deploys from GitHub/GitLab. Create a repo (e.g. `corvus-erp`) containing this
whole folder (`backend/`, `frontend/`, `render.yaml`), and push it.

---

## 3. Deploy the backend to Render

**Option A — Blueprint (fastest):** In Render, **New → Blueprint**, point it at your repo.
It reads `render.yaml` and creates both services below automatically; you'll just need to
fill in the env vars it leaves blank.

**Option B — Manual:**
1. Render → **New → Web Service** → connect your repo.
2. **Root Directory:** `backend/erp-backend`
3. **Build Command:** `npm install`
4. **Start Command:** `npm start`
5. **Environment variables:**
   | Key | Value |
   |---|---|
   | `FIREBASE_SERVICE_ACCOUNT` | Paste the *entire contents* of the service-account JSON from step 1.5 |
   | `FIREBASE_PROJECT_ID` | Your Firebase project ID |
   | `ALLOWED_ORIGINS` | Your frontend's URL once deployed, e.g. `https://corvus-erp-frontend.onrender.com` (comma-separate if more than one) |
6. Deploy. Once live, note the backend URL, e.g. `https://corvus-erp-backend.onrender.com`.
   Visit `<that URL>/health` — you should see `{"ok":true,...}`.

> `FIREBASE_SERVICE_ACCOUNT` accepts either the raw JSON on one line, or the JSON
> base64-encoded (handy if your env var UI mangles newlines/quotes).

---

## 4. Wire and deploy the frontend

1. Open `frontend/index.html`, find the `CONFIG` block near the top of the `<script>` tag,
   and fill in:
   - `firebaseConfig` — from step 1.4
   - `API_BASE` — your Render backend URL from step 3.6
2. Commit and push.
3. In Render: **New → Static Site** → same repo → **Root Directory:** `frontend`,
   **Build Command:** *(leave blank)*, **Publish Directory:** `.`
4. Deploy. Render gives you a URL like `https://corvus-erp-frontend.onrender.com`.
5. **Go back to the backend service's env vars** and set `ALLOWED_ORIGINS` to this exact
   URL (this was the one placeholder that depends on step 4), then redeploy the backend.

---

## 5. Create your first company + admin

Open the deployed frontend URL. On the login screen, click **"New company? → Create one"**,
fill in an email/password and company name, and submit. This:
- creates a Firebase Auth user,
- calls the backend's `/signup` endpoint, which bootstraps a `/companies/{id}` doc and
  marks you as that company's `admin`.

From there, use **Settings → invite** (admin only) to add managers/employees — they'll get
a password-setup link via Firebase Auth.

---

## Local development

**Backend:**
```bash
cd backend/erp-backend
cp .env.example .env    # fill in FIREBASE_SERVICE_ACCOUNT + FIREBASE_PROJECT_ID
npm install
npm start                # listens on :8080
```
**Frontend:** set `API_BASE = "http://localhost:8080"` in `index.html`, then just open the
file in a browser (or `npx serve frontend`).

---

## What was already built vs. what changed for this deploy

The app (Express routes, Firestore data model, RBAC, payroll math, and the whole
frontend UI) was already complete and already wired frontend → backend → Firebase.
For this deploy pass:
- `utils/firebase.js` now accepts a service-account key via `FIREBASE_SERVICE_ACCOUNT`
  (Render has no ambient Google credentials the way Cloud Functions does).
- `app.js` CORS is now configurable via `ALLOWED_ORIGINS` instead of wide open.
- Closed a cross-tenant gap: `POST /companies/:id/invite` now verifies the caller's
  `companyId` matches `:id` before allowing the invite (previously any admin could invite
  into *any* company ID).
- Added `render.yaml` and this guide.

## Security notes before real payroll data goes in
- Rotate/regenerate the service-account key if it's ever exposed; never commit it.
- Firestore rules are the real access-control boundary — keep them in sync with any new
  routes/roles you add.
- Consider Firebase App Check and a stricter rate limit for production traffic.
