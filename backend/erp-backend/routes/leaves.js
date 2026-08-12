const express = require('express');
const { z } = require('zod');
const { db, admin } = require('../utils/firebase');
const { requireRole } = require('../middleware/auth');

const router = express.Router({ mergeParams: true });

const leaveSchema = z.object({
  employeeId: z.string().min(1),
  type: z.enum(['paid', 'sick', 'casual', 'unpaid']),
  from: z.string(),
  to: z.string(),
  days: z.number().min(1),
  reason: z.string().optional().default(''),
});

function companyRef(req) {
  return db.collection('companies').doc(req.params.companyId);
}

router.get('/', async (req, res) => {
  let q = companyRef(req).collection('leaves');
  if (req.query.status) q = q.where('status', '==', req.query.status);
  const snap = await q.get();
  res.json(snap.docs.map(d => ({ id: d.id, ...d.data() })));
});

router.post('/', async (req, res) => {
  const parsed = leaveSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const ref = await companyRef(req).collection('leaves').add({
    ...parsed.data, status: 'pending', requestedBy: req.user.uid, createdAt: new Date().toISOString(),
  });
  res.status(201).json({ id: ref.id, ...parsed.data, status: 'pending' });
});

// PATCH /companies/:companyId/leaves/:id/decision  { decision: 'approved' | 'rejected' }
router.patch('/:id/decision', requireRole('admin', 'manager'), async (req, res) => {
  const decision = req.body.decision;
  if (!['approved', 'rejected'].includes(decision)) return res.status(400).json({ error: 'decision must be approved or rejected' });

  const leaveRef = companyRef(req).collection('leaves').doc(req.params.id);

  await db.runTransaction(async (tx) => {
    const leaveDoc = await tx.get(leaveRef);
    if (!leaveDoc.exists) throw new Error('NOT_FOUND');
    const leave = leaveDoc.data();
    tx.update(leaveRef, { status: decision, decidedBy: req.user.uid, decidedAt: new Date().toISOString() });

    if (decision === 'approved' && leave.type !== 'unpaid') {
      const empRef = companyRef(req).collection('employees').doc(leave.employeeId);
      tx.update(empRef, { leaveBalance: admin.firestore.FieldValue.increment(-leave.days) });
    }
  }).catch(err => {
    if (err.message === 'NOT_FOUND') return res.status(404).json({ error: 'Leave request not found' });
    throw err;
  });

  res.json({ id: req.params.id, status: decision });
});

router.delete('/:id', requireRole('admin', 'manager'), async (req, res) => {
  await companyRef(req).collection('leaves').doc(req.params.id).delete();
  res.status(204).end();
});

module.exports = router;
