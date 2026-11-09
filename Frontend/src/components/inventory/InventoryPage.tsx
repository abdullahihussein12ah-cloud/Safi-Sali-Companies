import React, { useState, useEffect } from 'react';
import {
  RotateCcw,
  Search,
  FileDown,
  X,
  Package,
  ArrowUpDown,
  History,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { AppStore } from '../../services/store';
import { Product, StockMovement } from '../../types';
import { exportToExcel } from '../../utils/exports';
import { ProductThumbnail } from '../products/ProductThumbnail';

export const InventoryPage: React.FC = () => {
  const { showToast, t, language } = useApp();
  const [products, setProducts] = useState<Product[]>([]);
  const [movements, setMovements] = useState<StockMovement[]>([]);
  const [activeTab, setActiveTab] = useState<'levels' | 'movements'>('levels');
  const [searchQuery, setSearchQuery] = useState('');

  // Stock Adjustment Modal
  const [isAdjustModalOpen, setIsAdjustModalOpen] = useState(false);
  const [selectedProductId, setSelectedProductId] = useState('');
  const [adjustDelta, setAdjustDelta] = useState<number>(0);
  const [adjustReason, setAdjustReason] = useState('');
  const [adjustmentType, setAdjustmentType] = useState<
    'adjustment' | 'damage' | 'expired' | 'customer_return' | 'supplier_return'
  >('adjustment');

  const reloadData = () => {
    setProducts(AppStore.getProductsForManagement().filter(
      (product) => !product.archived && product.approvalStatus !== 'rejected'
    ));
    setMovements(AppStore.getStockMovements());
  };

  useEffect(() => {
    reloadData();
    return AppStore.subscribe(reloadData);
  }, []);

  const totalCostVal = products.reduce((acc, p) => acc + p.stock * p.purchaseCost, 0);
  const totalRetailVal = products.reduce((acc, p) => acc + p.stock * p.sellingPrice, 0);
  const lowStockProducts = products.filter((p) => p.stock > 0 && p.stock <= p.minStock);
  const outOfStockProducts = products.filter((p) => p.stock <= 0);
  const lowStockCount = lowStockProducts.length;
  const outOfStockCount = outOfStockProducts.length;
  const lowStockUnitsRemaining = lowStockProducts.reduce((sum, product) => sum + product.stock, 0);

  const handleApplyAdjustment = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProductId || !adjustmentType || adjustDelta === 0) {
      showToast(t('selectProductQuantityError'), 'error');
      return;
    }

    try {
      AppStore.adjustStock(
        selectedProductId,
        adjustDelta,
        `${t(adjustmentType)}${adjustReason.trim() ? `: ${adjustReason.trim()}` : ''}`,
        adjustmentType === 'expired' || adjustmentType === 'damage'
          ? 'damage'
          : adjustmentType === 'customer_return' || adjustmentType === 'supplier_return'
            ? 'return'
            : 'adjustment'
      );
      setIsAdjustModalOpen(false);
      setSelectedProductId('');
      setAdjustDelta(0);
      setAdjustReason('');
      setAdjustmentType('adjustment');
      showToast(t('stockAdjustmentSaved'), 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : t('stockAdjustmentFailed'), 'error');
    }
  };

  const filteredProducts = products.filter(
    (p) =>
      p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.sku.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.barcode.includes(searchQuery)
  );

  const filteredMovements = movements.filter(
    (m) =>
      m.productName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      m.sku.toLowerCase().includes(searchQuery.toLowerCase()) ||
      m.reason.toLowerCase().includes(searchQuery.toLowerCase())
  );
  const productsById = new Map(products.map((product) => [product.id, product]));
  const supplierNames = new Map(AppStore.getSuppliers().map((supplier) => [supplier.id, supplier.name]));

  const handleExportExcel = () => {
    if (activeTab === 'levels') {
      const headers = [
        'PRODUCT NAME',
        'SKU',
        'AVAILABLE STOCK',
        'MIN THRESHOLD',
        'COST PRICE',
        'TOTAL STOCK VALUE',
      ];
      const rows = filteredProducts.map((p) => [
        p.name,
        p.sku,
        `${p.stock} ${p.unit}`,
        `${p.minStock} ${p.unit}`,
        `$${p.purchaseCost.toFixed(2)}`,
        `$${(p.stock * p.purchaseCost).toFixed(2)}`,
      ]);
      exportToExcel('Inventory_Stock_Levels', headers, rows);
    } else {
      const headers = ['DATE', 'PRODUCT', 'SKU', 'TYPE', 'QTY CHANGE', 'PREV STOCK', 'NEW STOCK', 'REASON'];
      const rows = filteredMovements.map((m) => [
        m.date,
        m.productName,
        m.sku,
        m.type.toUpperCase(),
        m.quantityDelta,
        m.previousStock,
        m.newStock,
        m.reason,
      ]);
      exportToExcel('Stock_Movement_Ledger', headers, rows);
    }
    showToast(t('inventoryExported'), 'success');
  };

  return (
    <div className="space-y-6">
      {/* Top Header matching exact screenshot 4 */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-900 dark:text-white tracking-tight">
            {t('inventoryTitle')}
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            {t('inventoryDescription')}
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            onClick={() => setIsAdjustModalOpen(true)}
            className="px-4 py-2 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white shadow-sm flex items-center gap-1.5 transition cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>{t('adjustStock')}</span>
          </button>
        </div>
      </div>

      {/* 4 Cards matching screenshot 4 */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: VALUATION (COST) */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-3xl p-5 shadow-xs">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
            {t('valuationCost')}
          </span>
          <div className="text-2xl sm:text-3xl font-black text-slate-900 dark:text-white font-mono mt-1">
            {AppStore.formatMoney(totalCostVal)}
          </div>
          <div className="text-[11px] text-slate-400 mt-1">
            {t('investedCapital')}
          </div>
        </div>

        {/* Card 2: VALUATION (RETAIL) */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-3xl p-5 shadow-xs">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
            {t('valuationRetail')}
          </span>
          <div className="text-2xl sm:text-3xl font-black text-emerald-600 font-mono mt-1">
            {AppStore.formatMoney(totalRetailVal)}
          </div>
          <div className="text-[11px] text-slate-400 mt-1">
            {t('expectedRevenueFullSale')}
          </div>
        </div>

        {/* Card 3: LOW STOCK ALERTS */}
        <div className="bg-amber-50/60 dark:bg-amber-950/20 border border-amber-200/60 dark:border-amber-900/40 rounded-3xl p-5 shadow-xs">
          <span className="text-[10px] font-bold uppercase tracking-wider text-amber-700 dark:text-amber-400">
            {t('lowStockAlertsUpper')}
          </span>
          <div className="text-2xl sm:text-3xl font-black text-amber-600 font-mono mt-1">
            {lowStockCount} {t('items')}
          </div>
          <div className="text-[11px] text-amber-700/80 dark:text-amber-400/80 mt-1">
            {t('lowStockUnitsRemaining').replace('{quantity}', String(lowStockUnitsRemaining))}
          </div>
          <ul className="mt-3 max-h-28 space-y-1 overflow-y-auto border-t border-amber-200/70 pt-2 text-[10px] dark:border-amber-900/50">
            {lowStockProducts.length ? lowStockProducts.map((product) => (
              <li key={product.id} className="flex justify-between gap-2 text-amber-900 dark:text-amber-200">
                <span className="min-w-0 truncate font-semibold">
                  {language === 'so' && product.nameSo ? product.nameSo : product.name}
                </span>
                <span className="shrink-0 font-mono font-bold">
                  {t('stockRemaining').replace('{quantity}', String(product.stock)).replace('{unit}', product.unit)}
                </span>
              </li>
            )) : (
              <li className="text-amber-700/70 dark:text-amber-400/70">{t('noLowStockProducts')}</li>
            )}
          </ul>
        </div>

        {/* Card 4: OUT OF STOCK */}
        <div className="bg-rose-50/60 dark:bg-rose-950/20 border border-rose-200/60 dark:border-rose-900/40 rounded-3xl p-5 shadow-xs">
          <span className="text-[10px] font-bold uppercase tracking-wider text-rose-700 dark:text-rose-400">
            {t('outOfStockUpper')}
          </span>
          <div className="text-2xl sm:text-3xl font-black text-rose-600 font-mono mt-1">
            {outOfStockCount} {t('items')}
          </div>
          <div className="text-[11px] text-rose-700/80 dark:text-rose-400/80 mt-1">
            {t('outOfStockProductsCount').replace('{count}', String(outOfStockCount))}
          </div>
          <ul className="mt-3 max-h-28 space-y-1 overflow-y-auto border-t border-rose-200/70 pt-2 text-[10px] dark:border-rose-900/50">
            {outOfStockProducts.length ? outOfStockProducts.map((product) => (
              <li key={product.id} className="flex justify-between gap-2 text-rose-900 dark:text-rose-200">
                <span className="min-w-0 truncate font-semibold">
                  {language === 'so' && product.nameSo ? product.nameSo : product.name}
                </span>
                <span className="shrink-0 font-mono font-bold">
                  {t('outOfStockLabel')}
                </span>
              </li>
            )) : (
              <li className="text-rose-700/70 dark:text-rose-400/70">{t('noOutOfStockProducts')}</li>
            )}
          </ul>
        </div>
      </div>

      {/* Tabs matching screenshot 4: Inventory Stock Levels (0) vs Stock Movement Ledger (1) */}
      <div className="flex items-center gap-6 border-b border-slate-200 dark:border-slate-800 text-sm font-bold">
        <button
          onClick={() => setActiveTab('levels')}
          className={`pb-3 transition relative cursor-pointer ${
            activeTab === 'levels'
              ? 'text-emerald-700 dark:text-emerald-400'
              : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
          }`}
        >
          <span>{t('inventoryStockLevels')} ({products.length})</span>
          {activeTab === 'levels' && (
            <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-emerald-600 rounded-full" />
          )}
        </button>

        <button
          onClick={() => setActiveTab('movements')}
          className={`pb-3 transition relative cursor-pointer ${
            activeTab === 'movements'
              ? 'text-emerald-700 dark:text-emerald-400'
              : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
          }`}
        >
          <span>{t('stockMovementLedger')} ({movements.length})</span>
          {activeTab === 'movements' && (
            <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-emerald-600 rounded-full" />
          )}
        </button>
      </div>

      {/* Content for Active Tab */}
      {activeTab === 'levels' ? (
        <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200/80 dark:border-slate-800 shadow-xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50/60 dark:bg-slate-800/40 text-slate-400 border-b border-slate-100 dark:border-slate-800 uppercase font-bold text-[10px] tracking-wider">
                <tr>
                  <th className="py-3.5 px-4">{t('productNameRequired').replace(' *', '').toUpperCase()}</th>
                  <th className="py-3.5 px-4">{t('categoryLabel')}</th>
                  <th className="py-3.5 px-4">SKU</th>
                  <th className="py-3.5 px-4">{t('skuBarcodeNumber')}</th>
                  <th className="py-3.5 px-4">{t('availableStock')}</th>
                  <th className="py-3.5 px-4">{t('lowStockAlertAt')}</th>
                  <th className="py-3.5 px-4">{t('purchaseCost').toUpperCase()}</th>
                  <th className="py-3.5 px-4">{t('priceLabel').toUpperCase()}</th>
                  <th className="py-3.5 px-4">{t('supplierLabel')}</th>
                  <th className="py-3.5 px-4">{t('totalStockValue')}</th>
                  <th className="py-3.5 px-4 text-right">{t('actionUpper')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {filteredProducts.length === 0 ? (
                  <tr>
                    <td colSpan={11} className="py-16 text-center text-slate-400 text-xs">
                      {t('noProductsInventory')}
                    </td>
                  </tr>
                ) : (
                  filteredProducts.map((p) => {
                    const isLow = p.stock <= p.minStock;
                    return (
                      <tr key={p.id} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition">
                        <td className="py-3.5 px-4">
                          <span className="flex items-center gap-3 font-bold text-slate-900 dark:text-white">
                            <ProductThumbnail
                              src={p.image}
                              alt={p.name}
                              className="h-10 w-10 rounded-xl"
                              productName={p.name}
                              category={p.category}
                              brand={p.brand}
                            />
                            <span>
                              {p.name}
                              {p.approvalStatus === 'pending' && (
                                <span className="mt-1 block text-[9px] font-semibold text-amber-600">
                                  {t('awaitingAdminApproval')}
                                </span>
                              )}
                            </span>
                          </span>
                        </td>
                        <td className="py-3.5 px-4 text-slate-600 dark:text-slate-300">
                          {p.category || '—'}
                        </td>
                        <td className="py-3.5 px-4 font-mono text-slate-500">
                          {p.sku}
                        </td>
                        <td className="py-3.5 px-4 font-mono text-slate-500">
                          {p.barcode || p.sku}
                        </td>
                        <td className="py-3.5 px-4 font-mono font-bold text-slate-800 dark:text-slate-200">
                          {p.stock} {p.unit}
                        </td>
                        <td className="py-3.5 px-4 font-mono text-slate-400">
                          {p.minStock} {p.unit}
                        </td>
                        <td className="py-3.5 px-4 font-mono text-slate-600 dark:text-slate-400">
                          {AppStore.formatMoney(p.purchaseCost)}
                        </td>
                        <td className="py-3.5 px-4 font-mono font-bold text-slate-900 dark:text-white">
                          {AppStore.formatMoney(p.sellingPrice)}
                        </td>
                        <td className="py-3.5 px-4 text-slate-600 dark:text-slate-300">
                          {p.supplierName || (p.supplierId ? supplierNames.get(p.supplierId) : undefined) || t('noneGeneral')}
                        </td>
                        <td className="py-3.5 px-4 font-mono font-black text-slate-900 dark:text-white">
                          {AppStore.formatMoney(p.stock * p.purchaseCost)}
                        </td>
                        <td className="py-3.5 px-4 text-right">
                          <button
                            onClick={() => {
                              setSelectedProductId(p.id);
                              setAdjustDelta(0);
                              setIsAdjustModalOpen(true);
                            }}
                            className="px-2.5 py-1 rounded-lg text-xs font-semibold text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800"
                          >
                            {t('adjust')}
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200/80 dark:border-slate-800 shadow-xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50/60 dark:bg-slate-800/40 text-slate-400 border-b border-slate-100 dark:border-slate-800 uppercase font-bold text-[10px] tracking-wider">
                <tr>
                  <th className="py-3.5 px-4">{t('dateTime')}</th>
                  <th className="py-3.5 px-4">{t('productNameRequired').replace(' *', '').toUpperCase()}</th>
                  <th className="py-3.5 px-4">{t('typeLabel')}</th>
                  <th className="py-3.5 px-4">{t('quantityDelta')}</th>
                  <th className="py-3.5 px-4">{t('previousStock')}</th>
                  <th className="py-3.5 px-4">{t('newStock')}</th>
                  <th className="py-3.5 px-4">{t('reasonNotes')}</th>
                  <th className="py-3.5 px-4">{t('userLabel')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {filteredMovements.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-16 text-center text-slate-400 text-xs">
                      No stock movement ledger records.
                    </td>
                  </tr>
                ) : (
                  filteredMovements.map((m) => (
                    <tr key={m.id} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition">
                      <td className="py-3.5 px-4 font-mono text-[11px] text-slate-400">
                        {m.date}
                      </td>
                      <td className="py-3.5 px-4">
                        <span className="flex items-center gap-3 font-bold text-slate-900 dark:text-white">
                          {(() => {
                            const product = productsById.get(m.productId);
                            return (
                              <ProductThumbnail
                                src={product?.image}
                                alt={m.productName}
                                className="h-9 w-9 rounded-lg"
                                productName={m.productName}
                                category={product?.category}
                                brand={product?.brand}
                              />
                            );
                          })()}
                          {m.productName}
                        </span>
                      </td>
                      <td className="py-3.5 px-4">
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full uppercase bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                          {m.type}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 font-mono font-bold">
                        <span className={m.quantityDelta > 0 ? 'text-emerald-600' : 'text-rose-600'}>
                          {m.quantityDelta > 0 ? `+${m.quantityDelta}` : m.quantityDelta}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 font-mono text-slate-500">{m.previousStock}</td>
                      <td className="py-3.5 px-4 font-mono font-bold text-slate-900 dark:text-white">{m.newStock}</td>
                      <td className="py-3.5 px-4 text-slate-600 dark:text-slate-400 max-w-xs truncate">{m.reason}</td>
                      <td className="py-3.5 px-4 text-slate-500">
                        {/^Maqsuud Administrator$/i.test(m.userName.trim()) ? 'Safi Sali Companies' : m.userName}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Stock Adjustment Modal */}
      {isAdjustModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-sm shadow-2xl p-4 sm:p-5 space-y-3">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
              <h3 className="font-bold text-slate-900 dark:text-white text-sm">
                {t('recordStockAdjustment')}
              </h3>
              <button type="button" onClick={() => setIsAdjustModalOpen(false)} aria-label={t('close')} className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleApplyAdjustment} className="space-y-3 text-[10px]">
              <div>
                <label htmlFor="stock-adjustment-product" className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  {t('selectProductRequired')}
                </label>
                <select
                  id="stock-adjustment-product"
                  required
                  value={selectedProductId}
                  onChange={(e) => setSelectedProductId(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700"
                >
                  <option value="">{t('selectProduct')}</option>
                  {products.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} ({p.stock} {t('inStock').toLowerCase()})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor="stock-adjustment-type" className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  {t('adjustmentType')}
                </label>
                <select
                  id="stock-adjustment-type"
                  required
                  value={adjustmentType}
                  onChange={(e) => setAdjustmentType(e.target.value as typeof adjustmentType)}
                  className="w-full px-3 py-2 rounded-xl text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700"
                >
                  <option value="adjustment">{t('physicalStockCountCorrection')}</option>
                  <option value="damage">{t('damagedBrokenGoodsWriteOff')}</option>
                  <option value="expired">{t('expiredShelfStock')}</option>
                  <option value="customer_return">{t('customerReturnedGoods')}</option>
                  <option value="supplier_return">{t('returnToSupplier')}</option>
                </select>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  {t('quantityChangeLabel')}
                </label>
                <input
                  type="number"
                  required
                  step="any"
                  value={adjustDelta || ''}
                  onChange={(e) => setAdjustDelta(Number(e.target.value) || 0)}
                  placeholder={t('quantityChangeShortExample')}
                  className="w-full px-3 py-2 text-sm font-bold rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 font-mono"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  {t('reasonAuditMemo')}
                </label>
                <input
                  type="text"
                  required
                  value={adjustReason}
                  onChange={(e) => setAdjustReason(e.target.value)}
                  placeholder={t('stockAdjustmentMemoExample')}
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsAdjustModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-slate-600 hover:bg-slate-100"
                >
                  {t('cancel')}
                </button>
                <button
                  type="submit"
                  className="px-5 py-2.5 rounded-xl font-bold bg-emerald-600 hover:bg-emerald-500 text-white"
                >
                  {t('commitAdjustment')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
