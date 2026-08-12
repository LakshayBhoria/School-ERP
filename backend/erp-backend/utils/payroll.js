/**
 * Payroll math shared by the API. Kept dependency-free so it's easy to
 * unit test and easy to keep in sync with the frontend's preview calc.
 */

function overtimeHourlyRate(employee, settings) {
  const base = employee.payType === 'hourly'
    ? employee.hourlyRate
    : employee.baseSalary / (settings.workingDaysPerMonth * settings.standardHoursPerDay);
  return base * settings.overtimeMultiplier;
}

/**
 * @param {Array} employees   active employees for the company
 * @param {Array} attendance  attendance records already filtered to the target month
 * @param {Array} leaves      leave records already filtered to the target month
 * @param {Object} settings   { overtimeMultiplier, standardHoursPerDay, workingDaysPerMonth }
 */
function computePayroll(employees, attendance, leaves, settings) {
  return employees
    .filter(e => e.status === 'active')
    .map(emp => {
      const records = attendance.filter(a => a.employeeId === emp.id);
      const overtimeHours = records.reduce((t, r) => t + (r.overtimeHours || 0), 0);
      const hoursWorked = records.reduce((t, r) => t + (r.hoursWorked || 0), 0);

      const base = emp.payType === 'hourly' ? hoursWorked * emp.hourlyRate : emp.baseSalary;
      const overtimePay = overtimeHours * overtimeHourlyRate(emp, settings);

      const unpaidLeaveDays = leaves
        .filter(l => l.employeeId === emp.id && l.type === 'unpaid' && l.status === 'approved')
        .reduce((t, l) => t + l.days, 0);
      const deductions = emp.payType === 'salary'
        ? round2((emp.baseSalary / settings.workingDaysPerMonth) * unpaidLeaveDays)
        : 0;

      const net = Math.max(0, round2(base + overtimePay - deductions));

      return {
        employeeId: emp.id,
        name: emp.name,
        department: emp.department,
        type: emp.type,
        base: round2(base),
        overtimeHours,
        overtimePay: round2(overtimePay),
        deductions,
        net,
      };
    });
}

function round2(n) {
  return Math.round(n * 100) / 100;
}

module.exports = { computePayroll, overtimeHourlyRate, round2 };
