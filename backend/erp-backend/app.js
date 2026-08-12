const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

const { requireAuth, requireSameCompany } = require('./middleware/auth');
const usersRoutes = require('./routes/users');
const employeesRoutes = require('./routes/employees');
const attendanceRoutes = require('./routes/attendance');
const leavesRoutes = require('./routes/leaves');
const resourcesRoutes = require('./routes/resources');
const departmentsRoutes = require('./routes/departments');
const payrollRoutes = require('./routes/payroll');
const settingsRoutes = require('./routes/settings');

const app = express();

// Comma-separated list of allowed frontend origins, e.g.
//   ALLOWED_ORIGINS=https://corvus-erp-frontend.onrender.com,https://your-project.web.app
// Left unset -> reflects any origin (fine for local dev / getting started).
const allowedOrigins = (process.env.ALLOWED_ORIGINS || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

app.use(helmet());
app.use(cors({ origin: allowedOrigins.length ? allowedOrigins : true }));
app.use(express.json());
app.use(rateLimit({ windowMs: 60 * 1000, max: 120 })); // 120 req/min per IP

app.get('/', (req, res) => res.json({ ok: true, service: 'corvus-erp-api', see: '/health' }));
app.get('/health', (req, res) => res.json({ ok: true, service: 'corvus-erp-api' }));

// Auth bootstrap (signup, profile, invites) — mostly public/self-auth handled per-route
app.use('/', usersRoutes);

// Everything below is scoped to a company and requires a verified user
const companyRouter = express.Router({ mergeParams: true });
companyRouter.use(requireAuth, requireSameCompany);
companyRouter.use('/employees', employeesRoutes);
companyRouter.use('/attendance', attendanceRoutes);
companyRouter.use('/leaves', leavesRoutes);
companyRouter.use('/resources', resourcesRoutes);
companyRouter.use('/departments', departmentsRoutes);
companyRouter.use('/payroll', payrollRoutes);
companyRouter.use('/settings', settingsRoutes);

app.use('/companies/:companyId', companyRouter);

// Fallback 404
app.use((req, res) => res.status(404).json({ error: 'Not found' }));

// Central error handler
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
});

module.exports = app;
