import React, { useState, useEffect, useRef } from 'react';
import {
  Search,
  ShoppingCart,
  Trash2,
  Plus,
  Minus,
  QrCode,
  Camera,
  Check,
  CheckCircle2,
  UserPlus,
  RotateCcw,
  Printer,
  FileDown,
  X,
  Pause,
  ClipboardList,
  Clock,
  RefreshCw,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { AppStore } from '../../services/store';
import { Product, SaleItem, Customer, PaymentMethod, SaleInvoice } from '../../types';
import { exportInvoicePDF } from '../../utils/exports';
import {
  cancelHeldPosOrder,
  claimHeldPosOrder,
  completeHeldPosOrder,
  createHeldPosOrder,
  getHeldPosOrders,
  getStoredAccessToken,
  HeldPosOrder,
  HeldPosOrderAuditEvent,
  releaseHeldPosOrder,
  updateHeldPosOrder,
} from '../../services/api';

export const PointOfSale: React.FC = () => {
  const { language, showToast, activeUser, posCartProductToAdd, setPosCartProductToAdd, t } = useApp();

  const [products, setProducts] = useState<Product[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [cart, setCart] = useState<SaleItem[]>([]);
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>('walk-in');
  const [tableName, setTableName] = useState('');
  const [branchName, setBranchName] = useState('');
  const [isProcessingSale, setIsProcessingSale] = useState(false);
  const processingSaleRef = useRef(false);
  const [heldOrders, setHeldOrders] = useState<HeldPosOrder[]>([]);
  const [heldOrderAudit, setHeldOrderAudit] = useState<HeldPosOrderAuditEvent[]>([]);
  const [activeHeldOrder, setActiveHeldOrder] = useState<HeldPosOrder | null>(null);
  const [heldOrdersModalOpen, setHeldOrdersModalOpen] = useState(false);
  const [heldOrderSearch, setHeldOrderSearch] = useState('');
  const [heldOrderStatusFilter, setHeldOrderStatusFilter] = useState<'all' | 'held' | 'processing' | 'completed' | 'cancelled'>('held');
  const [isLoadingHeldOrders, setIsLoadingHeldOrders] = useState(false);
  const [isSavingHeldOrder, setIsSavingHeldOrder] = useState(false);
  const heldOrderActionRef = useRef(false);

  // Cash vs Credit Toggle
  const [saleType, setSaleType] = useState<'cash' | 'credit'>('cash');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('cash');

  // Financial inputs
  const [taxEnabled, setTaxEnabled] = useState(() => AppStore.getSettings().taxEnabled);
  const [businessSettings, setBusinessSettings] = useState(() => AppStore.getSettings());
  const [discountInput, setDiscountInput] = useState<string>('');
  const [recordedAmountInput, setRecordedAmountInput] = useState<string>('0.00');

  // Barcode / Scanner
  const [barcodeInput, setBarcodeInput] = useState<string>('');
  const [isCameraActive, setIsCameraActive] = useState<boolean>(false);
  const videoRef = useRef<HTMLVideoElement>(null);

  // New Customer Modal
  const [newCustomerModalOpen, setNewCustomerModalOpen] = useState(false);
  const [newCustName, setNewCustName] = useState('');
  const [newCustPhone, setNewCustPhone] = useState('+252 61 ');

  // Last Completed Sale for Receipt
  const [lastCompletedSale, setLastCompletedSale] = useState<SaleInvoice | null>(null);
  const [receiptModalOpen, setReceiptModalOpen] = useState(false);

  const reloadData = () => {
    setProducts(AppStore.getProducts(false));
    setCustomers(AppStore.getCustomers());
    setBusinessSettings(AppStore.getSettings());
  };

  useEffect(() => {
    reloadData();
    return AppStore.subscribe(reloadData);
  }, []);

  const refreshHeldOrders = async () => {
    const token = getStoredAccessToken();
    if (!token) {
      showToast(t('failedToLoadHeldOrders'), 'error');
      return;
    }
    setIsLoadingHeldOrders(true);
    try {
      const result = await getHeldPosOrders(token);
      setHeldOrders(result.orders);
      setHeldOrderAudit(result.audit);
    } catch (error) {
      showToast(error instanceof Error ? error.message : t('failedToLoadHeldOrders'), 'error');
    } finally {
      setIsLoadingHeldOrders(false);
    }
  };

  useEffect(() => {
    void refreshHeldOrders();
  }, []);

  useEffect(() => {
    if (!posCartProductToAdd) return;
    const product = AppStore.getProductById(posCartProductToAdd);
    if (product) {
      addToCart(product);
      showToast(`${t('addedFromScanner')} ${product.name}`, 'success');
    }
    setPosCartProductToAdd(null);
  }, [posCartProductToAdd]);

  const categories = ['all', ...AppStore.getCategories()];

  const filteredProducts = products.filter((p) => {
    const matchesCat = selectedCategory === 'all' || p.category === selectedCategory;
    const matchesSearch =
      p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.sku.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.barcode.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCat && matchesSearch;
  });

  const addToCart = (product: Product) => {
    if (product.stock <= 0) {
      showToast(`${product.name} ${t('unitsOutOfStock')}`, 'error');
      return;
    }
    setCart((prev) => {
      const existing = prev.find((item) => item.productId === product.id);
      if (existing) {
        if (existing.quantity >= product.stock) {
          showToast(`${t('cannotExceedStock')} (${product.stock})`, 'error');
          return prev;
        }
        return prev.map((item) =>
          item.productId === product.id
            ? { ...item, quantity: item.quantity + 1, total: (item.quantity + 1) * item.unitPrice }
            : item
        );
      } else {
        const newItem: SaleItem = {
          productId: product.id,
          productName: product.name,
          sku: product.sku,
          unit: product.unit,
          quantity: 1,
          unitCost: product.purchaseCost,
          unitPrice: product.sellingPrice,
          discount: 0,
          total: product.sellingPrice,
        };
        return [...prev, newItem];
      }
    });
  };

  const updateQuantity = (productId: string, delta: number) => {
    const prod = products.find((p) => p.id === productId);
    if (!prod) return;
    setCart((prev) => {
      return prev
        .map((item) => {
          if (item.productId === productId) {
            const newQty = item.quantity + delta;
            if (newQty <= 0) return null;
            if (newQty > prod.stock) {
              showToast(t('onlyStockUnits').replace('{qty}', String(prod.stock)), 'error');
              return item;
            }
            return {
              ...item,
              quantity: newQty,
              total: newQty * item.unitPrice,
            };
          }
          return item;
        })
        .filter(Boolean) as SaleItem[];
    });
  };

  const removeFromCart = (productId: string) => {
    setCart((prev) => prev.filter((item) => item.productId !== productId));
  };

  const clearCart = () => {
    setCart([]);
    setDiscountInput('');
    setRecordedAmountInput('0.00');
    setActiveHeldOrder(null);
  };

  // Barcode Submission
  const handleBarcodeSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!barcodeInput.trim()) return;
    const matched = AppStore.getProductByBarcodeOrQR(barcodeInput);
    if (matched) {
      addToCart(matched);
      showToast(`${t('scannedProduct')} ${matched.name}`, 'success');
      setBarcodeInput('');
    } else {
      showToast(`${t('noProductFound')} "${barcodeInput}"`, 'error');
    }
  };

  // Calculations
  const productsAmount = cart.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
  const discountAmount = Math.min(productsAmount, Math.max(0, parseFloat(discountInput) || 0));
  const taxableAmount = productsAmount - discountAmount;
  const tax = taxEnabled && businessSettings.taxEnabled
    ? taxableAmount * (businessSettings.taxRate / 100)
    : 0;
  const goodsInsurance = businessSettings.goodsInsuranceEnabled
    ? taxableAmount * (businessSettings.goodsInsuranceRate / 100)
    : 0;
  const totalAmount = Math.max(0, taxableAmount + tax + goodsInsurance);

  // Sync recorded amount with total if in cash mode by default
  useEffect(() => {
    if (saleType === 'cash') {
      setRecordedAmountInput(totalAmount.toFixed(2));
    } else {
      setRecordedAmountInput('0.00');
    }
  }, [totalAmount, saleType]);

  const recordedNum = parseFloat(recordedAmountInput) || 0;
  const changeDue = Math.max(0, recordedNum - totalAmount);
  const creditBalanceDue = Math.max(0, totalAmount - recordedNum);

  const selectedCustomer = customers.find((c) => c.id === selectedCustomerId);

  const getHeldOrderPayload = () => ({
    items: cart,
    subtotal: productsAmount,
    discount: discountAmount,
    tax,
    goodsInsurance,
    totalAmount,
    customerId: selectedCustomerId !== 'walk-in' ? selectedCustomerId : '',
    customerName: selectedCustomer?.name || activeHeldOrder?.customerName || 'Walk-in Retail Customer (Macmiil)',
    customerPhone: selectedCustomer?.phone || activeHeldOrder?.customerPhone || '',
    tableName,
    branchName,
    saleType,
    paymentMethod: saleType === 'credit' ? 'deyn' as const : paymentMethod,
    recordedAmount: recordedNum,
    taxEnabled: taxEnabled && businessSettings.taxEnabled,
  });

  const handleHoldOrder = async () => {
    if (heldOrderActionRef.current || isSavingHeldOrder) return;
    if (activeHeldOrder?.status === 'processing') return;
    if (cart.length === 0) {
      showToast(t('addProductsBeforeSale'), 'error');
      return;
    }
    const token = getStoredAccessToken();
    if (!token) {
      showToast(t('heldOrderSaveError'), 'error');
      return;
    }
    heldOrderActionRef.current = true;
    setIsSavingHeldOrder(true);
    try {
      const payload = getHeldOrderPayload();
      const savedOrder = activeHeldOrder
        ? await updateHeldPosOrder(token, { ...activeHeldOrder, ...payload })
        : await createHeldPosOrder(token, payload);
      setActiveHeldOrder(null);
      clearCart();
      setTableName('');
      setBranchName('');
      showToast(`${t('heldOrderSaved')} ${savedOrder.reference}`, 'success');
      await refreshHeldOrders();
    } catch (error) {
      showToast(error instanceof Error ? error.message : t('heldOrderSaveError'), 'error');
    } finally {
      heldOrderActionRef.current = false;
      setIsSavingHeldOrder(false);
    }
  };

  const handleResumeHeldOrder = async (order: HeldPosOrder) => {
    const isOrderManager = ['admin', 'business_owner', 'business_admin', 'branch_manager', 'manager'].includes(activeUser.role);
    const claimExpired = order.status === 'processing' &&
      Date.parse(order.processingAt || '') <= Date.now() - 5 * 60 * 1000;
    if (
      order.status !== 'held' &&
      !(order.status === 'processing' && order.processingBy === activeUser.id) &&
      !(order.status === 'processing' && isOrderManager && claimExpired)
    ) return;
    if (activeHeldOrder?.id === order.id) {
      setHeldOrdersModalOpen(false);
      return;
    }
    if (cart.length > 0 && !window.confirm(t('replaceCurrentCartConfirm'))) return;
    let orderToResume = order;
    if (order.status === 'processing') {
      const token = getStoredAccessToken();
      if (!token) {
        showToast(t('heldOrderSaveError'), 'error');
        return;
      }
      try {
        const processingOrder = order.processingBy === activeUser.id && order.processingToken
          ? order
          : await claimHeldPosOrder(token, order.id);
        if (!processingOrder.processingToken) throw new Error(t('heldOrderSaveError'));
        orderToResume = await releaseHeldPosOrder(token, order.id, processingOrder.processingToken);
        setHeldOrders((current) => current.map((item) => item.id === orderToResume.id ? orderToResume : item));
      } catch (error) {
        showToast(error instanceof Error ? error.message : t('heldOrderSaveError'), 'error');
        return;
      }
    }
    setCart(orderToResume.items.map((item) => ({ ...item })));
    setSelectedCustomerId(orderToResume.customerId || 'walk-in');
    setTableName(orderToResume.tableName || '');
    setBranchName(orderToResume.branchName || '');
    setSaleType(orderToResume.saleType);
    setPaymentMethod(orderToResume.paymentMethod);
    setDiscountInput(String(orderToResume.discount));
    setRecordedAmountInput(String(orderToResume.recordedAmount));
    setTaxEnabled(orderToResume.taxEnabled);
    setActiveHeldOrder(orderToResume);
    setHeldOrdersModalOpen(false);
    showToast(`${t('heldOrderResumed')} ${orderToResume.reference}`, 'success');
  };

  const handleCancelHeldOrder = async (order: HeldPosOrder) => {
    if (order.status !== 'held' || heldOrderActionRef.current) return;
    if (!window.confirm(`${t('confirmCancelHeldOrder')} ${order.reference}?`)) return;
    const token = getStoredAccessToken();
    if (!token) {
      showToast(t('heldOrderCancelError'), 'error');
      return;
    }
    heldOrderActionRef.current = true;
    try {
      const cancelled = await cancelHeldPosOrder(token, order.id);
      setHeldOrders((current) => current.map((item) => item.id === cancelled.id ? cancelled : item));
      await refreshHeldOrders();
      showToast(`${t('heldOrderCancelled')} ${order.reference}`, 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : t('heldOrderCancelError'), 'error');
    } finally {
      heldOrderActionRef.current = false;
    }
  };

  const visibleHeldOrders = heldOrders.filter((order) => {
    const matchesStatus = heldOrderStatusFilter === 'all' || order.status === heldOrderStatusFilter;
    const query = heldOrderSearch.trim().toLocaleLowerCase();
    const matchesSearch = !query || [
      order.reference,
      order.customerName,
      order.cashierName,
      order.tableName,
      order.branchName,
    ].some((value) => value.toLocaleLowerCase().includes(query));
    return matchesStatus && matchesSearch;
  });
  const canCancelHeldOrder = (order: HeldPosOrder) =>
    ['admin', 'business_owner', 'business_admin', 'branch_manager', 'manager'].includes(activeUser.role) ||
    order.cashierId === activeUser.id;
  const canResumeHeldOrder = (order: HeldPosOrder) =>
    order.status === 'held' ||
    (order.status === 'processing' && order.processingBy === activeUser.id) ||
    (order.status === 'processing' &&
      ['admin', 'business_owner', 'business_admin', 'branch_manager', 'manager'].includes(activeUser.role) &&
      Date.parse(order.processingAt || '') <= Date.now() - 5 * 60 * 1000);

  // Handle Quick Add Customer
  const handleCreateCustomer = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCustName.trim()) return;
    const created = AppStore.saveCustomer({
      name: newCustName.trim(),
      phone: newCustPhone.trim(),
      address: 'Mogadishu',
      openingBalance: 0,
      status: 'active',
    });
    setNewCustomerModalOpen(false);
    setSelectedCustomerId(created.id);
    setNewCustName('');
    setNewCustPhone('+252 61 ');
    showToast(`${t('customer')} ${created.name} ${t('customerRegisteredSelected')}`, 'success');
  };

  // Complete Sale
  const handleFinalizeSale = async () => {
    if (processingSaleRef.current) return;
    const existingHeldSale = activeHeldOrder
      ? AppStore.getSales().find((item) => item.heldOrderId === activeHeldOrder.id)
      : undefined;
    if (!existingHeldSale && cart.length === 0) {
      showToast(t('addProductsBeforeSale'), 'error');
      return;
    }
    const unavailableItem = existingHeldSale ? undefined : cart.find((item) => {
      const product = products.find((candidate) => candidate.id === item.productId);
      return !product || item.quantity > product.stock;
    });
    if (unavailableItem) {
      const currentProduct = products.find((product) => product.id === unavailableItem.productId);
      showToast(
        currentProduct
          ? t('onlyStockUnits').replace('{qty}', String(currentProduct.stock))
          : `${unavailableItem.productName} ${t('unitsOutOfStock')}`,
        'error'
      );
      return;
    }

    if (!existingHeldSale && saleType === 'credit') {
      if (selectedCustomerId === 'walk-in') {
        showToast(t('selectCustomerForCredit'), 'error');
        return;
      }
    }

    let claimedHeldOrder: HeldPosOrder | null = null;
    let saleWasCreated = false;
    try {
      processingSaleRef.current = true;
      setIsProcessingSale(true);
      const isCredit = saleType === 'credit';
      const paid = isCredit ? recordedNum : totalAmount;
      const outstanding = isCredit ? creditBalanceDue : 0;
      const heldOrderToken = activeHeldOrder ? getStoredAccessToken() : null;
      if (activeHeldOrder && !heldOrderToken) throw new Error(t('heldOrderSaveError'));
      if (activeHeldOrder && heldOrderToken) {
        claimedHeldOrder = await claimHeldPosOrder(heldOrderToken, activeHeldOrder.id);
        setActiveHeldOrder(claimedHeldOrder);
      }

      const saleData: Omit<SaleInvoice, 'id' | 'invoiceNumber' | 'date' | 'qrIdentifier' | 'currency'> = {
        customerId: selectedCustomerId !== 'walk-in' ? selectedCustomerId : undefined,
        customerName: selectedCustomer?.name || activeHeldOrder?.customerName || 'Walk-in Retail Customer (Macmiil)',
        customerPhone: selectedCustomer?.phone || activeHeldOrder?.customerPhone,
        cashierId: activeUser.id,
        cashierName: activeUser.name,
        items: cart,
        subtotal: productsAmount,
        discount: discountAmount,
        tax,
        goodsInsurance,
        totalAmount,
        paidAmount: paid,
        outstandingBalance: outstanding,
        paymentMethod: isCredit ? 'deyn' : paymentMethod,
        paymentStatus: outstanding <= 0 ? 'paid' : paid > 0 ? 'partial' : 'unpaid',
        notes: isCredit ? 'Credit / Debt sale added to customer ledger' : `Paid via ${paymentMethod}`,
        tableName,
        branchName,
        heldOrderId: activeHeldOrder?.id,
        holdReference: activeHeldOrder?.reference,
      };
      const sale = existingHeldSale || AppStore.createSale(saleData);
      saleWasCreated = true;
      if (activeHeldOrder) {
        const token = heldOrderToken;
        const processingToken = claimedHeldOrder?.processingToken;
        if (!token || !processingToken) throw new Error(t('heldOrderSaveError'));
        const completedOrder = await completeHeldPosOrder(token, activeHeldOrder.id, processingToken);
        setHeldOrders((current) => current.map((item) => item.id === completedOrder.id ? completedOrder : item));
        setActiveHeldOrder(null);
        await refreshHeldOrders();
      }

      setLastCompletedSale(sale);
      setReceiptModalOpen(true);
      clearCart();
      setTableName('');
      setBranchName('');
      showToast(`${t('saleCompletedInvoice')}${sale.invoiceNumber}`, 'success');
    } catch (err: unknown) {
      if (claimedHeldOrder && !saleWasCreated && claimedHeldOrder.processingToken) {
        const token = getStoredAccessToken();
        if (token) {
          try {
            const released = await releaseHeldPosOrder(token, claimedHeldOrder.id, claimedHeldOrder.processingToken);
            setActiveHeldOrder(released);
            setHeldOrders((current) => current.map((item) => item.id === released.id ? released : item));
          } catch (releaseError) {
            console.error('Unable to release a held order after checkout failed:', releaseError);
          }
        }
      }
      const message = err instanceof Error ? err.message : t('saleCompletionError');
      showToast(message || t('saleCompletionError'), 'error');
    } finally {
      processingSaleRef.current = false;
      setIsProcessingSale(false);
    }
  };

  return (
    <div className="min-w-0 min-h-[calc(100dvh-5.5rem)] lg:h-[calc(100dvh-5.5rem)] flex flex-col lg:flex-row gap-4 overflow-y-auto lg:overflow-hidden">
      {/* LEFT COLUMN: Products Shelf */}
      <div className="min-w-0 min-h-0 flex-1 flex flex-col bg-white dark:bg-slate-900 rounded-3xl border border-slate-200/80 dark:border-slate-800 shadow-xs overflow-hidden">
        {/* Top Search & Barcode Row */}
        <div className="p-4 border-b border-slate-100 dark:border-slate-800 space-y-3">
          <div className="flex flex-col sm:flex-row items-center gap-2">
            {/* Search Input */}
            <div className="relative flex-1 w-full">
              <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder={t('searchProductsByName')}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-3 py-2 rounded-xl text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white placeholder-slate-400 focus:outline-hidden focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 font-medium"
              />
            </div>

            {/* Barcode / QR Input + Scan Button */}
            <form onSubmit={handleBarcodeSubmit} className="flex items-center gap-1.5 w-full sm:w-auto">
              <div className="relative flex-1 sm:w-52">
                <QrCode className="w-4 h-4 text-emerald-500 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder={t('scanBarcodeQr')}
                  value={barcodeInput}
                  onChange={(e) => setBarcodeInput(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 rounded-xl text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white font-mono"
                />
              </div>

              <button
                type="submit"
                className="px-3.5 py-2 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white shadow-xs transition cursor-pointer"
              >
                Scan
              </button>

              <button
                type="button"
                onClick={() => setIsCameraActive(!isCameraActive)}
                className="p-2 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-emerald-600 transition cursor-pointer"
                title={t('cameraScanner')}
              >
                <Camera className="w-4 h-4" />
              </button>
            </form>
          </div>

          {/* Categories Horizontal Pills */}
          <div className="min-w-0 flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
            <button
              onClick={() => setSelectedCategory('all')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition cursor-pointer ${
                selectedCategory === 'all'
                  ? 'bg-emerald-600 text-white shadow-xs'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
              }`}
            >
              All SKUs ({products.length})
            </button>
            {categories.filter((c) => c !== 'all').map((cat) => (
              <button
                key={cat}
                onClick={() => setSelectedCategory(cat)}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition cursor-pointer capitalize ${
                  selectedCategory === cat
                    ? 'bg-emerald-600 text-white shadow-xs'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>

        {/* Camera overlay if active */}
        {isCameraActive && (
          <div className="p-4 bg-slate-950 text-white border-b border-slate-800 flex flex-col items-center justify-center space-y-2">
            <div className="text-xs font-bold flex items-center justify-between w-full">
              <span>{t('webcamScanner')}</span>
              <button onClick={() => setIsCameraActive(false)} className="text-slate-400 hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="h-40 w-64 bg-slate-900 rounded-xl border border-slate-700 flex items-center justify-center relative overflow-hidden">
              <video ref={videoRef} className="w-full h-full object-cover" autoPlay playsInline muted />
              <div className="w-32 h-32 border-2 border-emerald-400 rounded-lg animate-pulse" />
            </div>
          </div>
        )}

        {/* Shelf Content */}
        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          {filteredProducts.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-slate-400 text-xs py-16 space-y-2">
              <ShoppingCart className="w-12 h-12 stroke-1 text-slate-300 dark:text-slate-700" />
              <span className="font-semibold text-slate-500">{t('noProductsMatchFilter')}</span>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-3">
              {filteredProducts.map((p) => {
                const inCart = cart.find((i) => i.productId === p.id);
                const isOutOfStock = p.stock <= 0;
                return (
                  <div
                    key={p.id}
                    onClick={() => !isOutOfStock && addToCart(p)}
                    className={`rounded-2xl border p-3 flex flex-col justify-between transition cursor-pointer select-none ${
                      isOutOfStock
                        ? 'opacity-50 border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/30 cursor-not-allowed'
                        : inCart
                        ? 'border-emerald-500 bg-emerald-50/20 dark:bg-emerald-950/20 shadow-xs'
                        : 'border-slate-200/80 dark:border-slate-800 hover:border-emerald-400 hover:shadow-md bg-white dark:bg-slate-800/50'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-1 mb-1.5">
                      <span className="text-[10px] font-mono text-slate-400 font-semibold">{p.sku}</span>
                      <span className="text-[10px] font-bold px-1.5 py-0.2 rounded-md bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300">
                        {p.stock} {p.unit}
                      </span>
                    </div>

                    {p.image && (
                      <div className="h-24 w-full rounded-xl overflow-hidden bg-slate-100 dark:bg-slate-700 mb-2">
                        <img src={p.image} alt={p.name} className="w-full h-full object-cover" />
                      </div>
                    )}

                    <div className="font-bold text-xs text-slate-800 dark:text-white line-clamp-2 leading-tight mb-2">
                      {language === 'so' && p.nameSo ? p.nameSo : p.name}
                    </div>

                    <div className="flex items-center justify-between pt-2 border-t border-slate-100 dark:border-slate-700/60">
                      <div className="text-sm font-black text-emerald-600 dark:text-emerald-400 font-mono">
                        {AppStore.formatMoney(p.sellingPrice)}
                      </div>
                      {inCart && (
                        <span className="w-5 h-5 rounded-full bg-emerald-600 text-white font-bold text-[11px] flex items-center justify-center">
                          {inCart.quantity}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* RIGHT COLUMN: POS Active Cart */}
      <div className="min-w-0 min-h-0 w-full lg:w-[410px] flex flex-col bg-white dark:bg-slate-900 rounded-3xl border border-slate-200/80 dark:border-slate-800 shadow-xs overflow-hidden shrink-0">
        {/* Cart Header */}
        <div className="p-3.5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ShoppingCart className="w-4 h-4 text-emerald-600" />
            <h2 className="font-bold text-sm text-slate-900 dark:text-white">
              POS Active Cart
            </h2>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => void handleHoldOrder()}
              disabled={cart.length === 0 || isProcessingSale || isSavingHeldOrder || activeHeldOrder?.status === 'processing'}
              className="inline-flex items-center gap-1 rounded-lg bg-amber-100 px-2 py-1.5 text-[10px] font-bold text-amber-800 hover:bg-amber-200 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-amber-950/50 dark:text-amber-300"
            >
              <Pause className="h-3 w-3" />
              {isSavingHeldOrder ? t('saving') : activeHeldOrder?.status === 'processing' ? t('processing') : activeHeldOrder ? t('editHeldOrder') : t('holdPos')}
            </button>
            <button
              type="button"
              onClick={() => {
                setHeldOrdersModalOpen(true);
                void refreshHeldOrders();
              }}
              className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2 py-1.5 text-[10px] font-bold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              <ClipboardList className="h-3 w-3" />
              {t('heldOrders')}
              {heldOrders.filter((order) => order.status === 'held').length > 0 && (
                <span className="rounded-full bg-emerald-600 px-1.5 text-[9px] text-white">
                  {heldOrders.filter((order) => order.status === 'held').length}
                </span>
              )}
            </button>
            {cart.length > 0 && (
              <button
                type="button"
                onClick={clearCart}
                disabled={activeHeldOrder?.status === 'processing'}
                className="text-xs text-rose-500 hover:text-rose-600 font-semibold flex items-center gap-1 cursor-pointer"
              >
                <RotateCcw className="w-3 h-3" />
                <span className="hidden sm:inline">{t('clearCart')}</span>
              </button>
            )}
          </div>
        </div>

        {/* Customer Select Row + "+ New" */}
        <div className="p-3 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30 space-y-2">
          <div className="flex items-center gap-2">
          <select
            value={selectedCustomerId}
            onChange={(e) => setSelectedCustomerId(e.target.value)}
            className="min-w-0 flex-1 px-3 py-2 rounded-xl text-xs bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-100 font-medium cursor-pointer"
          >
            <option value="walk-in">{t('walkInCustomer')}</option>
            {customers.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} {c.currentBalance > 0 ? `(Deyn: $${c.currentBalance})` : ''}
              </option>
            ))}
          </select>

          <button
            onClick={() => setNewCustomerModalOpen(true)}
            className="px-3 py-2 rounded-xl text-xs font-bold border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-100 text-slate-700 dark:text-slate-200 flex items-center gap-1 shrink-0 cursor-pointer"
            title={t('registerNewCustomer')}
          >
            <UserPlus className="w-3.5 h-3.5" />
            <span>+ New</span>
          </button>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <input
              type="text"
              value={tableName}
              onChange={(event) => setTableName(event.target.value)}
              placeholder={t('table')}
              aria-label={t('table')}
              maxLength={100}
              className="min-w-0 px-3 py-1.5 rounded-lg text-[11px] bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-100"
            />
            <input
              type="text"
              value={branchName}
              onChange={(event) => setBranchName(event.target.value)}
              placeholder={t('branch')}
              aria-label={t('branch')}
              maxLength={150}
              className="min-w-0 px-3 py-1.5 rounded-lg text-[11px] bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-100"
            />
          </div>
        </div>

        {/* Cash Sale (Kaash) vs Credit / Debt (Deyn) Toggle Buttons */}
        <div className="p-3 border-b border-slate-100 dark:border-slate-800 grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => {
              setSaleType('cash');
              setPaymentMethod('cash');
            }}
            className={`py-2 px-3 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer ${
              saleType === 'cash'
                ? 'bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-white border border-slate-300 dark:border-slate-700 shadow-xs'
                : 'text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-800/50'
            }`}
          >
            <span>{t('cashSale')}</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setSaleType('credit');
              setPaymentMethod('deyn');
            }}
            className={`py-2 px-3 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer ${
              saleType === 'credit'
                ? 'bg-rose-600 text-white shadow-xs shadow-rose-600/30'
                : 'text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40'
            }`}
          >
            <span>{t('creditSale')}</span>
          </button>
        </div>

        {/* Cart Itemized List */}
        <div className="min-h-0 flex-1 overflow-y-auto p-3 space-y-2">
          {cart.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-slate-400 text-xs py-12 space-y-2">
              <ShoppingCart className="w-10 h-10 stroke-1 text-slate-300 dark:text-slate-700" />
              <span className="font-semibold text-slate-500">{t('cartEmpty')}</span>
              <span className="text-[11px] text-slate-400">{t('clickProductsToAdd')}</span>
            </div>
          ) : (
            cart.map((item) => (
              <div
                key={item.productId}
                className="p-2.5 rounded-xl border border-slate-100 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-800/40 flex items-center justify-between gap-2"
              >
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-semibold text-slate-900 dark:text-white truncate">
                    {item.productName}
                  </div>
                  <div className="text-[10px] text-slate-400 font-mono">
                    {AppStore.formatMoney(item.unitPrice)} / {item.unit}
                  </div>
                </div>

                <div className="flex items-center gap-1 bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-700 px-1 py-0.5">
                  <button
                    onClick={() => updateQuantity(item.productId, -1)}
                    className="p-0.5 text-slate-500 hover:text-slate-900 dark:hover:text-white cursor-pointer"
                  >
                    <Minus className="w-3 h-3" />
                  </button>
                  <span className="text-xs font-bold px-1.5 text-slate-800 dark:text-slate-100 font-mono">
                    {item.quantity}
                  </span>
                  <button
                    onClick={() => updateQuantity(item.productId, 1)}
                    className="p-0.5 text-slate-500 hover:text-slate-900 dark:hover:text-white cursor-pointer"
                  >
                    <Plus className="w-3 h-3" />
                  </button>
                </div>

                <div className="text-right w-16">
                  <div className="text-xs font-black text-slate-900 dark:text-white font-mono">
                    {AppStore.formatMoney(item.total)}
                  </div>
                </div>

                <button
                  onClick={() => removeFromCart(item.productId)}
                  className="p-1 text-slate-400 hover:text-rose-500 cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))
          )}
        </div>

        {/* Totals & Payment Section */}
        <div className="p-2.5 bg-slate-50 dark:bg-slate-800/60 border-t border-slate-200 dark:border-slate-800 space-y-1.5">
          {/* Tax Checkbox & Discount */}
          <div className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-1.5 text-[10px]">
            <label className="min-w-0 flex items-center gap-1 cursor-pointer text-slate-600 dark:text-slate-300 font-medium">
              <input
                type="checkbox"
                checked={taxEnabled && businessSettings.taxEnabled}
                disabled={!businessSettings.taxEnabled}
                onChange={(e) => setTaxEnabled(e.target.checked)}
                className="w-3 h-3 rounded text-emerald-600 focus:ring-emerald-500"
              />
              <span className="whitespace-nowrap">{t('taxLabel')} ({businessSettings.taxRate}%)</span>
            </label>

            <div className="min-w-0 flex items-center justify-end gap-1">
              <span className="shrink-0 text-[10px] text-slate-500">
                Discount (Qiimo Dhimis):
              </span>
              <input
                type="number"
                step="0.01"
                min="0"
                value={discountInput}
                onChange={(e) => setDiscountInput(e.target.value)}
                placeholder={t('enterDiscount')}
                className="min-w-0 w-14 sm:w-16 px-1.5 py-0.5 text-right text-[10px] rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 font-mono font-bold text-emerald-600 focus:outline-hidden focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500"
                title={t('discountAmount')}
              />
            </div>
          </div>

          {/* Subtotal */}
          <div className="flex justify-between text-[10px] text-slate-600 dark:text-slate-400">
            <span>{t('productsAmount')}</span>
            <span className="font-mono font-bold">{AppStore.formatMoney(productsAmount)}</span>
          </div>
          <div className="flex justify-between text-[10px] text-rose-600 dark:text-rose-400">
            <span>{t('discount')}</span>
            <span className="font-mono font-bold">-{AppStore.formatMoney(discountAmount)}</span>
          </div>
          {taxEnabled && businessSettings.taxEnabled && (
            <div className="flex justify-between text-[10px] text-emerald-600 dark:text-emerald-400">
              <span>{t('taxAmount')} ({businessSettings.taxRate}%)</span>
              <span className="font-mono font-bold">+{AppStore.formatMoney(tax)}</span>
            </div>
          )}
          {businessSettings.goodsInsuranceEnabled && (
            <div className="flex justify-between text-[10px] text-slate-600 dark:text-slate-400">
              <span>{t('goodsInsuranceAmount')} ({businessSettings.goodsInsuranceRate}%)</span>
              <span className="font-mono font-bold">{AppStore.formatMoney(goodsInsurance)}</span>
            </div>
          )}

          {/* Grand Total */}
          <div className="flex justify-between items-center pt-1 border-t border-slate-200 dark:border-slate-700">
            <span className="text-xs font-black text-slate-900 dark:text-white">
              Total Amount (Wadarta Guud):
            </span>
            <span className="text-base font-black text-emerald-600 dark:text-emerald-400 font-mono">
              {AppStore.formatMoney(totalAmount)}
            </span>
          </div>

          {/* Payment Method Pills */}
          <div className="grid grid-cols-4 gap-1 pt-1">
            {[
              { id: 'cash', label: 'Cash' },
              { id: 'evc_plus', label: 'EVC Plus' },
              { id: 'zaad', label: 'Zaad / Sahal' },
              { id: 'premier_wallet', label: 'Salaam / Premi...' },
            ].map((m) => {
              const isSelected = paymentMethod === m.id && saleType !== 'credit';
              return (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => {
                    setSaleType('cash');
                    setPaymentMethod(m.id as any);
                  }}
                  className={`py-1.5 px-1 rounded-lg text-[11px] font-bold text-center truncate transition flex items-center justify-center gap-1 cursor-pointer ${
                    isSelected
                      ? 'bg-emerald-600 text-white shadow-xs'
                      : 'bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50'
                  }`}
                >
                  {isSelected && <Check className="w-3 h-3 shrink-0" />}
                  <span className="truncate">{m.label}</span>
                </button>
              );
            })}
          </div>

          {/* Inputs: Recorded Amount & Change Due */}
          <div className="grid grid-cols-2 gap-2 pt-1 text-xs">
            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block mb-1">
                Recorded Amount (Lacagta la Qabtay)
              </span>
              <input
                type="number"
                step="0.01"
                value={recordedAmountInput}
                onChange={(e) => setRecordedAmountInput(e.target.value)}
                className="w-full px-2.5 py-1.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white font-mono font-bold text-sm"
              />
            </div>

            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block mb-1">
                Change to Return (Baaqiga)
              </span>
              <div className="px-2.5 py-1.5 rounded-xl border border-emerald-200 dark:border-emerald-800 bg-emerald-50/60 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 font-mono font-black text-sm flex items-center">
                {AppStore.formatMoney(changeDue)}
              </div>
            </div>
          </div>

          {/* Primary Action Button */}
          <div>
          <button
            onClick={() => void handleFinalizeSale()}
            disabled={cart.length === 0 || isProcessingSale}
            className={`w-full py-3 rounded-2xl font-black text-xs shadow-md transition transform active:scale-98 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 ${
              saleType === 'credit'
                ? 'bg-rose-500/80 hover:bg-rose-600 text-white shadow-rose-600/20'
                : 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-600/20'
            }`}
          >
            <CheckCircle2 className="w-4 h-4" />
            <span>
              {saleType === 'credit'
                ? `Record Credit (Deyn: ${AppStore.formatMoney(creditBalanceDue)}) · Total ${AppStore.formatMoney(totalAmount)}`
                : `Complete Cash Sale: ${AppStore.formatMoney(totalAmount)}`}
            </span>
          </button>
          </div>
        </div>
      </div>

      {heldOrdersModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-3 backdrop-blur-xs">
          <section role="dialog" aria-modal="true" aria-labelledby="held-orders-title" className="flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xl dark:border-slate-800 dark:bg-slate-900">
            <header className="flex items-start justify-between gap-3 border-b border-slate-100 p-4 dark:border-slate-800">
              <div>
                <h2 id="held-orders-title" className="text-base font-bold text-slate-900 dark:text-white">{t('heldOrders')}</h2>
                <p className="mt-1 text-[11px] text-slate-500">{t('heldOrdersDescription')}</p>
              </div>
              <div className="flex items-center gap-2">
                <button type="button" onClick={() => void refreshHeldOrders()} disabled={isLoadingHeldOrders} aria-label={t('refresh')} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 disabled:opacity-50 dark:hover:bg-slate-800">
                  <RefreshCw className={`h-4 w-4 ${isLoadingHeldOrders ? 'animate-spin' : ''}`} />
                </button>
                <button type="button" onClick={() => setHeldOrdersModalOpen(false)} aria-label={t('close')} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800">
                  <X className="h-4 w-4" />
                </button>
              </div>
            </header>
            <div className="grid grid-cols-1 gap-2 border-b border-slate-100 p-4 dark:border-slate-800 sm:grid-cols-[minmax(0,1fr)_180px]">
              <input
                type="search"
                value={heldOrderSearch}
                onChange={(event) => setHeldOrderSearch(event.target.value)}
                placeholder={t('searchHeldOrders')}
                className="min-w-0 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs dark:border-slate-700 dark:bg-slate-800 dark:text-white"
              />
              <select
                value={heldOrderStatusFilter}
                onChange={(event) => setHeldOrderStatusFilter(event.target.value as typeof heldOrderStatusFilter)}
                aria-label={t('filterByStatus')}
                className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs dark:border-slate-700 dark:bg-slate-800 dark:text-white"
              >
                <option value="held">{t('heldStatus')}</option>
                <option value="processing">{t('processing')}</option>
                <option value="all">{t('allOrderStatuses')}</option>
                <option value="completed">{t('completedStatus')}</option>
                <option value="cancelled">{t('cancelledStatus')}</option>
              </select>
            </div>
            <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
              {isLoadingHeldOrders && heldOrders.length === 0 ? (
                <p className="py-8 text-center text-xs text-slate-500">{t('loading')}</p>
              ) : visibleHeldOrders.length === 0 ? (
                <p className="py-10 text-center text-xs text-slate-500">{t('noHeldOrders')}</p>
              ) : visibleHeldOrders.map((order) => {
                const statusLabel = order.status === 'held'
                  ? t('heldStatus')
                  : order.status === 'processing'
                    ? t('processing')
                  : order.status === 'completed'
                    ? t('completedStatus')
                    : t('cancelledStatus');
                return (
                  <article key={order.id} className="rounded-2xl border border-slate-200 p-3 dark:border-slate-800">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <strong className="font-mono text-xs text-slate-900 dark:text-white">{order.reference}</strong>
                          <span className={`rounded-full px-2 py-0.5 text-[9px] font-bold uppercase ${
                            order.status === 'held' ? 'bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300'
                              : order.status === 'processing' ? 'bg-sky-100 text-sky-800 dark:bg-sky-950/50 dark:text-sky-300'
                              : order.status === 'completed' ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300'
                                : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'
                          }`}>{statusLabel}</span>
                        </div>
                        <p className="mt-1 truncate text-xs font-semibold text-slate-800 dark:text-slate-200">{order.customerName}</p>
                        <p className="mt-1 text-[10px] text-slate-500">
                          {order.items.length} {t('items')} · {order.cashierName}
                          {order.tableName ? ` · ${t('table')}: ${order.tableName}` : ''}
                          {order.branchName ? ` · ${t('branch')}: ${order.branchName}` : ''}
                        </p>
                        <p className="mt-1 flex items-center gap-1 text-[10px] text-slate-400">
                          <Clock className="h-3 w-3" />{new Date(order.updatedAt).toLocaleString()}
                        </p>
                      </div>
                      <div className="flex items-center justify-between gap-3 sm:flex-col sm:items-end">
                        <strong className="font-mono text-sm text-emerald-700 dark:text-emerald-300">{AppStore.formatMoney(order.totalAmount)}</strong>
                        <div className="flex items-center gap-2">
                          {canResumeHeldOrder(order) && (
                            <>
                              <button type="button" onClick={() => void handleResumeHeldOrder(order)} className="rounded-lg bg-emerald-600 px-3 py-1.5 text-[10px] font-bold text-white hover:bg-emerald-500">
                                {activeHeldOrder?.id === order.id ? t('editHeldOrder') : order.status === 'processing' ? t('continueCheckout') : t('resumeOrder')}
                              </button>
                              {order.status === 'held' && canCancelHeldOrder(order) && (
                                <button type="button" onClick={() => void handleCancelHeldOrder(order)} className="rounded-lg border border-rose-200 px-3 py-1.5 text-[10px] font-bold text-rose-600 hover:bg-rose-50 dark:border-rose-900 dark:hover:bg-rose-950/40">
                                  {t('cancelOrder')}
                                </button>
                              )}
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="mt-2 border-t border-slate-100 pt-2 text-[10px] text-slate-500 dark:border-slate-800">
                      {order.items.map((item) => `${item.productName} × ${item.quantity}`).join(' · ')}
                    </div>
                  </article>
                );
              })}
              <section className="rounded-2xl bg-slate-50 p-3 dark:bg-slate-800/50">
                <h3 className="mb-2 text-[11px] font-bold text-slate-700 dark:text-slate-200">{t('recentHeldOrderActivity')}</h3>
                {heldOrderAudit.length === 0 ? (
                  <p className="text-[10px] text-slate-500">{t('noOrderActivity')}</p>
                ) : (
                  <ul className="space-y-1.5">
                    {heldOrderAudit.slice(0, 12).map((event) => (
                      <li key={event.id} className="flex flex-wrap justify-between gap-x-3 text-[10px] text-slate-500">
                        <span><strong>{event.actorName}</strong> · {event.action} · {event.reference}</span>
                        <time>{new Date(event.at).toLocaleString()}</time>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </div>
          </section>
        </div>
      )}

      {/* New Customer Modal */}
      {newCustomerModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl w-full max-w-sm shadow-2xl p-5 space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-slate-800">
              <h3 className="font-bold text-sm text-slate-900 dark:text-white">{t('quickAddCustomer')}</h3>
              <button onClick={() => setNewCustomerModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleCreateCustomer} className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-600 dark:text-slate-400 mb-1 font-semibold">{t('customerFullName')}</label>
                <input
                  type="text"
                  required
                  value={newCustName}
                  onChange={(e) => setNewCustName(e.target.value)}
                  placeholder={t('exampleCustomerName')}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white"
                />
              </div>
              <div>
                <label className="block text-slate-600 dark:text-slate-400 mb-1 font-semibold">{t('phoneNumberRequired')}</label>
                <input
                  type="text"
                  required
                  value={newCustPhone}
                  onChange={(e) => setNewCustPhone(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white font-mono"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setNewCustomerModalOpen(false)}
                  className="px-3 py-1.5 rounded-xl text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold"
                >
                  Save & Select
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Sale Receipt Confirmation Modal */}
      {receiptModalOpen && lastCompletedSale && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/70 backdrop-blur-xs animate-in fade-in">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl w-full max-w-sm shadow-2xl p-5 space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-slate-800">
              <h3 className="font-bold text-sm text-slate-900 dark:text-white flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                <span>{t('salesInvoiceCreated')}</span>
              </h3>
              <button onClick={() => setReceiptModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-4 bg-slate-50 dark:bg-slate-950 rounded-2xl border border-slate-200/80 dark:border-slate-800 font-mono text-xs space-y-2">
              <div className="text-center pb-2 border-b border-dashed border-slate-300 dark:border-slate-700">
                <div className="font-black text-sm uppercase text-slate-900 dark:text-white">
                  {AppStore.getSettings().businessName}
                </div>
                <div className="text-[10px] text-slate-400">Invoice: {lastCompletedSale.invoiceNumber}</div>
                <div className="text-[10px] text-slate-400">{lastCompletedSale.date}</div>
              </div>

              <div className="space-y-1 py-1 border-b border-dashed border-slate-300 dark:border-slate-700">
                {lastCompletedSale.items.map((it, idx) => (
                  <div key={idx} className="flex justify-between text-[11px]">
                    <span className="truncate pr-2">{it.productName} (x{it.quantity})</span>
                    <span className="font-bold">{AppStore.formatMoney(it.total)}</span>
                  </div>
                ))}
              </div>

              <div className="space-y-1 text-right text-[11px]">
                <div className="flex justify-between">
                  <span>{t('productsAmount')}</span>
                  <span>{AppStore.formatMoney(lastCompletedSale.subtotal)}</span>
                </div>
                {lastCompletedSale.discount > 0 && (
                  <div className="flex justify-between text-rose-600">
                    <span>{t('discount')}</span>
                    <span>-{AppStore.formatMoney(lastCompletedSale.discount)}</span>
                  </div>
                )}
                {lastCompletedSale.tax > 0 && (
                  <div className="flex justify-between">
                    <span>{t('taxAmount')}</span>
                    <span>{AppStore.formatMoney(lastCompletedSale.tax)}</span>
                  </div>
                )}
                {!!lastCompletedSale.goodsInsurance && lastCompletedSale.goodsInsurance > 0 && (
                  <div className="flex justify-between">
                    <span>{t('goodsInsuranceAmount')}</span>
                    <span>{AppStore.formatMoney(lastCompletedSale.goodsInsurance)}</span>
                  </div>
                )}
                <div className="flex justify-between font-black text-sm text-slate-900 dark:text-white pt-1">
                  <span>{t('totalLabel')}</span>
                  <span>{AppStore.formatMoney(lastCompletedSale.totalAmount)}</span>
                </div>
                <div className="flex justify-between text-slate-500">
                  <span>Paid:</span>
                  <span>{AppStore.formatMoney(lastCompletedSale.paidAmount)}</span>
                </div>
                {lastCompletedSale.outstandingBalance > 0 && (
                  <div className="flex justify-between text-rose-600 font-bold">
                    <span>{t('balanceDue')}</span>
                    <span>{AppStore.formatMoney(lastCompletedSale.outstandingBalance)}</span>
                  </div>
                )}
              </div>
            </div>

            <div className="flex items-center gap-2 pt-1">
              <button
                onClick={() => exportInvoicePDF(lastCompletedSale, AppStore.getSettings())}
                className="flex-1 py-2 rounded-xl text-xs font-semibold border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <FileDown className="w-3.5 h-3.5" />
                <span>{t('downloadPdf')}</span>
              </button>
              <button
                onClick={() => exportInvoicePDF(lastCompletedSale, AppStore.getSettings())}
                className="flex-1 py-2 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white flex items-center justify-center gap-1.5 shadow-xs cursor-pointer"
              >
                <Printer className="w-3.5 h-3.5" />
                <span>{t('printReceipt')}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
