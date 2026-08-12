const express = require('express');
const { z } = require('zod');
const { db } = require('../utils/firebase');

const router = express.Router({ mergeParams: true });

const entrySchema = z.object({
  employeeId: z.string().min(1),
  date: z.string(), // YYYY-MM-DD
  hoursWorked: z.number().min(0).default(0),
  overtimeHours: z.number().min(0).default(0),
  note: z.string().optional().default(''),
});

function collection(req) {
  return db.collection('companies').doc(req.params.companyId).collection('attendance');
}

// GET /companies/:companyId/attendance?month=2026-08&employeeId=xyz
router.get('/', async (req, res) => {
  let q = collection(req);
  if (req.query.employeeId) q = q.where('employeeId', '==', req.query.employeeId);
  const snap = await q.get();
  let rows = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  if (req.query.month) rows = rows.filter(r => r.date.startsWith(req.query.month));
  res.json(rows);
});

// POST /companies/:companyId/attendance  — log hours (any signed-in employee for their own record, or manager for anyone)
router.post('/', async (req, res) => {
  const parsed = entrySchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const isSelf = req.user.employeeId === parsed.data.employeeId;
  const isManager = ['admin', 'manager'].includes(req.user.role);
  if (!isSelf && !isManager) return res.status(403).json({ error: 'Can only log your own hours' });

  const ref = await collection(req).add({ ...parsed.data, loggedBy: req.user.uid, loggedAt: new Date().toISOString() });
  res.status(201).json({ id: ref.id, ...parsed.data });
});

router.delete('/:id', async (req, res) => {
  if (!['admin', 'manager'].includes(req.user.role)) return res.status(403).json({ error: 'Managers only' });
  await collection(req).doc(req.params.id).delete();
  res.status(204).end();
});

module.exports = router;
