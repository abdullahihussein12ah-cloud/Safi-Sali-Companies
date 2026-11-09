import React, { useEffect, useMemo, useState } from 'react';
import {
  Activity,
  BadgeCheck,
  Building2,
  CalendarClock,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  CircleX,
  Clock3,
  CreditCard,
  FileClock,
  KeyRound,
  LogOut,
  Pencil,
  RotateCcw,
  RefreshCw,
  Save,
  Search,
  ShieldCheck,
  Trash2,
  Users,
  X,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import {
  getPlatformBusinessActivity,
  getPlatformDashboard,
  getPlatformLicenseAudit,
  getPlatformSubscriptionPlans,
  decidePlatformLicenseRequest,
  deletePlatformUser,
  getStoredAccessToken,
  getPlatformUserActivity,
  getPlatformUsers,
  permanentlyDeletePlatformUser,
  restorePlatformUser,
  managePlatformLicense,
  updatePlatformUser,
  updatePlatformSubscriptionPlan,
} from '../../services/api';
import { AppStore } from '../../services/store';
import {
  BusinessTeamSale,
  PlatformBusiness,
  PlatformLicenseAuditEvent,
  PlatformLicenseVerification,
  PlatformUser,
  PlatformUserActivity,
  SubscriptionPlanSettings,
} from '../../types';

type LicenseSection =
  | 'all'
  | 'pending'
  | 'verification'
  | 'approved'
  | 'rejected'
  | 'active'
  | 'expired'
  | 'history';

type AdminSection = 'subscriptions' | 'plan-settings' | 'license-audit' | 'users' | 'recycling' | 'activity';

const formatDate = (value: string): string => value ? value.replace('T', ' ').slice(0, 16) : '—';

const formatPaidAmount = (amount: number): string => `$${amount.toFixed(2)}`;

const PlatformLicenseAudit: React.FC = () => {
  const [events, setEvents] = useState<PlatformLicenseAuditEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let mounted = true;
    const token = getStoredAccessToken();
    if (!token) {
      setError('Sign in again to view license audit history.');
      setLoading(false);
      return () => { mounted = false; };
    }
    setLoading(true);
    setError('');
    getPlatformLicenseAudit(token)
      .then((result) => {
        if (mounted) setEvents(result);
      })
      .catch((loadError: Error) => {
        if (mounted) setError(loadError.message);
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });
    return () => { mounted = false; };
  }, [refreshKey]);

  return (
    <section className="overflow-hidden rounded-3xl border border-slate-800 bg-slate-900">
      <header className="flex items-center justify-between border-b border-slate-800 p-4">
        <div>
          <h2 className="text-sm font-bold">License audit history</h2>
          <p className="mt-1 text-xs text-slate-400">Immutable payment and administrator license actions.</p>
        </div>
        <button type="button" onClick={() => setRefreshKey((key) => key + 1)} className="rounded-lg border border-slate-700 px-3 py-2 text-xs font-bold hover:border-emerald-500">
          Refresh
        </button>
      </header>
      {error && <p role="alert" className="m-4 rounded-lg bg-rose-950/60 p-3 text-xs text-rose-200">{error}</p>}
      {loading ? (
        <p className="p-6 text-sm text-slate-400">Loading license history…</p>
      ) : events.length ? (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-left text-xs">
            <thead className="bg-slate-950/70 text-[10px] uppercase tracking-wider text-slate-400">
              <tr><th className="px-4 py-3">Date</th><th className="px-4 py-3">Business</th><th className="px-4 py-3">Action</th><th className="px-4 py-3">Administrator</th><th className="px-4 py-3">Request ID</th></tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {events.map((event) => (
                <tr key={event.id}>
                  <td className="px-4 py-3">{formatDate(event.occurredAt)}</td>
                  <td className="px-4 py-3 font-mono">{event.tenantId}</td>
                  <td className="px-4 py-3 font-semibold">{event.action.split('_').join(' ')}</td>
                  <td className="px-4 py-3">{event.actorName || event.actorId}</td>
                  <td className="px-4 py-3 font-mono">{event.requestId || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : <p className="p-6 text-sm text-slate-400">No license audit events yet.</p>}
    </section>
  );
};

const PlatformPlanSettings: React.FC = () => {
  const [plans, setPlans] = useState<SubscriptionPlanSettings[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingPlanId, setSavingPlanId] = useState('');
  const [error, setError] = useState('');

  const loadPlans = async () => {
    const token = getStoredAccessToken();
    if (!token) throw new Error('Sign in again to manage subscription plans.');
    const result = await getPlatformSubscriptionPlans(token);
    setPlans(result);
  };

  useEffect(() => {
    let mounted = true;
    const token = getStoredAccessToken();
    if (!token) {
      setError('Sign in again to manage subscription plans.');
      setLoading(false);
      return () => { mounted = false; };
    }
    getPlatformSubscriptionPlans(token)
      .then((result) => {
        if (mounted) setPlans(result);
      })
      .catch((loadError: Error) => {
        if (mounted) setError(loadError.message);
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });
    return () => { mounted = false; };
  }, []);

  const updatePlanField = (
    planId: string,
    field: 'name' | 'priceUSD' | 'durationDays' | 'userLimit' | 'productLimit',
    value: string
  ) => {
    setPlans((current) => current.map((plan) => {
      if (plan.id !== planId) return plan;
      if (field === 'name') return { ...plan, name: value };
      if (field === 'userLimit' || field === 'productLimit') {
        const cleaned = value.trim();
        if (cleaned.toLowerCase() === 'unlimited') return { ...plan, [field]: null };
        const limit = cleaned ? Number(cleaned) : -1;
        return { ...plan, [field]: Number.isSafeInteger(limit) && limit > 0 ? limit : -1 };
      }
      const number = Number(value);
      return { ...plan, [field]: Number.isFinite(number) ? number : 0 };
    }));
  };

  const savePlan = async (plan: SubscriptionPlanSettings) => {
    const token = getStoredAccessToken();
    if (!token) {
      setError('Sign in again to manage subscription plans.');
      return;
    }
    setSavingPlanId(plan.id);
    setError('');
    try {
      await updatePlatformSubscriptionPlan(token, plan);
      await loadPlans();
      setError('');
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'The subscription plan could not be saved.');
    } finally {
      setSavingPlanId('');
    }
  };

  return (
    <section className="space-y-4 rounded-3xl border border-slate-800 bg-slate-900 p-4 sm:p-6">
      <header>
        <h2 className="text-sm font-bold">Subscription plan settings</h2>
        <p className="mt-1 text-xs text-slate-400">Changes are saved to the database and applied immediately to server-side account limits.</p>
      </header>
      {error && <p role="alert" className="rounded-lg bg-rose-950/60 p-3 text-xs text-rose-200">{error}</p>}
      {loading ? (
        <p className="text-sm text-slate-400">Loading plans…</p>
      ) : plans.length === 0 ? (
        <p className="text-sm text-slate-400">No subscription plans are configured.</p>
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {plans.map((plan) => (
            <article key={plan.id} className="space-y-3 rounded-2xl border border-slate-800 bg-slate-950/60 p-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="space-y-1 text-[10px] font-bold uppercase text-slate-400 sm:col-span-2">
                  Plan name
                  <input value={plan.name} onChange={(event) => updatePlanField(plan.id, 'name', event.target.value)} className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-xs font-semibold normal-case text-white" />
                </label>
                <label className="space-y-1 text-[10px] font-bold uppercase text-slate-400">
                  Price (USD)
                  <input type="number" min="0" step="0.01" disabled={plan.id === 'plan-trial'} value={plan.priceUSD} onChange={(event) => updatePlanField(plan.id, 'priceUSD', event.target.value)} className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-xs font-semibold normal-case text-white disabled:opacity-50" />
                </label>
                <label className="space-y-1 text-[10px] font-bold uppercase text-slate-400">
                  Duration (days)
                  <input type="number" min="0" step="1" value={plan.durationDays} disabled={plan.id === 'plan-trial' || plan.id === 'plan-lifetime'} onChange={(event) => updatePlanField(plan.id, 'durationDays', event.target.value)} className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-xs font-semibold normal-case text-white disabled:opacity-50" />
                </label>
                <label className="space-y-1 text-[10px] font-bold uppercase text-slate-400">
                  User limit
                  <input value={plan.userLimit ?? 'Unlimited'} onChange={(event) => updatePlanField(plan.id, 'userLimit', event.target.value)} className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-xs font-semibold normal-case text-white" />
                </label>
                <label className="space-y-1 text-[10px] font-bold uppercase text-slate-400">
                  Product limit
                  <input value={plan.productLimit ?? 'Unlimited'} onChange={(event) => updatePlanField(plan.id, 'productLimit', event.target.value)} className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-xs font-semibold normal-case text-white" />
                </label>
              </div>
              <div className="flex items-center justify-between gap-3 border-t border-slate-800 pt-3">
                <span className="font-mono text-[10px] text-slate-500">{plan.id}</span>
                <button type="button" disabled={savingPlanId === plan.id} onClick={() => void savePlan(plan)} className="rounded-lg bg-emerald-700 px-3 py-2 text-[10px] font-bold text-white disabled:opacity-50">
                  {savingPlanId === plan.id ? 'Saving…' : 'Save plan'}
                </button>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
};

const roleLabel: Record<string, string> = {
  super_admin: 'Administrator',
  admin: 'Super Admin',
  business_owner: 'Super Admin',
  business_admin: 'Business Admin',
  cashier: 'Cashier',
  accountant: 'Accountant',
  manager: 'Manager',
  branch_manager: 'Branch Manager',
  inventory_manager: 'Inventory Manager',
  hr_manager: 'HR Manager',
  employee: 'Employee',
};

const PlatformUserManagement: React.FC<{
  section: Exclude<AdminSection, 'subscriptions' | 'plan-settings' | 'license-audit'>;
}> = ({ section }) => {
  const { showToast } = useApp();
  const [users, setUsers] = useState<PlatformUser[]>([]);
  const [events, setEvents] = useState<PlatformUserActivity[]>([]);
  const [search, setSearch] = useState('');
  const [role, setRole] = useState('');
  const [status, setStatus] = useState<'' | 'active' | 'inactive'>('');
  const [page, setPage] = useState(1);
  const [pageCount, setPageCount] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [actionId, setActionId] = useState('');
  const [editingUser, setEditingUser] = useState<PlatformUser | null>(null);
  const [editForm, setEditForm] = useState({ name: '', email: '', phone: '', role: '', active: true });

  useEffect(() => {
    let mounted = true;
    const token = getStoredAccessToken();
    if (!token) {
      setError('Sign in again to manage platform users.');
      setLoading(false);
      return () => { mounted = false; };
    }

    setLoading(true);
    setError('');
    const load = section === 'activity'
      ? getPlatformUserActivity(token, page).then((result) => {
          if (!mounted) return;
          setEvents(result.events);
          setTotal(result.pagination.total);
          setPageCount(result.pagination.pageCount);
        })
      : getPlatformUsers(token, section === 'recycling' ? 'deleted' : 'active', page, search, role, status)
          .then((result) => {
            if (!mounted) return;
            setUsers(result.users);
            setTotal(result.pagination.total);
            setPageCount(result.pagination.pageCount);
          });
    load
      .catch((loadError: Error) => {
        if (!mounted) return;
        setError(loadError.message);
        setUsers([]);
        setEvents([]);
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });

    return () => { mounted = false; };
  }, [section, page, search, role, status]);

  const runUserAction = async (user: PlatformUser, action: 'delete' | 'restore' | 'permanent') => {
    const message = action === 'permanent'
      ? `Permanently remove ${user.name}? This cannot be undone.`
      : action === 'delete'
        ? `Move ${user.name} to the Recycling Bin?`
        : `Restore ${user.name}'s account?`;
    if (!window.confirm(message)) return;
    const token = getStoredAccessToken();
    if (!token) {
      setError('Sign in again to manage platform users.');
      return;
    }
    setActionId(user.id);
    setError('');
    try {
      if (action === 'delete') await deletePlatformUser(token, user.id);
      else if (action === 'restore') await restorePlatformUser(token, user.id);
      else await permanentlyDeletePlatformUser(token, user.id);
      showToast(
        action === 'delete'
          ? 'User moved to the Recycling Bin.'
          : action === 'restore'
            ? 'User account restored.'
            : 'User permanently deleted.',
        'success'
      );
      const result = await getPlatformUsers(token, section === 'recycling' ? 'deleted' : 'active', page, search, role, status);
      setUsers(result.users);
      setTotal(result.pagination.total);
      setPageCount(result.pagination.pageCount);
      if (!result.users.length && page > 1) setPage((current) => current - 1);
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : 'The user action could not be completed.');
    } finally {
      setActionId('');
    }
  };

  const openEditUser = (user: PlatformUser) => {
    setEditingUser(user);
    setEditForm({
      name: user.name,
      email: user.email,
      phone: user.phone || '',
      role: user.role || '',
      active: user.active,
    });
    setError('');
  };

  const saveUserChanges = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!editingUser) return;
    const token = getStoredAccessToken();
    if (!token) {
      setError('Sign in again to manage platform users.');
      return;
    }
    setActionId(editingUser.id);
    setError('');
    try {
      const updatedUser = await updatePlatformUser(token, editingUser.id, {
        ...editForm,
        phone: editForm.phone.trim(),
      });
      setUsers((current) => current.map((user) => user.id === updatedUser.id ? updatedUser : user));
      setEditingUser(null);
      showToast('User details updated.', 'success');
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'The user could not be updated.');
    } finally {
      setActionId('');
    }
  };

  const roleOptions = [
    ['super_admin', 'Administrator'],
    ['admin', 'Super Admin'],
    ['business_owner', 'Super Admin'],
    ['business_admin', 'Business Admin'],
    ['cashier', 'Cashier'],
    ['accountant', 'Accountant'],
    ['manager', 'Manager'],
    ['branch_manager', 'Branch Manager'],
    ['inventory_manager', 'Inventory Manager'],
    ['hr_manager', 'HR Manager'],
    ['employee', 'Employee'],
  ];

  return (
    <section className="min-w-0 overflow-hidden rounded-3xl border border-slate-800 bg-slate-900">
      <header className="flex flex-col gap-3 border-b border-slate-800 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-sm font-bold">
            {section === 'users' ? 'All registered users' : section === 'recycling' ? 'User Recycling Bin' : 'User activity history'}
          </h2>
          <p className="mt-1 text-xs text-slate-400">{total} {section === 'activity' ? 'audit events' : 'accounts'}</p>
        </div>
        {section !== 'activity' && (
          <div className="flex flex-col gap-2 sm:flex-row">
            <label className="relative">
              <span className="sr-only">Search users</span>
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
              <input
                value={search}
                onChange={(event) => { setSearch(event.target.value); setPage(1); }}
                placeholder="Search name, email or business"
                className="min-h-10 w-full rounded-xl border border-slate-700 bg-slate-950 pl-9 pr-3 text-xs text-white outline-none focus:border-emerald-500 sm:w-64"
              />
            </label>
            <label>
              <span className="sr-only">Filter by role</span>
              <select
                value={role}
                onChange={(event) => { setRole(event.target.value); setPage(1); }}
                className="min-h-10 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 text-xs text-white sm:w-48"
              >
                <option value="">All roles</option>
                {roleOptions.map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </label>
            <label>
              <span className="sr-only">Filter by account status</span>
              <select
                value={status}
                onChange={(event) => { setStatus(event.target.value as '' | 'active' | 'inactive'); setPage(1); }}
                className="min-h-10 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 text-xs text-white sm:w-36"
              >
                <option value="">All statuses</option>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
            </label>
          </div>
        )}
      </header>

      {error && <p role="alert" className="border-b border-rose-900 bg-rose-950/40 p-3 text-xs text-rose-200">{error}</p>}
      {loading ? (
        <p className="p-6 text-sm text-slate-400">Loading…</p>
      ) : section === 'activity' ? (
        events.length ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-xs">
              <thead className="bg-slate-950/70 text-slate-400">
                <tr><th className="p-3">Date</th><th className="p-3">Action</th><th className="p-3">User</th><th className="p-3">Role</th><th className="p-3">Administrator</th><th className="p-3">Business</th></tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {events.map((event) => (
                  <tr key={event.id}>
                    <td className="whitespace-nowrap p-3">{formatDate(event.occurredAt)}</td>
                    <td className="p-3 font-semibold">{event.action.replaceAll('_', ' ')}</td>
                    <td className="p-3">{event.targetName}<span className="block text-slate-500">{event.targetEmail}</span></td>
                    <td className="p-3">{roleLabel[event.targetRole] || event.targetRole}</td>
                    <td className="p-3">{event.actorName || event.actorId}</td>
                    <td className="p-3">{event.tenantId}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <p className="p-6 text-sm text-slate-400">No user activity recorded.</p>
      ) : users.length ? (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[980px] text-left text-xs">
            <thead className="bg-slate-950/70 text-slate-400">
              <tr>
                <th className="p-3">Name</th>
                <th className="p-3">Phone Number</th>
                <th className="p-3">Email Address / Login</th>
                <th className="p-3">POS Security Role</th>
                <th className="p-3">Status</th>
                <th className="p-3">Created</th>
                <th className="p-3">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {users.map((user) => (
                <tr key={user.id} className="align-top">
                  <td className="p-3 font-semibold text-white">{user.name || '—'}</td>
                  <td className="p-3 whitespace-nowrap">{user.phone || '—'}</td>
                  <td className="p-3 break-all">{user.email || '—'}</td>
                  <td className="p-3">
                    <span className="inline-flex rounded-full bg-indigo-950 px-2.5 py-1 text-[10px] font-bold text-indigo-200">
                      {roleLabel[user.role] || user.role?.replaceAll('_', ' ') || 'Unassigned'}
                    </span>
                    <span className="mt-1 block text-slate-500">{user.businessName || user.tenantId}</span>
                  </td>
                  <td className="p-3">
                    <span className={`rounded-full px-2 py-1 text-[10px] font-bold ${user.active ? 'bg-emerald-950 text-emerald-300' : 'bg-slate-800 text-slate-300'}`}>
                      {user.active ? 'Active' : 'Inactive'}
                    </span>
                    {section === 'recycling' && (
                      <span className="mt-1 block text-slate-500">
                        Deleted {formatDate(user.deletedAt)} by {user.deletedByName || user.deletedBy || '—'}
                      </span>
                    )}
                  </td>
                  <td className="p-3">
                    {formatDate(user.createdAt)}
                    <span className="block text-slate-500">By {user.createdByName || user.createdBy || '—'}</span>
                  </td>
                  <td className="p-3">
                    {section === 'users' ? (
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          disabled={actionId === user.id}
                          onClick={() => openEditUser(user)}
                          className="inline-flex min-h-8 items-center gap-1 rounded-lg bg-sky-950 px-2 text-[10px] font-bold text-sky-200 hover:bg-sky-900 disabled:opacity-50"
                        >
                          <Pencil className="h-3 w-3" /> Edit
                        </button>
                        <button
                          type="button"
                          disabled={actionId === user.id}
                          onClick={() => void runUserAction(user, 'delete')}
                          className="inline-flex min-h-8 items-center gap-1 rounded-lg bg-rose-950 px-2 text-[10px] font-bold text-rose-200 hover:bg-rose-900 disabled:opacity-50"
                        >
                          <Trash2 className="h-3 w-3" /> Delete
                        </button>
                      </div>
                    ) : (
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          disabled={actionId === user.id}
                          onClick={() => void runUserAction(user, 'restore')}
                          className="inline-flex min-h-8 items-center gap-1 rounded-lg bg-emerald-950 px-2 text-[10px] font-bold text-emerald-200 hover:bg-emerald-900 disabled:opacity-50"
                        >
                          <RotateCcw className="h-3 w-3" /> Restore
                        </button>
                        <button
                          type="button"
                          disabled={actionId === user.id}
                          onClick={() => void runUserAction(user, 'permanent')}
                          className="inline-flex min-h-8 items-center gap-1 rounded-lg bg-rose-950 px-2 text-[10px] font-bold text-rose-200 hover:bg-rose-900 disabled:opacity-50"
                        >
                          <Trash2 className="h-3 w-3" /> Permanently delete
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : <p className="p-6 text-sm text-slate-400">{section === 'recycling' ? 'The Recycling Bin is empty.' : 'No users match these filters.'}</p>}

      {!loading && pageCount > 1 && (
        <footer className="flex items-center justify-end gap-3 border-t border-slate-800 p-3 text-xs">
          <button type="button" onClick={() => setPage((current) => Math.max(1, current - 1))} disabled={page <= 1} className="rounded-lg border border-slate-700 p-2 disabled:opacity-40">Previous</button>
          <span>{page} / {pageCount}</span>
          <button type="button" onClick={() => setPage((current) => Math.min(pageCount, current + 1))} disabled={page >= pageCount} className="rounded-lg border border-slate-700 p-2 disabled:opacity-40">Next</button>
        </footer>
      )}
      {editingUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4" role="presentation">
          <form
            onSubmit={(event) => void saveUserChanges(event)}
            className="w-full max-w-lg space-y-4 rounded-2xl border border-slate-700 bg-slate-900 p-5 shadow-2xl"
            aria-labelledby="edit-platform-user-title"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 id="edit-platform-user-title" className="text-base font-bold text-white">Edit user</h3>
                <p className="mt-1 text-xs text-slate-400">Update account details, POS role, and status.</p>
              </div>
              <button type="button" onClick={() => setEditingUser(null)} className="rounded-lg p-2 text-slate-400 hover:bg-slate-800" aria-label="Close edit form">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="space-y-1 text-xs text-slate-300">
                <span>Name</span>
                <input required maxLength={120} value={editForm.name} onChange={(event) => setEditForm({ ...editForm, name: event.target.value })} className="min-h-10 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 text-white" />
              </label>
              <label className="space-y-1 text-xs text-slate-300">
                <span>Phone Number</span>
                <input type="tel" inputMode="tel" autoComplete="tel" maxLength={40} value={editForm.phone} onChange={(event) => setEditForm({ ...editForm, phone: event.target.value })} className="min-h-10 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 text-white" />
              </label>
              <label className="space-y-1 text-xs text-slate-300 sm:col-span-2">
                <span>Email Address / Login</span>
                <input required type="email" maxLength={254} value={editForm.email} onChange={(event) => setEditForm({ ...editForm, email: event.target.value })} className="min-h-10 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 text-white" />
              </label>
              <label className="space-y-1 text-xs text-slate-300">
                <span>POS Security Role</span>
                <select required value={editForm.role} onChange={(event) => setEditForm({ ...editForm, role: event.target.value })} className="min-h-10 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 text-white">
                  {roleOptions.filter(([value]) => value !== 'super_admin' || editingUser.role === 'super_admin').map(([value, label]) => (
                    <option key={value} value={value}>{label}</option>
                  ))}
                </select>
              </label>
              <label className="space-y-1 text-xs text-slate-300">
                <span>Account Status</span>
                <select value={editForm.active ? 'active' : 'inactive'} onChange={(event) => setEditForm({ ...editForm, active: event.target.value === 'active' })} className="min-h-10 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 text-white">
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                </select>
              </label>
            </div>
            {error && <p role="alert" className="rounded-lg bg-rose-950/60 p-3 text-xs text-rose-200">{error}</p>}
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setEditingUser(null)} className="rounded-lg border border-slate-700 px-4 py-2 text-xs font-bold text-slate-300">Cancel</button>
              <button type="submit" disabled={actionId === editingUser.id} className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-xs font-bold text-white hover:bg-emerald-500 disabled:opacity-50">
                <Save className="h-3.5 w-3.5" /> Save changes
              </button>
            </div>
          </form>
        </div>
      )}
    </section>
  );
};

export const SuperAdminPortal: React.FC = () => {
  const { activeUser, logout, t, showToast } = useApp();
  const [licenseSection, setLicenseSection] = useState<LicenseSection>('all');
  const [businesses, setBusinesses] = useState<PlatformBusiness[]>([]);
  const [loading, setLoading] = useState(true);
  const [dashboardError, setDashboardError] = useState('');
  const [search, setSearch] = useState('');
  const [selectedTenantId, setSelectedTenantId] = useState('');
  const [activityPage, setActivityPage] = useState(1);
  const [activity, setActivity] = useState<BusinessTeamSale[]>([]);
  const [activityTotal, setActivityTotal] = useState(0);
  const [activityLoading, setActivityLoading] = useState(false);
  const [activityError, setActivityError] = useState('');
  const [decisionRequestId, setDecisionRequestId] = useState('');
  const [licenseActionId, setLicenseActionId] = useState('');
  const [adminSection, setAdminSection] = useState<AdminSection>('subscriptions');

  const loadDashboard = async () => {
    const token = getStoredAccessToken();
    if (!token) {
      setDashboardError('Sign in again to view platform data.');
      setLoading(false);
      return;
    }

    setLoading(true);
    setDashboardError('');
    try {
      const result = await getPlatformDashboard(token);
      setBusinesses(result.businesses);
    } catch (error) {
      setDashboardError(error instanceof Error ? error.message : t('loadDashboardError'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadDashboard();
  }, []);

  useEffect(() => {
    if (!selectedTenantId) {
      setActivity([]);
      setActivityTotal(0);
      return;
    }
    let mounted = true;
    const token = getStoredAccessToken();
    if (!token) {
      setActivityError('Sign in again to view business activity.');
      return;
    }

    setActivityLoading(true);
    setActivityError('');
    getPlatformBusinessActivity(token, selectedTenantId, activityPage)
      .then((result) => {
        if (!mounted) return;
        setActivity(result.sales);
        setActivityTotal(result.pagination.total);
      })
      .catch((error: Error) => {
        if (!mounted) return;
        setActivityError(error.message);
        setActivity([]);
      })
      .finally(() => {
        if (mounted) setActivityLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, [selectedTenantId, activityPage]);

  const filteredBusinesses = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    if (!query) return businesses;
    return businesses.filter((business) =>
      [
        business.businessName,
        business.ownerName,
        business.ownerEmail,
        business.ownerPhone,
        business.plan?.name || '',
      ].some((value) => value.toLocaleLowerCase().includes(query))
    );
  }, [businesses, search]);

  const selectedBusiness = businesses.find((business) => business.tenantId === selectedTenantId);
  const activeSubscriptionCount = businesses.filter((business) => business.plan?.isActive).length;
  const totalPaid = businesses.reduce((total, business) => total + business.totalPaidUSD, 0);
  const currentPageCount = Math.max(1, Math.ceil(activityTotal / 50));
  const pendingRequests = filteredBusinesses.flatMap((business) =>
    business.pendingPaymentRequest
      ? [{ business, request: business.pendingPaymentRequest }]
      : []
  );
  const paymentHistoryRows = filteredBusinesses.flatMap((business) => {
    const recorded = business.verificationHistory || [];
    const recordedRequestIds = new Set(recorded.map((item) => item.requestId));
    const legacyApproved = business.payments
      .filter((payment) => !recordedRequestIds.has(payment.requestId))
      .map((payment) => ({
        requestId: payment.requestId,
        planId: payment.planId,
        planName: payment.planName,
        priceUSD: payment.priceUSD,
        trxId: payment.trxId,
        submittedAt: payment.submittedAt,
        decidedAt: payment.approvedAt,
        status: 'approved' as const,
        decidedBy: '',
      }));
    const rejectedFallback = business.rejectedPaymentRequest &&
      !recordedRequestIds.has(business.rejectedPaymentRequest.requestId)
      ? [business.rejectedPaymentRequest]
      : [];
    const pending = business.pendingPaymentRequest
      ? [{
          ...business.pendingPaymentRequest,
          decidedAt: business.pendingPaymentRequest.submittedAt,
          status: 'pending' as const,
          decidedBy: '',
        }]
      : [];
    return [...recorded, ...legacyApproved, ...rejectedFallback, ...pending]
      .map((verification) => ({ business, verification }));
  }).sort((left, right) => right.verification.decidedAt.localeCompare(left.verification.decidedAt));
  const businessRows = filteredBusinesses.filter((business) =>
    licenseSection === 'all' ||
    (licenseSection === 'active' && business.plan?.isActive) ||
    (licenseSection === 'expired' && business.plan?.status === 'EXPIRED')
  );
  const sectionItems: Array<{ id: LicenseSection; label: string; icon: React.ElementType }> = [
    { id: 'all', label: t('allLicenses'), icon: KeyRound },
    { id: 'pending', label: t('pendingPayments'), icon: Clock3 },
    { id: 'verification', label: t('paymentVerification'), icon: ShieldCheck },
    { id: 'approved', label: t('approvedPayments'), icon: CheckCircle2 },
    { id: 'rejected', label: t('rejectedPayments'), icon: CircleX },
    { id: 'active', label: t('activeLicenses'), icon: BadgeCheck },
    { id: 'expired', label: t('expiredLicenses'), icon: Clock3 },
    { id: 'history', label: t('verificationHistory'), icon: FileClock },
  ];

  const decidePayment = async (requestId: string, decision: 'approve' | 'reject') => {
    const token = getStoredAccessToken();
    if (!token) {
      setDashboardError(t('licenseSignInAgain'));
      return;
    }
    setDecisionRequestId(requestId);
    setDashboardError('');
    try {
      await decidePlatformLicenseRequest(token, requestId, decision);
      await loadDashboard();
      showToast(t('licenseDecisionSaved'), 'success');
    } catch (error) {
      setDashboardError(error instanceof Error ? error.message : t('licenseDecisionFailed'));
    } finally {
      setDecisionRequestId('');
    }
  };

  const runLicenseAction = async (
    business: PlatformBusiness,
    action: 'suspend' | 'reactivate' | 'extend'
  ) => {
    let days: number | undefined;
    if (action === 'extend') {
      const input = window.prompt('How many days should be added? (1–3650)', '30');
      if (input === null) return;
      days = Number(input);
      if (!Number.isInteger(days) || days < 1 || days > 3650) {
        showToast('Enter a whole number between 1 and 3650 days.', 'error');
        return;
      }
    }
    if (action !== 'extend' && !window.confirm(
      `${action === 'suspend' ? 'Suspend' : 'Reactivate'} ${business.businessName}'s license?`
    )) return;
    const token = getStoredAccessToken();
    if (!token) {
      setDashboardError('Sign in again to manage licenses.');
      return;
    }
    setLicenseActionId(`${business.tenantId}:${action}`);
    setDashboardError('');
    try {
      await managePlatformLicense(token, business.tenantId, action, days);
      await loadDashboard();
      showToast(`License ${action === 'extend' ? 'extended' : action === 'suspend' ? 'suspended' : 'reactivated'}.`, 'success');
    } catch (error) {
      setDashboardError(error instanceof Error ? error.message : 'The license action could not be completed.');
    } finally {
      setLicenseActionId('');
    }
  };

  const openBusinessActivity = (business: PlatformBusiness) => {
    setSelectedTenantId(business.tenantId);
    setActivityPage(1);
  };

  return (
    <main className="min-h-dvh bg-slate-950 px-3 py-5 text-slate-100 sm:px-6 lg:px-10">
      <div className="mx-auto max-w-7xl space-y-6">
        <header className="flex flex-col justify-between gap-4 rounded-3xl border border-slate-800 bg-slate-900 p-5 sm:flex-row sm:items-center sm:p-7">
          <div>
            <div className="mb-2 inline-flex items-center gap-2 rounded-full bg-emerald-500/10 px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-emerald-300">
              <ShieldCheck className="h-3.5 w-3.5" />
              {t('fullAccess')}
            </div>
            <h1 className="text-2xl font-black tracking-tight sm:text-3xl">{t('platformDashboard')}</h1>
            <p className="mt-1 text-sm text-slate-400">{t('platformDashboardDescription')}</p>
            <p className="mt-2 text-xs text-slate-500">{activeUser.name} · {activeUser.email}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void loadDashboard()}
              disabled={loading}
              className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-slate-700 px-4 text-xs font-bold hover:bg-slate-800 disabled:opacity-50"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              {t('refreshDashboard')}
            </button>
            <button
              type="button"
              onClick={logout}
              className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-rose-600 px-4 text-xs font-bold text-white hover:bg-rose-500"
            >
              <LogOut className="h-4 w-4" />
              {t('logout')}
            </button>
          </div>
        </header>

        {dashboardError && (
          <div role="alert" className="rounded-2xl border border-rose-800 bg-rose-950/50 p-4 text-sm text-rose-200">
            {dashboardError}
          </div>
        )}

        <nav className="grid grid-cols-2 gap-2 sm:grid-cols-4" aria-label="Administrator control panel">
          {([
            ['subscriptions', 'Subscriptions & plans'],
            ['plan-settings', 'Plan settings'],
            ['license-audit', 'License audit'],
            ['users', 'All users'],
            ['recycling', 'Recycling Bin'],
            ['activity', 'Activity history'],
          ] as Array<[AdminSection, string]>).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setAdminSection(id)}
              aria-pressed={adminSection === id}
              className={`min-h-11 rounded-xl border px-3 py-2 text-xs font-bold ${
                adminSection === id
                  ? 'border-emerald-500 bg-emerald-600 text-white'
                  : 'border-slate-700 bg-slate-900 text-slate-300 hover:bg-slate-800'
              }`}
            >
              {label}
            </button>
          ))}
        </nav>

        {adminSection === 'subscriptions' ? (
        <div className="grid gap-4 lg:grid-cols-[260px_minmax(0,1fr)]">
        <section className="h-fit rounded-3xl border border-slate-800 bg-slate-900 p-4 sm:p-5 lg:sticky lg:top-4">
          <div className="mb-3 flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-emerald-300">
            <ShieldCheck className="h-4 w-4" />
            {t('licenseManagement')}
          </div>
          <nav className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-1" aria-label={t('licenseManagement')}>
            {sectionItems.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                type="button"
                onClick={() => {
                  setLicenseSection(id);
                  setSelectedTenantId('');
                }}
                aria-pressed={licenseSection === id}
                className={`flex min-h-11 items-center gap-2 rounded-xl border px-3 py-2 text-left text-xs font-semibold transition ${
                  licenseSection === id
                    ? 'border-emerald-500 bg-emerald-600 text-white shadow-lg shadow-emerald-950/30'
                    : 'border-slate-700 bg-slate-950/50 text-slate-300 hover:border-emerald-700 hover:bg-slate-800'
                }`}
              >
                <Icon className="h-4 w-4 shrink-0" />
                <span>{label}</span>
                {(id === 'pending' || id === 'verification') && pendingRequests.length > 0 && (
                  <span className="ml-auto rounded-full bg-rose-600 px-1.5 py-0.5 text-[9px] font-black text-white">
                    {pendingRequests.length}
                  </span>
                )}
              </button>
            ))}
          </nav>
        </section>

        <div className="min-w-0 space-y-6">
        <section className="grid gap-3 sm:grid-cols-3">
          <article className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
            <div className="flex items-center justify-between text-xs font-bold uppercase tracking-wider text-slate-400">
              {t('registeredBusinesses')} <Building2 className="h-4 w-4 text-sky-400" />
            </div>
            <p className="mt-3 text-3xl font-black">{businesses.length}</p>
          </article>
          <article className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
            <div className="flex items-center justify-between text-xs font-bold uppercase tracking-wider text-slate-400">
              {t('activeSubscriptions')} <CreditCard className="h-4 w-4 text-emerald-400" />
            </div>
            <p className="mt-3 text-3xl font-black">{activeSubscriptionCount}</p>
          </article>
          <article className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
            <div className="flex items-center justify-between text-xs font-bold uppercase tracking-wider text-slate-400">
              {t('verifiedPayments')} <CreditCard className="h-4 w-4 text-amber-400" />
            </div>
            <p className="mt-3 text-3xl font-black">{formatPaidAmount(totalPaid)}</p>
          </article>
        </section>

        {['pending', 'verification'].includes(licenseSection) && (
          <section className="overflow-hidden rounded-3xl border border-slate-800 bg-slate-900">
            <header className="border-b border-slate-800 p-4">
              <h2 className="text-sm font-bold">{t(licenseSection === 'pending' ? 'pendingPayments' : 'paymentVerification')}</h2>
            </header>
            {pendingRequests.length === 0 ? (
              <p className="p-6 text-sm text-slate-400">{t('noPendingPayments')}</p>
            ) : (
              <div className="divide-y divide-slate-800">
                {pendingRequests.map(({ business, request }) => (
                  <article key={request.requestId} className="flex flex-col justify-between gap-4 p-4 sm:flex-row sm:items-center">
                    <div className="min-w-0">
                      <h3 className="text-sm font-bold text-white">{business.businessName}</h3>
                      <p className="mt-1 text-xs text-slate-400">{business.ownerName} · {business.ownerEmail}</p>
                      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-300">
                        <span>{t('licensePlan')}: {request.planName} ({formatPaidAmount(request.priceUSD)})</span>
                        <span>{t('transactionId')}: <span className="font-mono font-bold text-amber-300">{request.trxId}</span></span>
                        <span>{t('submittedAt')}: {formatDate(request.submittedAt)}</span>
                      </div>
                    </div>
                    {licenseSection === 'verification' && (
                      <div className="flex shrink-0 gap-2">
                        <button
                          type="button"
                          disabled={decisionRequestId === request.requestId || loading}
                          onClick={() => void decidePayment(request.requestId, 'approve')}
                          className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-emerald-600 px-4 text-xs font-bold text-white hover:bg-emerald-500 disabled:opacity-50"
                        >
                          <CheckCircle2 className="h-4 w-4" />
                          {decisionRequestId === request.requestId ? t('licenseProcessingPayment') : t('approvePayment')}
                        </button>
                        <button
                          type="button"
                          disabled={decisionRequestId === request.requestId || loading}
                          onClick={() => void decidePayment(request.requestId, 'reject')}
                          className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-rose-700 px-4 text-xs font-bold text-white hover:bg-rose-600 disabled:opacity-50"
                        >
                          <X className="h-4 w-4" />
                          {t('rejectPayment')}
                        </button>
                      </div>
                    )}
                  </article>
                ))}
              </div>
            )}
          </section>
        )}

        {['approved', 'rejected', 'history'].includes(licenseSection) && (
          <section className="overflow-hidden rounded-3xl border border-slate-800 bg-slate-900">
            <header className="border-b border-slate-800 p-4">
              <h2 className="text-sm font-bold">
                {t(licenseSection === 'approved' ? 'approvedPayments' : licenseSection === 'rejected' ? 'rejectedPayments' : 'verificationHistory')}
              </h2>
            </header>
            {(() => {
              const rows = paymentHistoryRows.filter(({ verification }) =>
                licenseSection === 'approved'
                  ? verification.status === 'approved'
                  : licenseSection === 'rejected'
                    ? verification.status === 'rejected'
                    : true
              );
              const emptyLabel = licenseSection === 'approved'
                ? 'noApprovedPayments'
                : licenseSection === 'rejected'
                  ? 'noRejectedPayments'
                  : 'noVerificationHistory';
              return rows.length === 0 ? (
                <p className="p-6 text-sm text-slate-400">{t(emptyLabel)}</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[850px] text-left text-xs">
                    <thead className="bg-slate-950/70 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                      <tr>
                        <th className="px-4 py-3">{t('platformBusiness')}</th>
                        <th className="px-4 py-3">{t('licensePlan')}</th>
                        <th className="px-4 py-3">{t('transactionId')}</th>
                        <th className="px-4 py-3">{t('submittedAt')}</th>
                        <th className="px-4 py-3">{t('decisionDate')}</th>
                        <th className="px-4 py-3">{t('decisionStatus')}</th>
                        <th className="px-4 py-3 text-right">{t('platformPaidAmount')}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800">
                      {rows.map(({ business, verification }) => (
                        <tr key={`${business.tenantId}-${verification.requestId}`} className="hover:bg-slate-800/40">
                          <td className="px-4 py-3 font-semibold text-white">{business.businessName}</td>
                          <td className="px-4 py-3">{verification.planName || verification.planId}</td>
                          <td className="px-4 py-3 font-mono">{verification.trxId || '—'}</td>
                          <td className="px-4 py-3">{formatDate(verification.submittedAt)}</td>
                          <td className="px-4 py-3">{formatDate(verification.decidedAt)}</td>
                          <td className="px-4 py-3">
                            <span className={`rounded-full px-2 py-1 text-[9px] font-bold uppercase ${
                              verification.status === 'approved'
                                ? 'bg-emerald-500/10 text-emerald-300'
                                : verification.status === 'rejected'
                                  ? 'bg-rose-500/10 text-rose-300'
                                  : 'bg-amber-500/10 text-amber-300'
                            }`}>{verification.status}</span>
                          </td>
                          <td className="px-4 py-3 text-right font-mono">{formatPaidAmount(verification.priceUSD)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              );
            })()}
          </section>
        )}

        {['all', 'active', 'expired'].includes(licenseSection) && (
        <section className="overflow-hidden rounded-3xl border border-slate-800 bg-slate-900">
          <div className="flex flex-col gap-3 border-b border-slate-800 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-sm font-bold">{t(licenseSection === 'active' ? 'activeLicenses' : licenseSection === 'expired' ? 'expiredLicenses' : 'allLicenses')}</h2>
              <p className="mt-1 text-[11px] text-slate-400">{t('platformDashboardDescription')}</p>
            </div>
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder={t('globalSearch')}
              aria-label={t('globalSearch')}
              className="min-h-10 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 text-xs outline-none focus:border-emerald-500 sm:max-w-xs"
            />
          </div>
          {loading && businesses.length === 0 ? (
            <p className="p-6 text-sm text-slate-400">{t('loadingTeamSales')}</p>
          ) : businessRows.length === 0 ? (
            <p className="p-6 text-sm text-slate-400">{t('noBusinesses')}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1000px] text-left text-xs">
                <thead className="bg-slate-950/70 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  <tr>
                    <th className="px-4 py-3">{t('platformBusiness')}</th>
                    <th className="px-4 py-3">{t('businessOwner')}</th>
                    <th className="px-4 py-3">{t('usersActive')}</th>
                    <th className="px-4 py-3">{t('subscription')}</th>
                    <th className="px-4 py-3">{t('platformPaidAmount')}</th>
                    <th className="px-4 py-3">{t('businessSales')}</th>
                    <th className="px-4 py-3"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {businessRows.map((business) => (
                    <tr
                      key={business.tenantId}
                      className={selectedTenantId === business.tenantId ? 'bg-slate-800/60' : 'hover:bg-slate-800/40'}
                    >
                      <td className="px-4 py-4">
                        <p className="font-bold text-white">{business.businessName}</p>
                        <p className="mt-1 font-mono text-[10px] text-slate-500">{business.tenantId}</p>
                      </td>
                      <td className="px-4 py-4">
                        <p className="font-semibold">{business.ownerName}</p>
                        <p className="mt-1 text-[10px] text-slate-400">{business.ownerEmail}</p>
                      </td>
                      <td className="px-4 py-4">
                        <span className="inline-flex items-center gap-1">
                          <Users className="h-3.5 w-3.5 text-slate-400" />
                          {business.userCount} / {business.activeUserCount}
                        </span>
                      </td>
                      <td className="px-4 py-4">
                        <p className="font-semibold">{business.plan?.name || '—'}</p>
                        <span className={`mt-1 inline-flex rounded-full px-2 py-0.5 text-[9px] font-bold uppercase ${
                          business.plan?.isActive
                            ? 'bg-emerald-500/10 text-emerald-300'
                            : 'bg-rose-500/10 text-rose-300'
                        }`}>
                          {business.plan?.status || 'NO PLAN'}
                        </span>
                        {business.plan?.expiryDate && (
                          <p className="mt-1 flex items-center gap-1 text-[10px] text-slate-500">
                            <CalendarClock className="h-3 w-3" /> {formatDate(business.plan.expiryDate)}
                          </p>
                        )}
                      </td>
                      <td className="px-4 py-4 font-mono font-bold text-emerald-300">{formatPaidAmount(business.totalPaidUSD)}</td>
                      <td className="px-4 py-4">
                        <p>{business.salesCount} {t('sales')}</p>
                        {business.salesTotals.map((total) => (
                          <p key={total.currency} className="mt-1 font-mono text-[10px] text-slate-400">
                            {AppStore.formatMoney(total.amount, total.currency)}
                          </p>
                        ))}
                      </td>
                      <td className="px-4 py-4">
                        <div className="flex min-w-32 flex-col items-start gap-1.5">
                          <button
                            type="button"
                            onClick={() => openBusinessActivity(business)}
                            className="whitespace-nowrap rounded-lg border border-slate-700 px-3 py-2 text-[10px] font-bold text-slate-200 hover:border-emerald-600 hover:text-emerald-300"
                          >
                            {t('viewActivity')}
                          </button>
                          {business.plan && (
                            <>
                              <button
                                type="button"
                                disabled={Boolean(licenseActionId) || loading}
                                onClick={() => void runLicenseAction(
                                  business,
                                  business.plan?.status === 'SUSPENDED' ? 'reactivate' : 'suspend'
                                )}
                                className="whitespace-nowrap rounded-lg border border-amber-700 px-3 py-2 text-[10px] font-bold text-amber-200 disabled:opacity-50"
                              >
                                {business.plan.status === 'SUSPENDED' ? 'Reactivate license' : 'Suspend license'}
                              </button>
                              {business.plan.id !== 'plan-lifetime' && (
                                <button
                                  type="button"
                                  disabled={Boolean(licenseActionId) || loading}
                                  onClick={() => void runLicenseAction(business, 'extend')}
                                  className="whitespace-nowrap rounded-lg border border-sky-700 px-3 py-2 text-[10px] font-bold text-sky-200 disabled:opacity-50"
                                >
                                  Extend license
                                </button>
                              )}
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
        )}

        {selectedBusiness && (
          <section className="space-y-4 rounded-3xl border border-slate-800 bg-slate-900 p-4 sm:p-6">
            <header className="flex flex-col justify-between gap-2 sm:flex-row sm:items-start">
              <div>
                <h2 className="text-lg font-black">{selectedBusiness.businessName}</h2>
                <p className="mt-1 text-xs text-slate-400">
                  {selectedBusiness.ownerName} · {selectedBusiness.ownerEmail}
                </p>
              </div>
              <p className="text-xs font-bold text-emerald-300">
                {formatPaidAmount(selectedBusiness.totalPaidUSD)} · {selectedBusiness.payments.length} {t('verifiedPayments')}
              </p>
            </header>

            <div className="grid gap-4 lg:grid-cols-2">
              <article className="rounded-2xl border border-slate-800 p-4">
                <h3 className="mb-3 text-xs font-bold">{t('paymentHistory')}</h3>
                {selectedBusiness.payments.length === 0 ? (
                  <p className="text-xs text-slate-500">{t('noPaymentHistory')}</p>
                ) : (
                  <div className="max-h-64 overflow-auto">
                    <table className="w-full min-w-[440px] text-left text-[10px]">
                      <thead className="text-slate-500">
                        <tr>
                          <th className="pb-2">{t('plan')}</th>
                          <th className="pb-2">{t('transactionId')}</th>
                          <th className="pb-2">{t('approvedAt')}</th>
                          <th className="pb-2 text-right">{t('platformPaidAmount')}</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800">
                        {[...selectedBusiness.payments].reverse().map((payment) => (
                          <tr key={payment.requestId}>
                            <td className="py-2 pr-2">{payment.planName || payment.planId}</td>
                            <td className="py-2 pr-2 font-mono">{payment.trxId || '—'}</td>
                            <td className="py-2 pr-2">{formatDate(payment.approvedAt)}</td>
                            <td className="py-2 text-right font-mono text-emerald-300">{formatPaidAmount(payment.priceUSD)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </article>

              <article className="rounded-2xl border border-slate-800 p-4">
                <div className="mb-3 flex items-center gap-2">
                  <Activity className="h-4 w-4 text-sky-400" />
                  <h3 className="text-xs font-bold">{t('salesActivity')}</h3>
                  <span className="text-[10px] text-slate-500">({activityTotal})</span>
                </div>
                {activityError && <p role="alert" className="mb-3 text-xs text-rose-300">{activityError}</p>}
                {activityLoading ? (
                  <p className="text-xs text-slate-500">{t('loadingTeamSales')}</p>
                ) : activity.length === 0 ? (
                  <p className="text-xs text-slate-500">{t('noBusinessSales')}</p>
                ) : (
                  <div className="max-h-80 overflow-auto">
                    <table className="w-full min-w-[600px] text-left text-[10px]">
                      <thead className="text-slate-500">
                        <tr>
                          <th className="pb-2">{t('date')}</th>
                          <th className="pb-2">{t('receiptNumberShort')}</th>
                          <th className="pb-2">{t('employee')}</th>
                          <th className="pb-2">{t('itemsSold')}</th>
                          <th className="pb-2 text-right">{t('total')}</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800">
                        {activity.map((sale) => (
                          <tr key={`${sale.cashierId}-${sale.id}`}>
                            <td className="py-2 pr-2 whitespace-nowrap">{formatDate(sale.date)}</td>
                            <td className="py-2 pr-2 font-mono">{sale.invoiceNumber || '—'}</td>
                            <td className="py-2 pr-2">{sale.cashierName} ({t(sale.cashierRole)})</td>
                            <td className="max-w-40 py-2 pr-2">{sale.items.map((item) => `${item.productName} × ${item.quantity}`).join(', ') || '—'}</td>
                            <td className="py-2 text-right font-mono">{AppStore.formatMoney(sale.totalAmount, sale.currency)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
                {activityTotal > 50 && (
                  <div className="mt-3 flex items-center justify-end gap-2 text-[10px]">
                    <button
                      type="button"
                      onClick={() => setActivityPage((page) => Math.max(1, page - 1))}
                      disabled={activityPage <= 1 || activityLoading}
                      aria-label={t('previousPage')}
                      className="rounded-lg border border-slate-700 p-2 disabled:opacity-40"
                    >
                      <ChevronLeft className="h-3.5 w-3.5" />
                    </button>
                    <span>{activityPage} / {currentPageCount}</span>
                    <button
                      type="button"
                      onClick={() => setActivityPage((page) => Math.min(currentPageCount, page + 1))}
                      disabled={activityPage >= currentPageCount || activityLoading}
                      aria-label={t('nextPage')}
                      className="rounded-lg border border-slate-700 p-2 disabled:opacity-40"
                    >
                      <ChevronRight className="h-3.5 w-3.5" />
                    </button>
                  </div>
                )}
              </article>
            </div>
          </section>
        )}
        </div>
        </div>
        ) : adminSection === 'plan-settings' ? (
          <PlatformPlanSettings />
        ) : adminSection === 'license-audit' ? (
          <PlatformLicenseAudit />
        ) : (
          <PlatformUserManagement section={adminSection} />
        )}
      </div>
    </main>
  );
};