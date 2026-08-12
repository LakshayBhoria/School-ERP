const admin = require('firebase-admin');

/**
 * Builds Firebase Admin credentials for whichever environment this is
 * running in:
 *  - Render (or any plain Node host): no ambient Google credentials exist,
 *    so we require a service-account key via the FIREBASE_SERVICE_ACCOUNT
 *    env var (raw JSON or base64-encoded JSON — either works).
 *  - Cloud Functions / Cloud Run / App Engine: ambient credentials are
 *    injected automatically, so admin.credential.applicationDefault()
 *    just works with no env vars needed.
 */
function buildCredential() {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (raw && raw.trim()) {
    let jsonStr = raw.trim();
    if (!jsonStr.startsWith('{')) {
      // Assume base64-encoded JSON (handy for pasting into a Render env var).
      jsonStr = Buffer.from(jsonStr, 'base64').toString('utf8');
    }
    let serviceAccount;
    try {
      serviceAccount = JSON.parse(jsonStr);
    } catch (err) {
      throw new Error(
        'FIREBASE_SERVICE_ACCOUNT is set but is not valid JSON (or valid base64-encoded JSON). ' +
        'Paste the full contents of the service account key file, or its base64 encoding.'
      );
    }
    // Render (and most env var UIs) turn literal "\n" in multiline values
    // into the two characters backslash-n — restore real newlines in the key.
    if (serviceAccount.private_key) {
      serviceAccount.private_key = serviceAccount.private_key.replace(/\\n/g, '\n');
    }
    return admin.credential.cert(serviceAccount);
  }
  // Local dev with GOOGLE_APPLICATION_CREDENTIALS=./serviceAccountKey.json,
  // or ambient credentials on Cloud Functions/Cloud Run.
  return admin.credential.applicationDefault();
}

if (!admin.apps.length) {
  admin.initializeApp({
    credential: buildCredential(),
    projectId: process.env.FIREBASE_PROJECT_ID || undefined,
  });
}

const db = admin.firestore();
const auth = admin.auth();

module.exports = { admin, db, auth };
