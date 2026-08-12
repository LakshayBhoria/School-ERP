const express = require('express');
const { z } = require('zod');
const { db } = require('../utils/firebase');
const { requireRole } = require('../middleware/auth');

const router = express.Router({ mergeParams: true });
const schema = z.object({ name: z.string().min(1) });

function collection(req) {
  return db.collection('companies').doc(req.params.companyId).collection('departments');
}

router.get('/', async (req, res) => {
  const snap = await collection(req).get();
  res.json(snap.docs.map(d => ({ id: d.id, ...d.data() })));
});

router.post('/', requireRole('admin'), async (req, res) => {
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const ref = await collection(req).add(parsed.data);
  res.status(201).json({ id: ref.id, ...parsed.data });
});

router.delete('/:id', requireRole('admin'), async (req, res) => {
  const { db: fdb } = require('../utils/firebase');
  const inUse = await fdb.collection('companies').doc(req.params.companyId)
    .collection('employees').where('department', '==', req.params.id).limit(1).get();
  if (!inUse.empty) return res.status(409).json({ error: 'Reassign employees before deleting this department' });
  await collection(req).doc(req.params.id).delete();
  res.status(204).end();
});

module.exports = router;
