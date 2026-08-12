const { auth, db } = require('../utils/firebase');

/**
 * Verifies the Firebase ID token sent as "Authorization: Bearer <token>",
 * then loads the matching /users/{uid} profile (role + companyId) so
 * downstream handlers can enforce company-scoping and RBAC.
 */
async function requireAuth(req, res, next) {
  try {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;
    if (!token) return res.status(401).json({ error: 'Missing bearer token' });

    const decoded = await auth.verifyIdToken(token);
    const userSnap = await db.collection('users').doc(decoded.uid).get();
    if (!userSnap.exists) return res.status(403).json({ error: 'No user profile found for this account' });

    req.user = { uid: decoded.uid, email: decoded.email, ...userSnap.data() };
    next();
  } catch (err) {
    console.error('Auth error:', err.message);
    res.status(401).json({ error: 'Invalid or expired token' });
  }
}

/** Restricts a route to one or more roles: requireRole('admin'), requireRole('admin','manager') */
function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ error: `Requires role: ${roles.join(' or ')}` });
    }
    next();
  };
}

/** Every data route is scoped under /companies/{companyId}/... — this guards cross-tenant access. */
function requireSameCompany(req, res, next) {
  const paramCompany = req.params.companyId;
  if (paramCompany && paramCompany !== req.user.companyId) {
    return res.status(403).json({ error: 'Cannot access another company\'s data' });
  }
  next();
}

module.exports = { requireAuth, requireRole, requireSameCompany };
