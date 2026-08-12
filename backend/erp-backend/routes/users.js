const express = require('express');
const { z } = require('zod');
const { db, auth } = require('../utils/firebase');
const { requireAuth, requireRole, requireSameCompany } = require('../middleware/auth');

const router = express.Router();

const signupSchema = z.object({
  companyName: z.string().min(1),
});

const inviteSchema = z.object({
  email: z.string().email(),
  role: z.enum(['admin', 'manager', 'employee']),
  employeeId: z.string().optional(),
});

/**
 * POST /api/signup
 * Called once right after the caller creates their Firebase Auth account
 * client-side. Bootstraps a new company and makes the caller its admin.
 * Requires a valid ID token but no existing /users profile yet.
 */
router.post('/signup', async (req, res) => {
  try {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;
    if (!token) return res.status(401).json({ error: 'Missing bearer token' });
    const decoded = await auth.verifyIdToken(token);

    const existing = await db.collection('users').doc(decoded.uid).get();
    if (existing.exists) return res.status(409).json({ error: 'Account already set up' });

    const parsed = signupSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

    const companyRef = await db.collection('companies').add({
      name: parsed.data.companyName,
      createdAt: new Date().toISOString(),
      createdBy: decoded.uid,
    });
    await companyRef.collection('settings').doc('general').set({
      currency: 'USD', overtimeMultiplier: 1.5, standardHoursPerDay: 8, workingDaysPerMonth: 22, leaveAnnualDays: 18,
    });
    await db.collection('users').doc(decoded.uid).set({
      email: decoded.email, role: 'admin', companyId: companyRef.id, createdAt: new Date().toISOString(),
    });

    res.status(201).json({ companyId: companyRef.id, role: 'admin' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Signup failed' });
  }
});

// GET /api/me
router.get('/me', requireAuth, async (req, res) => {
  res.json(req.user);
});

// POST /api/companies/:companyId/invite  — admin invites a teammate by email (they must sign up, then get linked)
router.post('/companies/:companyId/invite', requireAuth, requireSameCompany, requireRole('admin'), async (req, res) => {
  const parsed = inviteSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  let userRecord;
  try {
    userRecord = await auth.getUserByEmail(parsed.data.email);
  } catch {
    userRecord = await auth.createUser({ email: parsed.data.email });
  }
  await db.collection('users').doc(userRecord.uid).set({
    email: parsed.data.email, role: parsed.data.role, companyId: req.params.companyId,
    employeeId: parsed.data.employeeId || null, createdAt: new Date().toISOString(),
  }, { merge: true });

  const link = await auth.generatePasswordResetLink(parsed.data.email);
  res.status(201).json({ uid: userRecord.uid, setPasswordLink: link });
});

module.exports = router;
