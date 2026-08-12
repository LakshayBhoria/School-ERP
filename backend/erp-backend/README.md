> **Deploying to Render?** See the top-level `README.md` at the repo root for the
> full Firebase + Render deploy walkthrough. This file covers Firebase Cloud
> Functions deployment as an alternative, plus the full API/data reference below.

# Corvus ERP — Backend (Node.js + Express + Firebase)

REST API for the Corvus HR & Payroll ERP. Runs as a single Cloud Function
(`api`) backed by Firestore, with Firebase Auth for login and role-based
access control (admin / manager / employee), multi-tenant by `companyId`.

## Data model (Firestore)

```
/users/{uid}                         -> { email, role, companyId, employeeId? }
/companies/{companyId}
  /employees/{id}                    -> name, email, department, jobTitle,
                                         type: full-time|part-time|intern,
                                         payType: salary|hourly, baseSalary,
                                         hourlyRate, joinDate, status, leaveBalance
  /departments/{id}                  -> { name }
  /attendance/{id}                   -> { employeeId, date, hoursWorked, overtimeHours, note }
  /leaves/{id}                       -> { employeeId, type, from, to, days, status, reason }
  /resources/{id}                    -> { name, category, serial, assignedTo, status, purchaseDate }
  /payrollRuns/{id}                  -> { month, entries[], generatedAt }
  /settings/general                  -> { currency, overtimeMultiplier, standardHoursPerDay, workingDaysPerMonth }
```

## API surface

All routes except `/health` and `/signup` require `Authorization: Bearer <Firebase ID token>`.

| Method | Path | Role |
|---|---|---|
| POST | `/signup` | any signed-in Firebase user (bootstraps a company + makes caller admin) |
| GET | `/me` | any |
| POST | `/companies/:id/invite` | admin |
| GET/POST/PUT/DELETE | `/companies/:id/employees[/:eid]` | read: all · write: manager+ · delete: admin |
| GET/POST/DELETE | `/companies/:id/attendance[/:aid]` | self or manager+ |
| GET/POST | `/companies/:id/leaves` | all |
| PATCH | `/companies/:id/leaves/:lid/decision` | manager+ |
| GET/POST/PUT/DELETE | `/companies/:id/resources[/:rid]` | manager+ |
| GET/POST/DELETE | `/companies/:id/departments[/:did]` | admin write |
| GET | `/companies/:id/payroll/preview?month=YYYY-MM` | manager+ |
| POST | `/companies/:id/payroll/run` | admin |
| GET | `/companies/:id/payroll/history` | manager+ |
| GET/PUT | `/companies/:id/settings` | admin write |

Payroll math (base pay, overtime pay, unpaid-leave deductions) lives in
`utils/payroll.js` and mirrors the calculation used in the frontend preview.

## 1. Prerequisites

```bash
npm install -g firebase-tools
firebase login
```

## 2. Create the Firebase project

```bash
firebase projects:create corvus-erp-yourcompany   # or use an existing project
cd erp-backend
firebase use --add        # pick the project, alias it "default"
```

Enable in the Firebase console (console.firebase.google.com):
- **Authentication** → Sign-in method → enable Email/Password (add Google/SSO later if you want)
- **Firestore Database** → Create database → production mode

## 3. Install dependencies

```bash
npm install
```

## 4. Run locally with the emulator suite

```bash
npm run serve
# Functions:  http://127.0.0.1:5001/<project-id>/us-central1/api
# Firestore emulator UI: http://127.0.0.1:4000
```

Point the frontend's `fetch()` base URL at the emulator host while testing.

## 5. Deploy

```bash
firebase deploy --only functions,firestore:rules,firestore:indexes
```

This publishes:
- the `api` Cloud Function (your Express app)
- Firestore security rules (`firestore.rules`) — company-scoped, role-gated
- Firestore indexes

Your live API base URL will look like:
```
https://us-central1-<project-id>.cloudfunctions.net/api
```

If you also want a custom domain / clean `/api/*` path, deploy Firebase
Hosting with the included rewrite in `firebase.json`:

```bash
firebase deploy --only hosting
```
then call `https://<project-id>.web.app/api/...`.

## 6. First-time setup (creating the first company + admin)

1. From your frontend (or `curl`), create a Firebase Auth user (email/password
   or any provider) using the Firebase client SDK — this happens entirely
   client-side, no backend call needed yet.
2. Grab that user's ID token (`user.getIdToken()`), then call:

```bash
curl -X POST https://<your-api-base>/signup \
  -H "Authorization: Bearer <ID_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{"companyName":"Acme Inc."}'
```

This creates `/companies/{companyId}` and marks the caller as `admin` in
`/users/{uid}`. From then on, that admin can hit `POST /companies/:id/invite`
to add managers and employees (they'll get a "set password" link — Firebase
Auth handles email delivery if you configure an email template, or you can
send the link yourself via your own mailer).

3. Seed departments/employees/settings through the normal REST endpoints,
   or write a one-off script using `firebase-admin` directly.

## 7. Wiring the frontend to this backend

The demo frontend (`erp/index.html`) currently uses the artifact's built-in
`window.storage` so it works instantly with zero setup. To point it at this
real backend instead:

1. Add the Firebase client SDK (`firebase/app`, `firebase/auth`) to the
   frontend and initialize with your project's web config (Project settings
   → General → Your apps → Web app).
2. Replace the `storeGet`/`storeSet` helpers in `index.html` with `fetch()`
   calls to `https://<your-api-base>/companies/<companyId>/...`, attaching
   `Authorization: Bearer <idToken>` from `firebase.auth().currentUser.getIdToken()`.
3. Replace the demo login screen with real Firebase Auth sign-in
   (`signInWithEmailAndPassword` / SSO), then call `GET /me` to get the
   user's role and companyId.

## Security notes

- Firestore rules (`firestore.rules`) are the source of truth for access
  control — the Express middleware is a second layer, not a replacement.
- Every write is scoped by `companyId` so tenants can never read or write
  each other's data.
- Rotate any service account keys you download; never commit them
  (`.gitignore` already excludes `serviceAccountKey.json`).
- Add App Check and a stricter `express-rate-limit` config before taking
  real payroll data into production.
