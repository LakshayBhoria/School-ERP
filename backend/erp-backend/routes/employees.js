const express = require('express');
const { z } = require('zod');
const { db } = require('../utils/firebase');
const { requireRole } = require('../middleware/auth');

const router = express.Router({ mergeParams: true });

const employeeSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  phone: z.string().optional().default(''),
  department: z.string().optional().default(''),
  jobTitle: z.string().min(1),
  type: z.enum(['full-time', 'part-time', 'intern']),
  payType: z.enum(['salary', 'hourly']),
  baseSalary: z.number().min(0).default(0),
  hourlyRate: z.number().min(0).default(0),
  joinDate: z.string(),
  status: z.enum(['active', 'inactive']).default('active'),
  leaveBalance: z.number().min(0).default(0),
});

function collection(req) {
  return db.collection('companies').doc(req.params.companyId).collection('employees');
}

// GET /companies/:companyId/employees
router.get('/', async (req, res) => {
  const snap = await collection(req).get();
  res.json(snap.docs.map(d => ({ id: d.id, ...d.data() })));
});

// GET /companies/:companyId/employees/:id
router.get('/:id', async (req, res) => {
  const doc = await collection(req).doc(req.params.id).get();
  if (!doc.exists) return res.status(404).json({ error: 'Not found' });
  res.json({ id: doc.id, ...doc.data() });
});

// POST /companies/:companyId/employees  (admin/manager only)
router.post('/', requireRole('admin', 'manager'), async (req, res) => {
  const parsed = employeeSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const ref = await collection(req).add({ ...parsed.data, createdAt: new Date().toISOString() });
  res.status(201).json({ id: ref.id, ...parsed.data });
});

// PUT /companies/:companyId/employees/:id
router.put('/:id', requireRole('admin', 'manager'), async (req, res) => {
  const parsed = employeeSchema.partial().safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  await collection(req).doc(req.params.id).set({ ...parsed.data, updatedAt: new Date().toISOString() }, { merge: true });
  res.json({ id: req.params.id, ...parsed.data });
});

// DELETE /companies/:companyId/employees/:id  (admin only)
router.delete('/:id', requireRole('admin'), async (req, res) => {
  await collection(req).doc(req.params.id).delete();
  res.status(204).end();
});

module.exports = router;
