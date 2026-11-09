import React, { useState } from 'react';
import { Eye, EyeOff, Mail, Phone, X } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { AppStore } from '../../services/store';
import { EmployeeDetails, RoleType, User } from '../../types';

const formatDateInputValue = (date: Date): string =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

export interface EmployeeFormData {
  name: string;
  email: string;
  phone: string;
  monthlySalary: number;
  address: string;
  dateOfBirth: string;
  employeeDetails: Partial<EmployeeDetails>;
  role: RoleType;
  active: boolean;
  password?: string;
}

interface EmployeeFormModalProps {
  editingUser: User | null;
  isSaving: boolean;
  onClose: () => void;
  onSave: (data: EmployeeFormData) => Promise<void>;
}

export const EmployeeFormModal: React.FC<EmployeeFormModalProps> = ({
  editingUser,
  isSaving,
  onClose,
  onSave,
}) => {
  const { t, permissions } = useApp();
  const canManageUsers = permissions.includes('manage_users');
  const existingDetails = editingUser?.employeeDetails || {};
  const [name, setName] = useState(editingUser?.name || '');
  const [email, setEmail] = useState(editingUser?.email || '');
  const [phone, setPhone] = useState(editingUser?.phone || '+252 61 ');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [evcPlusPhone, setEvcPlusPhone] = useState(existingDetails.evcPlusPhone || '');
  const [zaadPhone, setZaadPhone] = useState(existingDetails.zaadPhone || '');
  const [sahalPhone, setSahalPhone] = useState(existingDetails.sahalPhone || '');
  const [monthlySalary, setMonthlySalary] = useState(
    editingUser?.monthlySalary ? String(editingUser.monthlySalary) : ''
  );
  const [address, setAddress] = useState(editingUser?.address || '');
  const [employeeNumber, setEmployeeNumber] = useState(existingDetails.serialNumber || '');
  const [jobTitle, setJobTitle] = useState(existingDetails.jobTitle || editingUser?.jobTitle || '');
  const [department, setDepartment] = useState(existingDetails.department || '');
  const [employmentStartDate, setEmploymentStartDate] = useState(existingDetails.employmentStartDate || '');
  const [employmentStatus, setEmploymentStatus] = useState<EmployeeDetails['employmentStatus']>(
    existingDetails.employmentStatus || (editingUser?.active === false ? 'terminated' : 'active')
  );
  const [profilePhoto, setProfilePhoto] = useState(existingDetails.photo || '');
  const [gender, setGender] = useState<EmployeeDetails['gender']>(existingDetails.gender || '');
  const [dateOfBirth, setDateOfBirth] = useState(editingUser?.dateOfBirth || '');
  const [role, setRole] = useState<RoleType>(
    editingUser?.role || (canManageUsers ? 'cashier' : 'employee')
  );
  const [active, setActive] = useState(editingUser?.active ?? true);
  const [error, setError] = useState('');

  const inputClass =
    'w-full min-w-0 rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-xs text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/10 dark:border-slate-700 dark:bg-slate-800 dark:text-white';
  const labelClass = 'block text-xs font-semibold text-slate-700 dark:text-slate-300';
  const today = formatDateInputValue(new Date());
  const latestDateOfBirth = new Date();
  latestDateOfBirth.setDate(latestDateOfBirth.getDate() - 1);
  const maxDateOfBirth = formatDateInputValue(latestDateOfBirth);
  const handlePhotoChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || file.size > 2 * 1024 * 1024) {
      setError(t('employeePhotoInvalid'));
      event.target.value = '';
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setProfilePhoto(reader.result);
        setError('');
      }
    };
    reader.onerror = () => setError(t('employeePhotoReadFailed'));
    reader.readAsDataURL(file);
  };

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    const salary = Number(monthlySalary);
    if (!dateOfBirth || dateOfBirth >= today) {
      setError(t('employeeDateOfBirthPastRequired'));
      return;
    }
    if (![evcPlusPhone, zaadPhone, sahalPhone].some((value) => value.trim())) {
      setError(t('employeePayrollNumberRequired'));
      return;
    }
    if (
      !name.trim() ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) ||
      !phone.trim() ||
      !gender ||
      !address.trim() ||
      !Number.isFinite(salary) ||
      salary <= 0 ||
      (password.length > 0 && password.length < 12)
    ) {
      setError(password.length > 0 && password.length < 12
        ? t('staffInvalidDetails')
        : t('employeeRequiredFieldsError'));
      return;
    }

    setError('');
    void onSave({
      name: name.trim(),
      email: email.trim(),
      phone: phone.trim(),
      monthlySalary: salary,
      address: address.trim(),
      dateOfBirth,
      employeeDetails: {
        ...existingDetails,
        gender,
        serialNumber: employeeNumber.trim(),
        jobTitle: jobTitle.trim(),
        department: department.trim(),
        employmentStartDate,
        employmentStatus,
        photo: profilePhoto.trim(),
        evcPlusPhone: evcPlusPhone.trim(),
        zaadPhone: zaadPhone.trim(),
        sahalPhone: sahalPhone.trim(),
      },
      role,
      active,
      ...(password ? { password } : {}),
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-3 backdrop-blur-sm sm:p-6">
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="employee-form-title"
        className="flex max-h-[90dvh] w-full max-w-xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-slate-800 dark:bg-slate-900"
      >
        <header className="flex shrink-0 items-center justify-between border-b border-slate-100 px-4 py-3 dark:border-slate-800 sm:px-6">
          <div>
            <p className="text-[9px] font-bold uppercase tracking-[0.18em] text-emerald-600">
              {t('navEmployees')}
            </p>
            <h2 id="employee-form-title" className="mt-0.5 text-base font-bold text-slate-900 dark:text-white">
              {t(editingUser ? 'employeeEditAccount' : 'employeeCreateTitle')}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('close')}
            className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        <form id="employee-form" onSubmit={handleSubmit} className="min-h-0 flex-1 overflow-y-auto">
          <div className="space-y-3 p-4 sm:p-5">
            <div>
              <h3 className="text-xs font-bold text-slate-900 dark:text-white">{t('employeeGeneralInformation')}</h3>
              <p className="mt-0.5 text-[10px] text-slate-500">{t('employeeFormDescription')}</p>
            </div>

            {error && (
              <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[10px] font-medium text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300">
                {error}
              </p>
            )}

            <label className={labelClass}>
              <span className="mb-1.5 block">{t('employeeFullName')} *</span>
              <input
                autoFocus
                required
                type="text"
                maxLength={120}
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder={t('staffFullNamePlaceholder')}
                className={inputClass}
              />
            </label>

            <div className="grid grid-cols-2 gap-2.5">
              <label className={labelClass}>
                <span className="mb-1 flex items-center gap-1">
                  <Phone className="h-3 w-3 text-slate-400" />{t('staffPhone')} *
                </span>
                <input
                  required
                  type="tel"
                  maxLength={40}
                  value={phone}
                  onChange={(event) => setPhone(event.target.value)}
                  placeholder={t('staffPhonePlaceholder')}
                  className={inputClass}
                />
              </label>
              <label className={labelClass}>
                <span className="mb-1 flex items-center gap-1">
                  <Mail className="h-3 w-3 text-slate-400" />{t('staffEmail')} *
                </span>
                <input
                  required
                  type="email"
                  maxLength={254}
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder={t('staffEmailPlaceholder')}
                  className={inputClass}
                />
              </label>
            </div>

            <div className="grid grid-cols-2 gap-2.5">
              <label className={labelClass}>
                <span className="mb-1.5 block">{editingUser ? t('employeeNewPassword') : t('employeePassword')}</span>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    minLength={password ? 12 : undefined}
                    maxLength={128}
                    autoComplete="new-password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    placeholder={t('employeePasswordOptional')}
                    className={`${inputClass} pr-10`}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((visible) => !visible)}
                    aria-label={showPassword ? t('hidePassword') : t('showPassword')}
                    title={showPassword ? t('hidePassword') : t('showPassword')}
                    className="absolute inset-y-0 right-3 flex items-center text-slate-400 transition hover:text-slate-700 dark:hover:text-slate-200"
                  >
                    {showPassword
                      ? <EyeOff className="h-4 w-4" />
                      : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                <span className="mt-1 block text-[9px] font-normal text-slate-500">{t('employeePasswordHelp')}</span>
              </label>
              <label className={labelClass}>
                <span className="mb-1.5 block">{t('staffSalary')} ({AppStore.getSettings().currency}) *</span>
                <input
                  required
                  type="number"
                  min="0.01"
                  max="1000000000"
                  step="0.01"
                  value={monthlySalary}
                  onChange={(event) => setMonthlySalary(event.target.value)}
                  placeholder="0.00"
                  className={inputClass}
                />
              </label>
            </div>

            <section className="space-y-2 rounded-xl border border-slate-200 p-3 dark:border-slate-700">
              <div>
                <h3 className="text-[10px] font-bold text-slate-900 dark:text-white">{t('employeePayrollNumbers')} *</h3>
                <p className="mt-0.5 text-[9px] font-normal text-slate-500">{t('employeePayrollNumbersHelp')}</p>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <label className={labelClass}>
                  <span className="mb-1 block text-[9px]">{t('payrollMethodevc_plus')}</span>
                  <input type="tel" maxLength={40} value={evcPlusPhone} onChange={(event) => setEvcPlusPhone(event.target.value)} placeholder={t('staffPhonePlaceholder')} className={inputClass} />
                </label>
                <label className={labelClass}>
                  <span className="mb-1 block text-[9px]">{t('payrollMethodzaad')}</span>
                  <input type="tel" maxLength={40} value={zaadPhone} onChange={(event) => setZaadPhone(event.target.value)} placeholder={t('staffZaadPhonePlaceholder')} className={inputClass} />
                </label>
                <label className={labelClass}>
                  <span className="mb-1 block text-[9px]">{t('payrollMethodsahal')}</span>
                  <input type="tel" maxLength={40} value={sahalPhone} onChange={(event) => setSahalPhone(event.target.value)} placeholder={t('staffSahalPhonePlaceholder')} className={inputClass} />
                </label>
              </div>
            </section>

            <label className={labelClass}>
              <span className="mb-1.5 block">{t('staffAddress')} *</span>
              <textarea
                required
                maxLength={500}
                rows={2}
                value={address}
                onChange={(event) => setAddress(event.target.value)}
                placeholder={t('staffAddressPlaceholder')}
                className={`${inputClass} resize-y`}
              />
            </label>

            <div className="grid grid-cols-2 gap-2.5">
              <label className={labelClass}>
                <span className="mb-1.5 block">{t('employeeNumber')}</span>
                <input type="text" maxLength={60} value={employeeNumber} onChange={(event) => setEmployeeNumber(event.target.value)} className={inputClass} />
              </label>
              <label className={labelClass}>
                <span className="mb-1.5 block">{t('employeeJobTitle')}</span>
                <input type="text" maxLength={120} value={jobTitle} onChange={(event) => setJobTitle(event.target.value)} className={inputClass} />
              </label>
              <label className={labelClass}>
                <span className="mb-1.5 block">{t('employeeDepartment')}</span>
                <input type="text" maxLength={120} value={department} onChange={(event) => setDepartment(event.target.value)} className={inputClass} />
              </label>
              <label className={labelClass}>
                <span className="mb-1.5 block">{t('employeeEmploymentStartDate')}</span>
                <input type="date" value={employmentStartDate} onChange={(event) => setEmploymentStartDate(event.target.value)} className={inputClass} />
              </label>
              <label className={labelClass}>
                <span className="mb-1.5 block">{t('employeeEmploymentStatus')}</span>
                <select value={employmentStatus} onChange={(event) => setEmploymentStatus(event.target.value as EmployeeDetails['employmentStatus'])} className={inputClass}>
                  <option value="active">{t('employeeActive')}</option>
                  <option value="on_leave">{t('employeeLeave')}</option>
                  <option value="terminated">{t('employeeTerminated')}</option>
                </select>
              </label>
              <label className={labelClass}>
                <span className="mb-1.5 block">{t('employeeProfilePhoto')}</span>
                <input type="file" accept="image/png,image/jpeg,image/webp" onChange={handlePhotoChange} className={inputClass} />
                <span className="mt-1 block text-[9px] font-normal text-slate-500">{t('employeePhotoHelp')}</span>
              </label>
            </div>
            {profilePhoto && (
              <img src={profilePhoto} alt="Employee profile preview" className="h-16 w-16 rounded-full border border-slate-200 object-cover dark:border-slate-700" />
            )}

            <div className="grid grid-cols-2 gap-2.5">
              <label className={labelClass}>
                <span className="mb-1.5 block">{t('employeeGender')} *</span>
                <select required value={gender} onChange={(event) => setGender(event.target.value as EmployeeDetails['gender'])} className={inputClass}>
                  <option value="">{t('select')}</option>
                  <option value="female">{t('employeeFemale')}</option>
                  <option value="male">{t('employeeMale')}</option>
                </select>
              </label>
              <label className={labelClass}>
                <span className="mb-1.5 block">{t('employeeDateOfBirth')} *</span>
                <input
                  required
                  type="date"
                  max={maxDateOfBirth}
                  value={dateOfBirth}
                  onChange={(event) => setDateOfBirth(event.target.value)}
                  className={inputClass}
                />
              </label>
            </div>

            <div className="grid grid-cols-2 gap-2.5">
              <label className={labelClass}>
                <span className="mb-1.5 block">{t('staffSecurityRole')} *</span>
                <select required value={role} onChange={(event) => setRole(event.target.value as RoleType)} className={inputClass}>
                  {canManageUsers ? (
                    <>
                      <option value="cashier">Cashier (POS &amp; Receipts)</option>
                      <option value="manager">Store Manager (Inventory &amp; Purchases)</option>
                      <option value="accountant">Accountant (Ledgers &amp; Debts)</option>
                      <option value="employee">Employee</option>
                    </>
                  ) : (
                    <option value="employee">Employee</option>
                  )}
                </select>
              </label>
              <label className={labelClass}>
                <span className="mb-1.5 block">{t('employeeActive')}</span>
                <select value={active ? 'active' : 'inactive'} onChange={(event) => setActive(event.target.value === 'active')} className={inputClass}>
                  <option value="active">{t('employeeActive')}</option>
                  {canManageUsers && <option value="inactive">{t('employeeInactive')}</option>}
                </select>
              </label>
            </div>
          </div>
        </form>
        <footer className="flex shrink-0 justify-end gap-2 border-t border-slate-100 bg-slate-50 px-4 py-3 dark:border-slate-800 dark:bg-slate-900 sm:px-5">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg bg-slate-100 px-3 py-2 text-[10px] font-semibold text-slate-700 transition hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
          >
            {t('cancel')}
          </button>
          <button
            type="submit"
            form="employee-form"
            disabled={isSaving}
            className="rounded-lg bg-emerald-600 px-3 py-2 text-[10px] font-bold text-white shadow-sm transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSaving ? t('saving') : editingUser ? t('saveChanges') : t('employeeCreateTitle')}
          </button>
        </footer>
      </section>
    </div>
  );
};
