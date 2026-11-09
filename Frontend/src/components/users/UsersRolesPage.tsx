import React, { useEffect, useState } from 'react';
import {
  Users,
  UserPlus,
  UserCheck,
  X,
  Eye,
  EyeOff,
  Pencil,
  Trash2,
  Copy,
  Banknote,
  CalendarDays,
  Calculator,
  CircleDollarSign,
  Send,
  Mail,
  Phone,
  RefreshCw,
  ShieldCheck,
  ShoppingCart,
  Store,
  Building2,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { AppStore } from '../../services/store';
import { getPlanLimits, getRecommendedUpgradePlan } from '../../services/licenseLimits';
import { PlanUpgradeModal } from '../plans/PlanUpgradeModal';
import { EmployeeFormData, EmployeeFormModal } from './EmployeeFormModal';
import { EmployeeOperationsPanel } from './EmployeeOperationsPanel';
import {
  createStaffUser,
  getTeamUserWorkspaceData,
  getTeamWorkspaceOverview,
  getRegisteredBusinessWorkspaceData,
  getRegisteredBusinessSummaries,
  deleteRegisteredBusinessUser,
  getRolePermissions,
  getStaffUsers,
  getStoredAccessToken,
  saveRolePermissions,
  RegisteredBusinessSummary,
  RegisteredBusinessWorkspaceData,
  TeamUserWorkspaceData,
  TeamWorkspaceSummary,
  transferBusinessAdminWorkspaceToOwner,
  updateRegisteredBusinessUser,
  updateStaffUser,
} from '../../services/api';
import {
  PayrollEntry,
  PayrollPayment,
  PayrollPaymentMethod,
  User,
  RoleType,
} from '../../types';
import { createPayrollAdjustment } from '../../services/api';
import { exportToExcel } from '../../utils/exports';
import { ALL_PERMISSION_KEYS, isBusinessAdministratorRole } from '../../services/permissions';

const getCurrentMonth = (): string => {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
};

const roundPayrollAmount = (amount: number): number => Math.round((amount + Number.EPSILON) * 100) / 100;

const getPayrollPayments = (entry: PayrollEntry): PayrollPayment[] =>
  entry.payments || (entry.status === 'paid'
    ? [{
        amount: entry.amount,
        method: entry.paymentMethod || 'cash',
        paidAt: entry.paidAt || entry.createdAt,
        ...(entry.transactionReference ? { transactionReference: entry.transactionReference } : {}),
      }]
    : []);

const getPayrollPaidAmount = (entry: PayrollEntry): number =>
  roundPayrollAmount(getPayrollPayments(entry).reduce((sum, payment) => sum + payment.amount, 0));

const getPayrollNetAmount = (entry: PayrollEntry): number =>
  roundPayrollAmount(Math.max(
    0,
    entry.amount +
      (entry.allowanceAmount || 0) +
      (entry.overtimeAmount || 0) +
      (entry.bonusAmount || 0) -
      (entry.deductionAmount || 0) -
      (entry.taxDeductionAmount || 0) -
      (entry.absenceDeductionAmount || 0)
  ));

const getPayrollRemainingAmount = (entry: PayrollEntry): number =>
  roundPayrollAmount(Math.max(0, getPayrollNetAmount(entry) - getPayrollPaidAmount(entry)));

const getPayrollStatus = (entry: PayrollEntry): PayrollEntry['status'] => {
  const paidAmount = getPayrollPaidAmount(entry);
  if (paidAmount >= getPayrollNetAmount(entry)) return 'paid';
  return paidAmount > 0 ? 'partial' : 'pending';
};

const roleDefinitions: {
  role: RoleType;
  title: string;
  color: string;
  icon: React.ComponentType<{ className?: string }>;
}[] = [
  { role: 'admin', title: 'Admin Full Access Owner', color: 'bg-rose-500', icon: ShieldCheck },
  { role: 'business_admin', title: 'Business Admin', color: 'bg-rose-500', icon: Building2 },
  { role: 'branch_manager', title: 'Store Manager', color: 'bg-emerald-500', icon: Store },
  { role: 'cashier', title: 'Cashier', color: 'bg-blue-500', icon: ShoppingCart },
  { role: 'accountant', title: 'Account', color: 'bg-amber-500', icon: Calculator },
];

const registeredAccountRoleLabels: Record<RoleType | 'unassigned', string> = {
  admin: 'Admin Full Access Owner',
  manager: 'Manager',
  cashier: 'Cashier',
  accountant: 'Accountant',
  business_owner: 'Business Owner',
  business_admin: 'Business Admin',
  branch_manager: 'Store Manager',
  inventory_manager: 'Inventory Manager',
  hr_manager: 'HR Manager',
  employee: 'Employee',
  super_admin: 'Super Admin',
  unassigned: 'Role not recorded',
};

interface UsersRolesPageProps {
  view?: 'roles' | 'employees';
  openPlanPickerOnMount?: boolean;
}

export const UsersRolesPage: React.FC<UsersRolesPageProps> = ({
  view = 'roles',
  openPlanPickerOnMount = false,
}) => {
  const {
    showToast,
    language,
    t,
    setActiveTab,
    pendingEmployeeCreation,
    setPendingEmployeeCreation,
    activeUser,
    switchActiveRole,
    license,
  } = useApp();
  const [users, setUsers] = useState<User[]>([]);
  const [, setTeamSummaries] = useState<TeamWorkspaceSummary[]>([]);
  const [selectedTeamWorkspace, setSelectedTeamWorkspace] = useState<TeamUserWorkspaceData | null>(null);
  const [registeredBusinesses, setRegisteredBusinesses] = useState<RegisteredBusinessSummary[]>([]);
  const [rolePermissions, setRolePermissions] = useState<Record<string, string[]>>({});
  const [isLoadingRolePermissions, setIsLoadingRolePermissions] = useState(false);
  const [isSavingRolePermissions, setIsSavingRolePermissions] = useState(false);
  const [rolePermissionsError, setRolePermissionsError] = useState('');
  const [registeredBusinessesError, setRegisteredBusinessesError] = useState('');
  const [selectedBusinessWorkspace, setSelectedBusinessWorkspace] = useState<RegisteredBusinessWorkspaceData | null>(null);
  const [selectedBusinessAccount, setSelectedBusinessAccount] = useState<RegisteredBusinessSummary | null>(null);
  const [isLoadingRegisteredBusinesses, setIsLoadingRegisteredBusinesses] = useState(false);
  const [isLoadingTeamWorkspace, setIsLoadingTeamWorkspace] = useState(false);
  const upsertUser = (current: User[], updatedUser: User): User[] => {
    const existingIndex = current.findIndex((user) => user.id === updatedUser.id);
    if (existingIndex === -1) return [...current, updatedUser];
    return current.map((user) => user.id === updatedUser.id ? updatedUser : user);
  };
  const isEmployeeAccount = (user: User) =>
    user.role !== 'admin' && Number.isFinite(user.monthlySalary) && (user.monthlySalary ?? 0) > 0;
  const employeeUsers = users.filter(isEmployeeAccount);
  const userRoleAccounts = activeUser.role === 'admin'
    ? users
    : users.filter((user) => !['admin', 'business_owner', 'super_admin'].includes(user.role));
  const adminVisibleAccounts = registeredBusinesses;
  const getAssignedStaffCount = (role: RoleType) => {
    if (role === 'business_admin' && activeUser.role === 'admin') {
      return registeredBusinesses.filter((account) => account.role === 'business_admin').length;
    }
    return userRoleAccounts.filter((user) =>
      user.role === role && !['admin', 'business_owner', 'super_admin'].includes(user.role)
    ).length;
  };
  const [payrollEntries, setPayrollEntries] = useState<PayrollEntry[]>(() => AppStore.getPayrollEntries());
  const [payrollMonthFilter, setPayrollMonthFilter] = useState(getCurrentMonth);
  const [isPayrollModalOpen, setIsPayrollModalOpen] = useState(false);
  const [editingPayroll, setEditingPayroll] = useState<PayrollEntry | null>(null);
  const [payrollUserId, setPayrollUserId] = useState('');
  const [payrollMonth, setPayrollMonth] = useState(getCurrentMonth);
  const [payrollBaseAmount, setPayrollBaseAmount] = useState('');
  const [payingEntry, setPayingEntry] = useState<PayrollEntry | null>(null);
  const [payrollPaymentMethod, setPayrollPaymentMethod] = useState<PayrollPaymentMethod | ''>('');
  const [payrollPaymentAmount, setPayrollPaymentAmount] = useState('');
  const [payrollReference, setPayrollReference] = useState('');
  const [payrollPaymentConfirmed, setPayrollPaymentConfirmed] = useState(false);
  const [payrollBonusAmount, setPayrollBonusAmount] = useState('');
  const [payrollDeductionAmount, setPayrollDeductionAmount] = useState('');
  const [payrollAllowanceAmount, setPayrollAllowanceAmount] = useState('');
  const [payrollOvertimeAmount, setPayrollOvertimeAmount] = useState('');
  const [payrollTaxDeductionAmount, setPayrollTaxDeductionAmount] = useState('');
  const [payrollAbsenceDeductionAmount, setPayrollAbsenceDeductionAmount] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [showPlanUpgrade, setShowPlanUpgrade] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [editingRegisteredAccountTenantId, setEditingRegisteredAccountTenantId] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('+252 61 ');
  const [monthlySalary, setMonthlySalary] = useState('');
  const [jobTitle, setJobTitle] = useState('');
  const [address, setAddress] = useState('');
  const [role, setRole] = useState<RoleType>('cashier');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isActive, setIsActive] = useState(true);
  const [generatedCredentials, setGeneratedCredentials] = useState<{
    user: User;
    password: string;
    passwordReset: boolean;
  } | null>(null);
  const { users: userLimit } = getPlanLimits(license.planId, {
    users: license.userLimit,
    products: license.productLimit,
  });
  const recommendedUpgradePlanId = getRecommendedUpgradePlan(license.planId);
  const registeredUserCount = 1 + users.filter((user) => user.role !== 'super_admin').length;
  const hasReachedUserLimit = Number.isFinite(userLimit) && registeredUserCount >= userLimit;
  const payrollEmployees = employeeUsers.filter(
    (user) => user.employeeDetails?.employmentStatus !== 'terminated'
  );
  const selectedPayrollEmployee = payrollEmployees.find((user) => user.id === payrollUserId) ||
    users.find((user) => user.id === editingPayroll?.userId);
  const editingPayrollHasPayments = Boolean(editingPayroll && (
    getPayrollPaidAmount(editingPayroll) > 0 || ['partial', 'paid'].includes(editingPayroll.status)
  ));
  const paymentAmount = Number(payrollPaymentAmount);
  const validPayrollPaymentAmount = Boolean(
    payingEntry &&
    Number.isFinite(paymentAmount) &&
    roundPayrollAmount(paymentAmount) > 0 &&
    roundPayrollAmount(paymentAmount) <= getPayrollRemainingAmount(payingEntry)
  );
  const monthPayroll = payrollEntries.filter((entry) => entry.month === payrollMonthFilter);
  const summarizePayroll = (entries: PayrollEntry[], getAmount: (entry: PayrollEntry) => number): string => {
    const totals = entries.reduce<Record<string, number>>((result, entry) => {
      result[entry.currency] = (result[entry.currency] || 0) + getAmount(entry);
      return result;
    }, {});
    return Object.entries(totals)
      .map(([currency, amount]) => AppStore.formatMoney(amount, currency))
      .join(' · ') || AppStore.formatMoney(0, AppStore.getSettings().currency);
  };
  const payrollPaidTotal = summarizePayroll(monthPayroll, getPayrollPaidAmount);
  const payrollRemainingTotal = summarizePayroll(monthPayroll, getPayrollRemainingAmount);
  const payrollSalaryTotal = summarizePayroll(monthPayroll, getPayrollNetAmount);
  const exportPayrollReport = () => {
    exportToExcel(
      `payroll-${payrollMonthFilter}`,
      [
        t('employeeName'),
        t('payrollMonth'),
        t('payrollAmount'),
        t('payrollAllowance'),
        t('payrollOvertime'),
        t('payrollBonus'),
        t('payrollDeduction'),
        t('payrollTaxDeduction'),
        t('payrollAbsenceDeduction'),
        t('payrollNetSalary'),
        t('payrollPaidAmount'),
        t('payrollRemaining'),
        t('payrollApprovalAudit'),
        t('payrollStatus'),
        t('payrollPaymentMethod'),
        t('payrollTransactionReference'),
      ],
      monthPayroll.map((entry) => [
        entry.userName,
        entry.month,
        entry.amount,
        entry.allowanceAmount || 0,
        entry.overtimeAmount || 0,
        entry.bonusAmount || 0,
        entry.deductionAmount || 0,
        entry.taxDeductionAmount || 0,
        entry.absenceDeductionAmount || 0,
        getPayrollNetAmount(entry),
        getPayrollPaidAmount(entry),
        getPayrollRemainingAmount(entry),
        entry.approvalStatus === 'pending' ? t('payrollAwaitingApproval') : t('payrollApproved'),
        t(`payroll${entry.status[0].toUpperCase()}${entry.status.slice(1)}`),
        getPayrollPayments(entry).map((payment) => t(`payrollMethod${payment.method}`)).join(', '),
        getPayrollPayments(entry).map((payment) => payment.transactionReference || '').filter(Boolean).join(', '),
      ])
    );
  };
  const payingEntryRemaining = payingEntry ? getPayrollRemainingAmount(payingEntry) : 0;
  const formatPayrollMonth = (month: string): string => {
    const [year, monthNumber] = month.split('-').map(Number);
    return new Date(year, monthNumber - 1).toLocaleDateString(language === 'so' ? 'so-SO' : 'en-US', {
      month: 'long',
      year: 'numeric',
    });
  };

  const openCreatePayrollModal = () => {
    setEditingPayroll(null);
    const firstEmployee = payrollEmployees[0];
    setPayrollUserId(firstEmployee?.id || '');
    setPayrollMonth(payrollMonthFilter);
    setPayrollBaseAmount('');
    setPayrollBonusAmount('');
    setPayrollDeductionAmount('');
    setPayrollAllowanceAmount('');
    setPayrollOvertimeAmount('');
    setPayrollTaxDeductionAmount('');
    setPayrollAbsenceDeductionAmount('');
    setIsPayrollModalOpen(true);
  };

  const openEditPayrollModal = (entry: PayrollEntry) => {
    setEditingPayroll(entry);
    setPayrollUserId(entry.userId);
    setPayrollMonth(entry.month);
    setPayrollBaseAmount(String(entry.amount));
    setPayrollBonusAmount(String(entry.bonusAmount || 0));
    setPayrollDeductionAmount(String(entry.deductionAmount || 0));
    setPayrollAllowanceAmount(String(entry.allowanceAmount || 0));
    setPayrollOvertimeAmount(String(entry.overtimeAmount || 0));
    setPayrollTaxDeductionAmount(String(entry.taxDeductionAmount || 0));
    setPayrollAbsenceDeductionAmount(String(entry.absenceDeductionAmount || 0));
    setIsPayrollModalOpen(true);
  };

  const handleSavePayroll = async (event: React.FormEvent) => {
    event.preventDefault();
    const paidEntry = Boolean(editingPayroll && (
      getPayrollPaidAmount(editingPayroll) > 0 || ['partial', 'paid'].includes(editingPayroll.status)
    ));
    const employeeId = paidEntry && editingPayroll ? editingPayroll.userId : payrollUserId;
    const monthToSave = paidEntry && editingPayroll ? editingPayroll.month : payrollMonth;
    const employee = users.find((user) => user.id === employeeId);
    const amount = editingPayroll ? Number(payrollBaseAmount) : employee?.monthlySalary ?? Number.NaN;
    const bonusAmount = Number(payrollBonusAmount || 0);
    const deductionAmount = Number(payrollDeductionAmount || 0);
    const allowanceAmount = Number(payrollAllowanceAmount || 0);
    const overtimeAmount = Number(payrollOvertimeAmount || 0);
    const taxDeductionAmount = Number(payrollTaxDeductionAmount || 0);
    const absenceDeductionAmount = Number(payrollAbsenceDeductionAmount || 0);
    const calculatedNet =
      amount + allowanceAmount + overtimeAmount + bonusAmount -
      deductionAmount - taxDeductionAmount - absenceDeductionAmount;
    if (
      !employee ||
      employee.role === 'admin' ||
      !/^\d{4}-\d{2}$/.test(monthToSave) ||
      typeof amount !== 'number' ||
      !Number.isFinite(amount) ||
      amount <= 0 ||
      !Number.isFinite(bonusAmount) ||
      bonusAmount < 0 ||
      !Number.isFinite(deductionAmount) ||
      deductionAmount < 0 ||
      !Number.isFinite(allowanceAmount) ||
      allowanceAmount < 0 ||
      !Number.isFinite(overtimeAmount) ||
      overtimeAmount < 0 ||
      !Number.isFinite(taxDeductionAmount) ||
      taxDeductionAmount < 0 ||
      !Number.isFinite(absenceDeductionAmount) ||
      absenceDeductionAmount < 0 ||
      calculatedNet <= 0
    ) {
      showToast(t('payrollInvalidEntry'), 'error');
      return;
    }
    if (payrollEntries.some((entry) =>
      entry.userId === employee.id && entry.month === monthToSave && entry.id !== editingPayroll?.id
    )) {
      showToast(t('payrollDuplicateEntry'), 'error');
      return;
    }
    const settings = AppStore.getSettings();
    const updatedEntries = editingPayroll
      ? payrollEntries.map((entry) => {
          if (entry.id !== editingPayroll.id) return entry;
          const updatedEntry = {
            ...entry,
            userId: paidEntry ? entry.userId : employee.id,
            userName: paidEntry ? entry.userName : employee.name,
            month: paidEntry ? entry.month : monthToSave,
            amount,
            bonusAmount,
            deductionAmount,
            allowanceAmount,
            overtimeAmount,
            taxDeductionAmount,
            absenceDeductionAmount,
            currency: paidEntry ? entry.currency : settings.currency,
          };
          const compensationChanged =
            entry.amount !== amount ||
            (entry.bonusAmount || 0) !== bonusAmount ||
            (entry.deductionAmount || 0) !== deductionAmount ||
            (entry.allowanceAmount || 0) !== allowanceAmount ||
            (entry.overtimeAmount || 0) !== overtimeAmount ||
            (entry.taxDeductionAmount || 0) !== taxDeductionAmount ||
            (entry.absenceDeductionAmount || 0) !== absenceDeductionAmount;
          const paidAmount = getPayrollPaidAmount(entry);
          const netAmount = getPayrollNetAmount(updatedEntry);
          const status: PayrollEntry['status'] = entry.status === 'paid' && !entry.payments?.length
            ? 'paid'
            : paidAmount >= netAmount
              ? 'paid'
              : paidAmount > 0
                ? 'partial'
                : 'pending';
          return {
            ...updatedEntry,
            status,
            ...(compensationChanged
              ? { approvalStatus: 'pending' as const, approvedAt: undefined, approvedBy: undefined, approvedByName: undefined }
              : {}),
          };
        })
      : [{
          id: `pay-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          userId: employee.id,
          userName: employee.name,
          month: payrollMonth,
          amount,
          bonusAmount,
          deductionAmount,
          allowanceAmount,
          overtimeAmount,
          taxDeductionAmount,
          absenceDeductionAmount,
          currency: settings.currency,
          status: 'pending' as const,
          approvalStatus: 'pending' as const,
          createdAt: new Date().toISOString(),
        }, ...payrollEntries];
    setIsSaving(true);
    try {
      await AppStore.savePayrollEntries(updatedEntries);
      setPayrollEntries(updatedEntries);
      setIsPayrollModalOpen(false);
      showToast(
        t(editingPayroll ? 'payrollUpdated' : 'payrollAdded'),
        'success'
      );
    } catch (error) {
      showToast(error instanceof Error ? error.message : t('payrollSaveFailed'), 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const approvePayroll = async (entry: PayrollEntry) => {
    if (entry.approvalStatus !== 'pending') return;
    const approval = {
      id: `approval-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      status: 'approved' as const,
      approvedAt: new Date().toISOString(),
      approvedBy: activeUser.id,
      approvedByName: activeUser.name,
    };
    const updatedEntries = payrollEntries.map((item) => item.id === entry.id
      ? {
          ...item,
          approvalStatus: 'approved' as const,
          approvedAt: approval.approvedAt,
          approvedBy: approval.approvedBy,
          approvedByName: approval.approvedByName,
          approvalHistory: [...(item.approvalHistory || []), approval],
        }
      : item
    );
    setIsSaving(true);
    try {
      await AppStore.savePayrollEntries(updatedEntries);
      setPayrollEntries(updatedEntries);
      showToast(t('payrollApprovalRecorded'), 'success');
    } catch (error) {
      console.error('Unable to approve payroll:', error);
      showToast(error instanceof Error ? error.message : t('payrollApprovalFailed'), 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeletePayroll = async (entry: PayrollEntry) => {
    const hasRecordedPayments = getPayrollPaidAmount(entry) > 0 || ['partial', 'paid'].includes(entry.status);
    const confirmation = t(hasRecordedPayments ? 'payrollDeletePaidConfirm' : 'payrollDeleteConfirm')
      .replace('{employee}', entry.userName)
      .replace('{month}', formatPayrollMonth(entry.month));
    if (!window.confirm(confirmation)) {
      return;
    }
    const updatedEntries = payrollEntries.filter((item) => item.id !== entry.id);
    setIsSaving(true);
    try {
      await AppStore.savePayrollEntries(updatedEntries);
      setPayrollEntries(updatedEntries);
      showToast(t('payrollDeleted'), 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : t('payrollSaveFailed'), 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const handleRecordPayrollPayment = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!payingEntry || !payrollPaymentMethod) return;
    if (payingEntry.approvalStatus === 'pending') {
      showToast(t('payrollApprovalRequired'), 'error');
      setPayingEntry(null);
      return;
    }
    if (!payrollPaymentConfirmed) {
      showToast('Confirm that the payment has actually been completed before recording it.', 'error');
      return;
    }
    if (payrollPaymentMethod !== 'cash' && !payrollReference.trim()) {
      showToast(t('payrollReferenceRequired'), 'error');
      return;
    }
    if (payrollReference.trim() && payrollEntries.some((entry) =>
      getPayrollPayments(entry).some((payment) =>
        payment.transactionReference?.trim().toUpperCase() === payrollReference.trim().toUpperCase()
      )
    )) {
      showToast(t('payrollDuplicateReference'), 'error');
      return;
    }
    if (
      !Number.isFinite(paymentAmount) ||
      paymentAmount <= 0 ||
      paymentAmount > payingEntryRemaining
    ) {
      showToast(t('payrollInvalidPaymentAmount'), 'error');
      return;
    }
    const updatedEntries = payrollEntries.map((entry) => entry.id === payingEntry.id
      ? (() => {
          const paidAt = new Date().toISOString();
          const payments = [
            ...getPayrollPayments(entry),
            {
              amount: roundPayrollAmount(paymentAmount),
              method: payrollPaymentMethod,
              paidAt,
              confirmed: true,
              recordedBy: AppStore.getActiveUser().id,
              recordedByName: AppStore.getActiveUser().name,
              ...(payrollReference.trim() ? { transactionReference: payrollReference.trim() } : {}),
            },
          ];
          const paidAmount = roundPayrollAmount(payments.reduce((sum, payment) => sum + payment.amount, 0));
          return {
            ...entry,
            payments,
            status: (paidAmount >= getPayrollNetAmount(entry) ? 'paid' : 'partial') as PayrollEntry['status'],
            paidAt,
            paymentMethod: payrollPaymentMethod,
            transactionReference: payrollReference.trim() || undefined,
          };
        })()
      : entry);
    setIsSaving(true);
    try {
      await AppStore.savePayrollEntries(updatedEntries);
      setPayrollEntries(updatedEntries);
      setPayingEntry(null);
      setPayrollPaymentAmount('');
      setPayrollReference('');
      setPayrollPaymentConfirmed(false);
      showToast(t('payrollPaymentRecorded'), 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : t('payrollSaveFailed'), 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const handlePayrollAdjustment = async (entry: PayrollEntry) => {
    const kind = window.prompt('Adjustment type: enter "bonus" or "deduction".')?.trim().toLowerCase();
    if (kind !== 'bonus' && kind !== 'deduction') return;
    const amount = Number(window.prompt('Adjustment amount (positive number):'));
    const reason = window.prompt('Reason for this payroll adjustment:')?.trim() || '';
    if (!Number.isFinite(amount) || amount <= 0 || !reason) {
      showToast('Provide a positive amount and a reason for the adjustment.', 'error');
      return;
    }
    const token = getStoredAccessToken();
    if (!token) {
      showToast('Your secure session has expired. Please sign in again.', 'error');
      return;
    }
    setIsSaving(true);
    try {
      const { entry: updatedEntry } = await createPayrollAdjustment(token, entry.id, { kind, amount, reason });
      const updatedEntries = payrollEntries.map((item) => item.id === entry.id ? updatedEntry : item);
      setPayrollEntries(updatedEntries);
      showToast('Payroll adjustment recorded with an audit trail.', 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Unable to record the payroll adjustment.', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  useEffect(() => {
    const token = getStoredAccessToken();
    if (!token) {
      showToast('Your secure session has expired. Please sign in again.', 'error');
      return;
    }
    let mounted = true;
    void getStaffUsers(token)
      .then((staff) => {
        if (mounted) setUsers(staff);
      })
      .catch((error: Error) => showToast(error.message, 'error'));

    if (view === 'roles' && activeUser.role === 'business_admin') {
      void getTeamWorkspaceOverview(token)
        .then((result) => {
          if (mounted) setTeamSummaries(result.staff);
        })
        .catch((error: Error) => {
          console.error('Unable to load team workspace summaries:', error);
          if (mounted) showToast(error.message, 'error');
        });
    } else {
      setTeamSummaries([]);
    }

    if (view === 'roles' && activeUser.role === 'admin') {
      setIsLoadingRegisteredBusinesses(true);
      setRegisteredBusinessesError('');
      void getRegisteredBusinessSummaries(token)
        .then((businesses) => {
          if (mounted) {
            setRegisteredBusinesses(businesses);
            setRegisteredBusinessesError('');
          }
        })
        .catch((error: Error) => {
          console.error('Unable to load registered business accounts:', error);
          if (mounted) {
            setRegisteredBusinessesError(error.message);
            showToast(error.message, 'error');
          }
        })
        .finally(() => {
          if (mounted) setIsLoadingRegisteredBusinesses(false);
        });
    } else {
      setRegisteredBusinesses([]);
      setRegisteredBusinessesError('');
    }
    return () => {
      mounted = false;
    };
  }, [activeUser.role, showToast, view]);

  useEffect(() => {
    if (view !== 'roles' || !isBusinessAdministratorRole(activeUser.role)) {
      setRolePermissions({});
      setRolePermissionsError('');
      return;
    }
    const token = getStoredAccessToken();
    if (!token) {
      setRolePermissionsError('Your secure session has expired. Please sign in again.');
      return;
    }
    let mounted = true;
    setIsLoadingRolePermissions(true);
    setRolePermissionsError('');
    void getRolePermissions(token)
      .then((result) => {
        if (mounted) setRolePermissions(result.roles);
      })
      .catch((error: Error) => {
        if (!mounted) return;
        console.error('Unable to load role permissions:', error);
        setRolePermissionsError(error.message);
      })
      .finally(() => {
        if (mounted) setIsLoadingRolePermissions(false);
      });
    return () => {
      mounted = false;
    };
  }, [activeUser.role, view]);

  const toggleRolePermission = (roleName: string, permission: string) => {
    if (roleName === 'business_admin') return;
    setRolePermissions((current) => {
      const currentPermissions = current[roleName] || [];
      return {
        ...current,
        [roleName]: currentPermissions.includes(permission)
          ? currentPermissions.filter((item) => item !== permission)
          : [...currentPermissions, permission],
      };
    });
  };

  const handleSaveRolePermissions = async () => {
    const token = getStoredAccessToken();
    if (!token) {
      setRolePermissionsError('Your secure session has expired. Please sign in again.');
      return;
    }
    setIsSavingRolePermissions(true);
    setRolePermissionsError('');
    try {
      const rolesToSave = Object.fromEntries(
        Object.entries(rolePermissions)
          .filter(([roleName]) => roleName !== 'business_admin')
          .map(([roleName, permissions]) => [
            roleName,
            permissions.filter((permission) => ALL_PERMISSION_KEYS.includes(permission as typeof ALL_PERMISSION_KEYS[number])),
          ])
      );
      await saveRolePermissions(token, rolesToSave);
      showToast('Role permissions saved successfully.', 'success');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to save role permissions.';
      setRolePermissionsError(message);
      showToast(message, 'error');
    } finally {
      setIsSavingRolePermissions(false);
    }
  };

  const openTeamWorkspace = async (member: TeamWorkspaceSummary) => {
    const token = getStoredAccessToken();
    if (!token) {
      showToast('Your secure session has expired. Please sign in again.', 'error');
      return;
    }
    setIsLoadingTeamWorkspace(true);
    try {
      const workspace = await getTeamUserWorkspaceData(token, member.id);
      setSelectedTeamWorkspace(workspace);
    } catch (error) {
      console.error(`Unable to load ${member.name}'s workspace:`, error);
      showToast(error instanceof Error ? error.message : 'Unable to load this staff workspace.', 'error');
    } finally {
      setIsLoadingTeamWorkspace(false);
    }
  };

  const openRegisteredBusinessWorkspace = async (business: RegisteredBusinessSummary) => {
    const token = getStoredAccessToken();
    if (!token) {
      showToast('Your secure session has expired. Please sign in again.', 'error');
      return;
    }
    setIsLoadingTeamWorkspace(true);
    try {
      const workspace = await getRegisteredBusinessWorkspaceData(token, business.tenantId);
      setSelectedBusinessWorkspace(workspace);
      setSelectedBusinessAccount(business);
    } catch (error) {
      console.error(`Unable to load ${business.businessName} business data:`, error);
      showToast(error instanceof Error ? error.message : 'Unable to load this business data.', 'error');
    } finally {
      setIsLoadingTeamWorkspace(false);
    }
  };

  const refreshRegisteredBusinesses = async () => {
    const token = getStoredAccessToken();
    if (!token) {
      showToast('Your secure session has expired. Please sign in again.', 'error');
      return;
    }
    setIsLoadingRegisteredBusinesses(true);
    setRegisteredBusinessesError('');
    try {
      setRegisteredBusinesses(await getRegisteredBusinessSummaries(token));
    } catch (error) {
      console.error('Unable to refresh registered business accounts:', error);
      const message = error instanceof Error ? error.message : 'Unable to refresh registered accounts.';
      setRegisteredBusinessesError(message);
      showToast(message, 'error');
    } finally {
      setIsLoadingRegisteredBusinesses(false);
    }
  };

  const openEditRegisteredAccount = (business: RegisteredBusinessSummary) => {
    openEditModal({
      id: business.userId,
      name: business.name,
      email: business.email,
      phone: business.phone,
      role: business.role === 'unassigned' ? 'employee' : business.role,
      active: business.active,
      createdAt: business.registeredAt,
    });
    setEditingRegisteredAccountTenantId(business.tenantId);
  };

  const handleDeleteRegisteredAccount = async (business: RegisteredBusinessSummary) => {
    if (business.userId === activeUser.id) {
      showToast('You cannot move your own account to the Recycling Bin.', 'error');
      return;
    }
    if (!window.confirm(`Move ${business.name} to the Recycling Bin?`)) return;
    const token = getStoredAccessToken();
    if (!token) {
      showToast('Your secure session has expired. Please sign in again.', 'error');
      return;
    }
    setIsSaving(true);
    try {
      await deleteRegisteredBusinessUser(token, business.tenantId, business.userId);
      setRegisteredBusinesses((current) => current.filter((account) => account.userId !== business.userId));
      showToast('Account moved to the Recycling Bin.', 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Unable to move this account to the Recycling Bin.', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const transferBusinessAdminWorkspace = async (member: TeamUserWorkspaceData) => {
    if (!selectedBusinessWorkspace || member.user.role !== 'business_admin') return;
    const confirmation = t('confirmBusinessAdminDataTransfer')
      .replace('{name}', member.user.name);
    if (!window.confirm(confirmation)) return;

    const token = getStoredAccessToken();
    if (!token) {
      showToast('Your secure session has expired. Please sign in again.', 'error');
      return;
    }

    setIsLoadingTeamWorkspace(true);
    try {
      const result = await transferBusinessAdminWorkspaceToOwner(
        token,
        selectedBusinessWorkspace.business.tenantId,
        member.user.id
      );
      await AppStore.loadWorkspace(activeUser, token);
      const refreshedWorkspace = await getRegisteredBusinessWorkspaceData(
        token,
        selectedBusinessWorkspace.business.tenantId
      );
      setSelectedBusinessWorkspace(refreshedWorkspace);
      showToast(
        t('businessAdminDataTransferred').replace('{name}', result.userName),
        'success'
      );
    } catch (error) {
      console.error(`Unable to transfer ${member.user.name}'s workspace to the Admin owner:`, error);
      showToast(error instanceof Error ? error.message : t('businessAdminDataTransferFailed'), 'error');
    } finally {
      setIsLoadingTeamWorkspace(false);
    }
  };

  const openCreateModal = () => {
    if (hasReachedUserLimit) {
      setShowPlanUpgrade(true);
      return;
    }
    setEditingUser(null);
    setName('');
    setEmail('');
    setPhone('+252 61 ');
    setMonthlySalary('');
    setJobTitle('');
    setAddress('');
    setRole('cashier');
    setPassword('');
    setShowPassword(false);
    setIsActive(true);
    setIsModalOpen(true);
  };

  useEffect(() => {
    if (!pendingEmployeeCreation) return;
    setPendingEmployeeCreation(false);
    openCreateModal();
  }, [pendingEmployeeCreation, setPendingEmployeeCreation]);

  useEffect(() => {
    if (view === 'employees' && openPlanPickerOnMount) {
      setShowPlanUpgrade(true);
    }
  }, [openPlanPickerOnMount, view]);

  const handleAddEmployee = () => {
    openCreateModal();
  };

  const openEditModal = (user: User) => {
    setEditingRegisteredAccountTenantId(null);
    setEditingUser(user);
    setName(user.name);
    setEmail(user.email);
    setPhone(user.phone);
    setMonthlySalary(String(user.monthlySalary ?? ''));
    setJobTitle(user.jobTitle || '');
    setAddress(user.address || '');
    setRole(user.role);
    setPassword('');
    setShowPassword(false);
    setIsActive(user.active);
    setIsModalOpen(true);
  };

  const closeUserModal = () => {
    setIsModalOpen(false);
    setEditingUser(null);
    setEditingRegisteredAccountTenantId(null);
    setPassword('');
    setShowPassword(false);
  };

  const handleSaveUser = async (e: React.FormEvent) => {
    e.preventDefault();
    const salary = monthlySalary.trim() === '' ? Number.NaN : Number(monthlySalary);
    if (view === 'roles' && !editingUser && phone.replace(/\D/g, '').length < 9) {
      showToast(t('userPhoneNumberRequired'), 'error');
      return;
    }
    if (
      !name.trim() ||
      !email.trim() ||
      (!editingUser && !phone.trim()) ||
      (view === 'employees' && (!Number.isFinite(salary) || salary <= 0)) ||
      (password.length > 0 && password.length < 12)
    ) {
      showToast(t(view === 'employees' ? 'employeeInvalidDetails' : 'staffInvalidDetails'), 'error');
      return;
    }
    const token = getStoredAccessToken();
    if (!token) {
      showToast('Your secure session has expired. Please sign in again.', 'error');
      return;
    }
    setIsSaving(true);
    try {
      if (!editingUser && hasReachedUserLimit) {
        setShowPlanUpgrade(true);
        return;
      }
      if (editingUser) {
        if (editingRegisteredAccountTenantId) {
          await updateRegisteredBusinessUser(token, editingRegisteredAccountTenantId, editingUser.id, {
            name,
            email,
            phone,
            role,
            active: isActive,
          });
          setRegisteredBusinesses(await getRegisteredBusinessSummaries(token));
          showToast(t('staffUpdated'), 'success');
        } else {
          const updatedUser = await updateStaffUser(token, editingUser.id, {
            name,
            email,
            phone,
            role,
            active: isActive,
            ...(view === 'employees' ? {
              monthlySalary: salary,
              jobTitle,
              address,
            } : {}),
            ...(password ? { password } : {}),
          });
          setUsers((current) => upsertUser(current, updatedUser.user));
          if (editingUser.role === 'admin') {
            setRegisteredBusinesses((current) => {
              if (!['admin', 'business_owner', 'business_admin'].includes(updatedUser.user.role)) {
                return current.filter((business) => business.userId !== updatedUser.user.id);
              }
              return current.map((business) =>
                business.userId === updatedUser.user.id
                  ? {
                      ...business,
                      name: updatedUser.user.name,
                      email: updatedUser.user.email,
                      phone: updatedUser.user.phone,
                      role: updatedUser.user.role,
                      active: updatedUser.user.active,
                    }
                  : business
              );
            });
          }
          if (updatedUser.temporaryPassword) {
            setGeneratedCredentials({
              user: updatedUser.user,
              password: updatedUser.temporaryPassword,
              passwordReset: true,
            });
          } else {
            showToast(t('staffUpdated'), 'success');
          }
        }
      } else {
        const result = await createStaffUser(token, {
          name,
          email,
          phone,
          role,
          ...(view === 'employees' ? {
            monthlySalary: salary,
            jobTitle,
            address,
          } : {}),
          ...(password ? { password } : {}),
        });
        setUsers((current) => upsertUser(current, result.user));
        setGeneratedCredentials({
          user: result.user,
          password: result.temporaryPassword,
          passwordReset: false,
        });
      }
      closeUserModal();
      setShowPassword(false);
    } catch (error) {
      if (error instanceof Error && error.message === 'PLAN_USER_LIMIT_REACHED') {
        setShowPlanUpgrade(true);
      } else {
        showToast(error instanceof Error ? error.message : 'Unable to save the user account.', 'error');
      }
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveEmployee = async (data: EmployeeFormData) => {
    const token = getStoredAccessToken();
    if (!token) {
      showToast('Your secure session has expired. Please sign in again.', 'error');
      return;
    }
    setIsSaving(true);
    try {
      if (!editingUser && hasReachedUserLimit) {
        setShowPlanUpgrade(true);
        return;
      }
      if (editingUser) {
        const updatedUser = await updateStaffUser(token, editingUser.id, {
          ...data,
          jobTitle: data.employeeDetails.jobTitle,
          active: data.active,
        });
        setUsers((current) => upsertUser(current, updatedUser.user));
        if (updatedUser.temporaryPassword) {
          setGeneratedCredentials({
            user: updatedUser.user,
            password: updatedUser.temporaryPassword,
            passwordReset: true,
          });
        } else {
          showToast(t('staffUpdated'), 'success');
        }
      } else {
        const result = await createStaffUser(token, {
          ...data,
          jobTitle: data.employeeDetails.jobTitle,
        });
        setUsers((current) => upsertUser(current, result.user));
        setGeneratedCredentials({
          user: result.user,
          password: result.temporaryPassword,
          passwordReset: false,
        });
      }
      closeUserModal();
    } catch (error) {
      if (error instanceof Error && error.message === 'PLAN_USER_LIMIT_REACHED') {
        setShowPlanUpgrade(true);
      } else {
        showToast(error instanceof Error ? error.message : 'Unable to save the employee account.', 'error');
      }
    } finally {
      setIsSaving(false);
    }
  };

  const copyGeneratedPassword = async () => {
    if (!generatedCredentials) return;
    try {
      await navigator.clipboard.writeText(generatedCredentials.password);
      showToast('Temporary password copied.', 'success');
    } catch (error) {
      console.error('Unable to copy the temporary password:', error);
      showToast('Could not copy the password. Select and copy it manually.', 'error');
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-900 dark:text-white tracking-tight">
            {view === 'employees' ? t('navEmployees') : t('navUsersRoles')}
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            {view === 'employees'
              ? t('staffPageDescription')
              : 'Manage user accounts and preview access for each operational role.'}
          </p>
        </div>
        {view === 'employees' || view === 'roles' ? (
          <button
            onClick={handleAddEmployee}
            className="px-4 py-2 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white shadow-sm flex items-center gap-1.5 self-start sm:self-auto cursor-pointer"
          >
            <UserPlus className="w-4 h-4" />
            <span>{t(view === 'employees' ? 'employeeAddButton' : 'staffAddEmployee')}</span>
          </button>
        ) : null}
      </div>

      {/* Active role preview */}
      {view === 'roles' && (
        <section className="space-y-4 rounded-3xl border border-slate-800 bg-slate-900 p-6 text-white shadow-lg">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-2">
              <UserCheck className="h-5 w-5 text-emerald-400" />
              <h3 className="text-sm font-bold">Active Session Role Simulator</h3>
            </div>
            <span className="text-xs text-slate-400">
              Logged in as: <strong className="font-mono text-emerald-400">{activeUser.name}</strong> ({t(activeUser.role)})
            </span>
          </div>
          <p className="text-xs leading-relaxed text-slate-300">
            Switch active operational roles instantly to simulate what cashiers, managers, and accountants see.
          </p>
          <div className="grid grid-cols-2 gap-3 pt-1 sm:grid-cols-4">
            {roleDefinitions
            .filter((item) => item.role !== 'admin' || AppStore.getActiveUser().role === 'admin')
              .map((item) => (
              <button
                key={item.role}
                type="button"
                onClick={() => switchActiveRole(item.role)}
                aria-pressed={activeUser.role === item.role}
                className={`flex cursor-pointer items-start gap-2.5 rounded-2xl border p-3.5 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 ${
                  activeUser.role === item.role
                    ? 'border-emerald-500 bg-emerald-950/50 text-emerald-300 ring-2 ring-emerald-500/20'
                    : 'border-slate-800 bg-slate-800/60 text-slate-300 hover:bg-slate-800'
                }`}
              >
                <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl ${item.color} text-white`}>
                  <item.icon className="h-4 w-4" />
                </span>
                <span>
                  <span className="block text-xs font-bold">{item.title}</span>
                  <span className="mt-0.5 block text-[10px] uppercase tracking-wider text-slate-400">{t(item.role)}</span>
                  <span className="mt-1 block text-[10px] text-slate-500">
                    {t('assignedStaff')}: {getAssignedStaffCount(item.role)}
                  </span>
                </span>
              </button>
            ))}
          </div>
        </section>
      )}

      {view === 'employees' && (
      <>
      <section className="overflow-hidden rounded-3xl border border-slate-200/80 bg-white shadow-xs dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 p-4 dark:border-slate-800">
          <h3 className="text-sm font-bold text-slate-900 dark:text-white">{t('employeeRegisteredEmployees')}</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1080px] text-left text-xs">
            <thead className="border-b border-slate-100 bg-slate-50/60 text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:border-slate-800 dark:bg-slate-800/40">
              <tr>
                <th className="whitespace-nowrap px-4 py-3.5">{t('employeeName')}</th>
                <th className="whitespace-nowrap px-4 py-3.5">{t('userPhoneNumber')}</th>
                <th className="whitespace-nowrap px-4 py-3.5">{t('userEmailAddress')}</th>
                <th className="whitespace-nowrap px-4 py-3.5">{t('staffSecurityRole')}</th>
                <th className="whitespace-nowrap px-4 py-3.5">{t('payrollAmount')}</th>
                <th className="whitespace-nowrap px-4 py-3.5">{t('employeeAddress')}</th>
                <th className="whitespace-nowrap px-4 py-3.5">{t('employeeStatus')}</th>
                <th className="whitespace-nowrap px-4 py-3.5">{t('employeeCreated')}</th>
                <th className="whitespace-nowrap px-4 py-3.5">{t('actions')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {employeeUsers.map((user) => (
                <tr key={user.id} className="text-slate-700 hover:bg-slate-50/80 dark:text-slate-300 dark:hover:bg-slate-800/40">
                  <td className="px-4 py-3.5">
                    <div className="flex items-center gap-2.5">
                      {user.employeeDetails?.photo ? (
                        <img src={user.employeeDetails.photo} alt="" className="h-9 w-9 rounded-full object-cover" />
                      ) : (
                        <span className="flex h-9 w-9 items-center justify-center rounded-full bg-emerald-100 text-xs font-bold text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
                          {user.name.slice(0, 1).toUpperCase()}
                        </span>
                      )}
                      <span>
                        <span className="block font-bold text-slate-900 dark:text-white">{user.name}</span>
                        <span className="block text-[10px] text-slate-500">
                          {[
                            user.employeeDetails?.serialNumber,
                            user.employeeDetails?.jobTitle,
                            user.employeeDetails?.department,
                            user.employeeDetails?.employmentStartDate,
                            user.employeeDetails?.employmentStatus === 'active'
                              ? t('employeeActive')
                              : user.employeeDetails?.employmentStatus === 'on_leave'
                                ? t('employeeLeave')
                                : user.employeeDetails?.employmentStatus === 'terminated'
                                  ? t('employeeTerminated')
                                  : undefined,
                          ].filter(Boolean).join(' · ') || '—'}
                        </span>
                      </span>
                    </div>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3.5 font-mono">{user.phone || '—'}</td>
                  <td className="max-w-[240px] break-all px-4 py-3.5">{user.email || '—'}</td>
                  <td className="px-4 py-3.5">
                    <span className="inline-flex items-center gap-2">
                      {(() => {
                        const RoleIcon = roleDefinitions.find((item) => item.role === user.role)?.icon || UserCheck;
                        return <RoleIcon className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />;
                      })()}
                      {t(user.role)}
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3.5 font-semibold">
                    {AppStore.formatMoney(user.monthlySalary || 0, AppStore.getSettings().currency)}
                  </td>
                  <td className="max-w-[200px] px-4 py-3.5">{user.address || '—'}</td>
                  <td className="px-4 py-3.5">
                    <span className={user.active ? 'font-semibold text-emerald-600' : 'font-semibold text-slate-400'}>
                      {user.active ? t('employeeActive') : t('employeeInactive')}
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3.5 text-slate-500">
                    {user.createdAt ? new Date(user.createdAt).toLocaleDateString() : '—'}
                  </td>
                  <td className="px-4 py-3.5">
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => openEditModal(user)}
                        aria-label={`Edit ${user.name}`}
                        title={t('edit')}
                        className="rounded-lg p-2 text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950/40"
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {employeeUsers.length === 0 && (
                <tr>
                  <td colSpan={9} className="px-4 py-8 text-center text-xs text-slate-500">
                    {t('employeeNoEmployees')}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <EmployeeOperationsPanel
        employees={employeeUsers}
        payrollEntries={payrollEntries}
        activeUser={activeUser}
        showToast={showToast}
      />

      <section className="space-y-4 rounded-3xl border border-slate-200/80 bg-white p-4 shadow-xs dark:border-slate-800 dark:bg-slate-900 sm:p-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-white">
              <CircleDollarSign className="h-4 w-4 text-emerald-600" />
              Monthly Employee Payroll
            </h3>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Review monthly salary, bonuses, deductions, payment history, and remaining balances.
            </p>
          </div>
          <button
            type="button"
            onClick={openCreatePayrollModal}
            disabled={payrollEmployees.length === 0 || isSaving}
            className="inline-flex items-center justify-center gap-1.5 self-start rounded-xl bg-emerald-600 px-4 py-2 text-xs font-bold text-white shadow-sm hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-50 sm:self-auto"
          >
            <Banknote className="h-4 w-4" />
            Add Monthly Salary
          </button>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
            <span className="mb-1.5 flex items-center gap-1.5">
              <CalendarDays className="h-3.5 w-3.5" />
              Payroll month
            </span>
            <input
              type="month"
              value={payrollMonthFilter}
              onChange={(event) => setPayrollMonthFilter(event.target.value)}
              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 outline-hidden focus:border-emerald-500 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
            />
          </label>
          <button
            type="button"
            onClick={exportPayrollReport}
            disabled={monthPayroll.length === 0}
            className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            {t('exportExcelButton')}
          </button>
          <div className="grid grid-cols-1 gap-2 min-[430px]:grid-cols-3">
            {[
              { label: 'NET PAYROLL', amount: payrollSalaryTotal, color: 'text-slate-900 dark:text-white' },
              { label: 'PAID AMOUNT', amount: payrollPaidTotal, color: 'text-emerald-600 dark:text-emerald-400' },
              { label: 'REMAINING', amount: payrollRemainingTotal, color: 'text-amber-600 dark:text-amber-400' },
            ].map((summary) => (
              <div key={summary.label} className="min-w-28 rounded-xl bg-slate-50 px-3 py-2 dark:bg-slate-800/70">
                <div className="text-[10px] font-semibold tracking-wide text-slate-500">{summary.label}</div>
                <div className={`mt-1 text-sm font-extrabold ${summary.color}`}>{summary.amount}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-700">
          <table className="w-full min-w-[900px] text-left text-xs">
            <thead className="border-b border-slate-100 bg-slate-50/80 text-[9px] font-bold uppercase tracking-wider text-slate-500 dark:border-slate-800 dark:bg-slate-800/60 dark:text-slate-300">
              <tr>
                <th className="whitespace-nowrap px-3 py-2.5">{t('employeeName')}</th>
                <th className="whitespace-nowrap px-3 py-2.5">{t('userPhoneNumber')}</th>
                <th className="whitespace-nowrap px-3 py-2.5">{t('payrollMonth')}</th>
                <th className="whitespace-nowrap px-3 py-2.5">{t('payrollAmount')}</th>
                <th className="whitespace-nowrap px-3 py-2.5">{t('payrollPaidAmount')}</th>
                <th className="whitespace-nowrap px-3 py-2.5">{t('payrollRemaining')}</th>
                <th className="whitespace-nowrap px-3 py-2.5">{t('payrollStatus')}</th>
                <th className="whitespace-nowrap px-3 py-2.5">{t('payrollPayment')}</th>
                <th className="whitespace-nowrap px-3 py-2.5 text-right">{t('payrollActions')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {monthPayroll.length === 0 ? (
                <tr>
                  <td colSpan={9} className="h-[84px] px-4 py-6 text-center text-[11px] text-slate-500 dark:text-slate-400">
                    {t('payrollEmptyMonth')}
                  </td>
                </tr>
              ) : monthPayroll.map((entry) => {
                  const status = getPayrollStatus(entry);
                  const payments = getPayrollPayments(entry);
                  const employeePhone = payrollEmployees.find((user) => user.id === entry.userId)?.phone || '—';
                  return (
                    <tr key={entry.id} className="text-slate-700 transition-colors hover:bg-slate-50/80 dark:text-slate-300 dark:hover:bg-slate-800/40">
                      <td className="whitespace-nowrap px-3 py-3.5 font-semibold text-slate-900 dark:text-white">{entry.userName}</td>
                      <td className="whitespace-nowrap px-3 py-3.5 font-mono">{employeePhone}</td>
                      <td className="whitespace-nowrap px-3 py-3.5">{formatPayrollMonth(entry.month)}</td>
                      <td className="whitespace-nowrap px-3 py-3.5 font-bold text-slate-900 dark:text-white">
                        {AppStore.formatMoney(getPayrollNetAmount(entry), entry.currency)}
                        {!!entry.adjustments?.length && (
                          <details className="mt-1 text-[10px] font-normal text-violet-700 dark:text-violet-300">
                            <summary className="cursor-pointer">Adjustment audit ({entry.adjustments.length})</summary>
                            <ul className="mt-1 space-y-1">
                              {entry.adjustments.map((adjustment) => (
                                <li key={adjustment.id}>
                                  {adjustment.kind} {AppStore.formatMoney(adjustment.amount, entry.currency)} — {adjustment.reason} · {adjustment.createdByName} · {new Date(adjustment.createdAt).toLocaleString()}
                                </li>
                              ))}
                            </ul>
                          </details>
                        )}
                        {!!entry.approvalHistory?.length && (
                          <details className="mt-1 text-[10px] font-normal text-blue-700 dark:text-blue-300">
                            <summary className="cursor-pointer">{t('payrollApprovalAudit')} ({entry.approvalHistory.length})</summary>
                            <ul className="mt-1 space-y-1">
                              {entry.approvalHistory.map((approval) => (
                                <li key={approval.id}>{approval.approvedByName} · {new Date(approval.approvedAt).toLocaleString()}</li>
                              ))}
                            </ul>
                          </details>
                        )}
                      </td>
                      <td className="whitespace-nowrap px-3 py-3.5 font-semibold text-emerald-700 dark:text-emerald-300">{AppStore.formatMoney(getPayrollPaidAmount(entry), entry.currency)}</td>
                      <td className="whitespace-nowrap px-3 py-3.5 font-semibold text-amber-700 dark:text-amber-300">{AppStore.formatMoney(getPayrollRemainingAmount(entry), entry.currency)}</td>
                      <td className="px-3 py-3.5">
                        <span className={`inline-flex rounded-full px-2.5 py-1 text-[10px] font-bold ${
                          status === 'paid'
                            ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300'
                            : status === 'partial'
                              ? 'bg-blue-100 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300'
                              : 'bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300'
                        }`}>
                          {t(`payroll${status[0].toUpperCase()}${status.slice(1)}`)}
                        </span>
                        {entry.approvalStatus === 'pending' ? (
                          <span className="mt-1 block text-[9px] font-bold text-amber-700 dark:text-amber-300">{t('payrollAwaitingApproval')}</span>
                        ) : (
                          <span className="mt-1 block text-[9px] font-bold text-emerald-700 dark:text-emerald-300">{t('payrollApproved')}</span>
                        )}
                        {entry.approvedByName && (
                          <span className="mt-0.5 block text-[9px] text-slate-400">{entry.approvedByName} · {entry.approvedAt ? new Date(entry.approvedAt).toLocaleDateString() : ''}</span>
                        )}
                      </td>
                      <td className="whitespace-nowrap px-3 py-3.5">
                        {payments.length ? (
                          <details>
                            <summary className="cursor-pointer whitespace-nowrap text-slate-700 dark:text-slate-200">
                              {payments.map((payment) => t(`payrollMethod${payment.method}`)).filter((method, index, methods) => methods.indexOf(method) === index).join(', ')}
                            </summary>
                            <ul className="mt-2 space-y-2 text-[10px] text-slate-500 dark:text-slate-400">
                              {payments.map((payment, index) => (
                                <li key={`${entry.id}-payment-${index}`}>
                                  {AppStore.formatMoney(payment.amount, entry.currency)} · {new Date(payment.paidAt).toLocaleString()} · {t(`payrollMethod${payment.method}`)}
                                  {payment.transactionReference ? ` · Ref ${payment.transactionReference}` : ''}
                                  {payment.recordedByName ? ` · Recorded by ${payment.recordedByName}` : ''}
                                </li>
                              ))}
                            </ul>
                          </details>
                        ) : <span className="text-slate-500 dark:text-slate-400">{t('payrollNotPaid')}</span>}
                      </td>
                      <td className="px-3 py-3.5 text-right">
                        <div className="flex flex-nowrap items-center justify-end gap-1">
                          {entry.approvalStatus === 'pending' && (
                            <button
                              type="button"
                              onClick={() => void approvePayroll(entry)}
                              disabled={isSaving}
                              className="inline-flex min-h-8 items-center justify-center gap-1 rounded-lg bg-blue-600 px-2 py-1.5 text-[10px] font-bold text-white hover:bg-blue-500 disabled:opacity-50"
                            >
                              <UserCheck className="h-3 w-3" />
                              {t('payrollApprove')}
                            </button>
                          )}
                          {getPayrollRemainingAmount(entry) > 0 && entry.approvalStatus !== 'pending' && (
                            <button
                              type="button"
                              onClick={() => {
                                setPayingEntry(entry);
                                setPayrollPaymentMethod('');
                                setPayrollPaymentAmount(String(getPayrollRemainingAmount(entry)));
                                setPayrollReference('');
                                setPayrollPaymentConfirmed(false);
                              }}
                              disabled={isSaving}
                              className="inline-flex min-h-8 items-center justify-center gap-1 rounded-lg bg-emerald-600 px-2 py-1.5 text-[10px] font-bold text-white hover:bg-emerald-500 disabled:opacity-50"
                            >
                              <Send className="h-3 w-3" />
                              {t('payrollRecordPayment')}
                            </button>
                          )}
                          <button type="button" onClick={() => openEditPayrollModal(entry)} disabled={isSaving} aria-label={`Edit payroll for ${entry.userName}`} title="Edit payroll" className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-blue-600 hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-slate-700 dark:hover:bg-blue-950/40">
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                          <button type="button" onClick={() => void handleDeletePayroll(entry)} disabled={isSaving || getPayrollPaidAmount(entry) > 0 || ['partial', 'paid'].includes(entry.status)} aria-label={`Delete payroll for ${entry.userName}`} title={getPayrollPaidAmount(entry) > 0 || ['partial', 'paid'].includes(entry.status) ? t('payrollPaidCannotDelete') : t('delete')} className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-rose-600 hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-slate-700 dark:hover:bg-rose-950/40">
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </div>
      </section>

      </>
      )}

      {view === 'roles' && (
        <section className="overflow-hidden rounded-3xl border border-slate-200/80 bg-white shadow-xs dark:border-slate-800 dark:bg-slate-900">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 p-4 dark:border-slate-800">
            <h3 className="text-sm font-bold text-slate-900 dark:text-white">{t('staffRegisteredUsers')}</h3>
            {activeUser.role === 'admin' && (
              <button
                type="button"
                onClick={() => void refreshRegisteredBusinesses()}
                disabled={isLoadingRegisteredBusinesses}
                aria-label={t('refreshRegisteredAccounts')}
                title={t('refreshRegisteredAccounts')}
                className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:cursor-wait disabled:opacity-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
              >
                <RefreshCw className={`h-4 w-4 ${isLoadingRegisteredBusinesses ? 'animate-spin' : ''}`} />
              </button>
            )}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-left text-xs">
              <thead className="border-b border-slate-100 bg-slate-50/60 text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:border-slate-800 dark:bg-slate-800/40">
                <tr>
                  <th className="px-4 py-3.5">NAME</th>
                  <th className="px-4 py-3.5">{t('staffPhone').toUpperCase()}</th>
                  <th className="px-4 py-3.5">{t('staffEmail').toUpperCase()}</th>
                  <th className="px-4 py-3.5">{t('staffSecurityRole').toUpperCase()}</th>
                  <th className="px-4 py-3.5">STATUS</th>
                  <th className="px-4 py-3.5">CREATED</th>
                  <th className="px-4 py-3.5">ACTIONS</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {activeUser.role === 'admin' && registeredBusinessesError && (
                  <tr>
                    <td colSpan={7} role="alert" className="px-4 py-4 text-center text-xs font-semibold text-rose-600 dark:text-rose-300">
                      {registeredBusinessesError}
                    </td>
                  </tr>
                )}
                {activeUser.role === 'admin' ? adminVisibleAccounts.map((business) => (
                  <tr key={business.userId} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40">
                    <td className="px-4 py-3.5">
                      <p className="font-bold text-slate-900 dark:text-white">{business.name}</p>
                      {['admin', 'super_admin', 'business_admin'].includes(business.role) && (
                        <p className="mt-1 text-[10px] text-slate-500 dark:text-slate-400">{business.businessName}</p>
                      )}
                    </td>
                    <td className="px-4 py-3.5">
                      <div className="flex items-center gap-2 whitespace-nowrap text-slate-700 dark:text-slate-200">
                        <Phone className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                        <span className="font-mono">
                          {business.role === 'super_admin' ? '+252683723015' : business.phone || '—'}
                        </span>
                      </div>
                    </td>
                    <td className="max-w-[240px] px-4 py-3.5">
                      <div className="flex items-center gap-2 text-slate-600 dark:text-slate-300">
                        <Mail className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                        <span className="break-all">{business.email || '—'}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3.5">
                      <div className="flex flex-col items-start gap-1">
                        <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-[10px] font-bold uppercase text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                          {registeredAccountRoleLabels[business.role] || business.role.replaceAll('_', ' ')}
                        </span>
                        {business.role === 'unassigned' && (
                          <span className="text-[9px] text-amber-700 dark:text-amber-300">Role data needs review</span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3.5">
                      <div>
                        <span className={business.active ? 'font-semibold text-emerald-600' : 'font-semibold text-slate-400'}>
                          {business.active ? t('active') : t('inactive')}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3.5 text-slate-500">{business.registeredAt ? new Date(business.registeredAt).toLocaleDateString(language === 'so' ? 'so-SO' : 'en-US') : '—'}</td>
                    <td className="px-4 py-3.5">
                      <div className="flex items-center gap-1">
                        {business.accountActionsAvailable !== false && ['business_owner', 'business_admin'].includes(business.role) && (
                          <button
                            type="button"
                            onClick={() => void openRegisteredBusinessWorkspace(business)}
                            disabled={isLoadingTeamWorkspace}
                            aria-label={`${t('viewAllBusinessData')}: ${business.name}`}
                            title={t('viewAllBusinessData')}
                            className="rounded-lg p-2 text-sky-600 hover:bg-sky-50 disabled:opacity-50 dark:hover:bg-sky-950/40"
                          >
                            <Eye className="h-4 w-4" />
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => openEditRegisteredAccount(business)}
                          disabled={isSaving || business.accountActionsAvailable === false}
                          aria-label={`Edit ${business.name}`}
                          title="Edit account"
                          className="rounded-lg p-2 text-blue-600 hover:bg-blue-50 disabled:opacity-50 dark:hover:bg-blue-950/40"
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleDeleteRegisteredAccount(business)}
                          disabled={isSaving || business.userId === activeUser.id || business.accountActionsAvailable === false}
                          aria-label={`Move ${business.name} to the Recycling Bin`}
                          title={business.userId === activeUser.id ? 'You cannot delete your own account' : 'Move to Recycling Bin'}
                          className="rounded-lg p-2 text-rose-600 hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-40 dark:hover:bg-rose-950/40"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                )) : userRoleAccounts.map((user) => (
                  <tr key={user.id} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40">
                    <td className="px-4 py-3.5 font-bold text-slate-900 dark:text-white">{user.name}</td>
                    <td className="px-4 py-3.5">
                      <div className="flex items-center gap-2 whitespace-nowrap text-slate-700 dark:text-slate-200">
                        <Phone className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                        <span className="font-mono">{user.phone || '—'}</span>
                      </div>
                    </td>
                    <td className="max-w-[240px] px-4 py-3.5">
                      <div className="flex items-center gap-2 text-slate-600 dark:text-slate-300">
                        <Mail className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                        <span className="break-all">{user.email || '—'}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3.5">
                      <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-[10px] font-bold uppercase text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                        {t(user.role)}
                      </span>
                    </td>
                    <td className="px-4 py-3.5">
                      <span className={user.active ? 'font-semibold text-emerald-600' : 'font-semibold text-slate-400'}>
                        {user.active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="px-4 py-3.5 text-slate-500">{user.createdAt}</td>
                    <td className="px-4 py-3.5">
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => openEditModal(user)}
                          aria-label={`Edit ${user.name}`}
                          title="Edit account"
                          className="rounded-lg p-2 text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950/40"
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {(activeUser.role === 'admin'
                  ? adminVisibleAccounts.length === 0 && !isLoadingRegisteredBusinesses
                  : userRoleAccounts.length === 0) && (
                  <tr>
                    <td colSpan={7} className="px-4 py-8 text-center text-xs text-slate-500">{t('staffNoUsers')}</td>
                  </tr>
                )}
                {activeUser.role === 'admin' && isLoadingRegisteredBusinesses && adminVisibleAccounts.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-4 py-8 text-center text-xs text-slate-500">{t('loading')}</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {view === 'roles' && (
        <section
          aria-label="Role permissions governance matrix"
          className="overflow-hidden rounded-3xl border border-slate-200/80 bg-white shadow-xs dark:border-slate-800 dark:bg-slate-900"
        >
          <div className="space-y-4 p-4">
            <header className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">Role Permissions</h3>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  Choose which sections each role can access. Business Admin keeps full access.
                </p>
              </div>
              {isBusinessAdministratorRole(activeUser.role) && (
                <button
                  type="button"
                  onClick={() => void handleSaveRolePermissions()}
                  disabled={isLoadingRolePermissions || isSavingRolePermissions || !Object.keys(rolePermissions).length}
                  className="inline-flex min-h-9 items-center gap-2 rounded-lg bg-emerald-600 px-3 text-xs font-bold text-white hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {isSavingRolePermissions ? 'Saving…' : 'Save permissions'}
                </button>
              )}
            </header>
            {rolePermissionsError && (
              <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-200">
                {rolePermissionsError}
              </p>
            )}
            {isLoadingRolePermissions ? (
              <p className="py-6 text-center text-xs text-slate-500">Loading role permissions…</p>
            ) : Object.keys(rolePermissions).length ? (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[760px] text-left text-xs">
                  <thead className="bg-slate-50 text-[10px] uppercase tracking-wide text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                    <tr>
                      <th className="p-3">Role</th>
                      {ALL_PERMISSION_KEYS.map((permission) => (
                        <th key={permission} className="min-w-24 p-3">{permission.replaceAll('_', ' ')}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {Object.entries(rolePermissions).map(([roleName, permissions]) => (
                      <tr key={roleName}>
                        <th scope="row" className="whitespace-nowrap p-3 font-bold text-slate-800 dark:text-slate-100">
                          {registeredAccountRoleLabels[roleName as RoleType] || roleName.replaceAll('_', ' ')}
                          {roleName === 'business_admin' && <span className="ml-1 text-[9px] font-medium text-slate-400">(fixed)</span>}
                        </th>
                        {ALL_PERMISSION_KEYS.map((permission) => (
                          <td key={permission} className="p-3 text-center">
                            <input
                              type="checkbox"
                              aria-label={`${registeredAccountRoleLabels[roleName as RoleType] || roleName} can access ${permission.replaceAll('_', ' ')}`}
                              checked={permissions.includes(permission)}
                              disabled={roleName === 'business_admin' || !isBusinessAdministratorRole(activeUser.role) || isSavingRolePermissions}
                              onChange={() => toggleRolePermission(roleName, permission)}
                              className="h-4 w-4 accent-emerald-600 disabled:cursor-not-allowed"
                            />
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="rounded-xl border border-dashed border-slate-300 p-5 text-center text-xs text-slate-500 dark:border-slate-700">
                Role permissions are only available to Business Administrators.
              </p>
            )}
          </div>
        </section>
      )}

      {selectedTeamWorkspace && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/70 p-3 backdrop-blur-sm sm:p-6">
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="team-workspace-title"
            className="flex max-h-[92dvh] w-full max-w-5xl flex-col overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-900"
          >
            <header className="flex items-start justify-between gap-4 border-b border-slate-100 p-4 dark:border-slate-800 sm:p-5">
              <div className="min-w-0">
                <h2 id="team-workspace-title" className="truncate text-base font-extrabold text-slate-900 dark:text-white">
                  {t('fullWorkspaceFor')} {selectedTeamWorkspace.user.name}
                </h2>
                <p className="mt-1 break-all text-[11px] text-slate-500 dark:text-slate-400">
                  {t(selectedTeamWorkspace.user.role)} · {selectedTeamWorkspace.user.email} · {selectedTeamWorkspace.user.phone || '—'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedTeamWorkspace(null)}
                aria-label={t('close')}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-slate-500 hover:bg-slate-100 hover:text-slate-900 dark:hover:bg-slate-800 dark:hover:text-white"
              >
                <X className="h-5 w-5" />
              </button>
            </header>
            <div className="grid gap-3 overflow-y-auto p-4 sm:grid-cols-2 sm:p-5 lg:grid-cols-3">
              {Object.entries({
                ...selectedTeamWorkspace.workspace,
                ...selectedTeamWorkspace.employeeRecords,
              }).map(([key, value]) => {
                const count = Array.isArray(value) ? value.length : undefined;
                return (
                  <details key={key} className="min-w-0 overflow-hidden rounded-2xl border border-slate-200 dark:border-slate-800">
                    <summary className="cursor-pointer bg-slate-50 px-3 py-2.5 text-xs font-bold text-slate-800 dark:bg-slate-800/60 dark:text-slate-100">
                      {t(key)} {count !== undefined ? `(${count})` : ''}
                    </summary>
                    <pre className="max-h-80 overflow-auto whitespace-pre-wrap break-words p-3 text-[10px] leading-relaxed text-slate-700 dark:text-slate-300">
                      {JSON.stringify(value, null, 2)}
                    </pre>
                  </details>
                );
              })}
            </div>
          </section>
        </div>
      )}

      {selectedBusinessWorkspace && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/70 p-3 backdrop-blur-sm sm:p-6">
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="registered-business-workspace-title"
            className="flex max-h-[92dvh] w-full max-w-6xl flex-col overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-900"
          >
            <header className="flex items-start justify-between gap-4 border-b border-slate-100 p-4 dark:border-slate-800 sm:p-5">
              <div className="min-w-0">
                <h2 id="registered-business-workspace-title" className="truncate text-base font-extrabold text-slate-900 dark:text-white">
                  {selectedBusinessWorkspace.business.businessName}
                </h2>
                <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
                  {selectedBusinessAccount?.name} · {selectedBusinessAccount ? t(selectedBusinessAccount.role) : ''}
                  {selectedBusinessAccount?.email ? ` · ${selectedBusinessAccount.email}` : ''}
                </p>
                <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
                  {selectedBusinessWorkspace.members.length} {t('businessMembers')} · {t('allBusinessData')}
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setSelectedBusinessWorkspace(null);
                  setSelectedBusinessAccount(null);
                }}
                aria-label={t('close')}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-slate-500 hover:bg-slate-100 hover:text-slate-900 dark:hover:bg-slate-800 dark:hover:text-white"
              >
                <X className="h-5 w-5" />
              </button>
            </header>
            <div className="space-y-3 overflow-y-auto p-4 sm:p-5">
              {[
                ['sharedWorkspace', selectedBusinessWorkspace.sharedWorkspace],
                ['tenantWorkspace', selectedBusinessWorkspace.tenantWorkspace],
                ['accounting', selectedBusinessWorkspace.accounting],
              ].map(([section, data]) => (
                <details key={section as string} className="overflow-hidden rounded-2xl border border-slate-200 dark:border-slate-800">
                  <summary className="cursor-pointer bg-slate-50 px-3 py-2.5 text-xs font-bold text-slate-800 dark:bg-slate-800/60 dark:text-slate-100">
                    {t(section as string)}
                  </summary>
                  <pre className="max-h-80 overflow-auto whitespace-pre-wrap break-words p-3 text-[10px] leading-relaxed text-slate-700 dark:text-slate-300">
                    {JSON.stringify(data, null, 2)}
                  </pre>
                </details>
              ))}
              {[...selectedBusinessWorkspace.members]
                .sort((left, right) => {
                  if (left.user.role === right.user.role) return left.user.name.localeCompare(right.user.name);
                  if (left.user.role === 'business_admin') return -1;
                  if (right.user.role === 'business_admin') return 1;
                  return left.user.role.localeCompare(right.user.role);
                })
                .map((member) => (
                <details
                  key={member.user.id}
                  open={member.user.role === 'business_admin'}
                  className="overflow-hidden rounded-2xl border border-slate-200 dark:border-slate-800"
                >
                  <summary className="cursor-pointer bg-slate-50 px-3 py-3 text-xs font-bold text-slate-800 dark:bg-slate-800/60 dark:text-slate-100">
                    {member.user.name} · {t(member.user.role)} · {member.user.email}
                  </summary>
                  {member.user.role === 'business_admin' && (
                    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 p-3 dark:border-slate-800">
                      <p className="text-[10px] text-slate-500 dark:text-slate-400">{t('businessAdminDataTransferDescription')}</p>
                      <button
                        type="button"
                        onClick={() => void transferBusinessAdminWorkspace(member)}
                        disabled={isLoadingTeamWorkspace}
                        className="inline-flex min-h-8 items-center gap-1.5 rounded-lg bg-rose-600 px-2.5 py-1.5 text-[10px] font-bold text-white hover:bg-rose-500 disabled:opacity-50"
                      >
                        <Send className="h-3.5 w-3.5" />
                        {t('transferBusinessAdminData')}
                      </button>
                    </div>
                  )}
                  <div className="grid gap-3 p-3 sm:grid-cols-2 lg:grid-cols-3">
                    {Object.entries({
                      ...member.workspace,
                      ...member.employeeRecords,
                    }).map(([key, value]) => {
                      const count = Array.isArray(value) ? value.length : undefined;
                      return (
                        <details key={key} className="min-w-0 overflow-hidden rounded-xl border border-slate-200 dark:border-slate-700">
                          <summary className="cursor-pointer bg-white px-3 py-2.5 text-[11px] font-bold text-slate-800 dark:bg-slate-900 dark:text-slate-100">
                            {t(key)} {count !== undefined ? `(${count})` : ''}
                          </summary>
                          <pre className="max-h-72 overflow-auto whitespace-pre-wrap break-words p-3 text-[10px] leading-relaxed text-slate-700 dark:text-slate-300">
                            {JSON.stringify(value, null, 2)}
                          </pre>
                        </details>
                      );
                    })}
                  </div>
                </details>
              ))}
            </div>
          </section>
        </div>
      )}

      {/* Create or edit user modal */}
      {isModalOpen && view === 'roles' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-3 backdrop-blur-sm sm:p-5">
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="user-account-form-title"
            className="max-h-[90dvh] w-full max-w-xl overflow-y-auto rounded-2xl border border-slate-200 bg-white px-5 py-4 shadow-2xl dark:border-slate-800 dark:bg-slate-900 sm:px-6"
          >
            <header className="mb-3 flex items-center justify-between border-b border-slate-100 pb-3 dark:border-slate-800">
              <h2 id="user-account-form-title" className="text-sm font-bold text-slate-900 dark:text-white">
                {t(editingUser ? 'staffEditAccount' : 'staffRegisterAccount')}
              </h2>
              <button
                type="button"
                onClick={closeUserModal}
                aria-label={t('cancel')}
                className="rounded-lg p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-white"
              >
                <X className="h-4 w-4" />
              </button>
            </header>
            <form onSubmit={handleSaveUser} className="space-y-2.5 text-[10px]">
              <label className="block font-semibold text-slate-700 dark:text-slate-300">
                <span className="mb-1 block">{t('staffUserFullName')} *</span>
                <input
                  autoComplete="name"
                  name="name"
                  type="text"
                  required
                  maxLength={120}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder={t('staffFullNamePlaceholder')}
                  className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-normal text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-emerald-500 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                />
              </label>
              <div className="grid gap-2 sm:grid-cols-2">
                <label className="block font-semibold text-slate-700 dark:text-slate-300">
                  <span className="mb-1 block">{t('staffEmail')} *</span>
                  <input
                    autoComplete="email"
                    name="email"
                    type="email"
                    required
                    maxLength={254}
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder={t('staffEmailPlaceholder')}
                    className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-normal text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-emerald-500 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                  />
                </label>
                <label className="block font-semibold text-slate-700 dark:text-slate-300">
                  <span className="mb-1 block">{t('staffPhone')} {!editingUser && '*'}</span>
                  <input
                    autoComplete="tel"
                    name="tel"
                    type="tel"
                    required={!editingUser}
                    maxLength={40}
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder={t('staffPhonePlaceholder')}
                    className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-mono font-normal text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-emerald-500 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                  />
                </label>
              </div>
              <label className="block font-semibold text-slate-700 dark:text-slate-300">
                <span className="mb-1 block">{t('staffPosSecurityRole')} *</span>
                <select
                  required
                  value={role}
                  onChange={(e) => setRole(e.target.value as RoleType)}
                  className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-800 outline-none transition focus:border-emerald-500 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                >
                  {editingRegisteredAccountTenantId
                    ? (Object.entries(registeredAccountRoleLabels) as [RoleType, string][])
                        .filter(([value]) => value !== 'super_admin' || editingUser?.role === 'super_admin')
                        .map(([value, label]) => <option key={value} value={value}>{label}</option>)
                    : (
                      <>
                        <option value="business_admin">{t('business_admin')}</option>
                        <option value="employee">{t('employee')}</option>
                        <option value="branch_manager">{t('branch_manager')}</option>
                        <option value="cashier">{t('cashier')}</option>
                        <option value="accountant">{t('account')}</option>
                        {editingUser && ['admin', 'business_owner', 'manager', 'inventory_manager', 'hr_manager'].includes(editingUser.role) && (
                          <option value={editingUser.role}>{t(editingUser.role)} ({t('legacyRole')})</option>
                        )}
                      </>
                    )}
                </select>
                <p className="mt-1 text-[10px] font-normal text-slate-500 dark:text-slate-400">
                  {t('platformAdminRoleNotice')}
                </p>
              </label>
              {!editingRegisteredAccountTenantId && (
              <div>
                <label className="mb-1 block font-semibold text-slate-700 dark:text-slate-300">
                  {t('userPasswordOptional')}
                </label>
                <div className="relative">
                  <input
                    name="password"
                    type={showPassword ? 'text' : 'password'}
                    minLength={password ? 12 : undefined}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete="new-password"
                    placeholder={t('userPasswordPlaceholder')}
                    className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 pr-10 text-xs font-normal text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-emerald-500 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((visible) => !visible)}
                    aria-label={showPassword ? t('hidePassword') : t('showPassword')}
                    title={showPassword ? t('hidePassword') : t('showPassword')}
                    className="absolute inset-y-0 right-3 flex items-center text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
                  >
                    {showPassword
                      ? <EyeOff className="h-4 w-4" />
                      : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                <p className="mt-1 text-[9px] leading-relaxed text-slate-500">
                  {t(editingUser ? 'userEditPasswordHelp' : 'userCreatePasswordHelp')}
                </p>
              </div>
              )}
              {editingUser && (
                <label className="flex items-center gap-2 py-1 font-semibold text-slate-700 dark:text-slate-300">
                  <input
                    type="checkbox"
                    checked={isActive}
                    onChange={(e) => setIsActive(e.target.checked)}
                    className="accent-emerald-600"
                  />
                  Account active (allow sign-in)
                </label>
              )}
              <footer className="flex justify-end gap-2 border-t border-slate-100 pt-3 dark:border-slate-800">
                <button
                  type="button"
                  onClick={closeUserModal}
                  className="rounded-lg px-4 py-2 text-[10px] font-semibold text-slate-600 transition hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
                >
                  {t('cancel')}
                </button>
                <button
                  type="submit"
                  disabled={isSaving}
                  className="rounded-lg bg-emerald-600 px-4 py-2 text-[10px] font-bold text-white transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isSaving ? t('saving') : editingUser ? t('saveChanges') : t('createAccount')}
                </button>
              </footer>
            </form>
          </section>
        </div>
      )}
      {isModalOpen && view === 'employees' && (
        <EmployeeFormModal
          editingUser={editingUser}
          isSaving={isSaving}
          onClose={closeUserModal}
          onSave={handleSaveEmployee}
        />
      )}
      {showPlanUpgrade && (
        <PlanUpgradeModal
          onClose={() => setShowPlanUpgrade(false)}
          returnToEmployeeCreation={view === 'employees'}
          recommendedPlanId={recommendedUpgradePlanId}
        />
      )}
      {generatedCredentials && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-xs">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="generated-credentials-title"
            className="w-full max-w-md space-y-4 rounded-3xl border border-slate-200 bg-white p-6 shadow-2xl dark:border-slate-800 dark:bg-slate-900"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 id="generated-credentials-title" className="text-base font-bold text-slate-900 dark:text-white">
                  {generatedCredentials.passwordReset ? 'Account updated; new password generated' : 'Account created'}
                </h3>
                <p className="mt-1 text-xs text-slate-500">
                  Save or share this password now. It will not be shown again.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setGeneratedCredentials(null)}
                aria-label="Close password details"
                className="text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="space-y-3 rounded-2xl bg-slate-50 p-4 dark:bg-slate-800">
              <div>
                <div className="mb-1 text-[11px] font-semibold text-slate-500">NAME</div>
                <div className="text-sm font-semibold text-slate-900 dark:text-white">{generatedCredentials.user.name}</div>
              </div>
              <div>
                <div className="mb-1 text-[11px] font-semibold text-slate-500">EMAIL / LOGIN</div>
                <div className="break-all font-mono text-sm text-slate-900 dark:text-white">{generatedCredentials.user.email}</div>
              </div>
              <div>
                <div className="mb-1 text-[11px] font-semibold text-slate-500">TEMPORARY PASSWORD</div>
                <div className="flex items-center gap-2">
                  <input
                    readOnly
                    type={showPassword ? 'text' : 'password'}
                    value={generatedCredentials.password}
                    aria-label="Generated temporary password"
                    className="min-w-0 flex-1 rounded-xl border border-slate-200 bg-white px-3 py-2 font-mono text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((visible) => !visible)}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                    title={showPassword ? 'Hide password' : 'Show password'}
                    className="rounded-lg p-2 text-slate-500 hover:bg-slate-200 dark:hover:bg-slate-700"
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                  <button
                    type="button"
                    onClick={() => void copyGeneratedPassword()}
                    aria-label="Copy generated password"
                    title="Copy password"
                    className="rounded-lg p-2 text-emerald-700 hover:bg-emerald-100 dark:text-emerald-400 dark:hover:bg-emerald-950"
                  >
                    <Copy className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </div>
            <div className="flex justify-end border-t border-slate-100 pt-3 dark:border-slate-800">
              <button
                type="button"
                onClick={() => setGeneratedCredentials(null)}
                className="rounded-xl bg-emerald-600 px-5 py-2.5 font-bold text-white hover:bg-emerald-500"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {isPayrollModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-xs">
          <form onSubmit={(event) => void handleSavePayroll(event)} className="w-full max-w-md space-y-4 rounded-3xl border border-slate-200 bg-white p-6 shadow-2xl dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 dark:border-slate-800">
              <h3 className="text-base font-bold text-slate-900 dark:text-white">
                {t(editingPayroll ? 'payrollEditSalary' : 'payrollAddSalary')}
              </h3>
              <button type="button" onClick={() => setIsPayrollModalOpen(false)} aria-label={t('cancel')} className="rounded-lg p-1 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800">
                <X className="h-5 w-5" />
              </button>
            </div>
            <label className="block space-y-1.5 text-xs font-semibold text-slate-700 dark:text-slate-300">
              <span>{t('payrollEmployee')}</span>
              <select
                required
                value={payrollUserId}
                onChange={(event) => setPayrollUserId(event.target.value)}
                disabled={editingPayrollHasPayments}
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-hidden focus:border-emerald-500 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
              >
                <option value="" disabled>{t('payrollChooseEmployee')}</option>
                {payrollEmployees.map((employee) => (
                  <option key={employee.id} value={employee.id}>
                    {employee.name} — {AppStore.formatMoney(employee.monthlySalary || 0, AppStore.getSettings().currency)}
                  </option>
                ))}
              </select>
            </label>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className="block space-y-1.5 text-xs font-semibold text-slate-700 dark:text-slate-300">
                <span>{t('payrollMonth')}</span>
                <input required type="month" value={payrollMonth} onChange={(event) => setPayrollMonth(event.target.value)} disabled={editingPayrollHasPayments} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-hidden focus:border-emerald-500 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-700 dark:bg-slate-800 dark:text-white" />
              </label>
              <label className="block space-y-1.5 text-xs font-semibold text-slate-700 dark:text-slate-300">
                <span>{t('payrollAmount')} ({editingPayroll?.currency || AppStore.getSettings().currency})</span>
                <input
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={editingPayroll ? payrollBaseAmount : selectedPayrollEmployee?.monthlySalary ?? ''}
                  onChange={(event) => setPayrollBaseAmount(event.target.value)}
                  readOnly={!editingPayroll || editingPayrollHasPayments}
                  placeholder="0.00"
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-hidden focus:border-emerald-500 read-only:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-white dark:read-only:bg-slate-800"
                />
                <span className="block font-normal text-slate-500">
                  {t('payrollEnterAmount')}
                </span>
              </label>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className="block space-y-1.5 text-xs font-semibold text-slate-700 dark:text-slate-300">
                <span>{t('payrollBonus')} ({AppStore.getSettings().currency})</span>
                <input type="number" min="0" step="0.01" value={payrollBonusAmount} onChange={(event) => setPayrollBonusAmount(event.target.value)} disabled={editingPayrollHasPayments} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm disabled:opacity-60 dark:border-slate-700 dark:bg-slate-800" />
              </label>
              <label className="block space-y-1.5 text-xs font-semibold text-slate-700 dark:text-slate-300">
                <span>{t('payrollDeduction')} ({AppStore.getSettings().currency})</span>
                <input type="number" min="0" step="0.01" value={payrollDeductionAmount} onChange={(event) => setPayrollDeductionAmount(event.target.value)} disabled={editingPayrollHasPayments} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm disabled:opacity-60 dark:border-slate-700 dark:bg-slate-800" />
              </label>
              <label className="block space-y-1.5 text-xs font-semibold text-slate-700 dark:text-slate-300">
                <span>{t('payrollAllowance')} ({AppStore.getSettings().currency})</span>
                <input type="number" min="0" step="0.01" value={payrollAllowanceAmount} onChange={(event) => setPayrollAllowanceAmount(event.target.value)} disabled={editingPayrollHasPayments} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm disabled:opacity-60 dark:border-slate-700 dark:bg-slate-800" />
              </label>
              <label className="block space-y-1.5 text-xs font-semibold text-slate-700 dark:text-slate-300">
                <span>{t('payrollOvertime')} ({AppStore.getSettings().currency})</span>
                <input type="number" min="0" step="0.01" value={payrollOvertimeAmount} onChange={(event) => setPayrollOvertimeAmount(event.target.value)} disabled={editingPayrollHasPayments} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm disabled:opacity-60 dark:border-slate-700 dark:bg-slate-800" />
              </label>
              <label className="block space-y-1.5 text-xs font-semibold text-slate-700 dark:text-slate-300">
                <span>{t('payrollTaxDeduction')} ({AppStore.getSettings().currency})</span>
                <input type="number" min="0" step="0.01" value={payrollTaxDeductionAmount} onChange={(event) => setPayrollTaxDeductionAmount(event.target.value)} disabled={editingPayrollHasPayments} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm disabled:opacity-60 dark:border-slate-700 dark:bg-slate-800" />
              </label>
              <label className="block space-y-1.5 text-xs font-semibold text-slate-700 dark:text-slate-300">
                <span>{t('payrollAbsenceDeduction')} ({AppStore.getSettings().currency})</span>
                <input type="number" min="0" step="0.01" value={payrollAbsenceDeductionAmount} onChange={(event) => setPayrollAbsenceDeductionAmount(event.target.value)} disabled={editingPayrollHasPayments} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm disabled:opacity-60 dark:border-slate-700 dark:bg-slate-800" />
              </label>
            </div>
            <p className="text-[11px] text-slate-500">{t('payrollNetCalculation')}</p>
            {editingPayrollHasPayments && <p className="text-[11px] text-amber-700 dark:text-amber-300">{t('payrollPaidEditHelp')}</p>}
            <div className="flex justify-end gap-2 border-t border-slate-100 pt-3 dark:border-slate-800">
              <button type="button" onClick={() => setIsPayrollModalOpen(false)} className="rounded-xl px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800">{t('cancel')}</button>
              <button type="submit" disabled={isSaving || payrollEmployees.length === 0 || !selectedPayrollEmployee?.monthlySalary} className="rounded-xl bg-emerald-600 px-5 py-2 text-xs font-bold text-white hover:bg-emerald-500 disabled:opacity-50">{t('save')}</button>
            </div>
          </form>
        </div>
      )}

      {payingEntry && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-xs">
          <form onSubmit={(event) => void handleRecordPayrollPayment(event)} className="w-full max-w-md space-y-4 rounded-3xl border border-slate-200 bg-white p-6 shadow-2xl dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 dark:border-slate-800">
              <h3 className="text-base font-bold text-slate-900 dark:text-white">{t('payrollRecordPayment')}</h3>
              <button type="button" onClick={() => setPayingEntry(null)} aria-label={t('cancel')} className="rounded-lg p-1 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="rounded-xl bg-slate-50 p-3 text-sm dark:bg-slate-800">
              <div className="font-bold text-slate-900 dark:text-white">{payingEntry.userName}</div>
              <div className="mt-1 text-xs text-slate-500">{formatPayrollMonth(payingEntry.month)}</div>
              <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
                <div>
                  <span className="text-slate-500">{t('payrollPaidAmount')}</span>
                  <div className="font-bold text-emerald-700 dark:text-emerald-300">{AppStore.formatMoney(getPayrollPaidAmount(payingEntry), payingEntry.currency)}</div>
                </div>
                <div>
                  <span className="text-slate-500">{t('payrollRemaining')}</span>
                  <div className="font-bold text-amber-700 dark:text-amber-300">{AppStore.formatMoney(payingEntryRemaining, payingEntry.currency)}</div>
                </div>
              </div>
            </div>
            <label className="block space-y-1.5 text-xs font-semibold text-slate-700 dark:text-slate-300">
              <span>{t('payrollPaymentAmount')} ({payingEntry.currency})</span>
              <input
                required
                type="number"
                min="0.01"
                max={payingEntryRemaining}
                step="0.01"
                value={payrollPaymentAmount}
                onChange={(event) => setPayrollPaymentAmount(event.target.value)}
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-hidden focus:border-emerald-500 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
              />
              <span className="block font-normal text-slate-500">
                {t('payrollPaymentAmountHelp').replace('{amount}', AppStore.formatMoney(payingEntryRemaining, payingEntry.currency))}
              </span>
            </label>
            <label className="block space-y-1.5 text-xs font-semibold text-slate-700 dark:text-slate-300">
              <span>{t('payrollPaymentMethod')}</span>
              <select required value={payrollPaymentMethod} onChange={(event) => setPayrollPaymentMethod(event.target.value as PayrollPaymentMethod | '')} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-hidden focus:border-emerald-500 dark:border-slate-700 dark:bg-slate-800 dark:text-white">
                <option value="">{t('payrollChoosePaymentMethod')}</option>
                <option value="evc_plus">{t('payrollMethodevc_plus')}</option>
                <option value="zaad">{t('payrollMethodzaad')}</option>
                <option value="sahal">{t('payrollMethodsahal')}</option>
                <option value="cash">{t('payrollMethodcash')}</option>
              </select>
            </label>
            <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs leading-relaxed text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-200">
              {payrollPaymentMethod === 'cash'
                ? t('payrollCashInstruction')
                : 'Transfer the salary manually using the selected provider. No mobile-money transfer is initiated by this system. Record the payment only after confirming it succeeded.'}
            </p>
            <label className="block space-y-1.5 text-xs font-semibold text-slate-700 dark:text-slate-300">
              <span>{t('payrollTransactionReference')}</span>
              <input value={payrollReference} onChange={(event) => setPayrollReference(event.target.value)} maxLength={100} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-hidden focus:border-emerald-500 dark:border-slate-700 dark:bg-slate-800 dark:text-white" />
            </label>
            <label className="flex items-start gap-2 text-xs font-semibold text-slate-700 dark:text-slate-300">
              <input required type="checkbox" checked={payrollPaymentConfirmed} onChange={(event) => setPayrollPaymentConfirmed(event.target.checked)} className="mt-0.5 h-4 w-4 accent-emerald-600" />
              <span>I confirm this payment has already been made and verified.</span>
            </label>
            <div className="flex justify-end gap-2 border-t border-slate-100 pt-3 dark:border-slate-800">
              <button type="button" onClick={() => setPayingEntry(null)} className="rounded-xl px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800">{t('cancel')}</button>
              <button type="submit" disabled={isSaving || !payrollPaymentMethod || !validPayrollPaymentAmount || !payrollPaymentConfirmed} className="rounded-xl bg-emerald-600 px-5 py-2 text-xs font-bold text-white hover:bg-emerald-500 disabled:opacity-50">{t('payrollMarkAsPaid')}</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
