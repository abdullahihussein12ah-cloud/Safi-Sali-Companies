import React, { useState, useEffect, useRef } from 'react';
import {
  Plus,
  FileDown,
  X,
  Trash2,
  ScanLine,
  Camera,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { AppStore } from '../../services/store';
import { PurchaseInvoice, PurchaseItem, Supplier, Product } from '../../types';
import { exportToExcel } from '../../utils/exports';
import { BrowserMultiFormatReader, IScannerControls } from '@zxing/browser';

export const PurchasesPage: React.FC = () => {
  const { showToast, activeUser, t } = useApp();
  const [purchases, setPurchases] = useState<PurchaseInvoice[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [products, setProducts] = useState<Product[]>([]);

  // Modal
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedSupplierId, setSelectedSupplierId] = useState('');
  const [purchaseItems, setPurchaseItems] = useState<PurchaseItem[]>([]);
  const [paidAmount, setPaidAmount] = useState<string>('0');
  const [receivedNow, setReceivedNow] = useState(true);
  const [notes, setNotes] = useState('');
  const [barcode, setBarcode] = useState('');
  const [selectedCatalogProductId, setSelectedCatalogProductId] = useState('');
  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const barcodeVideoRef = useRef<HTMLVideoElement>(null);
  const scannerControlsRef = useRef<IScannerControls | null>(null);

  const reloadData = () => {
    setPurchases(AppStore.getPurchases());
    setSuppliers(AppStore.getSuppliers());
    setProducts(AppStore.getProducts(true));
  };

  useEffect(() => {
    reloadData();
    return AppStore.subscribe(reloadData);
  }, []);

  useEffect(() => {
    if (!isCameraOpen) return;

    let cancelled = false;
    const startCamera = async () => {
      try {
        const video = barcodeVideoRef.current;
        if (!video) throw new Error('Purchase barcode camera preview could not be opened.');
        const reader = new BrowserMultiFormatReader();
        const controls = await reader.decodeFromVideoDevice(undefined, video, (result) => {
          if (!result || cancelled) return;
          const scannedValue = result.getText().trim();
          if (!scannedValue) return;
          setBarcode(scannedValue);
          setIsCameraOpen(false);
          showToast(`${t('purchaseBarcodeScanned')} ${scannedValue}`, 'success');
        });
        if (cancelled) {
          controls.stop();
          return;
        }
        scannerControlsRef.current = controls;
      } catch (error) {
        console.error('Could not start purchase barcode camera:', error);
        const message = error instanceof Error
          ? `${t('cameraPermissionError')} ${error.message}`
          : t('cameraPermissionError');
        showToast(message, 'error');
        setIsCameraOpen(false);
      }
    };

    void startCamera();
    return () => {
      cancelled = true;
      scannerControlsRef.current?.stop();
      scannerControlsRef.current = null;
    };
  }, [isCameraOpen, showToast, t]);

  const openCreateModal = () => {
    setSelectedSupplierId('');
    setPurchaseItems([]);
    setPaidAmount('0');
    setReceivedNow(true);
    setNotes('');
    setBarcode('');
    setSelectedCatalogProductId('');
    setIsModalOpen(true);
  };

  const addProductToPurchase = (product: Product): void => {
    setPurchaseItems((current) => {
      const existingIndex = current.findIndex((item) => item.productId === product.id);
      if (existingIndex >= 0) {
        return current.map((item, index) => index === existingIndex
          ? {
              ...item,
              quantity: item.quantity + 1,
              total: (item.quantity + 1) * item.unitCost,
            }
          : item);
      }
      return [...current, {
        productId: product.id,
        productName: product.name,
        sku: product.sku,
        quantity: 1,
        unitCost: product.purchaseCost,
        total: product.purchaseCost,
      }];
    });
  };

  const addBarcodeProduct = (value: string): void => {
    const scannedCode = value.trim();
    if (!scannedCode) return;
    const product = AppStore.getProductByBarcodeOrQR(scannedCode);
    if (!product) {
      showToast(t('purchaseBarcodeProductNotFound'), 'error');
      return;
    }
    addProductToPurchase(product);
    setBarcode('');
    showToast(`${t('purchaseBarcodeProductAdded')} ${product.name}`, 'success');
  };

  const updateItem = (index: number, field: 'productId' | 'quantity' | 'unitCost', value: any) => {
    setPurchaseItems((prev) => {
      const copy = [...prev];
      const item = { ...copy[index] };
      if (field === 'productId') {
        const p = products.find((prod) => prod.id === value);
        if (p) {
          item.productId = p.id;
          item.productName = p.name;
          item.sku = p.sku;
          item.unitCost = p.purchaseCost;
        }
      } else if (field === 'quantity') {
        item.quantity = Math.max(1, parseInt(value) || 1);
      } else if (field === 'unitCost') {
        item.unitCost = Math.max(0, parseFloat(value) || 0);
      }
      item.total = item.quantity * item.unitCost;
      copy[index] = item;
      return copy;
    });
  };

  const removeItem = (index: number) => {
    setPurchaseItems((prev) => prev.filter((_, i) => i !== index));
  };

  const totalCost = purchaseItems.reduce((sum, item) => sum + item.total, 0);

  const handleCreatePurchase = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedSupplierId || !suppliers.some((supplier) => supplier.id === selectedSupplierId)) {
      showToast(t('purchaseSelectSupplier'), 'error');
      return;
    }
    if (purchaseItems.length === 0) {
      showToast(t('addLineItemFirst'), 'error');
      return;
    }
    const sup = suppliers.find((s) => s.id === selectedSupplierId);
    if (!sup) return;

    const paidNum = parseFloat(paidAmount) || 0;
    if (paidNum > totalCost) {
      showToast(t('purchasePaymentExceedsTotal'), 'error');
      return;
    }
    const balanceNum = Math.max(0, totalCost - paidNum);

    try {
      AppStore.createPurchase({
        supplierId: sup.id,
        supplierName: sup.name,
        items: purchaseItems,
        totalCost,
        paidAmount: paidNum,
        outstandingBalance: balanceNum,
        paymentStatus: balanceNum === 0 ? 'paid' : paidNum > 0 ? 'partial' : 'unpaid',
        paymentMethod: 'Bank Wire / EVC',
        received: receivedNow,
        notes: notes || 'Delivery receipt',
        userName: activeUser.name,
      });
      setIsModalOpen(false);
      setIsCameraOpen(false);
      showToast(t('purchaseOrderRecorded'), 'success');
      reloadData();
    } catch (err: any) {
      showToast(err.message || t('purchaseOrderFailed'), 'error');
    }
  };

  const handleExportExcel = () => {
    const headers = [
      'PO NUMBER',
      'DATE',
      'SUPPLIER',
      'ITEMS COUNT',
      'TOTAL COST',
      'AMOUNT PAID',
      'BALANCE DUE',
      'STOCK STATUS',
    ];
    const rows = purchases.map((p) => [
      p.purchaseNumber,
      p.date,
      p.supplierName,
      p.items.length,
      `$${p.totalCost.toFixed(2)}`,
      `$${p.paidAmount.toFixed(2)}`,
      `$${p.outstandingBalance.toFixed(2)}`,
      p.received ? 'RECEIVED' : 'PENDING',
    ]);
    exportToExcel('Purchase_Orders_Report', headers, rows);
    showToast(t('purchaseOrdersExported'), 'success');
  };

  return (
    <div className="space-y-6">
      {/* Top Header matching exact screenshot 8 */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-900 dark:text-white tracking-tight">
            {t('purchaseOrdersProcurement')}
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            {t('purchaseOrdersDescription')}
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            onClick={handleExportExcel}
            className="px-4 py-2 rounded-xl text-xs font-bold border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-750 text-slate-700 dark:text-slate-200 shadow-xs flex items-center gap-1.5 transition cursor-pointer"
          >
            <FileDown className="w-3.5 h-3.5 text-emerald-600" />
            <span>{t('exportExcel')}</span>
          </button>

          <button
            onClick={openCreateModal}
            className="px-4 py-2 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white shadow-sm flex items-center gap-1.5 transition cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>{t('newPurchaseOrder')}</span>
          </button>
        </div>
      </div>

      {/* Table matching screenshot 8 */}
      <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200/80 dark:border-slate-800 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50/60 dark:bg-slate-800/40 text-slate-400 border-b border-slate-100 dark:border-slate-800 uppercase font-bold text-[10px] tracking-wider">
              <tr>
                <th className="py-3.5 px-4">{t('poNumber')}</th>
                <th className="py-3.5 px-4">{t('date').toUpperCase()}</th>
                <th className="py-3.5 px-4">{t('supplierUpper')}</th>
                <th className="py-3.5 px-4">{t('items').toUpperCase()}</th>
                <th className="py-3.5 px-4">{t('totalCostUpper')}</th>
                <th className="py-3.5 px-4">{t('amountPaidUpper')}</th>
                <th className="py-3.5 px-4">{t('balanceDueUpper')}</th>
                <th className="py-3.5 px-4">{t('stockStatusUpper')}</th>
                <th className="py-3.5 px-4 text-right">{t('actionUpper')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {purchases.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-16 text-center text-slate-400 text-xs">
                    {t('noPurchaseOrders')}
                  </td>
                </tr>
              ) : (
                purchases.map((p) => (
                  <tr key={p.id} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition">
                    <td className="py-3.5 px-4 font-mono font-bold text-emerald-600">
                      {p.purchaseNumber}
                    </td>
                    <td className="py-3.5 px-4 font-mono text-slate-400 text-[11px] whitespace-nowrap">
                      {p.date}
                    </td>
                    <td className="py-3.5 px-4 font-bold text-slate-900 dark:text-white">
                      {p.supplierName}
                    </td>
                    <td className="py-3.5 px-4 text-slate-600 dark:text-slate-300">
                      {p.items.length} {t('items')}
                    </td>
                    <td className="py-3.5 px-4 font-mono font-black text-slate-900 dark:text-white">
                      {AppStore.formatMoney(p.totalCost)}
                    </td>
                    <td className="py-3.5 px-4 font-mono font-semibold text-emerald-600">
                      {AppStore.formatMoney(p.paidAmount)}
                    </td>
                    <td className="py-3.5 px-4 font-mono font-bold text-rose-600">
                      {p.outstandingBalance > 0 ? AppStore.formatMoney(p.outstandingBalance) : '-'}
                    </td>
                    <td className="py-3.5 px-4">
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full uppercase bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300">
                        {t('received')}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 text-right">
                      <span className="text-slate-400 font-mono text-[11px]">{t('completed')}</span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* New Purchase Order Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-slate-900/60 p-4 backdrop-blur-xs animate-in fade-in">
          <div className="my-auto w-full max-w-3xl space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl dark:border-slate-800 dark:bg-slate-900 sm:p-6">
            <div className="flex items-start justify-between border-b border-slate-100 pb-3 dark:border-slate-800">
              <div>
                <h3 className="font-bold text-slate-900 dark:text-white text-base">
                  {t('createPurchaseInvoice')}
                </h3>
                <p className="mt-1 text-[11px] text-slate-500">{t('purchaseBarcodeSubtitle')}</p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setIsCameraOpen(false);
                  setIsModalOpen(false);
                }}
                aria-label={t('close')}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreatePurchase} className="space-y-3 text-xs">
              <section className="space-y-2 rounded-2xl border border-emerald-200 bg-emerald-50/60 p-3 dark:border-emerald-900 dark:bg-emerald-950/20">
                <div className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-1.5 font-bold text-emerald-800 dark:text-emerald-300">
                    <ScanLine className="h-3.5 w-3.5" />
                    {t('realTimeBarcodeIntake')}
                  </span>
                  <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[9px] font-semibold text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200">
                    {t('usbScannerReady')}
                  </span>
                </div>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <input
                    type="text"
                    value={barcode}
                    onChange={(event) => setBarcode(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') {
                        event.preventDefault();
                        addBarcodeProduct(barcode);
                      }
                    }}
                    placeholder={t('purchaseBarcodePlaceholder')}
                    className="min-w-0 flex-1 rounded-xl border border-emerald-200 bg-white px-3 py-2 font-mono dark:border-emerald-900 dark:bg-slate-900"
                  />
                  <button
                    type="button"
                    onClick={() => addBarcodeProduct(barcode)}
                    className="flex items-center justify-center gap-1.5 rounded-xl bg-emerald-600 px-3 py-2 font-bold text-white hover:bg-emerald-500"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    {t('addBarcode')}
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsCameraOpen(true)}
                    className="flex items-center justify-center gap-1.5 rounded-xl border border-emerald-300 bg-white px-3 py-2 font-bold text-emerald-800 hover:bg-emerald-100 dark:border-emerald-800 dark:bg-slate-900 dark:text-emerald-300"
                  >
                    <Camera className="h-3.5 w-3.5" />
                    {t('cameraScan')}
                  </button>
                </div>
              </section>

              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block font-semibold text-slate-700 dark:text-slate-300">
                  <span className="mb-1 block">{t('selectSupplierRequired')}</span>
                  <select
                    required
                    value={selectedSupplierId}
                    onChange={(event) => setSelectedSupplierId(event.target.value)}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 dark:border-slate-700 dark:bg-slate-800"
                  >
                    <option value="" disabled>{t('selectSupplier')}</option>
                    {suppliers.map((supplier) => (
                      <option key={supplier.id} value={supplier.id}>
                        {supplier.name} ({supplier.contactPerson})
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block font-semibold text-slate-700 dark:text-slate-300">
                  <span className="mb-1 block">{t('orSelectProductCatalog')}</span>
                  <select
                    value={selectedCatalogProductId}
                    onChange={(event) => {
                      const product = products.find((item) => item.id === event.target.value);
                      if (product) addProductToPurchase(product);
                      setSelectedCatalogProductId('');
                    }}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 dark:border-slate-700 dark:bg-slate-800"
                  >
                    <option value="">{t('clickChooseProduct')}</option>
                    {products.map((product) => (
                      <option key={product.id} value={product.id}>{product.name}</option>
                    ))}
                  </select>
                </label>
              </div>

              <section className="space-y-2">
                <div className="font-semibold text-slate-700 dark:text-slate-300">
                  {t('orderLineItems')} ({purchaseItems.length})
                </div>
                {purchaseItems.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-slate-300 px-4 py-6 text-center text-[11px] text-slate-400 dark:border-slate-700">
                    {t('purchaseEmptyLineItems')}
                  </div>
                ) : (
                  <div className="max-h-40 space-y-2 overflow-y-auto">
                    {purchaseItems.map((item, index) => (
                      <div key={`${item.productId}-${index}`} className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-100 bg-slate-50 p-2 dark:border-slate-700 dark:bg-slate-800">
                        <div className="min-w-0 flex-1">
                          <div className="truncate font-bold text-slate-800 dark:text-slate-100">{item.productName}</div>
                          <div className="text-[10px] text-slate-400">{item.sku}</div>
                        </div>
                        <label className="flex items-center gap-1 text-slate-500">
                          {t('qtyShort')}
                          <input
                            type="number"
                            min="1"
                            value={item.quantity}
                            onChange={(event) => updateItem(index, 'quantity', event.target.value)}
                            className="w-16 rounded-lg border border-slate-200 bg-white px-2 py-1 text-center dark:border-slate-600 dark:bg-slate-900"
                          />
                        </label>
                        <label className="flex items-center gap-1 text-slate-500">
                          {t('costShort')}
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            value={item.unitCost}
                            onChange={(event) => updateItem(index, 'unitCost', event.target.value)}
                            className="w-20 rounded-lg border border-slate-200 bg-white px-2 py-1 text-right dark:border-slate-600 dark:bg-slate-900"
                          />
                        </label>
                        <span className="w-20 text-right font-bold font-mono">{AppStore.formatMoney(item.total)}</span>
                        <button
                          type="button"
                          onClick={() => removeItem(index)}
                          aria-label={t('removeProduct')}
                          className="p-1 text-slate-400 hover:text-rose-500"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </section>

              <section className="space-y-3 rounded-2xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-800">
                <div className="flex items-center justify-between gap-3">
                  <span className="font-bold text-slate-800 dark:text-slate-100">{t('totalPurchaseCost')}</span>
                  <span className="font-black font-mono text-emerald-600">{AppStore.formatMoney(totalCost)}</span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <label htmlFor="purchase-paid-now" className="text-slate-500">{t('downPaymentPaidNow')}</label>
                  <input
                    id="purchase-paid-now"
                    type="number"
                    min="0"
                    max={totalCost}
                    step="0.01"
                    value={paidAmount}
                    onChange={(event) => setPaidAmount(event.target.value)}
                    className="w-24 rounded-lg border border-slate-200 bg-white px-2 py-1 text-right font-mono dark:border-slate-600 dark:bg-slate-900"
                  />
                </div>
                <label className="flex items-start gap-2 border-t border-slate-200 pt-2 dark:border-slate-700">
                  <input
                    type="checkbox"
                    checked={receivedNow}
                    onChange={(event) => setReceivedNow(event.target.checked)}
                    className="mt-0.5 accent-emerald-600"
                  />
                  <span>
                    <span className="block font-semibold text-slate-700 dark:text-slate-300">{t('receiveStockImmediately')}</span>
                    <span className="block text-[10px] text-slate-400">{t('receiveStockImmediatelyHelp')}</span>
                  </span>
                </label>
              </section>

              <div className="flex justify-end gap-2 border-t border-slate-100 pt-3 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => {
                    setIsCameraOpen(false);
                    setIsModalOpen(false);
                  }}
                  className="rounded-xl px-4 py-2 font-semibold text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
                >
                  {t('cancel')}
                </button>
                <button
                  type="submit"
                  disabled={!purchaseItems.length || !selectedSupplierId}
                  className="rounded-xl bg-emerald-600 px-5 py-2.5 font-bold text-white hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {t('submitPurchaseOrder')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {isCameraOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-sm">
          <div className="w-full max-w-lg space-y-4 rounded-3xl border border-slate-700 bg-slate-900 p-4 text-white shadow-2xl sm:p-6">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h3 className="font-bold">{t('scanProductBarcode')}</h3>
                <p className="mt-1 text-xs text-slate-300">{t('holdBarcodeSteady')}</p>
              </div>
              <button
                type="button"
                onClick={() => setIsCameraOpen(false)}
                aria-label={t('closeBarcodeCamera')}
                className="rounded-lg p-2 text-slate-300 hover:bg-slate-800"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <video ref={barcodeVideoRef} autoPlay playsInline muted className="aspect-video w-full rounded-2xl bg-black object-cover" />
            <button
              type="button"
              onClick={() => setIsCameraOpen(false)}
              className="w-full rounded-xl bg-slate-700 px-4 py-2.5 text-sm font-semibold hover:bg-slate-600"
            >
              {t('cancelScan')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
