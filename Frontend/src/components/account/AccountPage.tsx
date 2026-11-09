import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowDownLeft,
  ArrowUpRight,
  CalendarDays,
  CheckCircle2,
  CircleDollarSign,
  Download,
  Landmark,
  Plus,
  Printer,
  RotateCcw,
  Wallet,
  X,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import {
  adjustAccountExpense,
  adjustFinancialTransaction,
  createAccountExpense,
  createFinancialAccount,
  createFinancialTransaction,
  getAccountFinance,
  getStoredAccessToken,
  reconcileAccountExpense,
  reconcileFinancialTransaction,
} from '../../services/api';
import { AppStore } from '../../services/store';
import { AccountExpense, AccountFinanceData, FinancialTransaction, PayrollPayment, PayrollPaymentMethod } from '../../types';
import { exportToCSV } from '../../utils/exports';

type ReportPeriod = 'day' | 'month' | 'year';
type CashMovement = {
  id: string;
  date: string;
  description: string;
  method: string;
  direction: 'in' | 'out';
  amount: number;
  currency: string;
};
type AdjustmentTarget = {
  id: string;
  currency: string;
  description: string;
  source: 'transaction' | 'expense';
};
type SalaryReportRow = {
  id: string;
  period: string;
  userName: string;
  amount: number;
  paidAmount: number;
  unpaidAmount: number;
  currency: string;
  status: 'paid' | 'partial' | 'unpaid';
  paymentHistory: string;
};

const currentDateInput = (): string => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
};

const getDateRange = (period: ReportPeriod, value: string): { startDate: string; endDate: string } => {
  if (period === 'day') return { startDate: value, endDate: value };
  if (period === 'month') {
    const [year, month] = value.split('-').map(Number);
    const lastDay = new Date(year, month, 0).getDate();
    return {
      startDate: `${value}-01`,
      endDate: `${value}-${String(lastDay).padStart(2, '0')}`,
    };
  }
  const year = Number(value);
  return { startDate: `${year}-01-01`, endDate: `${year}-12-31` };
};

const roundAmount = (amount: number): number => Math.round((amount + Number.EPSILON) * 100) / 100;

const getPayments = (entry: AccountFinanceData['payroll'][number]): PayrollPayment[] =>
  entry.payments || (entry.status === 'paid'
    ? [{
        amount: entry.amount,
        method: entry.paymentMethod || 'cash',
        paidAt: entry.paidAt || `${entry.month}-01`,
        ...(entry.transactionReference ? { transactionReference: entry.transactionReference } : {}),
      }]
    : []);

const sumByCurrency = (
  values: Array<{ amount: number; currency: string }>
): Record<string, number> =>
  values.reduce<Record<string, number>>((totals, value) => {
    totals[value.currency] = roundAmount((totals[value.currency] || 0) + value.amount);
    return totals;
  }, {});

const formatCurrencyTotals = (totals: Record<string, number>): string => {
  const summary = Object.entries(totals)
    .filter(([, amount]) => amount !== 0)
    .map(([currency, amount]) => AppStore.formatMoney(amount, currency))
    .join(' · ');
  return summary || AppStore.formatMoney(0, AppStore.getSettings().currency);
};

export const AccountPage: React.FC = () => {
  const { language, showToast, t, setActiveTab } = useApp();
  const [period, setPeriod] = useState<ReportPeriod>('month');
  const [periodValue, setPeriodValue] = useState(currentDateInput);
  const [finance, setFinance] = useState<AccountFinanceData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isExpenseModalOpen, setIsExpenseModalOpen] = useState(false);
  const [isSavingExpense, setIsSavingExpense] = useState(false);
  const [isAccountModalOpen, setIsAccountModalOpen] = useState(false);
  const [isTransactionModalOpen, setIsTransactionModalOpen] = useState(false);
  const [adjustmentTarget, setAdjustmentTarget] = useState<AdjustmentTarget | null>(null);
  const [isSavingLedger, setIsSavingLedger] = useState(false);
  const [accountName, setAccountName] = useState('');
  const [accountType, setAccountType] = useState<'cash' | 'bank'>('cash');
  const [bankName, setBankName] = useState('');
  const [accountCurrency, setAccountCurrency] = useState(AppStore.getSettings().currency);
  const [openingBalance, setOpeningBalance] = useState('0');
  const [transactionAccountId, setTransactionAccountId] = useState('');
  const [transactionType, setTransactionType] = useState<'income' | 'expense'>('income');
  const [transactionCategory, setTransactionCategory] = useState('');
  const [transactionDescription, setTransactionDescription] = useState('');
  const [transactionAmount, setTransactionAmount] = useState('');
  const [transactionDate, setTransactionDate] = useState(currentDateInput);
  const [transactionReference, setTransactionReference] = useState('');
  const [adjustmentType, setAdjustmentType] = useState<'income' | 'expense'>('income');
  const [adjustmentAmount, setAdjustmentAmount] = useState('');
  const [adjustmentReason, setAdjustmentReason] = useState('');
  const [adjustmentDate, setAdjustmentDate] = useState(currentDateInput);
  const [expenseAccountId, setExpenseAccountId] = useState('');
  const [expenseDescription, setExpenseDescription] = useState('');
  const [expenseCategory, setExpenseCategory] = useState('');
  const [expenseAmount, setExpenseAmount] = useState('');
  const [expenseDate, setExpenseDate] = useState(currentDateInput);
  const [expenseMethod, setExpenseMethod] = useState<PayrollPaymentMethod>('cash');
  const [expenseCurrency, setExpenseCurrency] = useState(AppStore.getSettings().currency);
  const [loadError, setLoadError] = useState('');

  const dateRange = getDateRange(period, periodValue);

  useEffect(() => {
    const token = getStoredAccessToken();
    if (!token) {
      setLoadError('Your secure session has expired. Please sign in again.');
      setIsLoading(false);
      return;
    }
    let mounted = true;
    setIsLoading(true);
    setLoadError('');
    void getAccountFinance(token, dateRange.startDate, dateRange.endDate)
      .then((result) => {
        if (mounted) setFinance(result);
      })
      .catch((error: Error) => {
        if (mounted) {
          setLoadError(error.message);
          showToast(error.message, 'error');
        }
      })
      .finally(() => {
        if (mounted) setIsLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, [dateRange.startDate, dateRange.endDate, showToast]);

  const filteredData = useMemo(() => {
    if (!finance) return null;
    const monthStart = dateRange.startDate.slice(0, 7);
    const monthEnd = dateRange.endDate.slice(0, 7);
    const payrollObligations = period === 'day'
      ? []
      : finance.payroll.filter((entry) => entry.month >= monthStart && entry.month <= monthEnd);
    const salaryTotals = sumByCurrency(payrollObligations.map((entry) => ({ amount: entry.amount, currency: entry.currency })));
    const payrollPayments = finance.payroll.flatMap((entry) =>
      getPayments(entry).map((payment) => ({ ...payment, currency: entry.currency, userName: entry.userName }))
    );
    const paymentsInRange = payrollPayments.filter((payment) =>
      payment.paidAt.slice(0, 10) >= dateRange.startDate &&
      payment.paidAt.slice(0, 10) <= dateRange.endDate
    );
    const salaryPaidTotals = sumByCurrency(paymentsInRange);
    const salaryUnpaidTotals = { ...salaryTotals };
    const obligationPaymentsAsOfEnd = payrollObligations.flatMap((entry) =>
      getPayments(entry)
        .filter((payment) => payment.paidAt.slice(0, 10) <= dateRange.endDate)
        .map((payment) => ({ amount: payment.amount, currency: entry.currency }))
    );
    Object.entries(sumByCurrency(obligationPaymentsAsOfEnd)).forEach(([currency, amount]) => {
      salaryUnpaidTotals[currency] = roundAmount(Math.max(0, (salaryUnpaidTotals[currency] || 0) - amount));
    });

    const salaryReportRows: SalaryReportRow[] = period === 'day'
      ? finance.payroll.flatMap((entry) => getPayments(entry)
          .filter((payment) => payment.paidAt.slice(0, 10) === dateRange.startDate)
          .map((payment, index) => ({
            id: `daily-${entry.id}-${index}`,
            period: payment.paidAt.slice(0, 10),
            userName: entry.userName,
            amount: payment.amount,
            paidAmount: payment.amount,
            unpaidAmount: 0,
            currency: entry.currency,
            status: 'paid' as const,
            paymentHistory: [
              t(`payrollMethod${payment.method}`),
              payment.transactionReference ? `Ref ${payment.transactionReference}` : '',
            ].filter(Boolean).join(' · '),
          })))
      : (() => {
          const rowsByEmployee = new Map<string, SalaryReportRow>();
          payrollObligations.forEach((entry) => {
            const key = `${entry.userName}\u0000${entry.currency}`;
            const payments = getPayments(entry).filter((payment) => payment.paidAt.slice(0, 10) <= dateRange.endDate);
            const paidAmount = payments.reduce((total, payment) => total + payment.amount, 0);
            const row = rowsByEmployee.get(key) || {
              id: key,
              period: periodValue,
              userName: entry.userName,
              amount: 0,
              paidAmount: 0,
              unpaidAmount: 0,
              currency: entry.currency,
              status: 'unpaid' as const,
              paymentHistory: '',
            };
            row.amount = roundAmount(row.amount + entry.amount);
            row.paidAmount = roundAmount(row.paidAmount + paidAmount);
            row.paymentHistory = [row.paymentHistory, ...payments.map((payment) =>
              `${payment.paidAt.slice(0, 10)} · ${t(`payrollMethod${payment.method}`)}${payment.transactionReference ? ` · Ref ${payment.transactionReference}` : ''}`
            )].filter(Boolean).join(' | ');
            row.unpaidAmount = roundAmount(Math.max(0, row.amount - row.paidAmount));
            row.status = row.unpaidAmount === 0 ? 'paid' : row.paidAmount > 0 ? 'partial' : 'unpaid';
            rowsByEmployee.set(key, row);
          });
          return [...rowsByEmployee.values()];
        })();

    const movements: CashMovement[] = [
      ...finance.sales
        .filter((sale) => sale.initialPaidAmount > 0)
        .map((sale) => ({
          id: `sale-${sale.id}`,
          date: sale.date,
          description: `${t('accountSalesReceipt')} ${sale.invoiceNumber}`,
          method: t('accountSales'),
          direction: 'in' as const,
          amount: sale.initialPaidAmount,
          currency: sale.currency,
        })),
      ...finance.customerPayments.map((payment) => ({
        id: `customer-payment-${payment.id}`,
        date: payment.date,
        description: `${t('accountSalesReceipt')} ${payment.reference || payment.customerName}`,
        method: payment.paymentMethod || payment.customerName,
        direction: 'in' as const,
        amount: payment.amount,
        currency: payment.currency,
      })),
      ...finance.purchases
        .filter((purchase) => purchase.paidAmount > 0)
        .map((purchase) => ({
          id: `purchase-${purchase.id}`,
          date: purchase.date,
          description: `${t('accountPurchasePayment')} ${purchase.purchaseNumber}`,
          method: purchase.supplierName || t('navSuppliers'),
          direction: 'out' as const,
          amount: purchase.paidAmount,
          currency: purchase.currency,
        })),
      ...finance.supplierPayments.map((payment) => ({
        id: `supplier-${payment.id}`,
        date: payment.date,
        description: `${t('accountSupplierPayment')} ${payment.supplierName}`,
        method: payment.paymentMethod || '',
        direction: 'out' as const,
        amount: payment.amount,
        currency: payment.currency,
      })),
      ...finance.expenses.map((expense) => ({
        id: `expense-${expense.id}`,
        date: expense.date,
        description: expense.description,
        method: expense.category,
        direction: 'out' as const,
        amount: expense.amount,
        currency: expense.currency,
      })),
      ...finance.financialTransactions.map((transaction) => ({
        id: `ledger-${transaction.id}`,
        date: transaction.date,
        description: transaction.adjustmentOf
          ? `${transaction.description} (${transaction.adjustmentReason})`
          : transaction.description,
        method: `${transaction.accountName} · ${transaction.category}`,
        direction: (transaction.type === 'income' ? 'in' : 'out') as 'in' | 'out',
        amount: transaction.amount,
        currency: transaction.currency,
      })),
      ...finance.payroll.flatMap((entry) => getPayments(entry)
        .filter((payment) => payment.paidAt.slice(0, 10) >= dateRange.startDate && payment.paidAt.slice(0, 10) <= dateRange.endDate)
        .map((payment, index) => ({
        id: `payroll-${entry.id}-${index}`,
        date: payment.paidAt.slice(0, 10),
        description: `${t('accountSalaryPayment')} ${entry.userName}`,
        method: t(`payrollMethod${payment.method}`),
        direction: 'out' as const,
        amount: payment.amount,
        currency: entry.currency,
      }))),
    ].sort((left, right) => right.date.localeCompare(left.date));

    const inItems = [
      ...finance.sales.map((sale) => ({ amount: sale.initialPaidAmount, currency: sale.currency })),
      ...finance.customerPayments.map((payment) => ({ amount: payment.amount, currency: payment.currency })),
      ...finance.financialTransactions
        .filter((transaction) => transaction.type === 'income')
        .map((transaction) => ({ amount: transaction.amount, currency: transaction.currency })),
    ];
    const salesRevenue = sumByCurrency(finance.sales.map((sale) => ({ amount: sale.totalAmount, currency: sale.currency })));
    const expenses = sumByCurrency(finance.expenses.map((expense) => ({ amount: expense.amount, currency: expense.currency })));
    const costOfGoodsSold = sumByCurrency(finance.sales.map((sale) => ({
      amount: sale.costOfGoodsSold,
      currency: sale.currency,
    })));
    const otherIncome = sumByCurrency(finance.financialTransactions
      .filter((transaction) => transaction.type === 'income')
      .map((transaction) => ({ amount: transaction.amount, currency: transaction.currency })));
    const otherExpenses = sumByCurrency(finance.financialTransactions
      .filter((transaction) => transaction.type === 'expense')
      .map((transaction) => ({ amount: transaction.amount, currency: transaction.currency })));
    const operatingExpenses: Record<string, number> = {};
    const operatingCurrencies = new Set([
      ...Object.keys(expenses),
      ...Object.keys(otherExpenses),
      ...Object.keys(salaryTotals),
    ]);
    operatingCurrencies.forEach((currency) => {
      operatingExpenses[currency] = roundAmount(
        (expenses[currency] || 0) +
        (otherExpenses[currency] || 0) +
        (salaryTotals[currency] || 0)
      );
    });
    const outItems = [
      ...finance.purchases.map((purchase) => ({ amount: purchase.paidAmount, currency: purchase.currency })),
      ...finance.supplierPayments.map((payment) => ({ amount: payment.amount, currency: payment.currency })),
      ...finance.expenses.map((expense) => ({ amount: expense.amount, currency: expense.currency })),
      ...finance.financialTransactions
        .filter((transaction) => transaction.type === 'expense')
        .map((transaction) => ({ amount: transaction.amount, currency: transaction.currency })),
      ...paymentsInRange.map((payment) => ({ amount: payment.amount, currency: payment.currency })),
    ];
    const moneyIn = sumByCurrency(inItems);
    const moneyOut = sumByCurrency(outItems);
    const netCashFlow: Record<string, number> = {};
    new Set([...Object.keys(moneyIn), ...Object.keys(moneyOut)]).forEach((currency) => {
      netCashFlow[currency] = roundAmount((moneyIn[currency] || 0) - (moneyOut[currency] || 0));
    });
    const grossProfit: Record<string, number> = {};
    const netProfit: Record<string, number> = {};
    const currencies = new Set([
      ...Object.keys(salesRevenue),
      ...Object.keys(costOfGoodsSold),
      ...Object.keys(otherIncome),
      ...Object.keys(expenses),
      ...Object.keys(otherExpenses),
      ...Object.keys(salaryTotals),
    ]);
    currencies.forEach((currency) => {
      grossProfit[currency] = roundAmount((salesRevenue[currency] || 0) - (costOfGoodsSold[currency] || 0));
      netProfit[currency] = roundAmount(
        grossProfit[currency] +
        (otherIncome[currency] || 0) -
        (expenses[currency] || 0) -
        (otherExpenses[currency] || 0) -
        (salaryTotals[currency] || 0)
      );
    });
    const purchaseCosts = sumByCurrency(finance.purchases.map((purchase) => ({
      amount: purchase.totalCost,
      currency: purchase.currency,
    })));

    return {
      movements,
      moneyIn,
      moneyOut,
      netCashFlow,
      balances: finance.currentBalances,
      salesRevenue,
      costOfGoodsSold,
      grossProfit,
      netProfit,
      otherIncome,
      otherExpenses,
      purchaseCosts,
      operatingExpenses,
      expenses,
      salaryTotals,
      salaryPaidTotals,
      salaryUnpaidTotals,
      salaryReportRows,
      receivables: finance.receivables,
      payables: finance.payables,
    };
  }, [dateRange.endDate, dateRange.startDate, finance, period, periodValue, t]);

  const updatePeriod = (nextPeriod: ReportPeriod) => {
    const today = currentDateInput();
    setPeriod(nextPeriod);
    setPeriodValue(nextPeriod === 'month' ? today.slice(0, 7) : nextPeriod === 'year' ? today.slice(0, 4) : today);
  };

  const reloadFinance = async () => {
    const token = getStoredAccessToken();
    if (!token) throw new Error('Your secure session has expired. Please sign in again.');
    const result = await getAccountFinance(token, dateRange.startDate, dateRange.endDate);
    setFinance(result);
  };

  const saveAccount = async (event: React.FormEvent) => {
    event.preventDefault();
    const balance = Number(openingBalance);
    if (!accountName.trim() || !Number.isFinite(balance) || balance < 0) {
      showToast('Enter a valid account name and opening balance.', 'error');
      return;
    }
    const token = getStoredAccessToken();
    if (!token) {
      showToast('Your secure session has expired. Please sign in again.', 'error');
      return;
    }
    setIsSavingLedger(true);
    try {
      await createFinancialAccount(token, {
        name: accountName.trim(),
        type: accountType,
        bankName: accountType === 'bank' ? bankName.trim() : '',
        currency: accountCurrency,
        openingBalance: roundAmount(balance),
      });
      setIsAccountModalOpen(false);
      setAccountName('');
      setBankName('');
      setOpeningBalance('0');
      await reloadFinance();
      showToast('Cash or bank account created.', 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Unable to create the account.', 'error');
    } finally {
      setIsSavingLedger(false);
    }
  };

  const saveFinancialTransaction = async (event: React.FormEvent) => {
    event.preventDefault();
    const amount = Number(transactionAmount);
    const account = finance?.financialAccounts.find((item) => item.id === transactionAccountId);
    if (!account || !transactionCategory.trim() || !transactionDescription.trim() || !Number.isFinite(amount) || amount <= 0) {
      showToast('Choose an account and enter valid transaction details.', 'error');
      return;
    }
    const token = getStoredAccessToken();
    if (!token) {
      showToast('Your secure session has expired. Please sign in again.', 'error');
      return;
    }
    setIsSavingLedger(true);
    try {
      await createFinancialTransaction(token, {
        accountId: account.id,
        type: transactionType,
        category: transactionCategory.trim(),
        description: transactionDescription.trim(),
        amount: roundAmount(amount),
        currency: account.currency,
        date: transactionDate,
        reference: transactionReference.trim(),
      });
      setIsTransactionModalOpen(false);
      setTransactionCategory('');
      setTransactionDescription('');
      setTransactionAmount('');
      setTransactionReference('');
      await reloadFinance();
      showToast('Financial transaction recorded.', 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Unable to record the transaction.', 'error');
    } finally {
      setIsSavingLedger(false);
    }
  };

  const reconcileTransaction = async (transaction: FinancialTransaction) => {
    const token = getStoredAccessToken();
    if (!token) {
      showToast('Your secure session has expired. Please sign in again.', 'error');
      return;
    }
    setIsSavingLedger(true);
    try {
      await reconcileFinancialTransaction(token, transaction.id);
      await reloadFinance();
      showToast('Transaction reconciled and locked against direct changes.', 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Unable to reconcile the transaction.', 'error');
    } finally {
      setIsSavingLedger(false);
    }
  };

  const reconcileExpense = async (expense: AccountExpense) => {
    const token = getStoredAccessToken();
    if (!token) {
      showToast('Your secure session has expired. Please sign in again.', 'error');
      return;
    }
    setIsSavingLedger(true);
    try {
      await reconcileAccountExpense(token, expense.id);
      await reloadFinance();
      showToast('Expense reconciled and locked against direct changes.', 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Unable to reconcile the expense.', 'error');
    } finally {
      setIsSavingLedger(false);
    }
  };

  const saveAdjustment = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!adjustmentTarget) return;
    const amount = Number(adjustmentAmount);
    if (!Number.isFinite(amount) || amount <= 0 || !adjustmentReason.trim()) {
      showToast('Provide a valid adjustment amount and reason.', 'error');
      return;
    }
    const token = getStoredAccessToken();
    if (!token) {
      showToast('Your secure session has expired. Please sign in again.', 'error');
      return;
    }
    setIsSavingLedger(true);
    try {
      const adjustment = {
        type: adjustmentType,
        amount: roundAmount(amount),
        reason: adjustmentReason.trim(),
        date: adjustmentDate,
      };
      if (adjustmentTarget.source === 'expense') {
        await adjustAccountExpense(token, adjustmentTarget.id, adjustment);
      } else {
        await adjustFinancialTransaction(token, adjustmentTarget.id, adjustment);
      }
      setAdjustmentTarget(null);
      setAdjustmentAmount('');
      setAdjustmentReason('');
      await reloadFinance();
      showToast('Traceable adjustment recorded; the reconciled transaction remains unchanged.', 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Unable to record the adjustment.', 'error');
    } finally {
      setIsSavingLedger(false);
    }
  };

  const saveExpense = async (event: React.FormEvent) => {
    event.preventDefault();
    const amount = Number(expenseAmount);
    if (!expenseDescription.trim() || !expenseCategory.trim() || !Number.isFinite(amount) || amount <= 0) {
      showToast(t('accountInvalidExpense'), 'error');
      return;
    }
    const token = getStoredAccessToken();
    if (!token) {
      showToast('Your secure session has expired. Please sign in again.', 'error');
      return;
    }
    setIsSavingExpense(true);
    try {
      await createAccountExpense(token, {
        description: expenseDescription.trim(),
        category: expenseCategory.trim(),
        amount: roundAmount(amount),
        currency: expenseCurrency,
        date: expenseDate,
        paymentMethod: expenseMethod,
        ...(expenseAccountId ? { accountId: expenseAccountId } : {}),
      });
      setExpenseDescription('');
      setExpenseCategory('');
      setExpenseAmount('');
      setExpenseAccountId('');
      setIsExpenseModalOpen(false);
      showToast(t('accountExpenseSaved'), 'success');
      const result = await getAccountFinance(token, dateRange.startDate, dateRange.endDate);
      setFinance(result);
    } catch (error) {
      showToast(error instanceof Error ? error.message : t('accountExpenseSaveFailed'), 'error');
    } finally {
      setIsSavingExpense(false);
    }
  };

  const balanceSummaryCards = filteredData ? [
    { label: t('accountTotalMoneyIn'), amount: formatCurrencyTotals(filteredData.moneyIn), icon: ArrowDownLeft, color: 'text-emerald-600' },
    { label: t('accountTotalMoneyOut'), amount: formatCurrencyTotals(filteredData.moneyOut), icon: ArrowUpRight, color: 'text-rose-600' },
    { label: t('accountNetCashFlow'), amount: formatCurrencyTotals(filteredData.netCashFlow), icon: CircleDollarSign, color: 'text-cyan-600' },
    { label: t('accountCurrentBalance'), amount: formatCurrencyTotals(filteredData.balances), icon: Wallet, color: 'text-blue-600' },
    { label: t('accountSalesRevenue'), amount: formatCurrencyTotals(filteredData.salesRevenue), icon: CircleDollarSign, color: 'text-indigo-600' },
    { label: t('accountBusinessExpenses'), amount: formatCurrencyTotals(filteredData.expenses), icon: ArrowUpRight, color: 'text-orange-600' },
  ] : [];

  const profitAndLossCards = filteredData ? [
    { label: t('accountSalesRevenue'), amount: formatCurrencyTotals(filteredData.salesRevenue), color: 'text-indigo-600' },
    { label: t('accountCostOfGoodsSold'), amount: formatCurrencyTotals(filteredData.costOfGoodsSold), color: 'text-rose-600' },
    { label: t('accountGrossProfit'), amount: formatCurrencyTotals(filteredData.grossProfit), color: 'text-emerald-600' },
    { label: t('accountOperatingExpensesPayroll'), amount: formatCurrencyTotals(filteredData.operatingExpenses), color: 'text-orange-600' },
    { label: t('accountOtherIncome'), amount: formatCurrencyTotals(filteredData.otherIncome), color: 'text-cyan-600' },
    { label: t('accountNetProfit'), amount: formatCurrencyTotals(filteredData.netProfit), color: 'text-violet-600' },
    { label: t('accountPurchaseCostsInventory'), amount: formatCurrencyTotals(filteredData.purchaseCosts), color: 'text-amber-600' },
    { label: t('accountCustomerReceivables'), amount: formatCurrencyTotals(filteredData.receivables), color: 'text-blue-600' },
    { label: t('accountSupplierPayables'), amount: formatCurrencyTotals(filteredData.payables), color: 'text-pink-600' },
  ] : [];

  const salarySummaryCards = filteredData ? [
    { label: t('accountTotalSalary'), amount: formatCurrencyTotals(filteredData.salaryTotals), icon: CircleDollarSign, color: 'text-slate-700' },
    { label: t('accountSalaryPaid'), amount: formatCurrencyTotals(filteredData.salaryPaidTotals), icon: ArrowDownLeft, color: 'text-emerald-600' },
    { label: t('accountSalaryUnpaid'), amount: formatCurrencyTotals(filteredData.salaryUnpaidTotals), icon: ArrowUpRight, color: 'text-amber-600' },
  ] : [];

  const reportTitle = period === 'day'
    ? new Date(`${periodValue}T00:00:00`).toLocaleDateString(language === 'so' ? 'so-SO' : 'en-US')
    : periodValue;
  const exportSalaryReport = () => {
    if (!filteredData) return;
    exportToCSV(
      `salary-${period}-${periodValue}`,
      [t('accountSelectedPeriod'), t('employeeName'), t('payrollAmount'), t('payrollPaidAmount'), t('payrollRemaining'), t('payrollStatus'), t('accountPaymentHistory')],
      filteredData.salaryReportRows.map((row) => [
        row.period,
        row.userName,
        row.amount,
        row.paidAmount,
        row.unpaidAmount,
        t(`payroll${row.status[0].toUpperCase()}${row.status.slice(1)}`),
        row.paymentHistory,
      ])
    );
  };

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-slate-900 dark:text-white">{t('navAccount')}</h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{t('accountDescription')}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setIsAccountModalOpen(true)}
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-700 shadow-sm hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
          >
            <Landmark className="h-4 w-4" />
            Add account
          </button>
          <button
            type="button"
            onClick={() => {
              setTransactionAccountId(finance?.financialAccounts[0]?.id || '');
              setIsTransactionModalOpen(true);
            }}
            disabled={!finance?.financialAccounts.length}
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
          >
            <Plus className="h-4 w-4" />
            Add income / expense
          </button>
          <button
            type="button"
            onClick={() => setIsExpenseModalOpen(true)}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-bold text-white shadow-sm hover:bg-emerald-500"
          >
            <Plus className="h-4 w-4" />
            {t('accountAddExpense')}
          </button>
        </div>
      </header>

      <section className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900 sm:flex-row sm:items-end">
        <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
          <span className="mb-1.5 flex items-center gap-1.5"><CalendarDays className="h-3.5 w-3.5" />{t('accountReportPeriod')}</span>
          <select value={period} onChange={(event) => updatePeriod(event.target.value as ReportPeriod)} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-800 sm:w-44">
            <option value="day">{t('accountDaily')}</option>
            <option value="month">{t('accountMonthly')}</option>
            <option value="year">{t('accountYearly')}</option>
          </select>
        </label>
        <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
          <span className="mb-1.5 block">{t('accountSelectedPeriod')}</span>
          <input
            type={period === 'day' ? 'date' : period === 'month' ? 'month' : 'number'}
            min={period === 'year' ? '2000' : undefined}
            max={period === 'year' ? String(new Date().getFullYear() + 10) : undefined}
            value={periodValue}
            onChange={(event) => setPeriodValue(event.target.value)}
            className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-800 sm:w-48"
          />
        </label>
        <p className="pb-2 text-xs text-slate-500">{t('accountOpeningBalanceNote')}</p>
      </section>

      {isLoading ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500 dark:border-slate-800 dark:bg-slate-900">{t('loading')}</div>
      ) : loadError ? (
        <div role="alert" className="rounded-2xl border border-rose-200 bg-rose-50 p-5 text-sm text-rose-800 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-200">{loadError}</div>
      ) : filteredData && (
        <>
          <section aria-labelledby="account-employee-salary-title" className="space-y-3">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <h2 id="account-employee-salary-title" className="text-base font-bold text-slate-900 dark:text-white">
                {period === 'day' ? t('accountDailySalaryRecords') : period === 'month' ? t('accountMonthlySalaryReports') : t('accountYearlySalaryReports')}
              </h2>
              <div className="flex flex-wrap gap-2 print:hidden">
                <button type="button" onClick={() => setActiveTab('employee')} className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-bold text-white hover:bg-emerald-500">
                  <Plus className="h-3.5 w-3.5" />{t('accountNewSalary')}
                </button>
                <button type="button" onClick={() => window.print()} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800">
                  <Printer className="h-3.5 w-3.5" />{t('print')}
                </button>
                <button type="button" onClick={exportSalaryReport} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800">
                  <Download className="h-3.5 w-3.5" />{t('exportCSV')}
                </button>
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {salarySummaryCards.map(({ label, amount, icon: Icon, color }) => (
                <article key={label} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs dark:border-slate-800 dark:bg-slate-900">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold text-slate-500">{label}</span>
                    <Icon className={`h-4 w-4 ${color}`} />
                  </div>
                  <p className="mt-2 break-words text-lg font-extrabold text-slate-900 dark:text-white">{amount}</p>
                </article>
              ))}
            </div>
            <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800">
              <table className="w-full min-w-[900px] text-left text-xs">
                <thead className="bg-slate-50 text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:bg-slate-800/70 dark:text-slate-400">
                  <tr>
                    <th className="px-3 py-3">{t('accountSelectedPeriod')}</th>
                    <th className="px-3 py-3">{t('employeeName')}</th>
                    <th className="px-3 py-3">{t('payrollAmount')}</th>
                    <th className="px-3 py-3">{t('payrollPaidAmount')}</th>
                    <th className="px-3 py-3">{t('payrollRemaining')}</th>
                    <th className="px-3 py-3">{t('payrollStatus')}</th>
                    <th className="px-3 py-3">{t('accountPaymentHistory')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {filteredData.salaryReportRows.map((row) => (
                    <tr key={row.id} className="text-slate-700 dark:text-slate-300">
                      <td className="whitespace-nowrap px-3 py-3">{row.period}</td>
                      <td className="px-3 py-3 font-semibold">{row.userName}</td>
                      <td className="whitespace-nowrap px-3 py-3 font-semibold">{AppStore.formatMoney(row.amount, row.currency)}</td>
                      <td className="whitespace-nowrap px-3 py-3 font-semibold text-emerald-700 dark:text-emerald-300">{AppStore.formatMoney(row.paidAmount, row.currency)}</td>
                      <td className="whitespace-nowrap px-3 py-3 font-semibold text-amber-700 dark:text-amber-300">{AppStore.formatMoney(row.unpaidAmount, row.currency)}</td>
                      <td className="px-3 py-3">{t(`payroll${row.status[0].toUpperCase()}${row.status.slice(1)}`)}</td>
                      <td className="px-3 py-3">{row.paymentHistory || t('payrollNotPaid')}</td>
                    </tr>
                  ))}
                  {!filteredData.salaryReportRows.length && (
                    <tr><td colSpan={7} className="px-3 py-8 text-center text-slate-500">{t('accountNoSalaryRecords')}</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>

          <section aria-labelledby="account-balance-transactions-title" className="space-y-3">
            <h2 id="account-balance-transactions-title" className="text-base font-bold text-slate-900 dark:text-white">
              {t('accountBalanceTransactions')}
            </h2>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {balanceSummaryCards.map(({ label, amount, icon: Icon, color }) => (
                <article key={label} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs dark:border-slate-800 dark:bg-slate-900">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold text-slate-500">{label}</span>
                    <Icon className={`h-4 w-4 ${color}`} />
                  </div>
                  <p className="mt-2 break-words text-lg font-extrabold text-slate-900 dark:text-white">{amount}</p>
                </article>
              ))}
            </div>
          </section>

          <section aria-labelledby="account-profit-loss-title" className="space-y-3">
            <div>
              <h2 id="account-profit-loss-title" className="text-base font-bold text-slate-900 dark:text-white">
                {t('accountProfitAndLoss')} · {reportTitle}
              </h2>
              <p className="mt-1 text-xs text-slate-500">{t('accountProfitAndLossDescription')}</p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {profitAndLossCards.map((card) => (
                <article key={card.label} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs dark:border-slate-800 dark:bg-slate-900">
                  <p className="text-xs font-semibold text-slate-500">{card.label}</p>
                  <p className={`mt-2 break-words text-lg font-extrabold ${card.color}`}>{card.amount}</p>
                </article>
              ))}
            </div>
          </section>

          <section aria-labelledby="account-cash-bank-title" className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-xs dark:border-slate-800 dark:bg-slate-900 sm:p-5">
            <div>
              <h2 id="account-cash-bank-title" className="text-base font-bold text-slate-900 dark:text-white">{t('accountCashBankAccounts')}</h2>
              <p className="mt-1 text-xs text-slate-500">{t('accountCashBankDescription')}</p>
            </div>
            {finance?.financialAccounts.length ? (
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {finance.financialAccounts.map((account) => (
                  <article key={account.id} className="rounded-xl border border-slate-100 p-4 dark:border-slate-800">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2">
                        {account.type === 'bank' ? <Landmark className="h-4 w-4 text-blue-600" /> : <Wallet className="h-4 w-4 text-emerald-600" />}
                        <div>
                          <h3 className="text-sm font-bold text-slate-900 dark:text-white">{account.name}</h3>
                          <p className="text-[11px] text-slate-500">{account.type === 'bank' ? account.bankName : t('accountCash')} · {account.currency}</p>
                        </div>
                      </div>
                      <span className="text-sm font-extrabold text-slate-900 dark:text-white">{AppStore.formatMoney(account.balance, account.currency)}</span>
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <p className="rounded-xl bg-slate-50 p-4 text-xs text-slate-500 dark:bg-slate-800/60">{t('accountAddCashBankHint')}</p>
            )}
            <div className="overflow-x-auto rounded-xl border border-slate-100 dark:border-slate-800">
              <table className="w-full min-w-[900px] text-left text-xs">
                <thead className="bg-slate-50 text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:bg-slate-800/70 dark:text-slate-400">
                  <tr>
                    <th className="px-3 py-3">{t('accountDateReference')}</th>
                    <th className="px-3 py-3">{t('accountAccountDescription')}</th>
                    <th className="px-3 py-3">{t('accountCategory')}</th>
                    <th className="px-3 py-3">{t('accountAmount')}</th>
                    <th className="px-3 py-3">{t('accountReconciliation')}</th>
                    <th className="px-3 py-3">{t('accountActions')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {(finance?.financialTransactions || []).map((transaction) => (
                    <tr key={transaction.id} className="text-slate-700 dark:text-slate-300">
                      <td className="px-3 py-3">
                        <div>{transaction.date}</div>
                        <div className="text-[10px] text-slate-400">{transaction.reference || '—'}</div>
                      </td>
                      <td className="px-3 py-3">
                        <div className="font-semibold">{transaction.description}</div>
                        <div className="text-[10px] text-slate-400">{transaction.accountName}</div>
                        <div className="text-[10px] text-slate-400">{t('accountRecordedBy')} {transaction.createdByName} · {new Date(transaction.createdAt).toLocaleString()}</div>
                        {transaction.adjustmentOf && (
                          <div className="mt-1 text-[10px] text-amber-700 dark:text-amber-300">
                            {t('accountAdjustmentOf')} {transaction.adjustmentOf}: {transaction.adjustmentReason}
                          </div>
                        )}
                      </td>
                      <td className="px-3 py-3">{transaction.category}</td>
                      <td className={`whitespace-nowrap px-3 py-3 font-bold ${transaction.type === 'income' ? 'text-emerald-700 dark:text-emerald-300' : 'text-rose-700 dark:text-rose-300'}`}>
                        {transaction.type === 'income' ? '+' : '−'}{AppStore.formatMoney(transaction.amount, transaction.currency)}
                      </td>
                      <td className="px-3 py-3">
                        {transaction.reconciled
                          ? <span className="inline-flex items-center gap-1 font-semibold text-emerald-700 dark:text-emerald-300"><CheckCircle2 className="h-3.5 w-3.5" /> {t('accountReconciled')}</span>
                          : <span className="text-amber-700 dark:text-amber-300">{t('accountUnreconciled')}</span>}
                      </td>
                      <td className="px-3 py-3">
                        <div className="flex gap-2">
                          {!transaction.reconciled && !transaction.adjustmentOf && (
                            <button type="button" disabled={isSavingLedger} onClick={() => void reconcileTransaction(transaction)} className="rounded-lg bg-emerald-50 px-2.5 py-1.5 font-bold text-emerald-700 disabled:opacity-50 dark:bg-emerald-950/40 dark:text-emerald-300">
                              {t('accountReconcile')}
                            </button>
                          )}
                          {transaction.reconciled && !transaction.adjustmentOf && (
                            <button
                              type="button"
                              disabled={isSavingLedger}
                              onClick={() => {
                                setAdjustmentType(transaction.type === 'income' ? 'expense' : 'income');
                                setAdjustmentTarget({
                                  id: transaction.id,
                                  currency: transaction.currency,
                                  description: transaction.description,
                                  source: 'transaction',
                                });
                              }}
                              className="inline-flex items-center gap-1 rounded-lg bg-amber-50 px-2.5 py-1.5 font-bold text-amber-700 disabled:opacity-50 dark:bg-amber-950/40 dark:text-amber-300"
                            >
                              <RotateCcw className="h-3 w-3" /> {t('accountAdjust')}
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                  {!finance?.financialTransactions.length && (
                    <tr><td colSpan={6} className="px-3 py-8 text-center text-slate-500">{t('accountNoLedgerTransactions')}</td></tr>
                  )}
                </tbody>
              </table>
            </div>
            <div className="overflow-x-auto rounded-xl border border-slate-100 dark:border-slate-800">
              <table className="w-full min-w-[760px] text-left text-xs">
                <thead className="bg-slate-50 text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:bg-slate-800/70 dark:text-slate-400">
                  <tr>
                    <th className="px-3 py-3">{t('accountExpense')}</th>
                    <th className="px-3 py-3">{t('accountDate')}</th>
                    <th className="px-3 py-3">{t('accountAmount')}</th>
                    <th className="px-3 py-3">{t('accountReconciliation')}</th>
                    <th className="px-3 py-3">{t('accountActions')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {(finance?.expenses || []).filter((expense) => expense.accountId).map((expense) => {
                    const account = finance?.financialAccounts.find((item) => item.id === expense.accountId);
                    return (
                      <tr key={expense.id} className="text-slate-700 dark:text-slate-300">
                        <td className="px-3 py-3">
                          <div className="font-semibold">{expense.description}</div>
                          <div className="text-[10px] text-slate-400">{expense.category} · {t('accountRecordedBy')} {expense.createdByName}</div>
                        </td>
                        <td className="px-3 py-3">{account?.name || t('accountAccount')} · {expense.date}</td>
                        <td className="whitespace-nowrap px-3 py-3 font-bold text-rose-700 dark:text-rose-300">
                          {AppStore.formatMoney(expense.amount, expense.currency)}
                        </td>
                        <td className="px-3 py-3">
                          {expense.reconciled
                            ? <span className="inline-flex items-center gap-1 font-semibold text-emerald-700 dark:text-emerald-300"><CheckCircle2 className="h-3.5 w-3.5" /> {t('accountReconciled')}</span>
                            : <span className="text-amber-700 dark:text-amber-300">{t('accountUnreconciled')}</span>}
                        </td>
                        <td className="px-3 py-3">
                          <div className="flex gap-2">
                            {!expense.reconciled && (
                              <button type="button" disabled={isSavingLedger} onClick={() => void reconcileExpense(expense)} className="rounded-lg bg-emerald-50 px-2.5 py-1.5 font-bold text-emerald-700 disabled:opacity-50 dark:bg-emerald-950/40 dark:text-emerald-300">{t('accountReconcile')}</button>
                            )}
                            {expense.reconciled && (
                              <button
                                type="button"
                                disabled={isSavingLedger}
                                onClick={() => {
                                  setAdjustmentType('income');
                                  setAdjustmentTarget({
                                    id: expense.id,
                                    currency: expense.currency,
                                    description: expense.description,
                                    source: 'expense',
                                  });
                                }}
                                className="inline-flex items-center gap-1 rounded-lg bg-amber-50 px-2.5 py-1.5 font-bold text-amber-700 disabled:opacity-50 dark:bg-amber-950/40 dark:text-amber-300"
                              >
                                <RotateCcw className="h-3 w-3" /> {t('accountAdjust')}
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                  {!finance?.expenses.some((expense) => expense.accountId) && (
                    <tr><td colSpan={5} className="px-3 py-8 text-center text-slate-500">{t('accountNoLinkedExpenses')}</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>

          <section aria-label={t('accountBalanceTransactions')} className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-xs dark:border-slate-800 dark:bg-slate-900 sm:p-5">
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-white">{t('accountPaymentHistory')}</h2>
              <p className="mt-1 text-xs text-slate-500">{reportTitle} · {t('accountHistoryNoDuplicates')}</p>
            </div>
            <div className="overflow-x-auto rounded-xl border border-slate-100 dark:border-slate-800">
              <table className="w-full min-w-[760px] text-left text-xs">
                <thead className="bg-slate-50 text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:bg-slate-800/70 dark:text-slate-400">
                  <tr>
                    <th className="px-3 py-3">{t('date')}</th>
                    <th className="px-3 py-3">{t('accountTransaction')}</th>
                    <th className="px-3 py-3">{t('payrollPaymentMethod')}</th>
                    <th className="px-3 py-3">{t('accountMoneyIn')}</th>
                    <th className="px-3 py-3">{t('accountMoneyOut')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {filteredData.movements.map((movement) => (
                    <tr key={movement.id} className="text-slate-700 dark:text-slate-300">
                      <td className="whitespace-nowrap px-3 py-3">{movement.date}</td>
                      <td className="px-3 py-3 font-semibold">{movement.description}</td>
                      <td className="px-3 py-3">{movement.method || '—'}</td>
                      <td className="whitespace-nowrap px-3 py-3 font-semibold text-emerald-700 dark:text-emerald-300">
                        {movement.direction === 'in' ? AppStore.formatMoney(movement.amount, movement.currency) : '—'}
                      </td>
                      <td className="whitespace-nowrap px-3 py-3 font-semibold text-rose-700 dark:text-rose-300">
                        {movement.direction === 'out' ? AppStore.formatMoney(movement.amount, movement.currency) : '—'}
                      </td>
                    </tr>
                  ))}
                  {filteredData.movements.length === 0 && (
                    <tr><td colSpan={5} className="px-3 py-10 text-center text-slate-500">{t('accountNoTransactions')}</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}

      {isAccountModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm">
          <form onSubmit={(event) => void saveAccount(event)} className="w-full max-w-lg space-y-4 rounded-3xl border border-slate-200 bg-white p-6 shadow-2xl dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 dark:border-slate-800">
              <h2 className="text-base font-bold text-slate-900 dark:text-white">Add cash or bank account</h2>
              <button type="button" onClick={() => setIsAccountModalOpen(false)} aria-label={t('cancel')} className="rounded-lg p-1 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"><X className="h-5 w-5" /></button>
            </div>
            <label className="block space-y-1.5 text-xs font-semibold text-slate-700 dark:text-slate-300">
              <span>Account name</span>
              <input required maxLength={120} value={accountName} onChange={(event) => setAccountName(event.target.value)} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-800" />
            </label>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block space-y-1.5 text-xs font-semibold text-slate-700 dark:text-slate-300">
                <span>Account type</span>
                <select value={accountType} onChange={(event) => setAccountType(event.target.value as 'cash' | 'bank')} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-800">
                  <option value="cash">Cash</option>
                  <option value="bank">Bank</option>
                </select>
              </label>
              {accountType === 'bank' && (
                <label className="block space-y-1.5 text-xs font-semibold text-slate-700 dark:text-slate-300">
                  <span>Bank name</span>
                  <input required maxLength={120} value={bankName} onChange={(event) => setBankName(event.target.value)} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-800" />
                </label>
              )}
              <label className="block space-y-1.5 text-xs font-semibold text-slate-700 dark:text-slate-300">
                <span>Currency</span>
                <input required minLength={3} maxLength={12} value={accountCurrency} onChange={(event) => setAccountCurrency(event.target.value.toUpperCase())} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm uppercase dark:border-slate-700 dark:bg-slate-800" />
              </label>
              <label className="block space-y-1.5 text-xs font-semibold text-slate-700 dark:text-slate-300">
                <span>Opening balance ({accountCurrency})</span>
                <input required type="number" min="0" step="0.01" value={openingBalance} onChange={(event) => setOpeningBalance(event.target.value)} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-800" />
              </label>
            </div>
            <div className="flex justify-end gap-2 border-t border-slate-100 pt-3 dark:border-slate-800">
              <button type="button" onClick={() => setIsAccountModalOpen(false)} className="rounded-xl px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800">{t('cancel')}</button>
              <button type="submit" disabled={isSavingLedger} className="rounded-xl bg-emerald-600 px-5 py-2 text-xs font-bold text-white hover:bg-emerald-500 disabled:opacity-50">{isSavingLedger ? t('saving') : 'Create account'}</button>
            </div>
          </form>
        </div>
      )}

      {isTransactionModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm">
          <form onSubmit={(event) => void saveFinancialTransaction(event)} className="w-full max-w-lg space-y-4 rounded-3xl border border-slate-200 bg-white p-6 shadow-2xl dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 dark:border-slate-800">
              <h2 className="text-base font-bold text-slate-900 dark:text-white">Record income or expense</h2>
              <button type="button" onClick={() => setIsTransactionModalOpen(false)} aria-label={t('cancel')} className="rounded-lg p-1 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"><X className="h-5 w-5" /></button>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block space-y-1.5 text-xs font-semibold text-slate-700 dark:text-slate-300">
                <span>Transaction type</span>
                <select value={transactionType} onChange={(event) => setTransactionType(event.target.value as 'income' | 'expense')} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-800">
                  <option value="income">Income</option>
                  <option value="expense">Expense</option>
                </select>
              </label>
              <label className="block space-y-1.5 text-xs font-semibold text-slate-700 dark:text-slate-300">
                <span>Cash / bank account</span>
                <select required value={transactionAccountId} onChange={(event) => setTransactionAccountId(event.target.value)} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-800">
                  {(finance?.financialAccounts || []).map((account) => <option key={account.id} value={account.id}>{account.name} · {account.currency}</option>)}
                </select>
              </label>
              <label className="block space-y-1.5 text-xs font-semibold text-slate-700 dark:text-slate-300">
                <span>Category</span>
                <input required maxLength={80} value={transactionCategory} onChange={(event) => setTransactionCategory(event.target.value)} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-800" />
              </label>
              <label className="block space-y-1.5 text-xs font-semibold text-slate-700 dark:text-slate-300">
                <span>Amount ({finance?.financialAccounts.find((account) => account.id === transactionAccountId)?.currency || ''})</span>
                <input required type="number" min="0.01" step="0.01" value={transactionAmount} onChange={(event) => setTransactionAmount(event.target.value)} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-800" />
              </label>
              <label className="block space-y-1.5 text-xs font-semibold text-slate-700 dark:text-slate-300">
                <span>Description</span>
                <input required maxLength={200} value={transactionDescription} onChange={(event) => setTransactionDescription(event.target.value)} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-800" />
              </label>
              <label className="block space-y-1.5 text-xs font-semibold text-slate-700 dark:text-slate-300">
                <span>Date</span>
                <input required type="date" value={transactionDate} onChange={(event) => setTransactionDate(event.target.value)} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-800" />
              </label>
              <label className="block space-y-1.5 text-xs font-semibold text-slate-700 dark:text-slate-300 sm:col-span-2">
                <span>Reference (optional)</span>
                <input maxLength={120} value={transactionReference} onChange={(event) => setTransactionReference(event.target.value)} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-800" />
              </label>
            </div>
            <div className="flex justify-end gap-2 border-t border-slate-100 pt-3 dark:border-slate-800">
              <button type="button" onClick={() => setIsTransactionModalOpen(false)} className="rounded-xl px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800">{t('cancel')}</button>
              <button type="submit" disabled={isSavingLedger || !finance?.financialAccounts.length} className="rounded-xl bg-emerald-600 px-5 py-2 text-xs font-bold text-white hover:bg-emerald-500 disabled:opacity-50">{isSavingLedger ? t('saving') : 'Save transaction'}</button>
            </div>
          </form>
        </div>
      )}

      {adjustmentTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm">
          <form onSubmit={(event) => void saveAdjustment(event)} className="w-full max-w-lg space-y-4 rounded-3xl border border-slate-200 bg-white p-6 shadow-2xl dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 dark:border-slate-800">
              <h2 className="text-base font-bold text-slate-900 dark:text-white">Adjust reconciled transaction</h2>
              <button type="button" onClick={() => setAdjustmentTarget(null)} aria-label={t('cancel')} className="rounded-lg p-1 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"><X className="h-5 w-5" /></button>
            </div>
            <p className="text-xs leading-relaxed text-slate-500">Original: {adjustmentTarget.description}. The reconciled record remains unchanged; a separate linked adjustment is created with your reason.</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block space-y-1.5 text-xs font-semibold text-slate-700 dark:text-slate-300">
                <span>Adjustment direction</span>
                <select value={adjustmentType} onChange={(event) => setAdjustmentType(event.target.value as 'income' | 'expense')} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-800">
                  <option value="income">Income</option>
                  <option value="expense">Expense</option>
                </select>
              </label>
              <label className="block space-y-1.5 text-xs font-semibold text-slate-700 dark:text-slate-300">
                <span>Amount ({adjustmentTarget.currency})</span>
                <input required type="number" min="0.01" step="0.01" value={adjustmentAmount} onChange={(event) => setAdjustmentAmount(event.target.value)} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-800" />
              </label>
              <label className="block space-y-1.5 text-xs font-semibold text-slate-700 dark:text-slate-300">
                <span>Date</span>
                <input required type="date" value={adjustmentDate} onChange={(event) => setAdjustmentDate(event.target.value)} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-800" />
              </label>
              <label className="block space-y-1.5 text-xs font-semibold text-slate-700 dark:text-slate-300">
                <span>Reason (required)</span>
                <input required maxLength={500} value={adjustmentReason} onChange={(event) => setAdjustmentReason(event.target.value)} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-800" />
              </label>
            </div>
            <div className="flex justify-end gap-2 border-t border-slate-100 pt-3 dark:border-slate-800">
              <button type="button" onClick={() => setAdjustmentTarget(null)} className="rounded-xl px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800">{t('cancel')}</button>
              <button type="submit" disabled={isSavingLedger} className="rounded-xl bg-amber-600 px-5 py-2 text-xs font-bold text-white hover:bg-amber-500 disabled:opacity-50">{isSavingLedger ? t('saving') : 'Record adjustment'}</button>
            </div>
          </form>
        </div>
      )}

      {isExpenseModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm">
          <form onSubmit={(event) => void saveExpense(event)} className="w-full max-w-lg space-y-4 rounded-3xl border border-slate-200 bg-white p-6 shadow-2xl dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 dark:border-slate-800">
              <h2 className="text-base font-bold text-slate-900 dark:text-white">{t('accountAddExpense')}</h2>
              <button type="button" onClick={() => setIsExpenseModalOpen(false)} aria-label={t('cancel')} className="rounded-lg p-1 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"><X className="h-5 w-5" /></button>
            </div>
            <label className="block space-y-1.5 text-xs font-semibold text-slate-700 dark:text-slate-300">
              <span>{t('accountExpenseDescription')}</span>
              <input required maxLength={200} value={expenseDescription} onChange={(event) => setExpenseDescription(event.target.value)} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-800" />
            </label>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block space-y-1.5 text-xs font-semibold text-slate-700 dark:text-slate-300">
                <span>{t('accountExpenseCategory')}</span>
                <select
                  required
                  value={expenseCategory}
                  onChange={(event) => setExpenseCategory(event.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-800"
                >
                  <option value="" disabled>{t('accountExpenseCategorySelect')}</option>
                  <option value="Rent">{t('accountExpenseCategoryRent')}</option>
                  <option value="Utilities">{t('accountExpenseCategoryUtilities')}</option>
                  <option value="Salaries">{t('accountExpenseCategorySalaries')}</option>
                  <option value="Transport">{t('accountExpenseCategoryTransport')}</option>
                  <option value="Supplies">{t('accountExpenseCategorySupplies')}</option>
                  <option value="Maintenance">{t('accountExpenseCategoryMaintenance')}</option>
                  <option value="Marketing">{t('accountExpenseCategoryMarketing')}</option>
                  <option value="Other">{t('accountExpenseCategoryOther')}</option>
                </select>
              </label>
              <label className="block space-y-1.5 text-xs font-semibold text-slate-700 dark:text-slate-300">
                <span>{t('payrollAmount')} ({expenseCurrency})</span>
                <input required type="number" min="0.01" step="0.01" max="1000000000000" value={expenseAmount} onChange={(event) => setExpenseAmount(event.target.value)} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-800" />
              </label>
              <label className="block space-y-1.5 text-xs font-semibold text-slate-700 dark:text-slate-300">
                <span>{t('date')}</span>
                <input required type="date" value={expenseDate} onChange={(event) => setExpenseDate(event.target.value)} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-800" />
              </label>
              <label className="block space-y-1.5 text-xs font-semibold text-slate-700 dark:text-slate-300">
                <span>Pay from account (optional)</span>
                <select
                  value={expenseAccountId}
                  onChange={(event) => {
                    setExpenseAccountId(event.target.value);
                    const selected = finance?.financialAccounts.find((account) => account.id === event.target.value);
                    if (selected) setExpenseCurrency(selected.currency);
                  }}
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-800"
                >
                  <option value="">Unlinked / mobile wallet</option>
                  {(finance?.financialAccounts || []).map((account) => (
                    <option key={account.id} value={account.id}>{account.name} · {account.currency}</option>
                  ))}
                </select>
              </label>
              <label className="block space-y-1.5 text-xs font-semibold text-slate-700 dark:text-slate-300">
                <span>{t('payrollPaymentMethod')}</span>
                <select value={expenseMethod} onChange={(event) => setExpenseMethod(event.target.value as PayrollPaymentMethod)} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-800">
                  <option value="cash">{t('payrollMethodcash')}</option>
                  <option value="evc_plus">{t('payrollMethodevc_plus')}</option>
                  <option value="zaad">{t('payrollMethodzaad')}</option>
                  <option value="sahal">{t('payrollMethodsahal')}</option>
                </select>
              </label>
            </div>
            <div className="flex justify-end gap-2 border-t border-slate-100 pt-3 dark:border-slate-800">
              <button type="button" onClick={() => setIsExpenseModalOpen(false)} className="rounded-xl px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800">{t('cancel')}</button>
              <button type="submit" disabled={isSavingExpense} className="rounded-xl bg-emerald-600 px-5 py-2 text-xs font-bold text-white hover:bg-emerald-500 disabled:opacity-50">{isSavingExpense ? t('saving') : t('accountSaveExpense')}</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
