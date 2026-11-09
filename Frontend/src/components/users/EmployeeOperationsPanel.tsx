import React, { useMemo, useState } from 'react';
import { CalendarDays, Check, Clock3, Download, Users, X } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { AppStore } from '../../services/store';
import { AttendanceRecord, LeaveRecord, PayrollEntry, User } from '../../types';
import { exportToExcel } from '../../utils/exports';

type OperationsTab = 'overview' | 'attendance' | 'leave';

interface EmployeeOperationsPanelProps {
  employees: User[];
  payrollEntries: PayrollEntry[];
  activeUser: User;
  showToast: (message: string, type: 'success' | 'error' | 'info') => void;
}

const localDateValue = (date: Date): string =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

const dayCount = (startDate: string, endDate: string): number => {
  const toUTC = (value: string): number => {
    const [year, month, day] = value.split('-').map(Number);
    return Date.UTC(year, month - 1, day);
  };
  return Math.floor((toUTC(endDate) - toUTC(startDate)) / 86_400_000) + 1;
};

const currentMonth = (): string => localDateValue(new Date()).slice(0, 7);

export const EmployeeOperationsPanel: React.FC<EmployeeOperationsPanelProps> = ({
  employees,
  payrollEntries,
  activeUser,
  showToast,
}) => {
  const { t } = useApp();
  const statusLabels: Record<AttendanceRecord['status'], string> = {
    present: t('employeePresent'),
    absent: t('employeeAbsent'),
    late: t('employeeLate'),
    half_day: t('employeeHalfDay'),
  };
  const [tab, setTab] = useState<OperationsTab>('overview');
  const [attendance, setAttendance] = useState<AttendanceRecord[]>(() => AppStore.getAttendanceRecords());
  const [leaveRecords, setLeaveRecords] = useState<LeaveRecord[]>(() => AppStore.getLeaveRecords());
  const [month, setMonth] = useState(currentMonth);
  const [attendanceUserId, setAttendanceUserId] = useState(employees[0]?.id || '');
  const [attendanceDate, setAttendanceDate] = useState(localDateValue(new Date()));
  const [attendanceStatus, setAttendanceStatus] = useState<AttendanceRecord['status']>('present');
  const [checkInTime, setCheckInTime] = useState('');
  const [checkOutTime, setCheckOutTime] = useState('');
  const [attendanceNote, setAttendanceNote] = useState('');
  const [leaveUserId, setLeaveUserId] = useState(employees[0]?.id || '');
  const [leaveType, setLeaveType] = useState<'annual' | 'sick' | 'emergency'>('annual');
  const [leaveStartDate, setLeaveStartDate] = useState(localDateValue(new Date()));
  const [leaveEndDate, setLeaveEndDate] = useState(localDateValue(new Date()));
  const [leaveReason, setLeaveReason] = useState('');
  const [annualAllowance, setAnnualAllowance] = useState(String(AppStore.getEmployeeSettings().annualLeaveAllowanceDays));
  const [isSaving, setIsSaving] = useState(false);

  const selectedAttendanceEmployee = employees.find((employee) => employee.id === attendanceUserId);
  const selectedLeaveEmployee = employees.find((employee) => employee.id === leaveUserId);
  const monthAttendance = useMemo(
    () => attendance.filter((record) => record.date.startsWith(month)),
    [attendance, month]
  );
  const today = localDateValue(new Date());
  const todayRecords = attendance.filter((record) => record.date === today);
  const activeEmployeeIds = new Set(employees.filter((employee) =>
    employee.active && employee.employeeDetails?.employmentStatus !== 'terminated'
  ).map((employee) => employee.id));
  const monthPayroll = payrollEntries.filter((entry) => entry.month === currentMonth());
  const payrollPending = monthPayroll.filter((entry) => entry.status !== 'paid').length;
  const payrollTotalByCurrency = monthPayroll.reduce<Record<string, number>>((totals, entry) => {
    totals[entry.currency] = (totals[entry.currency] || 0) +
      Math.max(
        0,
        entry.amount +
          (entry.allowanceAmount || 0) +
          (entry.overtimeAmount || 0) +
          (entry.bonusAmount || 0) -
          (entry.deductionAmount || 0) -
          (entry.taxDeductionAmount || 0) -
          (entry.absenceDeductionAmount || 0)
      );
    return totals;
  }, {});
  const payrollTotalSummary = Object.entries(payrollTotalByCurrency)
    .map(([currency, amount]) => AppStore.formatMoney(amount, currency))
    .join(' · ') || AppStore.formatMoney(0, AppStore.getSettings().currency);
  const onLeaveToday = leaveRecords.filter(
    (record) => record.status === 'approved' && record.startDate <= today && record.endDate >= today
  ).length;
  const allowance = Number(annualAllowance);

  const countReservedAnnualLeave = (userId: string): number => {
    const yearStart = `${new Date().getFullYear()}-01-01`;
    const yearEnd = `${new Date().getFullYear()}-12-31`;
    return leaveRecords
      .filter((record) =>
        record.userId === userId &&
        record.leaveType === 'annual' &&
        record.status !== 'rejected' &&
        record.endDate >= yearStart &&
        record.startDate <= yearEnd
      )
      .reduce((total, record) => {
        const start = record.startDate < yearStart ? yearStart : record.startDate;
        const end = record.endDate > yearEnd ? yearEnd : record.endDate;
        return total + dayCount(start, end);
      }, 0);
  };

  const persistAttendance = async (records: AttendanceRecord[]) => {
    setIsSaving(true);
    try {
      await AppStore.saveAttendanceRecords(records);
      setAttendance(records);
      showToast(t('employeeAttendanceSaved'), 'success');
    } catch (error) {
      console.error('Unable to save attendance records:', error);
      showToast(error instanceof Error ? error.message : t('employeeAttendanceSaveFailed'), 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const persistLeaveRecords = async (records: LeaveRecord[]) => {
    setIsSaving(true);
    try {
      await AppStore.saveLeaveRecords(records);
      setLeaveRecords(records);
      showToast(t('employeeLeaveSaved'), 'success');
    } catch (error) {
      console.error('Unable to save leave records:', error);
      showToast(error instanceof Error ? error.message : t('employeeLeaveSaveFailed'), 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const saveAttendance = (event: React.FormEvent) => {
    event.preventDefault();
    if (!selectedAttendanceEmployee) {
      showToast(t('employeeChooseBeforeAttendance'), 'error');
      return;
    }
    if (checkInTime && checkOutTime && checkOutTime < checkInTime) {
      showToast(t('employeeCheckoutAfterCheckin'), 'error');
      return;
    }
    const existing = attendance.find(
      (record) => record.userId === selectedAttendanceEmployee.id && record.date === attendanceDate
    );
    const record: AttendanceRecord = {
      id: existing?.id || crypto.randomUUID(),
      userId: selectedAttendanceEmployee.id,
      userName: selectedAttendanceEmployee.name,
      date: attendanceDate,
      status: attendanceStatus,
      ...(checkInTime ? { checkInTime } : {}),
      ...(checkOutTime ? { checkOutTime } : {}),
      note: attendanceNote.trim(),
      createdAt: existing?.createdAt || new Date().toISOString(),
      createdBy: existing?.createdBy || activeUser.id,
    };
    const updatedRecords = existing
      ? attendance.map((item) => item.id === existing.id ? record : item)
      : [...attendance, record];
    void persistAttendance(updatedRecords);
  };

  const saveLeaveRequest = (event: React.FormEvent) => {
    event.preventDefault();
    if (!selectedLeaveEmployee || !leaveReason.trim() || leaveEndDate < leaveStartDate) {
      showToast(t('employeeInvalidLeaveRequest'), 'error');
      return;
    }
    const hasConflict = leaveRecords.some((record) =>
      record.userId === selectedLeaveEmployee.id &&
      record.status !== 'rejected' &&
      record.startDate <= leaveEndDate &&
      record.endDate >= leaveStartDate
    );
    if (hasConflict) {
      showToast(t('employeeLeaveOverlap'), 'error');
      return;
    }
    if (leaveType === 'annual' && countReservedAnnualLeave(selectedLeaveEmployee.id) + dayCount(leaveStartDate, leaveEndDate) > allowance) {
      showToast(t('employeeLeaveAllowanceExceeded'), 'error');
      return;
    }
    const record: LeaveRecord = {
      id: crypto.randomUUID(),
      userId: selectedLeaveEmployee.id,
      userName: selectedLeaveEmployee.name,
      startDate: leaveStartDate,
      endDate: leaveEndDate,
      leaveType,
      reason: leaveReason.trim(),
      status: 'pending',
      createdAt: new Date().toISOString(),
      createdBy: activeUser.id,
    };
    void persistLeaveRecords([...leaveRecords, record]);
    setLeaveReason('');
  };

  const decideLeave = (record: LeaveRecord, status: 'approved' | 'rejected') => {
    if (status === 'approved' && record.leaveType === 'annual' && countReservedAnnualLeave(record.userId) > allowance) {
      showToast(t('employeeLeaveAllowanceExceeded'), 'error');
      return;
    }
    const updatedRecords = leaveRecords.map((item) => item.id === record.id
      ? {
          ...item,
          status,
          decisionAt: new Date().toISOString(),
          decidedBy: activeUser.id,
          decidedByName: activeUser.name,
        }
      : item
    );
    void persistLeaveRecords(updatedRecords);
  };

  const updateAllowance = async () => {
    if (!Number.isInteger(allowance) || allowance < 0 || allowance > 365) {
      showToast(t('employeeInvalidAllowance'), 'error');
      return;
    }
    setIsSaving(true);
    try {
      await AppStore.saveEmployeeSettings({ annualLeaveAllowanceDays: allowance });
      showToast(t('employeeAllowanceUpdated'), 'success');
    } catch (error) {
      console.error('Unable to save employee settings:', error);
      showToast(error instanceof Error ? error.message : t('employeeAllowanceSaveFailed'), 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const exportAttendance = () => {
    exportToExcel(
      `attendance-${month}`,
      [
        t('employeeAttendanceDate'),
        t('employeeAttendanceEmployee'),
        t('employeeAttendanceStatus'),
        t('employeeCheckIn'),
        t('employeeCheckOut'),
        t('employeeAttendanceNote'),
      ],
      monthAttendance.map((record) => [
        record.date,
        record.userName,
        statusLabels[record.status] || record.status,
        record.checkInTime || '',
        record.checkOutTime || '',
        record.note,
      ])
    );
  };

  const exportLeave = () => {
    exportToExcel(
      `leave-${new Date().getFullYear()}`,
      [
        t('employeeAttendanceEmployee'),
        t('employeeLeaveType'),
        t('employeeLeaveStartDate'),
        t('employeeLeaveEndDate'),
        t('employeeDays'),
        t('employeeLeaveReason'),
        t('employeeStatus'),
        t('employeeReviewedBy'),
      ],
      leaveRecords.map((record) => [
        record.userName,
        record.leaveType === 'annual'
          ? t('employeeAnnual')
          : record.leaveType === 'sick'
            ? t('employeeSick')
            : record.leaveType === 'emergency'
              ? t('employeeEmergency')
              : record.leaveType,
        record.startDate,
        record.endDate,
        dayCount(record.startDate, record.endDate),
        record.reason,
        t(record.status === 'approved' ? 'employeeLeaveApproved' : record.status === 'rejected' ? 'employeeLeaveRejected' : 'employeeLeavePending'),
        record.decidedByName || '',
      ])
    );
  };

  const cardClass = 'rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900';
  const fieldClass = 'w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 dark:border-slate-700 dark:bg-slate-800 dark:text-white';
  const tabClass = (selected: boolean) =>
    `rounded-lg px-3 py-2 text-xs font-semibold transition ${selected ? 'bg-emerald-600 text-white' : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'}`;

  return (
    <section className="space-y-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-bold text-slate-900 dark:text-white">{t('employeeOperations')}</h2>
          <p className="mt-1 text-xs text-slate-500">{t('employeeOperationsDescription')}</p>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-3">
          <nav className="flex flex-wrap gap-1 rounded-xl bg-slate-100 p-1 dark:bg-slate-800" aria-label="Employee operations">
            {(['overview', 'attendance', 'leave'] as const).map((item) => (
              <button key={item} type="button" className={tabClass(tab === item)} onClick={() => setTab(item)}>
                {item === 'overview' ? t('employeeOverview') : item === 'attendance' ? t('employeeAttendance') : t('employeeLeave')}
              </button>
            ))}
          </nav>
        </div>
      </header>

      {tab === 'overview' && (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {[
              { label: t('employeeActiveCount'), value: activeEmployeeIds.size, icon: Users },
              { label: t('employeePresentToday'), value: todayRecords.filter((record) => record.status === 'present').length, icon: Check },
              { label: t('employeeLateToday'), value: todayRecords.filter((record) => record.status === 'late').length, icon: Clock3 },
              { label: t('employeeAbsentToday'), value: todayRecords.filter((record) => record.status === 'absent').length, icon: X },
              { label: t('employeeHalfDayToday'), value: todayRecords.filter((record) => record.status === 'half_day').length, icon: CalendarDays },
              { label: t('employeeOnApprovedLeave'), value: onLeaveToday, icon: CalendarDays },
            ].map(({ label, value, icon: Icon }) => (
              <article key={label} className={cardClass}>
                <div className="flex items-center justify-between text-xs font-semibold text-slate-500">
                  {label}<Icon className="h-4 w-4 text-emerald-600" />
                </div>
                <div className="mt-3 text-2xl font-bold text-slate-900 dark:text-white">{value}</div>
              </article>
            ))}
          </div>
          <div className={`${cardClass} flex flex-wrap items-center justify-between gap-3`}>
            <div>
              <div className="text-xs font-semibold text-slate-500">{t('employeeCurrentMonthPayroll')}</div>
              <div className="mt-1 text-lg font-bold text-slate-900 dark:text-white">
                {payrollTotalSummary}
              </div>
            </div>
            <div className="text-sm text-slate-600 dark:text-slate-300">{payrollPending} {t('employeePayrollUnpaidCount')}</div>
          </div>
          <div className={cardClass}>
            <h3 className="text-sm font-bold text-slate-900 dark:text-white">{t('employeeAnnualLeaveAllowance')}</h3>
            <div className="mt-3 flex flex-wrap items-end gap-3">
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-300">
                {t('employeeDaysPerYear')}
                <input className={`${fieldClass} mt-1 max-w-48`} type="number" min="0" max="365" value={annualAllowance} onChange={(event) => setAnnualAllowance(event.target.value)} />
              </label>
              <button type="button" onClick={updateAllowance} className="rounded-lg bg-emerald-600 px-4 py-2 text-xs font-bold text-white hover:bg-emerald-500">{t('employeeSaveAllowance')}</button>
            </div>
          </div>
        </>
      )}

      {tab === 'attendance' && (
        <>
          <form onSubmit={saveAttendance} className={`${cardClass} grid gap-3 sm:grid-cols-2 xl:grid-cols-4`}>
            <label className="text-xs font-semibold text-slate-600 dark:text-slate-300">
              {t('employeeAttendanceEmployee')}
              <select className={`${fieldClass} mt-1`} value={attendanceUserId} onChange={(event) => setAttendanceUserId(event.target.value)}>
                {employees.map((employee) => <option key={employee.id} value={employee.id}>{employee.name}</option>)}
              </select>
            </label>
            <label className="text-xs font-semibold text-slate-600 dark:text-slate-300">
              {t('employeeAttendanceDate')}
              <input className={`${fieldClass} mt-1`} type="date" value={attendanceDate} onChange={(event) => setAttendanceDate(event.target.value)} required />
            </label>
            <label className="text-xs font-semibold text-slate-600 dark:text-slate-300">
              {t('employeeAttendanceStatus')}
              <select className={`${fieldClass} mt-1`} value={attendanceStatus} onChange={(event) => setAttendanceStatus(event.target.value as AttendanceRecord['status'])}>
                {Object.entries(statusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </label>
            <div className="grid grid-cols-2 gap-2">
              <label className="text-xs font-semibold text-slate-600 dark:text-slate-300">{t('employeeCheckIn')}<input className={`${fieldClass} mt-1`} type="time" value={checkInTime} onChange={(event) => setCheckInTime(event.target.value)} /></label>
              <label className="text-xs font-semibold text-slate-600 dark:text-slate-300">{t('employeeCheckOut')}<input className={`${fieldClass} mt-1`} type="time" value={checkOutTime} onChange={(event) => setCheckOutTime(event.target.value)} /></label>
            </div>
            <label className="text-xs font-semibold text-slate-600 dark:text-slate-300 sm:col-span-2">{t('employeeAttendanceNote')}<input className={`${fieldClass} mt-1`} maxLength={300} value={attendanceNote} onChange={(event) => setAttendanceNote(event.target.value)} placeholder={t('employeeOptionalAttendanceNote')} /></label>
            <div className="flex items-end">
              <button disabled={isSaving || employees.length === 0} className="w-full rounded-lg bg-emerald-600 px-4 py-2.5 text-xs font-bold text-white hover:bg-emerald-500 disabled:opacity-50">{isSaving ? t('employeeSaving') : t('employeeSaveAttendance')}</button>
            </div>
          </form>
          <div className={cardClass}>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">{t('employeeAttendanceHistory')}</h3>
              <div className="flex items-center gap-2">
                <input aria-label="Attendance month" className={`${fieldClass} w-auto`} type="month" value={month} onChange={(event) => setMonth(event.target.value)} />
                <button type="button" onClick={exportAttendance} className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold dark:border-slate-700"><Download className="h-3.5 w-3.5" />{t('employeeExport')}</button>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[650px] text-left text-xs">
                <thead className="text-[10px] uppercase text-slate-400"><tr>{[t('employeeAttendanceDate'), t('employeeAttendanceEmployee'), t('employeeAttendanceStatus'), t('employeeCheckIn'), t('employeeCheckOut'), t('employeeAttendanceNote')].map((label) => <th key={label} className="px-3 py-2">{label}</th>)}</tr></thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {monthAttendance.length === 0
                    ? <tr><td colSpan={6} className="px-3 py-8 text-center text-slate-500">{t('employeeNoAttendance')}</td></tr>
                    : [...monthAttendance].sort((a, b) => b.date.localeCompare(a.date)).map((record) => (
                      <tr key={record.id}><td className="px-3 py-2.5">{record.date}</td><td className="px-3 py-2.5 font-semibold">{record.userName}</td><td className="px-3 py-2.5">{statusLabels[record.status] || record.status}</td><td className="px-3 py-2.5">{record.checkInTime || '—'}</td><td className="px-3 py-2.5">{record.checkOutTime || '—'}</td><td className="max-w-56 truncate px-3 py-2.5">{record.note || '—'}</td></tr>
                    ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {tab === 'leave' && (
        <>
          <form onSubmit={saveLeaveRequest} className={`${cardClass} grid gap-3 sm:grid-cols-2 xl:grid-cols-4`}>
            <label className="text-xs font-semibold text-slate-600 dark:text-slate-300">{t('employeeAttendanceEmployee')}
              <select className={`${fieldClass} mt-1`} value={leaveUserId} onChange={(event) => setLeaveUserId(event.target.value)}>{employees.map((employee) => <option key={employee.id} value={employee.id}>{employee.name}</option>)}</select>
            </label>
            <label className="text-xs font-semibold text-slate-600 dark:text-slate-300">{t('employeeLeaveType')}
              <select className={`${fieldClass} mt-1`} value={leaveType} onChange={(event) => setLeaveType(event.target.value as typeof leaveType)}><option value="annual">{t('employeeAnnual')}</option><option value="sick">{t('employeeSick')}</option><option value="emergency">{t('employeeEmergency')}</option></select>
            </label>
            <label className="text-xs font-semibold text-slate-600 dark:text-slate-300">{t('employeeLeaveStartDate')}<input className={`${fieldClass} mt-1`} type="date" value={leaveStartDate} onChange={(event) => setLeaveStartDate(event.target.value)} required /></label>
            <label className="text-xs font-semibold text-slate-600 dark:text-slate-300">{t('employeeLeaveEndDate')}<input className={`${fieldClass} mt-1`} type="date" min={leaveStartDate} value={leaveEndDate} onChange={(event) => setLeaveEndDate(event.target.value)} required /></label>
            <label className="text-xs font-semibold text-slate-600 dark:text-slate-300 sm:col-span-2 xl:col-span-3">{t('employeeLeaveReason')}<input className={`${fieldClass} mt-1`} maxLength={500} value={leaveReason} onChange={(event) => setLeaveReason(event.target.value)} required /></label>
            <button disabled={isSaving || employees.length === 0} className="self-end rounded-lg bg-emerald-600 px-4 py-2.5 text-xs font-bold text-white hover:bg-emerald-500 disabled:opacity-50">{isSaving ? t('employeeSaving') : t('employeeSubmitLeave')}</button>
            {selectedLeaveEmployee && leaveType === 'annual' && (
              <p className="text-xs text-slate-500 sm:col-span-2 xl:col-span-4">
                {t('employeeAnnualLeaveUsed')}: {countReservedAnnualLeave(selectedLeaveEmployee.id)} / {allowance} {t('employeeDays')}.
              </p>
            )}
          </form>
          <div className={cardClass}>
            <div className="mb-3 flex items-center justify-between gap-3">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">{t('employeeLeaveHistory')}</h3>
              <button type="button" onClick={exportLeave} className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold dark:border-slate-700"><Download className="h-3.5 w-3.5" />{t('employeeExport')}</button>
            </div>
            <div className="space-y-2">
              {leaveRecords.length === 0
                ? <p className="py-8 text-center text-xs text-slate-500">{t('employeeNoLeaveRecords')}</p>
                : [...leaveRecords].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map((record) => (
                  <article key={record.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-100 p-3 dark:border-slate-800">
                    <div className="min-w-0">
                      <div className="text-xs font-bold text-slate-900 dark:text-white">{record.userName} · {record.leaveType}</div>
                      <div className="mt-1 text-xs text-slate-500">{record.startDate} – {record.endDate} · {dayCount(record.startDate, record.endDate)} day(s)</div>
                      <div className="mt-1 break-words text-xs text-slate-600 dark:text-slate-300">{record.reason}</div>
                      {record.decidedByName && <div className="mt-1 text-[10px] text-slate-400">{t('employeeReviewedBy')} {record.decidedByName}</div>}
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`rounded-full px-2.5 py-1 text-[10px] font-bold capitalize ${record.status === 'approved' ? 'bg-emerald-100 text-emerald-700' : record.status === 'rejected' ? 'bg-rose-100 text-rose-700' : 'bg-amber-100 text-amber-700'}`}>{t(record.status === 'approved' ? 'employeeLeaveApproved' : record.status === 'rejected' ? 'employeeLeaveRejected' : 'employeeLeavePending')}</span>
                      {record.status === 'pending' && <>
                        <button type="button" disabled={isSaving} onClick={() => decideLeave(record, 'approved')} aria-label={`${t('employeeApproveLeave')} ${record.userName}`} className="rounded-lg p-2 text-emerald-700 hover:bg-emerald-50 disabled:opacity-50"><Check className="h-4 w-4" /></button>
                        <button type="button" disabled={isSaving} onClick={() => decideLeave(record, 'rejected')} aria-label={`${t('employeeRejectLeave')} ${record.userName}`} className="rounded-lg p-2 text-rose-700 hover:bg-rose-50 disabled:opacity-50"><X className="h-4 w-4" /></button>
                      </>}
                    </div>
                  </article>
                ))}
            </div>
          </div>
        </>
      )}
    </section>
  );
};
