const functions = require('firebase-functions');
const app = require('./app');

// Deployed as a single HTTPS function `api`, mounted at /api/** via
// firebase.json hosting rewrites. Locally: `firebase emulators:start`.
exports.api = functions.https.onRequest(app);

// Optional local/non-Firebase run: `node index.js` (see package.json "start")
if (require.main === module) {
  const PORT = process.env.PORT || 8080;
  app.listen(PORT, () => console.log(`Corvus ERP API listening on :${PORT}`));
}
