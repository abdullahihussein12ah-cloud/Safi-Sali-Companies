import { Router } from 'express';
import { AccountExpenseModel } from '../models/AccountExpense.js';
import { FinancialAccountModel } from '../models/FinancialAccount.js';
import { FinancialTransactionModel } from '../models/FinancialTransaction.js';
import { UserModel } from '../models/User.js';
import { WorkspaceModel } from '../models/Workspace.js';
import { requirePermission } from '../permissions.js';

const PAYMENT_METHODS = ['cash', 'evc_plus', 'zaad', 'sahal'];

function isValidDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function isWithinRange(value, startDate, endDate) {
  const date = typeof value === 'string' ? value.slice(0, 10) : '';
  return date >= startDate && date <= endDate;
}

function isOnOrBeforeDate(value, endDate) {
  const date = typeof value === 'string' ? value.slice(0, 10) : '';
  return isValidDate(date) && date <= endDate;
}

function getTenantId(user) {
  return user.tenantId || 'business';
}

function getTenantFilter(tenantId) {
  return tenantId === 'business'
    ? { $or: [{ tenantId: 'business' }, { tenantId: { $exists: false } }] }
    : { tenantId };
}

function asList(value) {
  return Array.isArray(value) ? value : [];
}

function asAmount(value) {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : 0;
}

function sumByCurrency(values) {
  return values.reduce((totals, value) => {
    totals[value.currency] = Math.round(((totals[value.currency] || 0) + value.amount + Number.EPSILON) * 100) / 100;
    return totals;
  }, {});
}

export function createAccountingRouter() {
  const router = Router();
  router.use(requirePermission('financial_reports'));

  router.get('/', async (req, res, next) => {
    try {
      const { startDate, endDate } = req.query;
      if (!isValidDate(startDate) || !isValidDate(endDate) || startDate > endDate) {
        return res.status(400).json({ error: 'Provide a valid start and end date.' });
      }

      const tenantId = getTenantId(req.user);
      const users = await UserModel.find(getTenantFilter(tenantId)).select('_id name').lean();
      const ownerIds = users.map((user) => String(user._id));
      const [userWorkspaces, expenseDocuments, employeeWorkspace] = await Promise.all([
        ownerIds.length
          ? WorkspaceModel.find({ ownerId: { $in: ownerIds }, scope: 'user' }).select('ownerId scope data').lean()
          : [],
        AccountExpenseModel.find({
          tenantId,
          date: { $lte: endDate },
        }).sort({ date: -1, createdAt: -1 }).lean(),
        WorkspaceModel.findOne({ ownerId: tenantId, scope: 'tenant' }).select('ownerId scope data').lean(),
      ]);
      const workspaces = employeeWorkspace
        ? [...userWorkspaces, employeeWorkspace]
        : userWorkspaces;
      const [financialAccounts, financialTransactions] = await Promise.all([
        FinancialAccountModel.find({ tenantId }).sort({ createdAt: 1 }).lean(),
        FinancialTransactionModel.find({ tenantId, date: { $lte: endDate } }).sort({ date: -1 }).lean(),
      ]);
      const namesById = new Map(users.map((user) => [String(user._id), user.name]));

      const sales = [];
      const customerPayments = [];
      const purchases = [];
      const supplierPayments = [];
      const payroll = [];
      const receivableBalances = [];
      const payableBalances = [];
      const accountsById = new Map(financialAccounts.map((account) => [String(account._id), account]));
      const accountBalances = new Map(financialAccounts.map((account) => [
        String(account._id),
        account.createdAt.toISOString().slice(0, 10) <= endDate ? account.openingBalance : 0,
      ]));
      const moneyInThroughEndDate = [];
      const moneyOutThroughEndDate = [];

      for (const workspace of workspaces) {
        const data = {
          ...(workspace.data || {}),
          payroll: employeeWorkspace && workspace.scope === 'user' ? [] : workspace.data?.payroll,
        };
        const ownerId = String(workspace.ownerId);
        const currency = typeof data.settings?.currency === 'string' ? data.settings.currency : 'USD';
        const suppliersById = new Map(
          asList(data.suppliers).map((supplier) => [String(supplier.id), String(supplier.name || 'Supplier')])
        );
        const customersById = new Map(
          asList(data.customers).map((customer) => [String(customer.id), String(customer.name || 'Customer')])
        );
        const latestCustomerBalances = new Map();
        const customerLedgerIds = new Set();
        asList(data.customer_ledger).forEach((entry, index) => {
          const customerId = String(entry?.customerId || '');
          if (customerId) customerLedgerIds.add(customerId);
          const date = String(entry?.date || '').slice(0, 10);
          if (
            !customersById.has(customerId) ||
            !isOnOrBeforeDate(date, endDate) ||
            typeof entry.newBalance !== 'number' ||
            !Number.isFinite(entry.newBalance)
          ) return;
          const previous = latestCustomerBalances.get(customerId);
          if (!previous || date > previous.date || (date === previous.date && index < previous.index)) {
            latestCustomerBalances.set(customerId, { date, index, balance: entry.newBalance });
          }
        });
        const payableBySupplier = new Map(
          asList(data.suppliers).map((supplier) => [
            String(supplier.id),
            isOnOrBeforeDate(String(supplier.createdAt || '').slice(0, 10), endDate)
              ? asAmount(supplier.openingBalance)
              : 0,
          ])
        );
        const unassignedReceivables = [];
        const unassignedPayables = [];
        const creditSalesByInvoice = new Map(
          asList(data.customer_ledger)
            .filter((entry) => entry?.type === 'credit_sale' && typeof entry.reference === 'string')
            .map((entry) => [entry.reference, asAmount(entry.amount)])
        );

        for (const sale of asList(data.sales)) {
          if (!sale || sale.paymentStatus === 'refunded') continue;
          const date = String(sale.date || '').slice(0, 10);
          const paidAmount = asAmount(sale.paidAmount);
          const saleCurrency = String(sale.currency || currency);
          const initialPaidAmount = Math.max(
            0,
            asAmount(sale.totalAmount) - (creditSalesByInvoice.get(String(sale.invoiceNumber || '')) || 0)
          );
          if (
            isOnOrBeforeDate(date, endDate) &&
            (!sale.customerId || !customersById.has(String(sale.customerId)))
          ) {
            unassignedReceivables.push({
              amount: Math.max(0, asAmount(sale.totalAmount) - paidAmount),
              currency: saleCurrency,
            });
          }
          if (isOnOrBeforeDate(date, endDate)) {
            moneyInThroughEndDate.push({ amount: initialPaidAmount, currency: saleCurrency });
          }
          if (!isWithinRange(date, startDate, endDate)) continue;
          sales.push({
            id: String(sale.id || sale.invoiceNumber || `${ownerId}-sale-${sales.length}`),
            date,
            invoiceNumber: String(sale.invoiceNumber || ''),
            customerName: String(sale.customerName || ''),
            totalAmount: asAmount(sale.totalAmount),
            paidAmount,
            initialPaidAmount,
            outstandingBalance: Math.max(0, asAmount(sale.totalAmount) - paidAmount),
            costOfGoodsSold: asList(sale.items).reduce(
              (total, item) => total + asAmount(item?.unitCost) * asAmount(item?.quantity),
              0
            ),
            currency: saleCurrency,
            paymentStatus: sale.paymentStatus || 'unpaid',
          });
        }

        for (const payment of asList(data.customer_ledger)) {
          if (payment?.type !== 'payment') continue;
          const date = String(payment.date || '').slice(0, 10);
          const amount = asAmount(payment.amount);
          if (isOnOrBeforeDate(date, endDate)) {
            moneyInThroughEndDate.push({ amount, currency });
          }
          if (!isWithinRange(date, startDate, endDate)) continue;
          customerPayments.push({
            id: String(payment.id || `${ownerId}-customer-payment-${customerPayments.length}`),
            date,
            customerName: customersById.get(String(payment.customerId)) || 'Customer',
            amount,
            currency,
            paymentMethod: typeof payment.paymentMethod === 'string' ? payment.paymentMethod : undefined,
            reference: typeof payment.reference === 'string' ? payment.reference : undefined,
          });
        }

        for (const purchase of asList(data.purchases)) {
          if (!purchase) continue;
          const date = String(purchase.date || '').slice(0, 10);
          const paidAmount = asAmount(purchase.paidAmount);
          const purchaseCurrency = String(purchase.currency || currency);
          if (isOnOrBeforeDate(date, endDate)) {
            if (purchase.supplierId && payableBySupplier.has(String(purchase.supplierId))) {
              const supplierId = String(purchase.supplierId);
              payableBySupplier.set(
                supplierId,
                payableBySupplier.get(supplierId) + Math.max(0, asAmount(purchase.totalCost) - paidAmount)
              );
            } else {
              unassignedPayables.push({
                amount: Math.max(0, asAmount(purchase.totalCost) - paidAmount),
                currency: purchaseCurrency,
              });
            }
          }
          if (isOnOrBeforeDate(date, endDate)) moneyOutThroughEndDate.push({ amount: paidAmount, currency: purchaseCurrency });
          if (!isWithinRange(date, startDate, endDate)) continue;
          purchases.push({
            id: String(purchase.id || purchase.purchaseNumber || `${ownerId}-purchase-${purchases.length}`),
            date,
            purchaseNumber: String(purchase.purchaseNumber || ''),
            supplierName: String(purchase.supplierName || ''),
            totalCost: asAmount(purchase.totalCost),
            paidAmount,
            outstandingBalance: Math.max(0, asAmount(purchase.totalCost) - paidAmount),
            currency: purchaseCurrency,
          });
        }

        for (const payment of asList(data.supplier_ledger)) {
          if (!payment || payment.type !== 'payment') continue;
          const date = String(payment.date || '').slice(0, 10);
          const amount = asAmount(payment.amount);
          if (
            isOnOrBeforeDate(date, endDate) &&
            payableBySupplier.has(String(payment.supplierId))
          ) {
            const supplierId = String(payment.supplierId);
            payableBySupplier.set(supplierId, Math.max(0, payableBySupplier.get(supplierId) - amount));
          }
          if (isOnOrBeforeDate(date, endDate)) moneyOutThroughEndDate.push({ amount, currency });
          if (!isWithinRange(date, startDate, endDate)) continue;
          supplierPayments.push({
            id: String(payment.id || `${ownerId}-supplier-payment-${supplierPayments.length}`),
            date,
            supplierName: suppliersById.get(String(payment.supplierId)) || 'Supplier',
            amount,
            currency,
            paymentMethod: typeof payment.paymentMethod === 'string' ? payment.paymentMethod : undefined,
            reference: typeof payment.reference === 'string' ? payment.reference : undefined,
          });
        }

        for (const entry of asList(data.payroll)) {
          if (!entry) continue;
          const payments = Array.isArray(entry.payments)
            ? entry.payments
                .filter((payment) => payment && PAYMENT_METHODS.includes(payment.method))
                .map((payment) => ({
                  amount: asAmount(payment.amount),
                  method: payment.method,
                  paidAt: typeof payment.paidAt === 'string' ? payment.paidAt : '',
                  ...(typeof payment.transactionReference === 'string'
                    ? { transactionReference: payment.transactionReference }
                    : {}),
                }))
            : [];
          const legacyPayment = payments.length === 0 && entry.status === 'paid'
            ? {
                amount: asAmount(entry.amount),
                method: PAYMENT_METHODS.includes(entry.paymentMethod) ? entry.paymentMethod : 'cash',
                paidAt: typeof entry.paidAt === 'string' ? entry.paidAt : `${entry.month}-01`,
                ...(typeof entry.transactionReference === 'string'
                  ? { transactionReference: entry.transactionReference }
                  : {}),
              }
            : null;
          const allPayments = legacyPayment ? [legacyPayment] : payments;
          allPayments.forEach((payment) => {
            const date = payment.paidAt.slice(0, 10);
            if (isOnOrBeforeDate(date, endDate)) moneyOutThroughEndDate.push({
              amount: payment.amount,
              currency: String(entry.currency || currency),
            });
          });
          const hasPaymentInRange = allPayments.some((payment) =>
            isWithinRange(payment.paidAt, startDate, endDate)
          );
          const salaryMonthInRange = typeof entry.month === 'string' &&
            entry.month >= startDate.slice(0, 7) &&
            entry.month <= endDate.slice(0, 7);
          if (!salaryMonthInRange && !hasPaymentInRange) continue;
          payroll.push({
            id: String(entry.id || `${ownerId}-payroll-${payroll.length}`),
            userName: String(entry.userName || namesById.get(ownerId) || 'Employee'),
            month: entry.month,
            amount: Math.max(0, asAmount(entry.amount) + asAmount(entry.bonusAmount) - asAmount(entry.deductionAmount)),
            baseAmount: asAmount(entry.amount),
            bonusAmount: asAmount(entry.bonusAmount),
            deductionAmount: asAmount(entry.deductionAmount),
            currency: String(entry.currency || currency),
            status: entry.status || 'pending',
            paidAt: typeof entry.paidAt === 'string' ? entry.paidAt : undefined,
            paymentMethod: PAYMENT_METHODS.includes(entry.paymentMethod) ? entry.paymentMethod : undefined,
            transactionReference: typeof entry.transactionReference === 'string'
              ? entry.transactionReference
              : undefined,
            payments: allPayments,
          });
        }

        for (const customer of asList(data.customers)) {
          const customerId = String(customer.id);
          const ledgerBalance = latestCustomerBalances.get(customerId)?.balance;
          let balance = asAmount(customer.openingBalance);
          if (typeof ledgerBalance === 'number') {
            balance = ledgerBalance;
          } else if (
            customerLedgerIds.has(customerId) ||
            !isOnOrBeforeDate(String(customer.createdAt || '').slice(0, 10), endDate)
          ) {
            balance = 0;
          } else if (typeof customer.currentBalance === 'number' && Number.isFinite(customer.currentBalance)) {
            balance = customer.currentBalance;
          }
          receivableBalances.push({
            amount: Math.max(0, balance),
            currency,
          });
        }
        receivableBalances.push(...unassignedReceivables);
        for (const balance of payableBySupplier.values()) {
          if (balance > 0) payableBalances.push({ amount: balance, currency });
        }
        payableBalances.push(...unassignedPayables);
      }

      const transactions = financialTransactions.map((transaction) => {
        const accountId = String(transaction.accountId);
        const account = accountsById.get(accountId);
        const sign = transaction.type === 'income' ? 1 : -1;
        if (account && account.currency === transaction.currency) {
          accountBalances.set(
            accountId,
            Math.round(((accountBalances.get(accountId) || 0) + sign * transaction.amount + Number.EPSILON) * 100) / 100
          );
        }
        return {
          id: String(transaction._id),
          accountId,
          accountName: account?.name || 'Unknown account',
          type: transaction.type,
          category: transaction.category,
          description: transaction.description,
          amount: transaction.amount,
          currency: transaction.currency,
          date: transaction.date,
          reference: transaction.reference,
          reconciled: transaction.reconciled,
          reconciledAt: transaction.reconciledAt?.toISOString() || undefined,
          reconciledBy: transaction.reconciledBy,
          adjustmentOf: transaction.adjustmentOf ? String(transaction.adjustmentOf) : undefined,
          adjustmentReason: transaction.adjustmentReason,
          createdByName: transaction.createdByName,
          createdAt: transaction.createdAt.toISOString(),
        };
      });

      for (const expense of expenseDocuments) {
        if (!expense.accountId) continue;
        const accountId = String(expense.accountId);
        const account = accountsById.get(accountId);
        if (!account || account.currency !== expense.currency) continue;
        accountBalances.set(
          accountId,
          Math.round(((accountBalances.get(accountId) || 0) - expense.amount + Number.EPSILON) * 100) / 100
        );
      }

      const expenseTotalsThroughEndDate = expenseDocuments
        .filter((expense) => isOnOrBeforeDate(expense.date, endDate))
        .map((expense) => ({ amount: asAmount(expense.amount), currency: expense.currency }));
      const moneyOutTotals = sumByCurrency([
        ...moneyOutThroughEndDate,
        ...expenseTotalsThroughEndDate,
      ]);
      const currentBalances = { ...sumByCurrency(moneyInThroughEndDate) };
      Object.entries(moneyOutTotals).forEach(([currency, amount]) => {
        currentBalances[currency] = Math.round(((currentBalances[currency] || 0) - amount + Number.EPSILON) * 100) / 100;
      });
      const accountOpeningBalances = sumByCurrency(financialAccounts
        .filter((account) => account.createdAt.toISOString().slice(0, 10) <= endDate)
        .map((account) => ({
          amount: account.openingBalance,
          currency: account.currency,
        })));
      const financialLedgerActivity = sumByCurrency(financialTransactions.map((transaction) => ({
        amount: transaction.type === 'income' ? transaction.amount : -transaction.amount,
        currency: transaction.currency,
      })));
      const balanceCurrencies = new Set([
        ...Object.keys(accountOpeningBalances),
        ...Object.keys(financialLedgerActivity),
      ]);
      for (const currency of balanceCurrencies) {
        currentBalances[currency] = Math.round((
          (currentBalances[currency] || 0) +
          (accountOpeningBalances[currency] || 0) +
          (financialLedgerActivity[currency] || 0) +
          Number.EPSILON
        ) * 100) / 100;
      }

      return res.json({
        sales,
        customerPayments,
        purchases,
        supplierPayments,
        payroll,
        currentBalances,
        financialAccounts: financialAccounts.map((account) => ({
          id: String(account._id),
          name: account.name,
          type: account.type,
          bankName: account.bankName,
          currency: account.currency,
          openingBalance: account.openingBalance,
          balance: accountBalances.get(String(account._id)) || 0,
        })),
        financialTransactions: transactions.filter((transaction) =>
          isWithinRange(transaction.date, startDate, endDate)
        ),
        receivables: sumByCurrency(receivableBalances),
        payables: sumByCurrency(payableBalances),
        expenses: expenseDocuments.filter((expense) => isWithinRange(expense.date, startDate, endDate)).map((expense) => ({
          id: String(expense._id),
          description: expense.description,
          category: expense.category,
          amount: expense.amount,
          currency: expense.currency,
          date: expense.date,
          paymentMethod: expense.paymentMethod,
          createdBy: expense.createdBy,
          createdByName: expense.createdByName,
          accountId: expense.accountId ? String(expense.accountId) : undefined,
          reconciled: expense.reconciled,
          reconciledAt: expense.reconciledAt?.toISOString() || undefined,
          reconciledBy: expense.reconciledBy,
          createdAt: expense.createdAt.toISOString(),
        })),
      });
    } catch (error) {
      return next(error);
    }
  });

  router.post('/expenses', async (req, res, next) => {
    try {
      const { description, category, amount, currency, date, paymentMethod, accountId } = req.body;
      if (
        typeof description !== 'string' ||
        !description.trim() ||
        description.trim().length > 200 ||
        typeof category !== 'string' ||
        !category.trim() ||
        category.trim().length > 80 ||
        typeof amount !== 'number' ||
        !Number.isFinite(amount) ||
        amount <= 0 ||
        typeof currency !== 'string' ||
        !/^[A-Za-z]{3,12}$/.test(currency.trim()) ||
        !isValidDate(date) ||
        !PAYMENT_METHODS.includes(paymentMethod)
      ) {
        return res.status(400).json({ error: 'Provide valid expense details, amount, currency, date, and payment method.' });
      }
      if (accountId !== undefined) {
        if (!/^[a-f\d]{24}$/i.test(accountId)) {
          return res.status(400).json({ error: 'Choose a valid cash or bank account.' });
        }
        const account = await FinancialAccountModel.findOne({
          _id: accountId,
          tenantId: getTenantId(req.user),
          currency: currency.trim().toUpperCase(),
        }).lean();
        if (!account) {
          return res.status(400).json({ error: 'The selected account does not exist or uses another currency.' });
        }
      }

      const expense = await AccountExpenseModel.create({
        tenantId: getTenantId(req.user),
        description: description.trim(),
        category: category.trim(),
        amount: Math.round((amount + Number.EPSILON) * 100) / 100,
        currency: currency.trim().toUpperCase(),
        date,
        paymentMethod,
        ...(accountId ? { accountId } : {}),
        createdBy: req.user.id,
        createdByName: req.user.name,
      });
      return res.status(201).json({
        expense: {
          id: String(expense._id),
          description: expense.description,
          category: expense.category,
          amount: expense.amount,
          currency: expense.currency,
          date: expense.date,
          paymentMethod: expense.paymentMethod,
          createdBy: expense.createdBy,
          createdByName: expense.createdByName,
          accountId: expense.accountId ? String(expense.accountId) : undefined,
          reconciled: expense.reconciled,
          reconciledAt: expense.reconciledAt?.toISOString() || undefined,
          reconciledBy: expense.reconciledBy,
          createdAt: expense.createdAt.toISOString(),
        },
      });
    } catch (error) {
      return next(error);
    }
  });

  router.post('/accounts', async (req, res, next) => {
    try {
      const { name, type, bankName = '', currency, openingBalance = 0 } = req.body;
      if (
        typeof name !== 'string' ||
        !name.trim() ||
        name.trim().length > 120 ||
        !['cash', 'bank'].includes(type) ||
        typeof bankName !== 'string' ||
        bankName.length > 120 ||
        (type === 'bank' && !bankName.trim()) ||
        typeof currency !== 'string' ||
        !/^[A-Za-z]{3,12}$/.test(currency.trim()) ||
        typeof openingBalance !== 'number' ||
        !Number.isFinite(openingBalance) ||
        openingBalance < 0
      ) {
        return res.status(400).json({ error: 'Provide a name, cash or bank type, currency, and valid opening balance.' });
      }
      const account = await FinancialAccountModel.create({
        tenantId: getTenantId(req.user),
        name: name.trim(),
        type,
        bankName: bankName.trim(),
        currency: currency.trim().toUpperCase(),
        openingBalance: Math.round((openingBalance + Number.EPSILON) * 100) / 100,
        createdBy: req.user.id,
      });
      return res.status(201).json({
        account: {
          id: String(account._id),
          name: account.name,
          type: account.type,
          bankName: account.bankName,
          currency: account.currency,
          openingBalance: account.openingBalance,
          balance: account.openingBalance,
        },
      });
    } catch (error) {
      return next(error);
    }
  });

  router.post('/transactions', async (req, res, next) => {
    try {
      const { accountId, type, category, description, amount, currency, date, reference = '' } = req.body;
      if (
        typeof accountId !== 'string' ||
        !/^[a-f\d]{24}$/i.test(accountId) ||
        !['income', 'expense'].includes(type) ||
        typeof category !== 'string' ||
        !category.trim() ||
        category.trim().length > 80 ||
        typeof description !== 'string' ||
        !description.trim() ||
        description.trim().length > 200 ||
        typeof amount !== 'number' ||
        !Number.isFinite(amount) ||
        amount <= 0 ||
        typeof currency !== 'string' ||
        !/^[A-Za-z]{3,12}$/.test(currency.trim()) ||
        !isValidDate(date) ||
        typeof reference !== 'string' ||
        reference.length > 120
      ) {
        return res.status(400).json({ error: 'Provide valid account, type, category, description, amount, currency, and date.' });
      }
      const account = await FinancialAccountModel.findOne({
        _id: accountId,
        tenantId: getTenantId(req.user),
        currency: currency.trim().toUpperCase(),
      }).lean();
      if (!account) {
        return res.status(400).json({ error: 'The selected account does not exist or uses another currency.' });
      }
      const transaction = await FinancialTransactionModel.create({
        tenantId: getTenantId(req.user),
        accountId,
        type,
        category: category.trim(),
        description: description.trim(),
        amount: Math.round((amount + Number.EPSILON) * 100) / 100,
        currency: currency.trim().toUpperCase(),
        date,
        reference: reference.trim(),
        createdBy: req.user.id,
        createdByName: req.user.name,
      });
      return res.status(201).json({ transaction: { id: String(transaction._id) } });
    } catch (error) {
      return next(error);
    }
  });

  router.post('/transactions/:id/reconcile', async (req, res, next) => {
    try {
      if (!/^[a-f\d]{24}$/i.test(req.params.id)) {
        return res.status(400).json({ error: 'Transaction ID is invalid.' });
      }
      const transaction = await FinancialTransactionModel.findOneAndUpdate(
        {
          _id: req.params.id,
          tenantId: getTenantId(req.user),
          reconciled: false,
          adjustmentOf: { $exists: false },
        },
        {
          $set: {
            reconciled: true,
            reconciledAt: new Date(),
            reconciledBy: req.user.name,
          },
        },
        { new: true }
      );
      if (!transaction) {
        const exists = await FinancialTransactionModel.exists({
          _id: req.params.id,
          tenantId: getTenantId(req.user),
        });
        return exists
          ? res.status(409).json({ error: 'Transaction is already reconciled or cannot be reconciled.' })
          : res.status(404).json({ error: 'Transaction was not found.' });
      }
      return res.json({ reconciled: true });
    } catch (error) {
      return next(error);
    }
  });

  router.post('/expenses/:id/reconcile', async (req, res, next) => {
    try {
      if (!/^[a-f\d]{24}$/i.test(req.params.id)) {
        return res.status(400).json({ error: 'Expense ID is invalid.' });
      }
      const expense = await AccountExpenseModel.findOneAndUpdate(
        {
          _id: req.params.id,
          tenantId: getTenantId(req.user),
          accountId: { $exists: true },
          reconciled: false,
        },
        {
          $set: {
            reconciled: true,
            reconciledAt: new Date(),
            reconciledBy: req.user.name,
          },
        },
        { new: true }
      );
      if (!expense) {
        const exists = await AccountExpenseModel.exists({
          _id: req.params.id,
          tenantId: getTenantId(req.user),
        });
        return exists
          ? res.status(409).json({ error: 'Expense is already reconciled or is not linked to a cash or bank account.' })
          : res.status(404).json({ error: 'Expense was not found.' });
      }
      return res.json({ reconciled: true });
    } catch (error) {
      return next(error);
    }
  });

  router.post('/transactions/:id/adjustments', async (req, res, next) => {
    try {
      const { type, amount, reason, date, reference = '' } = req.body;
      if (
        !/^[a-f\d]{24}$/i.test(req.params.id) ||
        !['income', 'expense'].includes(type) ||
        typeof amount !== 'number' ||
        !Number.isFinite(amount) ||
        amount <= 0 ||
        typeof reason !== 'string' ||
        !reason.trim() ||
        reason.trim().length > 500 ||
        !isValidDate(date) ||
        typeof reference !== 'string' ||
        reference.length > 120
      ) {
        return res.status(400).json({ error: 'Provide a valid adjustment type, amount, reason, and date.' });
      }
      const original = await FinancialTransactionModel.findOne({
        _id: req.params.id,
        tenantId: getTenantId(req.user),
        reconciled: true,
        adjustmentOf: { $exists: false },
      }).lean();
      if (!original) {
        return res.status(404).json({ error: 'A reconciled original transaction was not found.' });
      }
      const adjustment = await FinancialTransactionModel.create({
        tenantId: original.tenantId,
        accountId: original.accountId,
        type,
        category: `Adjustment: ${original.category}`.slice(0, 80),
        description: `Adjustment for ${original.description}`.slice(0, 200),
        amount: Math.round((amount + Number.EPSILON) * 100) / 100,
        currency: original.currency,
        date,
        reference: reference.trim(),
        adjustmentOf: original._id,
        adjustmentReason: reason.trim(),
        createdBy: req.user.id,
        createdByName: req.user.name,
      });
      return res.status(201).json({ adjustment: { id: String(adjustment._id), originalId: String(original._id) } });
    } catch (error) {
      return next(error);
    }
  });

  router.post('/expenses/:id/adjustments', async (req, res, next) => {
    try {
      const { type, amount, reason, date, reference = '' } = req.body;
      if (
        !/^[a-f\d]{24}$/i.test(req.params.id) ||
        !['income', 'expense'].includes(type) ||
        typeof amount !== 'number' ||
        !Number.isFinite(amount) ||
        amount <= 0 ||
        typeof reason !== 'string' ||
        !reason.trim() ||
        reason.trim().length > 500 ||
        !isValidDate(date) ||
        typeof reference !== 'string' ||
        reference.length > 120
      ) {
        return res.status(400).json({ error: 'Provide a valid adjustment type, amount, reason, and date.' });
      }
      const original = await AccountExpenseModel.findOne({
        _id: req.params.id,
        tenantId: getTenantId(req.user),
        reconciled: true,
        accountId: { $exists: true },
      }).lean();
      if (!original) {
        return res.status(404).json({ error: 'A reconciled, account-linked expense was not found.' });
      }
      const adjustment = await FinancialTransactionModel.create({
        tenantId: original.tenantId,
        accountId: original.accountId,
        type,
        category: `Adjustment: ${original.category}`.slice(0, 80),
        description: `Adjustment for ${original.description}`.slice(0, 200),
        amount: Math.round((amount + Number.EPSILON) * 100) / 100,
        currency: original.currency,
        date,
        reference: reference.trim(),
        adjustmentOf: original._id,
        adjustmentReason: reason.trim(),
        createdBy: req.user.id,
        createdByName: req.user.name,
      });
      return res.status(201).json({ adjustment: { id: String(adjustment._id), originalId: String(original._id) } });
    } catch (error) {
      return next(error);
    }
  });

  return router;
}
