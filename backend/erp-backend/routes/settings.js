const express = require('express');
const { z } = require('zod');
const { db } = require('../utils/firebase');
const { requireRole } = require('../middleware/auth');

const router = express.Router({ mergeParams: true });

const schema = z.object({
  currency: z.string().default('USD'),
  overtimeMultiplier: z.number().min(1).default(1.5),
  standardHoursPerDay: z.number().min(1).default(8),
  workingDaysPerMonth: z.number().min(1).default(22),
  leaveAnnualDays: z.number().min(0).default(18),
});

function docRef(req) {
  return db.collection('companies').doc(req.params.companyId).collection('settings').doc('general');
}

router.get('/', async (req, res) => {
  const doc = await docRef(req).get();
  res.json(doc.exists ? doc.data() : schema.parse({}));
});

router.put('/', requireRole('admin'), async (req, res) => {
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  await docRef(req).set(parsed.data, { merge: true });
  res.json(parsed.data);
});

module.exports = router;
