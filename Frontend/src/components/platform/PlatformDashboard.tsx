import React, { useEffect, useMemo, useState } from 'react';
import { Activity, ArrowDownRight, ArrowUpRight, Bell, Building2, CheckCircle2, CircleDollarSign, ClipboardList, CreditCard, Crown, Download, ExternalLink, Eye, FileText, Link2, LogOut, Menu, Search, Settings, ShieldCheck, Users, Wallet } from 'lucide-react';
import { Logo } from '../brand/Logo';
import { getStoredAccessToken } from '../../services/api';

type Role = 'super_admin' | 'business_admin' | 'affiliate' | 'finance_admin';
type Props = { role: string; user: { name?: string; email?: string; profileImageUrl?: string | null }; onLogout: () => void };
type Payload = Record<string, any>;

const roleConfig: Record<Role, { title: string; subtitle: string; endpoint: string; nav: string[] }> = {
  super_admin: { title: 'Platform Overview', subtitle: 'Monitor the complete SAFI SALI COMPANIES network.', endpoint: '/api/mysql-dashboards/super-admin/overview', nav: ['Overview', 'Businesses', 'Users & Roles', 'Affiliates', 'Commissions', 'Transactions', 'Reports', 'Audit Log', 'Notifications', 'Settings'] },
  business_admin: { title: 'Business Overview', subtitle: 'Track your business performance, partners and sales.', endpoint: '/api/mysql-dashboards/business-admin/overview', nav: ['Overview', 'My Business', 'Referrals', 'Affiliates', 'Sales', 'Commissions', 'Reports', 'Notifications', 'Settings'] },
  affiliate: { title: 'Affiliate Overview', subtitle: 'Track referrals, conversions and your commission earnings.', endpoint: '/api/mysql-dashboards/affiliate/overview', nav: ['Overview', 'My Referral Links', 'Referrals', 'Earnings', 'Withdrawals', 'Notifications', 'Profile'] },
  finance_admin: { title: 'Finance Overview', subtitle: 'Review platform transactions and payout requests.', endpoint: '/api/mysql-dashboards/finance/overview', nav: ['Overview', 'Transactions', 'Payout Requests', 'Commissions', 'Reconciliation', 'Reports', 'Notifications', 'Settings'] },
};

const fmt = (value: unknown) => {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(n) : '0';
};
const money = (value: unknown) => '$' + fmt(value);

export const PlatformDashboard: React.FC<Props> = ({ role: rawRole, user, onLogout }) => {
  const role: Role = (['super_admin','business_admin','affiliate','finance_admin'].includes(rawRole) ? rawRole : 'business_admin') as Role;
  const config = roleConfig[role];
  const [data, setData] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [active, setActive] = useState('Overview');
  const [query, setQuery] = useState('');
  const [mobileNav, setMobileNav] = useState(false);
  const [payoutRows, setPayoutRows] = useState<any[]>([]);
  const [payableRows, setPayableRows] = useState<any[]>([]);
  const [selectedCommissionIds, setSelectedCommissionIds] = useState<string[]>([]);
  const [payoutBusy, setPayoutBusy] = useState(false);
  const [payoutError, setPayoutError] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('Bank transfer');
  const [paymentDestination, setPaymentDestination] = useState('');
  const [paymentReference, setPaymentReference] = useState('');
  const [notifications, setNotifications] = useState<any[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [notificationBusy, setNotificationBusy] = useState(false);
  const [notificationError, setNotificationError] = useState('');
  const [reportData, setReportData] = useState<{sales:any[];commissions:any[]}|null>(null);
  const [reportBusy, setReportBusy] = useState(false);
  const [reportError, setReportError] = useState('');




  useEffect(() => {
    let alive = true;
    const token = getStoredAccessToken();
    if (!token) { setError('Your secure session is missing. Please sign in again.'); setLoading(false); return; }
    fetch(config.endpoint, { headers: { Authorization: `Bearer ${token}` } })
      .then(async response => {
        const body = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(body.error || 'Dashboard data could not be loaded.');
        return body;
      })
      .then(body => { if (alive) setData(body); })
      .catch(err => { if (alive) setError(err instanceof Error ? err.message : 'Unable to load dashboard.'); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [config.endpoint]);


  useEffect(() => {
    const affiliatePage = role === 'affiliate' && active === 'Withdrawals';
    const financePage = role === 'finance_admin' && active === 'Payout Requests';
    if (!affiliatePage && !financePage) return;
    const token = getStoredAccessToken();
    if (!token) return;
    let alive = true;
    setPayoutBusy(true); setPayoutError('');
    const headers = { Authorization: 'Bearer ' + token };
    const tasks = affiliatePage
      ? [fetch('/api/mysql-payouts/available', { headers }).then(async x => { const b=await x.json(); if(!x.ok) throw new Error(b.error || 'Could not load payable commissions'); return b.commissions || []; }),
         fetch('/api/mysql-payouts/mine', { headers }).then(async x => { const b=await x.json(); if(!x.ok) throw new Error(b.error || 'Could not load withdrawals'); return b.payouts || []; })]
      : [fetch('/api/mysql-payouts', { headers }).then(async x => { const b=await x.json(); if(!x.ok) throw new Error(b.error || 'Could not load payout queue'); return b.payouts || []; })];
    Promise.all(tasks).then(values => {
      if (!alive) return;
      if (affiliatePage) { setPayableRows(values[0]); setPayoutRows(values[1]); }
      else setPayoutRows(values[0]);
    }).catch(e => { if (alive) setPayoutError(e instanceof Error ? e.message : 'Payout data could not be loaded.'); })
      .finally(() => { if (alive) setPayoutBusy(false); });
    return () => { alive = false; };
  }, [role, active]);


  useEffect(() => {
    if (active !== 'Notifications') return;
    const token = getStoredAccessToken();
    if (!token) return;
    let alive = true;
    setNotificationBusy(true); setNotificationError('');
    fetch('/api/mysql-notifications?limit=50', { headers: { Authorization: 'Bearer ' + token } })
      .then(async response => { const body = await response.json().catch(() => ({})); if (!response.ok) throw new Error(body.error || 'Notifications could not be be loaded.'); return body; })
      .then(body => { if (alive) { setNotifications(Array.isArray(body.notifications) ? body.notifications : []); setUnreadCount(Number(body.unreadCount) || 0); } })
      .catch(error => { if (alive) setNotificationError(error instanceof Error ? error.message : 'Notifications could not be loaded.'); })
      .finally(() => { if (alive) setNotificationBusy(false); });
    return () => { alive = false; };
  }, [active]);


  useEffect(() => {
    if (active !== 'Reports') return;
    const token = getStoredAccessToken(); if (!token) return;
    let alive = true;
    setReportBusy(true); setReportError('');
    fetch('/api/mysql-dashboards/reports/monthly', { headers: { Authorization: 'Bearer ' + token } })
      .then(async response => { const body=await response.json().catch(()=>({})); if(!response.ok) throw new Error(body.error || 'Reports could not be loaded.'); return body; })
      .then(body => { if(alive) setReportData({sales:Array.isArray(body.sales)?body.sales:[],commissions:Array.isArray(body.commissions)?body.commissions:[]}); })
      .catch(error => { if(alive) setReportError(error instanceof Error?error.message:'Reports could not be loaded.'); })
      .finally(() => { if(alive) setReportBusy(false); });
    return () => { alive=false; };
  }, [active]);

  const markNotificationRead = async (id: string | number) => {
    const token = getStoredAccessToken(); if (!token) return;
    try {
      const response = await fetch('/api/mysql-notifications/' + encodeURIComponent(String(id)) + '/read', { method: 'PATCH', headers: { Authorization: 'Bearer ' + token } });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || 'Could not mark notification read.');
      setNotifications(rows => rows.map(row => String(row.id) === String(id) ? { ...row, read_at: row.read_at || new Date().toISOString() } : row));
      setUnreadCount(count => Math.max(0, count - 1));
    } catch (error) { setNotificationError(error instanceof Error ? error.message : 'Could not update notification.'); }
  };

  const markAllNotificationsRead = async () => {
    const token = getStoredAccessToken(); if (!token) return;
    try {
      const response = await fetch('/api/mysql-notifications/read-all', { method: 'PATCH', headers: { Authorization: 'Bearer ' + token } });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || 'Could not mark notifications read.');
      setNotifications(rows => rows.map(row => ({ ...row, read_at: row.read_at || new Date().toISOString() })));
      setUnreadCount(0);
    } catch (error) { setNotificationError(error instanceof Error ? error.message : 'Could not update notifications.'); }
  };

  const runPayoutAction = async (url: string, method: string, body: Record<string, unknown>) => {
    const token = getStoredAccessToken();
    if (!token) throw new Error('Please sign in again.');
    const response = await fetch(url, { method, headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || 'Payout action failed.');
    return result;
  };

  const submitPayoutRequest = async () => {
    setPayoutBusy(true); setPayoutError('');
    try {
      await runPayoutAction('/api/mysql-payouts/request', 'POST', { commissionIds: selectedCommissionIds, method: paymentMethod, destination: paymentDestination });
      setSelectedCommissionIds([]); setPaymentDestination('');
      const token = getStoredAccessToken();
      const headers = { Authorization: 'Bearer ' + token };
      const [a, m] = await Promise.all([
        fetch('/api/mysql-payouts/available', { headers }).then(x => x.json()),
        fetch('/api/mysql-payouts/mine', { headers }).then(x => x.json())
      ]);
      setPayableRows(a.commissions || []); setPayoutRows(m.payouts || []);
    } catch(e) { setPayoutError(e instanceof Error ? e.message : 'Withdrawal request failed.'); }
    finally { setPayoutBusy(false); }
  };

  const reviewPayout = async (id: string | number, decision: 'approve' | 'reject') => {
    setPayoutBusy(true); setPayoutError('');
    try {
      await runPayoutAction('/api/mysql-payouts/' + encodeURIComponent(String(id)) + '/decision', 'PATCH', { decision });
      setPayoutRows(rows => rows.map(row => String(row.id) === String(id) ? { ...row, status: decision === 'approve' ? 'approved' : 'rejected' } : row));
    } catch(e) { setPayoutError(e instanceof Error ? e.message : 'Review failed.'); }
    finally { setPayoutBusy(false); }
  };

  const confirmPayoutPaid = async (id: string | number) => {
    if (!paymentReference.trim()) { setPayoutError('Enter the external payment reference first.'); return; }
    setPayoutBusy(true); setPayoutError('');
    try {
      await runPayoutAction('/api/mysql-payouts/' + encodeURIComponent(String(id)) + '/paid', 'POST', { externalReference: paymentReference.trim() });
      setPayoutRows(rows => rows.map(row => String(row.id) === String(id) ? { ...row, status: 'paid', external_reference: paymentReference.trim() } : row));
      setPaymentReference('');
    } catch(e) { setPayoutError(e instanceof Error ? e.message : 'Payment confirmation failed.'); }
    finally { setPayoutBusy(false); }
  };

  const metrics = useMemo(() => {
    if (!data) return [];
    if (role === 'super_admin') return [
      { label: 'Registered businesses', value: fmt(data.businesses?.total), icon: Building2 },
      { label: 'Active businesses', value: fmt(data.businesses?.active), icon: CheckCircle2 },
      { label: 'Platform users', value: fmt(data.users?.total), icon: Users },
      { label: 'Affiliates', value: fmt(data.users?.affiliates), icon: Link2 },
      { label: 'Confirmed sales', value: fmt(data.sales?.total), icon: ClipboardList },
      { label: 'Eligible revenue', value: money(data.sales?.eligibleRevenue), icon: CircleDollarSign },
      { label: 'Total commissions', value: money(data.commissions?.total), icon: Wallet },
      { label: 'Outstanding commissions', value: money(data.commissions?.outstanding), icon: CreditCard },
    ];
    if (role === 'business_admin') return [
      { label: 'Sales', value: fmt(data.sales?.total), icon: ClipboardList },
      { label: 'Eligible revenue', value: money(data.sales?.eligibleRevenue), icon: CircleDollarSign },
      { label: 'Active affiliates', value: fmt(data.activeAffiliates), icon: Users },
      { label: 'Commissions generated', value: money(data.commissions), icon: Wallet },
    ];
    if (role === 'affiliate') return [
      { label: 'Active referral links', value: fmt(data.links?.totalLinks), icon: Link2 },
      { label: 'Link clicks', value: fmt(data.links?.clicks), icon: Eye },
      { label: 'Total referrals', value: fmt(data.referrals?.total), icon: Users },
      { label: 'Converted referrals', value: fmt(data.referrals?.converted), icon: CheckCircle2 },
      { label: 'Total earnings', value: money(data.earnings?.total), icon: Wallet },
      { label: 'Pending commission', value: money(data.earnings?.pending), icon: CreditCard },
      { label: 'Paid commission', value: money(data.earnings?.paid), icon: CircleDollarSign },
    ];
    return [
      { label: 'Transactions', value: fmt(data.transactions?.total), icon: ClipboardList },
      { label: 'Posted credits', value: money(data.transactions?.credits), icon: ArrowUpRight },
      { label: 'Posted debits', value: money(data.transactions?.debits), icon: ArrowDownRight },
      { label: 'Payout requests', value: fmt(data.payouts?.total), icon: Wallet },
      { label: 'Requested payout amount', value: money(data.payouts?.requestedAmount), icon: CreditCard },
    ];
  }, [data, role]);

  return <div className="min-h-screen bg-[#f4f6fb] text-slate-800">
    {mobileNav && <button type="button" aria-label="Close navigation menu" className="fixed inset-0 z-30 bg-slate-950/50 backdrop-blur-[2px] lg:hidden" onClick={() => setMobileNav(false)} />}
    <aside id="platform-navigation" aria-label="Main navigation" className={`fixed inset-y-0 left-0 z-40 flex w-[min(84vw,280px)] flex-col border-r border-slate-200 bg-[#101f3d] text-white shadow-2xl transition-transform duration-200 lg:w-[260px] lg:shadow-none lg:translate-x-0 ${mobileNav ? 'translate-x-0' : '-translate-x-full'}`}>
      <div className="flex h-[86px] items-center border-b border-white/10 px-6"><div className="rounded-xl bg-white p-2"><Logo size="lg" /></div></div>
      <div className="px-5 py-6"><p className="text-[10px] font-bold uppercase tracking-[.22em] text-[#d9b45b]">Workspace</p><p className="mt-2 text-sm font-semibold text-white">{role === 'super_admin' ? 'Super Administrator' : role === 'business_admin' ? 'Business Administration' : role === 'affiliate' ? 'Affiliate Center' : 'Finance Office'}</p></div>
      <nav className="flex-1 space-y-1 overflow-y-auto px-3">{config.nav.map((item, i) => <button key={item} onClick={() => { setActive(item); setMobileNav(false); }} className={`flex w-full items-center gap-3 rounded-xl px-4 py-3 text-left text-[13px] font-medium transition ${active === item ? 'bg-[#d5ad50] text-[#10203e] shadow-lg shadow-black/10' : 'text-slate-300 hover:bg-white/10 hover:text-white'}`}><span className="w-5 text-center">{i === 0 ? '◈' : '·'}</span>{item}</button>)}</nav>
      <div className="m-4 rounded-2xl border border-white/10 bg-white/5 p-4"><p className="text-xs font-semibold text-[#e5c46f]">SAFI SALI COMPANIES</p><p className="mt-1 text-[11px] text-slate-400">Enterprise Affiliate Platform</p></div>
    </aside>
    <div className="min-h-screen lg:pl-[260px]">
      <header className="sticky top-0 z-30 flex h-[76px] items-center justify-between border-b border-slate-200 bg-white/95 px-4 backdrop-blur md:px-8">
        <div className="flex min-w-0 items-center gap-3"><button type="button" aria-label={mobileNav ? "Close navigation menu" : "Open navigation menu"} aria-controls="platform-navigation" aria-expanded={mobileNav} onClick={() => setMobileNav(!mobileNav)} className="rounded-lg p-2 text-slate-600 hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-[#d5ad50] lg:hidden"><Menu size={21}/></button><div><p className="text-[10px] font-bold uppercase tracking-[.18em] text-[#b18a32]">SAFI SALI COMPANIES</p><p className="truncate text-sm font-bold text-[#142747] md:text-base">{config.title}</p></div></div>
        <div className="flex items-center gap-2 md:gap-4"><div className="hidden items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 md:flex"><Search size={15} className="text-slate-400"/><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search workspace..." className="w-36 bg-transparent text-xs outline-none xl:w-52"/></div><button className="relative rounded-xl border border-slate-200 p-2.5 text-slate-600" aria-label="Notifications"><Bell size={18}/><span className="absolute right-2 top-2 h-1.5 w-1.5 rounded-full bg-[#c49b3b]"/></button><div className="hidden h-9 w-9 items-center justify-center overflow-hidden rounded-full bg-[#142747] text-xs font-bold text-white sm:flex">{user.profileImageUrl ? <img src={user.profileImageUrl} className="h-full w-full object-cover" /> : (user.name || 'SA').split(' ').map(x=>x[0]).slice(0,2).join('')}</div><div className="hidden sm:block"><p className="text-xs font-bold text-slate-800">{user.name || 'Administrator'}</p><p className="text-[10px] capitalize text-slate-500">{role.replace('_',' ')}</p></div><button onClick={onLogout} className="rounded-xl border border-slate-200 p-2.5 text-slate-500 hover:bg-slate-50" title="Sign out"><LogOut size={17}/></button></div>
      </header>
      <main className="mx-auto max-w-[1500px] p-4 md:p-8">
        <div className="mb-7 flex flex-col justify-between gap-4 md:flex-row md:items-end"><div><p className="text-xs font-semibold text-slate-500">Good day, {user.name || 'Administrator'}</p><h1 className="mt-1 text-2xl font-extrabold tracking-tight text-[#142747] md:text-[30px]">{active === 'Overview' ? config.title : active}</h1><p className="mt-1 text-sm text-slate-500">{config.subtitle}</p></div><div className="flex items-center gap-2"><span className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600">Live MySQL data</span><button onClick={() => window.location.reload()} className="rounded-lg bg-[#142747] px-4 py-2.5 text-xs font-bold text-white hover:bg-[#203b68]"><Activity size={14} className="mr-2 inline"/>Refresh</button></div></div>
        {error && <div role="alert" className="mb-5 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>}
        <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">{(loading ? Array.from({length:4},(_,i)=>({label:'Loading metric',value:'—',icon:Activity})) : metrics).map((m,i) => { const Icon=m.icon; return <section key={m.label+i} className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-[0_3px_16px_rgba(18,39,71,.045)]"><div className="flex items-center justify-between"><span className="text-xs font-semibold text-slate-500">{m.label}</span><span className="rounded-xl bg-[#f8f2e4] p-2.5 text-[#a77e24]"><Icon size={18}/></span></div><p className="mt-4 text-[26px] font-extrabold tracking-tight text-[#142747]">{m.value}</p><p className="mt-2 text-[10px] font-medium text-slate-400">Verified from platform API</p></section>; })}</div>



        {active === 'Reports' && <section className="mb-6 space-y-5">
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"><div className="mb-4"><h2 className="text-lg font-bold text-[#142747]">Monthly sales report</h2><p className="mt-1 text-sm text-slate-500">Last 12 months · role-scoped MySQL data · revenue shown by currency</p></div>
            {reportError && <p role="alert" className="mb-3 rounded-lg bg-rose-50 p-3 text-sm text-rose-700">{reportError}</p>}
            {reportBusy && <p className="py-3 text-sm text-slate-500">Loading reports…</p>}
            <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr className="border-b text-xs text-slate-500"><th className="p-3">Month</th><th className="p-3">Currency</th><th className="p-3">Sales</th><th className="p-3">Eligible revenue</th></tr></thead><tbody>{(reportData?.sales||[]).map((row,i)=><tr key={row.month+row.currency+i} className="border-b border-slate-100"><td className="p-3">{row.month}</td><td className="p-3">{row.currency}</td><td className="p-3">{fmt(row.salesCount)}</td><td className="p-3 font-semibold">{money(row.eligibleRevenue)}</td></tr>)}</tbody></table></div>
            {!reportBusy && !(reportData?.sales.length) && <p className="py-4 text-center text-sm text-slate-500">No sales report data for this period.</p>}
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"><div className="mb-4"><h2 className="text-lg font-bold text-[#142747]">Commission report</h2><p className="mt-1 text-sm text-slate-500">Commission totals and paid totals, without referred-customer personal information</p></div>
            <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr className="border-b text-xs text-slate-500"><th className="p-3">Month</th><th className="p-3">Currency</th><th className="p-3">Commissions</th><th className="p-3">Total</th><th className="p-3">Paid</th></tr></thead><tbody>{(reportData?.commissions||[]).map((row,i)=><tr key={row.month+row.currency+i} className="border-b border-slate-100"><td className="p-3">{row.month}</td><td className="p-3">{row.currency}</td><td className="p-3">{fmt(row.commissionCount)}</td><td className="p-3 font-semibold">{money(row.commissionTotal)}</td><td className="p-3">{money(row.paidTotal)}</td></tr>)}</tbody></table></div>
            {!reportBusy && !(reportData?.commissions.length) && <p className="py-4 text-center text-sm text-slate-500">No commission report data for this period.</p>}
          </div>
        </section>}
        {active === 'Notifications' && <section className="mb-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-lg font-bold text-[#142747]">Notifications</h2><p className="mt-1 text-sm text-slate-500">{unreadCount} unread notifications</p></div><button disabled={notificationBusy || unreadCount === 0} onClick={markAllNotificationsRead} className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-[#142747] disabled:opacity-50">Mark all as read</button></div>
          {notificationError && <p role="alert" className="mb-3 rounded-lg bg-rose-50 p-3 text-sm text-rose-700">{notificationError}</p>}
          {notificationBusy && <p className="py-3 text-sm text-slate-500">Loading notifications…</p>}
          <div className="space-y-2">{notifications.map(item => <article key={item.id} className={'rounded-xl border p-4 ' + (item.read_at ? 'border-slate-100 bg-white' : 'border-amber-200 bg-amber-50/40')}><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="font-semibold text-[#142747]">{item.title}</p><p className="mt-1 text-sm text-slate-600">{item.message}</p><p className="mt-2 text-xs text-slate-400">{item.created_at ? new Date(item.created_at).toLocaleString() : '—'}</p></div>{!item.read_at && <button onClick={() => markNotificationRead(item.id)} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold">Mark read</button>}</div></article>)}</div>
          {!notifications.length && !notificationBusy && <p className="py-5 text-center text-sm text-slate-500">You have no notifications yet.</p>}
        </section>}
        {role === 'affiliate' && active === 'Withdrawals' && <section className="mb-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="mb-4"><h2 className="text-lg font-bold text-[#142747]">Available commissions</h2><p className="mt-1 text-sm text-slate-500">Only your payable commissions are listed. Referred customers' personal details are never shown.</p></div>
          {payoutError && <p role="alert" className="mb-3 rounded-lg bg-rose-50 p-3 text-sm text-rose-700">{payoutError}</p>}
          {payoutBusy && <p className="py-3 text-sm text-slate-500">Loading payout information…</p>}
          <div className="space-y-2">{payableRows.map(row => <label key={row.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-100 p-3 text-sm">
            <span className="flex items-center gap-3"><input type="checkbox" checked={selectedCommissionIds.includes(String(row.id))} onChange={e => setSelectedCommissionIds(ids => e.target.checked ? [...ids,String(row.id)] : ids.filter(id => id !== String(row.id)))} /><span><b>Commission #{row.id}</b><span className="ml-2 text-slate-500">Sale {row.external_order_ref || '—'}</span></span></span>
            <b>{row.currency} {fmt(row.amount)}</b>
          </label>)}</div>
          {!payableRows.length && !payoutBusy && <p className="py-3 text-sm text-slate-500">No payable commissions are currently available.</p>}
          <div className="mt-4 grid gap-3 md:grid-cols-3"><select value={paymentMethod} onChange={e => setPaymentMethod(e.target.value)} className="rounded-lg border border-slate-200 px-3 py-2 text-sm"><option>Bank transfer</option><option>Mobile money</option><option>Other</option></select><input value={paymentDestination} onChange={e => setPaymentDestination(e.target.value)} placeholder="Payment destination / account reference" className="rounded-lg border border-slate-200 px-3 py-2 text-sm" /><button disabled={payoutBusy || !selectedCommissionIds.length || !paymentDestination.trim()} onClick={submitPayoutRequest} className="rounded-lg bg-[#142747] px-4 py-2 text-sm font-bold text-white disabled:opacity-50">Request withdrawal ({selectedCommissionIds.length})</button></div>
          <h3 className="mb-2 mt-7 font-bold text-[#142747]">My withdrawal history</h3>
          <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr className="border-b text-xs text-slate-500"><th className="p-2">ID</th><th className="p-2">Amount</th><th className="p-2">Method</th><th className="p-2">Status</th><th className="p-2">Requested</th></tr></thead><tbody>{payoutRows.map(row => <tr key={row.id} className="border-b border-slate-100"><td className="p-2">#{row.id}</td><td className="p-2">{row.currency} {fmt(row.amount)}</td><td className="p-2">{row.method}</td><td className="p-2 capitalize">{row.status}</td><td className="p-2">{row.requested_at ? new Date(row.requested_at).toLocaleDateString() : '—'}</td></tr>)}</tbody></table></div>
        </section>}
        {role === 'finance_admin' && active === 'Payout Requests' && <section className="mb-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="mb-4"><h2 className="text-lg font-bold text-[#142747]">Finance payout queue</h2><p className="mt-1 text-sm text-slate-500">Review requests, approve or reject them, and record payment references after funds are sent.</p></div>
          {payoutError && <p role="alert" className="mb-3 rounded-lg bg-rose-50 p-3 text-sm text-rose-700">{payoutError}</p>}
          {payoutBusy && <p className="py-3 text-sm text-slate-500">Loading payout queue…</p>}
          <div className="space-y-3">{payoutRows.map(row => <article key={row.id} className="rounded-xl border border-slate-100 p-4"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="font-bold text-[#142747]">Withdrawal #{row.id}</p><p className="mt-1 text-sm text-slate-500">Affiliate ID: {row.affiliate_user_id} · Business ID: {row.business_id}</p><p className="mt-1 text-sm">{row.method} · {row.currency} {fmt(row.amount)}</p><p className="mt-1 break-all text-xs text-slate-600">Payment destination: {row.destination_ref || 'Not supplied'}</p><p className="mt-1 text-xs capitalize text-slate-500">Status: {row.status} · {row.commission_count} commissions</p></div><div className="flex flex-wrap gap-2">{row.status === 'requested' && <><button disabled={payoutBusy} onClick={() => reviewPayout(row.id,'approve')} className="rounded-lg bg-emerald-700 px-3 py-2 text-xs font-bold text-white disabled:opacity-50">Approve</button><button disabled={payoutBusy} onClick={() => reviewPayout(row.id,'reject')} className="rounded-lg border border-rose-200 px-3 py-2 text-xs font-bold text-rose-700 disabled:opacity-50">Reject</button></>}{['approved','processing'].includes(row.status) && <button disabled={payoutBusy} onClick={() => confirmPayoutPaid(row.id)} className="rounded-lg bg-[#142747] px-3 py-2 text-xs font-bold text-white disabled:opacity-50">Mark paid</button>}</div></div></article>)}</div>
          {payoutRows.some(row => ['approved','processing'].includes(row.status)) && <div className="mt-4 flex flex-wrap gap-3"><input value={paymentReference} onChange={e => setPaymentReference(e.target.value)} placeholder="External payment / transaction reference" className="min-w-[260px] flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm" /><p className="self-center text-xs text-slate-500">Enter reference, then click Mark paid on the approved request.</p></div>}
          {!payoutRows.length && !payoutBusy && <p className="py-3 text-sm text-slate-500">No withdrawal requests found.</p>}
        </section>}
        <div className="grid grid-cols-1 gap-5 xl:grid-cols-3"><section className="rounded-2xl border border-slate-200/80 bg-white p-6 shadow-[0_3px_16px_rgba(18,39,71,.045)] xl:col-span-2"><div className="flex items-center justify-between"><div><h2 className="text-sm font-bold text-[#142747]">Performance summary</h2><p className="mt-1 text-xs text-slate-500">Key platform indicators for your access level</p></div><span className="rounded-lg bg-[#f8f2e4] px-3 py-1.5 text-[10px] font-bold text-[#98701b]">OVERVIEW</span></div><div className="mt-7 grid grid-cols-1 gap-3 sm:grid-cols-2">{metrics.slice(0,4).map((m,i)=>{const Icon=m.icon;return <div key={m.label} className="flex items-center gap-3 rounded-xl border border-slate-100 bg-slate-50/80 p-4"><span className="rounded-lg bg-white p-2 text-[#a77e24] shadow-sm"><Icon size={17}/></span><div className="min-w-0"><p className="truncate text-[11px] text-slate-500">{m.label}</p><p className="mt-1 text-sm font-bold text-[#142747]">{m.value}</p></div></div>;})}</div><div className="mt-5 rounded-xl border border-dashed border-slate-200 p-4 text-center text-xs text-slate-400">Charts will appear when the platform reporting endpoints provide dated trend data.</div></section>
        <section className="rounded-2xl border border-slate-200/80 bg-white p-6 shadow-[0_3px_16px_rgba(18,39,71,.045)]"><div className="flex items-center gap-2"><ShieldCheck size={18} className="text-[#b18a32]"/><h2 className="text-sm font-bold text-[#142747]">Access & security</h2></div><div className="mt-5 space-y-4"><div><p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Signed-in role</p><p className="mt-1 text-sm font-semibold capitalize text-slate-700">{role.replace('_',' ')}</p></div><div><p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Data source</p><p className="mt-1 text-sm font-semibold text-slate-700">MySQL platform API</p></div><div><p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Commission policy</p><p className="mt-1 text-sm font-semibold text-slate-700">10% default rate · Super Admin controlled</p></div><div className="rounded-xl bg-[#f8f2e4] p-3 text-[11px] leading-5 text-[#765719]">Your dashboard displays information permitted for your account role.</div></div></section></div>
        <footer className="mt-8 flex flex-col justify-between gap-2 border-t border-slate-200 pt-5 text-[10px] text-slate-400 sm:flex-row"><span>© 2026 SAFI SALI COMPANIES. All rights reserved.</span><span>Secure Enterprise Affiliate Platform</span></footer>
      </main>
    </div>
  </div>;
};
