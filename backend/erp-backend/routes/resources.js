const express = require('express');
const { z } = require('zod');
const { db } = require('../utils/firebase');
const { requireRole } = require('../middleware/auth');

const router = express.Router({ mergeParams: true });

const resourceSchema = z.object({
  name: z.string().min(1),
  category: z.enum(['laptop', 'monitor', 'phone', 'furniture', 'other']),
  serial: z.string().optional().default(''),
  assignedTo: z.string().nullable().optional(),
  status: z.enum(['available', 'assigned', 'maintenance', 'retired']).default('available'),
  purchaseDate: z.string(),
});

function collection(req) {
  return db.collection('companies').doc(req.params.companyId).collection('resources');
}

router.get('/', async (req, res) => {
  const snap = await collection(req).get();
  res.json(snap.docs.map(d => ({ id: d.id, ...d.data() })));
});

router.post('/', requireRole('admin', 'manager'), async (req, res) => {
  const parsed = resourceSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const ref = await collection(req).add(parsed.data);
  res.status(201).json({ id: ref.id, ...parsed.data });
});

router.put('/:id', requireRole('admin', 'manager'), async (req, res) => {
  const parsed = resourceSchema.partial().safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  await collection(req).doc(req.params.id).set(parsed.data, { merge: true });
  res.json({ id: req.params.id, ...parsed.data });
});

router.delete('/:id', requireRole('admin', 'manager'), async (req, res) => {
  await collection(req).doc(req.params.id).delete();
  res.status(204).end();
});

module.exports = router;
