const express = require('express');
const { db } = require('../utils/firebase');
const { requireRole } = require('../middleware/auth');
const { computePayroll } = require('../utils/payroll');

const router = express.Router({ mergeParams: true });

function companyRef(req) {
  return db.collection('companies').doc(req.params.companyId);
}

async function loadInputs(req, month) {
  const cRef = companyRef(req);
  const [empSnap, attSnap, leaveSnap, settingsSnap] = await Promise.all([
    cRef.collection('employees').get(),
    cRef.collection('attendance').get(),
    cRef.collection('leaves').get(),
    cRef.collection('settings').doc('general').get(),
  ]);
  const employees = empSnap.docs.map(d => ({ id: d.id, ...d.data() }));
  const attendance = attSnap.docs.map(d => ({ id: d.id, ...d.data() })).filter(a => a.date.startsWith(month));
  const leaves = leaveSnap.docs.map(d => ({ id: d.id, ...d.data() })).filter(l => l.from.startsWith(month));
  const settings = settingsSnap.exists ? settingsSnap.data() : {
    overtimeMultiplier: 1.5, standardHoursPerDay: 8, workingDaysPerMonth: 22,
  };
  return { employees, attendance, leaves, settings };
}

// GET /companies/:companyId/payroll/preview?month=2026-08
router.get('/preview', requireRole('admin', 'manager'), async (req, res) => {
  const month = req.query.month || new Date().toISOString().slice(0, 7);
  const { employees, attendance, leaves, settings } = await loadInputs(req, month);
  res.json({ month, entries: computePayroll(employees, attendance, leaves, settings) });
});

// POST /companies/:companyId/payroll/run  { month: '2026-08' }
router.post('/run', requireRole('admin'), async (req, res) => {
  const month = req.body.month || new Date().toISOString().slice(0, 7);
  const { employees, attendance, leaves, settings } = await loadInputs(req, month);
  const entries = computePayroll(employees, attendance, leaves, settings);

  const runsCol = companyRef(req).collection('payrollRuns');
  const existing = await runsCol.where('month', '==', month).limit(1).get();
  const payload = { month, entries, generatedAt: new Date().toISOString(), generatedBy: req.user.uid };

  let runId;
  if (!existing.empty) {
    runId = existing.docs[0].id;
    await runsCol.doc(runId).set(payload);
  } else {
    const ref = await runsCol.add(payload);
    runId = ref.id;
  }
  res.status(201).json({ id: runId, ...payload });
});

// GET /companies/:companyId/payroll/history
router.get('/history', requireRole('admin', 'manager'), async (req, res) => {
  const snap = await companyRef(req).collection('payrollRuns').orderBy('month', 'desc').get();
  res.json(snap.docs.map(d => ({ id: d.id, ...d.data() })));
});

module.exports = router;
