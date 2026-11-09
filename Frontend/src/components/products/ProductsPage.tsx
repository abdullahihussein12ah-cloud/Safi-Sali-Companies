import React, { useState, useEffect, useRef } from 'react';
import {
  Package,
  Plus,
  Search,
  FileDown,
  Edit2,
  Trash2,
  Upload,
  X,
  Image as ImageIcon,
  CheckCircle2,
  ChevronDown,
  RefreshCw,
  Check,
  ScanLine,
  Eye,
  LayoutGrid,
  List,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { AppStore } from '../../services/store';
import { getPlanLimits, getRecommendedUpgradePlan } from '../../services/licenseLimits';
import { PlanUpgradeModal } from '../plans/PlanUpgradeModal';
import { Product, UnitType } from '../../types';
import { exportToExcel } from '../../utils/exports';
import { BrowserMultiFormatReader, IScannerControls } from '@zxing/browser';
import { isBusinessAdministratorRole } from '../../services/permissions';
import { ProductThumbnail } from './ProductThumbnail';

export const ProductsPage: React.FC = () => {
  const { showToast, language, t, activeUser, license } = useApp();
  const translateRef = useRef(t);
  const showToastRef = useRef(showToast);
  translateRef.current = t;
  showToastRef.current = showToast;
  const [products, setProducts] = useState<Product[]>([]);
  const [suppliers, setSuppliers] = useState(AppStore.getSuppliers().filter((supplier) => supplier.status === 'active'));
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [selectedBrand, setSelectedBrand] = useState('all');
  const [selectedSupplier, setSelectedSupplier] = useState('all');
  const [selectedStockStatus, setSelectedStockStatus] = useState<'all' | 'in-stock' | 'low-stock' | 'out-of-stock'>('all');
  const [sortOrder, setSortOrder] = useState<'name-asc' | 'name-desc' | 'price-asc' | 'price-desc'>('name-asc');
  const [viewMode, setViewMode] = useState<'table' | 'grid'>('table');
  const [viewingProduct, setViewingProduct] = useState<Product | null>(null);

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [showPlanUpgrade, setShowPlanUpgrade] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  // Form Fields
  const [name, setName] = useState('');
  const [sku, setSku] = useState('');
  const [barcode, setBarcode] = useState('');
  const [barcodeRegistered, setBarcodeRegistered] = useState(false);
  const [category, setCategory] = useState('');
  const [brand, setBrand] = useState('Generic');
  const [purchaseCost, setPurchaseCost] = useState<number>(0);
  const [sellingPrice, setSellingPrice] = useState<number>(0);
  const [wholesalePrice, setWholesalePrice] = useState<number>(0);
  const [stock, setStock] = useState<number>(0);
  const [minStock, setMinStock] = useState<number>(5);
  const [unit, setUnit] = useState<UnitType>('pcs');
  const [supplierId, setSupplierId] = useState('');
  const [image, setImage] = useState<string>('');
  const [description, setDescription] = useState('');
  const [isBarcodeCameraOpen, setIsBarcodeCameraOpen] = useState(false);
  const [barcodeCameraError, setBarcodeCameraError] = useState('');
  const [barcodeCameraStream, setBarcodeCameraStream] = useState<MediaStream | null>(null);
  const [scannerCode, setScannerCode] = useState('');

  // Delete product confirmation
  const [productToDelete, setProductToDelete] = useState<Product | null>(null);

  // CSV Import State
  const importFileInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const barcodeInputRef = useRef<HTMLInputElement>(null);
  const barcodeVideoRef = useRef<HTMLVideoElement>(null);
  const scannerCodeInputRef = useRef<HTMLInputElement>(null);
  const barcodeScannerControlsRef = useRef<IScannerControls | null>(null);
  const barcodeCameraRequestRef = useRef(0);

  const reloadData = () => {
    setProducts(AppStore.getProductsForManagement());
    setSuppliers(AppStore.getSuppliers().filter((supplier) => supplier.status === 'active'));
  };

  useEffect(() => {
    reloadData();
    return AppStore.subscribe(reloadData);
  }, []);

  useEffect(() => {
    if (!isBarcodeCameraOpen || !barcodeCameraStream) return;

    let cancelled = false;
    const startScanning = async () => {
      try {
        const video = barcodeVideoRef.current;
        if (!video) throw new Error('Barcode camera preview could not be opened.');
        const reader = new BrowserMultiFormatReader();
        const controls = await reader.decodeFromStream(barcodeCameraStream, video, (result) => {
          if (!result || cancelled) return;
          const value = result.getText().trim();
          if (!value) return;
          registerScannedBarcode(value);
          barcodeScannerControlsRef.current?.stop();
          barcodeScannerControlsRef.current = null;
          barcodeCameraStream.getTracks().forEach((track) => track.stop());
          setBarcodeCameraStream(null);
        });
        if (cancelled) {
          controls.stop();
          return;
        }
        barcodeScannerControlsRef.current = controls;
      } catch (error) {
        barcodeCameraStream.getTracks().forEach((track) => track.stop());
        console.error('Could not start barcode camera:', error);
        const name = error instanceof DOMException ? error.name : '';
        const message = name === 'NotAllowedError' || name === 'SecurityError'
          ? translateRef.current('cameraAccessDenied')
          : error instanceof Error
            ? `${translateRef.current('cameraPermissionError')} ${error.message}`
            : translateRef.current('cameraPermissionError');
        setBarcodeCameraError(message);
        setBarcodeCameraStream(null);
        showToastRef.current(message, 'error');
      }
    };

    void startScanning();
    return () => {
      cancelled = true;
      barcodeScannerControlsRef.current?.stop();
      barcodeScannerControlsRef.current = null;
      barcodeCameraStream.getTracks().forEach((track) => track.stop());
    };
  }, [isBarcodeCameraOpen, barcodeCameraStream]);

  useEffect(() => {
    if (isBarcodeCameraOpen) scannerCodeInputRef.current?.focus();
  }, [isBarcodeCameraOpen]);

  const categories = ['all', ...AppStore.getCategories()];
  const categoryRecords = AppStore.getCategoryRecords();
  const selectableCategoryRecords = categoryRecords.filter((record) => record.status === 'active' || record.name === category);
  const brandRecords = AppStore.getBrandRecords();
  const brandNames = Array.from(new Set([
    ...brandRecords.filter((brandRecord) => brandRecord.status === 'active' || brandRecord.name === brand).map((brandRecord) => brandRecord.name),
    ...products.map((product) => product.brand).filter(Boolean),
  ])).sort((left, right) => left.localeCompare(right));

  const registerScannedBarcode = (value: string) => {
    const scannedCode = value.trim();
    if (!scannedCode) return;
    setBarcode(scannedCode);
    setSku(scannedCode);
    setBarcodeRegistered(true);
    setScannerCode('');
    setIsBarcodeCameraOpen(false);
    showToast(`${t('barcodeScanned')} ${scannedCode}`, 'success');
  };

  const handleStartBarcodeScan = async () => {
    const requestId = ++barcodeCameraRequestRef.current;
    barcodeScannerControlsRef.current?.stop();
    barcodeScannerControlsRef.current = null;
    barcodeCameraStream?.getTracks().forEach((track) => track.stop());
    setBarcodeCameraStream(null);
    setBarcodeCameraError('');
    setScannerCode('');
    setIsBarcodeCameraOpen(true);
    if (!window.isSecureContext) {
      setBarcodeCameraError(t('cameraRequiresSecureContext'));
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      setBarcodeCameraError(t('cameraNotSupported'));
      return;
    }

    try {
      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' } },
          audio: false,
        });
      } catch (error) {
        if (
          error instanceof DOMException &&
          ['OverconstrainedError', 'NotFoundError'].includes(error.name)
        ) {
          stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
        } else {
          throw error;
        }
      }
      if (requestId !== barcodeCameraRequestRef.current) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      setBarcodeCameraStream(stream);
    } catch (error) {
      if (requestId !== barcodeCameraRequestRef.current) return;
      console.error('Could not start barcode camera:', error);
      const name = error instanceof DOMException ? error.name : '';
      const message = name === 'NotAllowedError' || name === 'SecurityError'
        ? t('cameraAccessDenied')
        : name === 'NotFoundError'
          ? t('cameraNotFound')
          : name === 'NotReadableError'
            ? t('cameraInUse')
        : error instanceof Error
          ? `${t('cameraPermissionError')} ${error.message}`
          : t('cameraPermissionError');
      setBarcodeCameraError(message);
      showToast(message, 'error');
    }
  };

  const closeBarcodeCamera = () => {
    barcodeCameraRequestRef.current += 1;
    barcodeScannerControlsRef.current?.stop();
    barcodeScannerControlsRef.current = null;
    barcodeCameraStream?.getTracks().forEach((track) => track.stop());
    setBarcodeCameraStream(null);
    setIsBarcodeCameraOpen(false);
  };

  const generateUniqueBarcode = () => {
    let generated = '';
    do {
      generated = `${Math.floor(100000000000 + Math.random() * 900000000000)}`;
    } while (AppStore.getProductByBarcodeOrQR(generated));
    setBarcode(generated);
    setSku(generated);
    setBarcodeRegistered(true);
    showToast(t('barcodeRegistered'), 'success');
  };

  const openCreateModal = () => {
    const activeLicense = AppStore.getServerLicense();
    if (AppStore.getProductsForManagement().length >= getPlanLimits(activeLicense.planId, {
      users: activeLicense.userLimit,
      products: activeLicense.productLimit,
    }).products) {
      setShowPlanUpgrade(true);
      return;
    }
    setEditingProduct(null);
    setName('');
    setSku('');
    setBarcode('');
    setBarcodeRegistered(false);
    setCategory('');
    setBrand('');
    setPurchaseCost(0);
    setSellingPrice(0);
    setWholesalePrice(0);
    setStock(0);
    setMinStock(5);
    setUnit('pcs');
    setSupplierId('');
    setImage('');
    setDescription('');
    setIsModalOpen(true);
  };

  const openEditModal = (p: Product) => {
    setEditingProduct(p);
    setName(p.name);
    setSku(p.sku);
    setBarcode(p.barcode);
    setBarcodeRegistered(Boolean(p.barcode));
    setCategory(p.category);
    setBrand(p.brand);
    setPurchaseCost(p.purchaseCost);
    setSellingPrice(p.sellingPrice);
    setWholesalePrice(p.wholesalePrice);
    setStock(p.stock);
    setMinStock(p.minStock);
    setUnit(p.unit);
    setSupplierId(p.supplierId || '');
    setImage(p.image || '');
    setDescription(p.description || '');
    setIsModalOpen(true);
  };

  const handleImageFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = () => {
        if (typeof reader.result === 'string') {
          setImage(reader.result);
          showToast(t('productPhotoUploaded'), 'success');
        } else {
          showToast(t('photoReadError'), 'error');
        }
      };
      reader.onerror = () => showToast(t('photoReadError'), 'error');
      reader.readAsDataURL(file);
    }
    e.target.value = '';
  };

  const handleSaveProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSaving) return;
    const productSku = sku.trim() || barcode.trim();
    const productBarcode = barcode.trim() || productSku;
    if (!name.trim() || !productSku) {
      showToast(t('productNameAndSkuRequired'), 'error');
      return;
    }

    try {
      setIsSaving(true);
      const selectedSupplier = suppliers.find((supplier) => supplier.id === supplierId);
      await AppStore.saveProduct({
        id: editingProduct?.id,
        name: name.trim(),
        sku: productSku,
        barcode: productBarcode,
        qrCode: productBarcode,
        category,
        categoryId: categoryRecords.find((record) => record.name.toLocaleLowerCase() === category.toLocaleLowerCase())?.id,
        brand: brand || 'Generic',
        brandId: brandRecords.find((record) => record.name.toLocaleLowerCase() === brand.toLocaleLowerCase())?.id,
        purchaseCost: Number(purchaseCost),
        sellingPrice: Number(sellingPrice),
        wholesalePrice: Number(wholesalePrice) || Number(sellingPrice),
        stock: Number(stock),
        minStock: Number(minStock),
        unit,
        supplierId: supplierId || undefined,
        supplierName: selectedSupplier?.name,
        image,
        description,
      });
      const successMessage = editingProduct
        ? editingProduct.approvalStatus === 'rejected' && !isBusinessAdministratorRole(activeUser.role)
          ? t('productSubmittedForApproval')
          : t('productUpdated')
        : isBusinessAdministratorRole(activeUser.role)
          ? t('productRegistered')
          : t('productSubmittedForApproval');
      setIsModalOpen(false);
      showToast(successMessage, 'success');
    } catch (err: any) {
      const message = typeof err?.message === 'string' ? err.message : '';
      if (message === 'PLAN_PRODUCT_LIMIT_REACHED') {
        setShowPlanUpgrade(true);
      } else if (message.startsWith('PRODUCT_IMAGE_ALREADY_EXISTS:')) {
        showToast(
          t('productImageAlreadyExists').replace('{name}', message.slice('PRODUCT_IMAGE_ALREADY_EXISTS:'.length)),
          'error'
        );
      } else if (message.startsWith('PRODUCT_ALREADY_EXISTS:')) {
        showToast(
          t('productAlreadyExists').replace('{name}', message.slice('PRODUCT_ALREADY_EXISTS:'.length)),
          'error'
        );
      } else {
        showToast(message || t('saveProductFailed'), 'error');
      }
    } finally {
      setIsSaving(false);
    }
  };

  const handleReviewProduct = (product: Product, approvalStatus: 'accepted' | 'rejected') => {
    try {
      AppStore.reviewProduct(product.id, approvalStatus);
      showToast(
        t(approvalStatus === 'accepted' ? 'productSubmissionAccepted' : 'productSubmissionRejected')
          .replace('{name}', product.name),
        approvalStatus === 'accepted' ? 'success' : 'info'
      );
    } catch (error) {
      showToast(error instanceof Error ? error.message : t('productReviewFailed'), 'error');
    }
  };

  const handleConfirmDelete = async () => {
    if (!productToDelete) return;
    try {
      await AppStore.moveProductToRecyclingBin(productToDelete.id);
      setProductToDelete(null);
      showToast(t('productDeleted'), 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Failed to move product to the Recycling Bin.', 'error');
    }
  };

  // CSV Import parser
  const handleCSVUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const text = event.target?.result as string;
        const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
        if (lines.length < 2) return;

        const items: Array<Partial<Product>> = [];
        for (let i = 1; i < lines.length; i++) {
          const cols = lines[i].split(',').map((c) => c.trim().replace(/^"|"$/g, ''));
          if (cols[0]) {
            items.push({
              name: cols[0],
              sku: cols[1] || `SKU-${Math.floor(100 + Math.random() * 900)}`,
              purchaseCost: parseFloat(cols[2]) || 10,
              sellingPrice: parseFloat(cols[3]) || 15,
              stock: parseInt(cols[4]) || 10,
              category: cols[5] || AppStore.getCategories()[0] || '',
            });
          }
        }
        const res = AppStore.bulkImportProducts(items);
        reloadData();
        if (res.duplicates.length) {
          showToast(t('duplicateCsvProducts').replace('{names}', res.duplicates.join(', ')), 'info');
        }
        if (res.count > 0) {
          showToast(
            isBusinessAdministratorRole(activeUser.role)
              ? t('importedProducts').replace('{count}', String(res.count))
              : t('productsSubmittedForApproval').replace('{count}', String(res.count)),
            'success'
          );
        }
      } catch (err) {
        if (err instanceof Error && err.message === 'PLAN_PRODUCT_LIMIT_REACHED') {
          setShowPlanUpgrade(true);
        } else {
          showToast(t('csvImportError'), 'error');
        }
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const filteredProducts = products.filter((p) => {
    const matchesCat = selectedCategory === 'all' || p.category === selectedCategory;
    const matchesBrand = selectedBrand === 'all' || p.brand === selectedBrand;
    const matchesSupplier = selectedSupplier === 'all' || p.supplierId === selectedSupplier;
    const matchesStock = selectedStockStatus === 'all' ||
      (selectedStockStatus === 'out-of-stock' && p.stock <= 0) ||
      (selectedStockStatus === 'low-stock' && p.stock > 0 && p.stock <= p.minStock) ||
      (selectedStockStatus === 'in-stock' && p.stock > p.minStock);
    const matchesSearch =
      [p.name, p.sku, p.barcode, p.qrCode].some((value) =>
        (value || '').toLocaleLowerCase().includes(searchQuery.trim().toLocaleLowerCase())
      );
    return matchesCat && matchesBrand && matchesSupplier && matchesStock && matchesSearch;
  }).sort((left, right) => {
    if (sortOrder === 'name-desc') return right.name.localeCompare(left.name);
    if (sortOrder === 'price-asc') return left.sellingPrice - right.sellingPrice;
    if (sortOrder === 'price-desc') return right.sellingPrice - left.sellingPrice;
    return left.name.localeCompare(right.name);
  });
  const totalStockQuantity = products.reduce((sum, product) => sum + product.stock, 0);
  const lowStockCount = products.filter((product) => product.stock > 0 && product.stock <= product.minStock).length;
  const outOfStockCount = products.filter((product) => product.stock <= 0).length;
  const totalPurchaseValue = products.reduce((sum, product) => sum + product.stock * product.purchaseCost, 0);
  const totalSellingValue = products.reduce((sum, product) => sum + product.stock * product.sellingPrice, 0);
  const productLimit = getPlanLimits(license.planId, {
    users: license.userLimit,
    products: license.productLimit,
  }).products;
  const hasReachedProductLimit = Number.isFinite(productLimit) && products.length >= productLimit;

  const handleExportExcel = () => {
    const headers = [
      'PRODUCT NAME',
      'SKU / BARCODE',
      'CATEGORY',
      'COST PRICE',
      'SELLING PRICE',
      'AVAILABLE STOCK',
      'LOW STOCK ALERT AT',
      'STATUS',
    ];
    const rows = filteredProducts.map((p) => [
      p.name,
      `${p.sku} / ${p.barcode}`,
      p.category,
      `$${p.purchaseCost.toFixed(2)}`,
      `$${p.sellingPrice.toFixed(2)}`,
      `${p.stock} ${p.unit}`,
      `${p.minStock} ${p.unit}`,
      p.stock <= p.minStock ? 'LOW STOCK' : 'IN STOCK',
    ]);
    exportToExcel('Products_Hardware_Catalog', headers, rows);
    showToast(t('catalogExported'), 'success');
  };

  return (
    <div className="space-y-6">
      {/* Hidden file input */}
      <input
        type="file"
        ref={importFileInputRef}
        accept=".csv,text/csv"
        onChange={handleCSVUpload}
        className="hidden"
      />

      {/* Top Header matching exact screenshot 17 */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-900 dark:text-white tracking-tight">
            {t('productsCatalogTitle')}
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            {t('productsCatalogDescription')}
          </p>
          <p className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-emerald-50 px-2.5 py-1 text-[11px] font-bold text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
            <Package className="h-3.5 w-3.5" />
            {t('productsRegisteredCount')}: {products.length} / {Number.isFinite(productLimit) ? productLimit : t('unlimited')}
          </p>
        </div>

        <div className="flex items-center flex-wrap gap-2.5">
          <button
            onClick={() => importFileInputRef.current?.click()}
            className="px-4 py-2 rounded-xl text-xs font-bold border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-750 text-slate-700 dark:text-slate-200 shadow-xs flex items-center gap-1.5 transition cursor-pointer"
          >
            <Upload className="w-3.5 h-3.5 text-emerald-600" />
            <span>{t('importCsv')}</span>
          </button>

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
            <span>{t('addProduct')}</span>
          </button>
        </div>
      </div>

      {hasReachedProductLimit && (
        <div className="flex flex-col gap-3 rounded-2xl border border-amber-300 bg-amber-50 p-4 text-amber-950 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-200 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <span className="rounded-xl bg-amber-100 px-2.5 py-1 text-xs font-black dark:bg-amber-900/60">
              {products.length}/{productLimit}
            </span>
            <p className="text-xs font-semibold">{t('planProductLimitReached')}</p>
          </div>
          <button
            type="button"
            onClick={() => setShowPlanUpgrade(true)}
            className="inline-flex min-h-9 items-center justify-center rounded-xl bg-amber-600 px-3 text-xs font-bold text-white hover:bg-amber-500"
          >
            {t('viewPlansAndPay')}
          </button>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-8">
        {[
          [t('productsStatTotal'), String(products.length), 'text-slate-900 dark:text-white'],
          [t('productsStatCategories'), String(AppStore.getCategories().length), 'text-sky-700 dark:text-sky-300'],
          [t('productsStatBrands'), String(brandNames.length), 'text-violet-700 dark:text-violet-300'],
          [t('productsStatStock'), totalStockQuantity.toLocaleString(), 'text-indigo-700 dark:text-indigo-300'],
          [t('productsStatLowStock'), String(lowStockCount), 'text-amber-700 dark:text-amber-300'],
          [t('productsStatOutOfStock'), String(outOfStockCount), 'text-rose-700 dark:text-rose-300'],
          [t('productsStatPurchaseValue'), AppStore.formatMoney(totalPurchaseValue), 'text-slate-900 dark:text-white'],
          [t('productsStatSellingValue'), AppStore.formatMoney(totalSellingValue), 'text-emerald-700 dark:text-emerald-300'],
        ].map(([label, value, color]) => (
          <div key={label} className="min-w-0 rounded-2xl border border-slate-200 bg-white p-3 shadow-xs dark:border-slate-800 dark:bg-slate-900">
            <p className="truncate text-[9px] font-bold uppercase tracking-wide text-slate-500">{label}</p>
            <p className={`mt-1 truncate text-sm font-black ${color}`}>{value}</p>
          </div>
        ))}
      </div>

      {/* Search Bar + All Categories Dropdown matching screenshot 17 */}
      <div className="bg-white dark:bg-slate-900 p-4 rounded-3xl border border-slate-200/80 dark:border-slate-800 shadow-xs grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-6">
        <div className="relative md:col-span-2 xl:col-span-2">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder={t('searchProducts')}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-2 rounded-2xl text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white placeholder-slate-400 focus:outline-hidden focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 font-medium"
          />
        </div>

        {/* Categories Select Dropdown */}
        <div className="relative">
          <select
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
            className="w-full px-3.5 py-2 rounded-2xl text-xs font-bold bg-white dark:bg-slate-800 border-2 border-slate-900 dark:border-slate-600 text-slate-900 dark:text-white cursor-pointer appearance-none"
          >
            <option value="all">{t('allCategories')}</option>
            {categories.filter((c) => c !== 'all').map((cat) => (
              <option key={cat} value={cat}>
                {cat}
              </option>
            ))}
          </select>
          <ChevronDown className="w-4 h-4 text-slate-700 dark:text-slate-300 absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
        </div>
        <select value={selectedBrand} onChange={(event) => setSelectedBrand(event.target.value)} aria-label={t('filterByBrand')} className="min-w-0 rounded-2xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold dark:border-slate-700 dark:bg-slate-800 dark:text-white">
          <option value="all">{t('filterByBrand')}</option>
          {brandNames.map((brandName) => <option key={brandName} value={brandName}>{brandName}</option>)}
        </select>
        <select value={selectedSupplier} onChange={(event) => setSelectedSupplier(event.target.value)} aria-label={t('filterBySupplier')} className="min-w-0 rounded-2xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold dark:border-slate-700 dark:bg-slate-800 dark:text-white">
          <option value="all">{t('filterBySupplier')}</option>
          {suppliers.map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.name}</option>)}
        </select>
        <div className="flex gap-2">
          <select value={selectedStockStatus} onChange={(event) => setSelectedStockStatus(event.target.value as typeof selectedStockStatus)} aria-label={t('filterByStockStatus')} className="min-w-0 flex-1 rounded-2xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold dark:border-slate-700 dark:bg-slate-800 dark:text-white">
            <option value="all">{t('filterByStockStatus')}</option>
            <option value="in-stock">{t('inStock')}</option>
            <option value="low-stock">{t('lowStock')}</option>
            <option value="out-of-stock">{t('outOfStock')}</option>
          </select>
          <select value={sortOrder} onChange={(event) => setSortOrder(event.target.value as typeof sortOrder)} aria-label={t('sortProducts')} className="min-w-0 flex-1 rounded-2xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold dark:border-slate-700 dark:bg-slate-800 dark:text-white">
            <option value="name-asc">{t('sortNameAsc')}</option>
            <option value="name-desc">{t('sortNameDesc')}</option>
            <option value="price-asc">{t('sortPriceLowHigh')}</option>
            <option value="price-desc">{t('sortPriceHighLow')}</option>
          </select>
        </div>
        <div className="flex justify-end gap-1 xl:col-span-6">
          <button type="button" onClick={() => setViewMode('grid')} aria-label={t('gridView')} aria-pressed={viewMode === 'grid'} className={`rounded-lg border p-2 ${viewMode === 'grid' ? 'border-emerald-500 bg-emerald-50 text-emerald-700' : 'border-slate-200 text-slate-500 dark:border-slate-700'}`}><LayoutGrid className="h-4 w-4" /></button>
          <button type="button" onClick={() => setViewMode('table')} aria-label={t('tableView')} aria-pressed={viewMode === 'table'} className={`rounded-lg border p-2 ${viewMode === 'table' ? 'border-emerald-500 bg-emerald-50 text-emerald-700' : 'border-slate-200 text-slate-500 dark:border-slate-700'}`}><List className="h-4 w-4" /></button>
        </div>
      </div>

      {viewMode === 'table' ? (
      <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200/80 dark:border-slate-800 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50/60 dark:bg-slate-800/40 text-slate-400 border-b border-slate-100 dark:border-slate-800 uppercase font-bold text-[10px] tracking-wider">
              <tr>
                <th className="py-3.5 px-4">{t('productPhotoDetails')}</th>
                <th className="py-3.5 px-4">{t('skuBarcodeQr')}</th>
                <th className="py-3.5 px-4">{t('categoryLabel')}</th>
                <th className="py-3.5 px-4">{t('supplierLabel')}</th>
                <th className="py-3.5 px-4">{t('costLabel')}</th>
                <th className="py-3.5 px-4">{t('priceLabel')}</th>
                <th className="py-3.5 px-4">{t('stockLabel')}</th>
                <th className="py-3.5 px-4">{t('lowStockAlertAt')}</th>
                <th className="py-3.5 px-4">{t('statusLabel')}</th>
                <th className="py-3.5 px-4 text-right">{t('actions')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {filteredProducts.length === 0 ? (
                <tr>
                  <td colSpan={10} className="py-16 text-center text-slate-400 text-xs">
                    {t('noProductsFound')}
                  </td>
                </tr>
              ) : (
                filteredProducts.map((p) => {
                  const isOutOfStock = p.stock <= 0;
                  const isLow = !isOutOfStock && p.stock <= p.minStock;
                  return (
                    <tr key={p.id} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition">
                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-3">
                          <ProductThumbnail
                            src={p.image}
                            alt={language === 'so' && p.nameSo ? p.nameSo : p.name}
                            className="h-10 w-10 rounded-xl"
                            productName={p.name}
                            category={p.category}
                            brand={p.brand}
                          />
                          <div>
                            <div className="font-bold text-slate-900 dark:text-white">
                              {language === 'so' && p.nameSo ? p.nameSo : p.name}
                            </div>
                            <div className="text-[10px] text-slate-400 font-mono">{t('brand')}: {p.brand || t('generic')}</div>
                          </div>
                        </div>
                      </td>
                      <td className="py-3.5 px-4 font-mono text-[11px] text-slate-600 dark:text-slate-400">
                        <div>{p.sku}</div>
                        <div className="text-[10px] text-slate-400">{p.barcode}</div>
                      </td>
                      <td className="py-3.5 px-4 text-slate-600 dark:text-slate-300 font-medium">
                        {p.category}
                      </td>
                      <td className="py-3.5 px-4 text-slate-600 dark:text-slate-300">
                        {p.supplierName || suppliers.find((supplier) => supplier.id === p.supplierId)?.name || '—'}
                      </td>
                      <td className="py-3.5 px-4 font-mono text-slate-600 dark:text-slate-400">
                        {AppStore.formatMoney(p.purchaseCost)}
                      </td>
                      <td className="py-3.5 px-4 font-mono font-bold text-slate-900 dark:text-white">
                        {AppStore.formatMoney(p.sellingPrice)}
                      </td>
                      <td className="py-3.5 px-4 font-mono font-bold text-slate-800 dark:text-slate-200">
                        {p.stock} {p.unit}
                      </td>
                      <td className="py-3.5 px-4 font-mono text-slate-600 dark:text-slate-300">
                        {p.minStock} {p.unit}
                      </td>
                      <td className="py-3.5 px-4">
                        <span
                          className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase ${
                            isOutOfStock
                              ? 'bg-rose-100 dark:bg-rose-950 text-rose-700 dark:text-rose-400'
                              : isLow
                                ? 'bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-400'
                                : 'bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300'
                          }`}
                        >
                          {isOutOfStock ? t('outOfStock') : isLow ? t('lowStock') : t('inStock')}
                        </span>
                        {p.approvalStatus === 'pending' && (
                          <div className="mt-1 text-[10px] font-bold text-amber-600">{t('awaitingAdminApproval')}</div>
                        )}
                        {p.approvalStatus === 'rejected' && (
                          <div className="mt-1 text-[10px] font-bold text-rose-600">{t('productRejected')}</div>
                        )}
                      </td>
                      <td className="py-3.5 px-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {isBusinessAdministratorRole(activeUser.role) && p.approvalStatus === 'pending' && (
                            <>
                              <button
                                onClick={() => handleReviewProduct(p, 'accepted')}
                                className="p-1.5 rounded-lg text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 cursor-pointer"
                                title={t('acceptProduct')}
                              >
                                <Check className="w-4 h-4" />
                              </button>
                              <button
                                onClick={() => handleReviewProduct(p, 'rejected')}
                                className="p-1.5 rounded-lg text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 cursor-pointer"
                                title={t('rejectProduct')}
                              >
                                <X className="w-4 h-4" />
                              </button>
                            </>
                          )}
                          <button
                            onClick={() => setViewingProduct(p)}
                            className="p-1.5 rounded-lg text-sky-600 hover:bg-sky-50 dark:hover:bg-sky-950/40 cursor-pointer"
                            title={t('viewProduct')}
                          >
                            <Eye className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => openEditModal(p)}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                            title={t('editProduct')}
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => setProductToDelete(p)}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 cursor-pointer"
                            title={t('deleteProduct')}
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
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
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {filteredProducts.length ? filteredProducts.map((product) => {
            const outOfStock = product.stock <= 0;
            const lowStock = !outOfStock && product.stock <= product.minStock;
            return (
              <article key={product.id} className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xs dark:border-slate-800 dark:bg-slate-900">
                <ProductThumbnail src={product.image} alt={product.name} className="h-44 w-full rounded-none" productName={product.name} category={product.category} brand={product.brand} />
                <div className="space-y-3 p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <h3 className="truncate text-sm font-bold text-slate-900 dark:text-white">{product.name}</h3>
                      <p className="mt-1 truncate text-[10px] text-slate-500">{product.category || '—'} · {product.brand || t('generic')}</p>
                    </div>
                    <span className={`shrink-0 rounded-full px-2 py-1 text-[9px] font-bold ${outOfStock ? 'bg-rose-100 text-rose-700' : lowStock ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'}`}>
                      {outOfStock ? t('outOfStock') : lowStock ? t('lowStock') : t('inStock')}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-[10px]">
                    <div><p className="text-slate-500">SKU / Barcode</p><p className="truncate font-mono font-semibold text-slate-800 dark:text-slate-200">{product.sku} / {product.barcode}</p></div>
                    <div><p className="text-slate-500">{t('supplierLabel')}</p><p className="truncate font-semibold text-slate-800 dark:text-slate-200">{product.supplierName || suppliers.find((supplier) => supplier.id === product.supplierId)?.name || '—'}</p></div>
                    <div><p className="text-slate-500">{t('costLabel')}</p><p className="font-mono font-semibold">{AppStore.formatMoney(product.purchaseCost)}</p></div>
                    <div><p className="text-slate-500">{t('priceLabel')}</p><p className="font-mono font-bold text-emerald-700 dark:text-emerald-300">{AppStore.formatMoney(product.sellingPrice)}</p></div>
                  </div>
                  <div className="flex items-center justify-between border-t border-slate-100 pt-3 text-xs dark:border-slate-800">
                    <span className="font-mono font-bold text-slate-700 dark:text-slate-200">{product.stock} {product.unit} <span className="font-normal text-slate-400">/ min {product.minStock}</span></span>
                    <div className="flex items-center gap-1">
                      <button type="button" onClick={() => setViewingProduct(product)} aria-label={`${t('viewProduct')} ${product.name}`} className="rounded-lg p-2 text-sky-600 hover:bg-sky-50 dark:hover:bg-sky-950/40"><Eye className="h-4 w-4" /></button>
                      <button type="button" onClick={() => openEditModal(product)} aria-label={`${t('editProduct')} ${product.name}`} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"><Edit2 className="h-4 w-4" /></button>
                      <button type="button" onClick={() => setProductToDelete(product)} aria-label={`${t('deleteProduct')} ${product.name}`} className="rounded-lg p-2 text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40"><Trash2 className="h-4 w-4" /></button>
                    </div>
                  </div>
                </div>
              </article>
            );
          }) : <p className="col-span-full rounded-2xl border border-dashed border-slate-300 p-10 text-center text-xs text-slate-500">{t('noProductsFound')}</p>}
        </div>
      )}

      {viewingProduct && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4">
          <section role="dialog" aria-modal="true" aria-labelledby="product-details-title" className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-3xl border border-slate-200 bg-white p-5 shadow-2xl dark:border-slate-800 dark:bg-slate-900">
            <header className="mb-4 flex items-center justify-between gap-3">
              <h2 id="product-details-title" className="text-base font-bold text-slate-900 dark:text-white">{t('viewProduct')}: {viewingProduct.name}</h2>
              <button type="button" onClick={() => setViewingProduct(null)} aria-label={t('close')} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"><X className="h-4 w-4" /></button>
            </header>
            <ProductThumbnail src={viewingProduct.image} alt={viewingProduct.name} className="mb-4 h-48 w-full rounded-2xl" productName={viewingProduct.name} category={viewingProduct.category} brand={viewingProduct.brand} />
            <dl className="grid grid-cols-1 gap-3 text-xs sm:grid-cols-2">
              {[
                [t('categoryLabel'), viewingProduct.category || '—'],
                [t('brand'), viewingProduct.brand || t('generic')],
                ['SKU', viewingProduct.sku],
                [t('skuBarcodeNumber'), viewingProduct.barcode],
                [t('qrLabelCode'), viewingProduct.qrCode || '—'],
                [t('purchaseCostRequired'), AppStore.formatMoney(viewingProduct.purchaseCost)],
                [t('sellingPriceRequired'), AppStore.formatMoney(viewingProduct.sellingPrice)],
                [t('currentStockQuantity'), `${viewingProduct.stock} ${viewingProduct.unit}`],
                [t('lowStockAlertAt'), `${viewingProduct.minStock} ${viewingProduct.unit}`],
                [t('supplierLabel'), viewingProduct.supplierName || suppliers.find((supplier) => supplier.id === viewingProduct.supplierId)?.name || '—'],
                [t('statusLabel'), viewingProduct.stock <= 0 ? t('outOfStock') : viewingProduct.stock <= viewingProduct.minStock ? t('lowStock') : t('inStock')],
              ].map(([label, value]) => (
                <div key={label} className="rounded-xl bg-slate-50 p-3 dark:bg-slate-800">
                  <dt className="text-slate-500">{label}</dt>
                  <dd className="mt-1 break-words font-semibold text-slate-900 dark:text-white">{value}</dd>
                </div>
              ))}
              <div className="rounded-xl bg-slate-50 p-3 dark:bg-slate-800 sm:col-span-2">
                <dt className="text-slate-500">{t('descriptionLabel')}</dt>
                <dd className="mt-1 whitespace-pre-wrap font-semibold text-slate-900 dark:text-white">{viewingProduct.description || '—'}</dd>
              </div>
            </dl>
            <div className="mt-4 flex justify-end">
              <button type="button" onClick={() => { openEditModal(viewingProduct); setViewingProduct(null); }} className="rounded-xl bg-emerald-600 px-4 py-2 text-xs font-bold text-white hover:bg-emerald-500">{t('editProduct')}</button>
            </div>
          </section>
        </div>
      )}

      {/* Add / Edit Product Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-slate-900/60 p-3 backdrop-blur-xs animate-in fade-in sm:p-5">
          <div className="my-auto w-full max-w-2xl space-y-4 rounded-3xl border border-slate-200 bg-white p-4 shadow-2xl dark:border-slate-800 dark:bg-slate-900 sm:p-6">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
              <div>
                <h3 className="font-bold text-slate-900 dark:text-white text-base">
                  {editingProduct ? t('editCatalogProduct') : t('addNewProduct')}
                </h3>
                <p className="mt-0.5 text-[10px] text-slate-500">{t('productFormSubtitle')}</p>
              </div>
              <button onClick={() => { closeBarcodeCamera(); setIsModalOpen(false); }} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveProduct} className="max-h-[78vh] space-y-3 overflow-y-auto pr-1 text-xs">
              <section className="rounded-2xl border border-slate-200 bg-slate-50/80 p-3 dark:border-slate-700 dark:bg-slate-800/40">
                <label className="mb-2 block font-semibold text-slate-700 dark:text-slate-300">
                  {t('productPhoto')}
                </label>
                <div className="grid grid-cols-[64px_minmax(0,1fr)] items-center gap-3">
                  <div className="relative flex h-16 w-16 items-center justify-center overflow-hidden rounded-2xl border border-emerald-200 bg-white text-emerald-500 dark:border-slate-600 dark:bg-slate-900">
                    {image ? (
                      <>
                        <img src={image} alt="Product preview" className="h-full w-full object-cover" />
                        <button type="button" onClick={() => setImage('')} aria-label={t('removeProductPhoto')} className="absolute right-1 top-1 rounded-full bg-rose-600 p-1 text-white">
                          <X className="h-3 w-3" />
                        </button>
                      </>
                    ) : <ImageIcon className="h-6 w-6" />}
                  </div>
                  <div className="min-w-0 space-y-2">
                    <input ref={fileInputRef} type="file" accept="image/*" onChange={handleImageFile} className="hidden" />
                    <button type="button" onClick={() => fileInputRef.current?.click()} className="inline-flex min-h-8 items-center gap-2 rounded-xl border border-emerald-300 bg-emerald-100 px-3 py-1.5 font-bold text-emerald-800 transition hover:bg-emerald-200 dark:border-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300">
                      <Upload className="h-3.5 w-3.5" />
                      {t('uploadPhotoFile')}
                    </button>
                    <input
                      type="url"
                      value={image.startsWith('data:') ? '' : image}
                      onChange={(e) => setImage(e.target.value)}
                      placeholder={t('productImageUrl')}
                      className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 font-mono text-[11px] dark:border-slate-700 dark:bg-slate-900"
                    />
                  </div>
                </div>
              </section>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,2fr)_minmax(150px,1fr)]">
                <div>
                  <label className="mb-1 block font-semibold text-slate-700 dark:text-slate-300">{t('productNameRequired')}</label>
                  <input type="text" required value={name} onChange={(e) => setName(e.target.value)} placeholder={t('exampleProductName')} className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 dark:border-slate-700 dark:bg-slate-800" />
                </div>
                <div>
                  <label className="mb-1 block font-semibold text-slate-700 dark:text-slate-300">{t('categoryLabel')}</label>
                  <select value={category} onChange={(e) => setCategory(e.target.value)} className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 dark:border-slate-700 dark:bg-slate-800">
                    <option value="">{t('selectCategory')}</option>
                    {selectableCategoryRecords.map((record) => <option key={record.id} value={record.name}>{record.name}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="mb-1 block font-semibold text-slate-700 dark:text-slate-300">{t('brand')}</label>
                <select value={brand} onChange={(event) => setBrand(event.target.value)} className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 dark:border-slate-700 dark:bg-slate-800">
                  <option value="Generic">{t('generic')}</option>
                  {brandNames.filter((brandName) => brandName !== 'Generic').map((brandName) => <option key={brandName} value={brandName}>{brandName}</option>)}
                </select>
              </div>

              <section className="space-y-2 rounded-2xl border border-emerald-200 bg-emerald-50/60 p-3 dark:border-emerald-900 dark:bg-emerald-950/20">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h4 className="flex items-center gap-1.5 font-bold text-slate-800 dark:text-slate-200">
                    {t('realtimeBarcodeQrRegistration')}
                    {barcodeRegistered && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[9px] font-bold text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300">
                        <CheckCircle2 className="h-3 w-3" />
                        {t('barcodeRegistered')}
                      </span>
                    )}
                  </h4>
                  <div className="flex flex-wrap gap-2">
                    <button type="button" onClick={handleStartBarcodeScan} className="inline-flex min-h-8 items-center gap-1.5 rounded-xl bg-emerald-600 px-3 py-1.5 font-bold text-white hover:bg-emerald-500">
                      <ScanLine className="h-3.5 w-3.5" />
                      {t('scanBarcodeNow')}
                    </button>
                    <button type="button" onClick={generateUniqueBarcode} className="inline-flex min-h-8 items-center gap-1.5 rounded-xl border border-emerald-300 bg-white px-3 py-1.5 font-bold text-emerald-700 hover:bg-emerald-50 dark:border-emerald-800 dark:bg-slate-900 dark:text-emerald-300">
                      <RefreshCw className="h-3.5 w-3.5" />
                      {t('autoGenerateBarcode')}
                    </button>
                  </div>
                </div>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <div>
                    <label className="mb-1 block text-[10px] font-semibold text-slate-600 dark:text-slate-400">{t('skuBarcodeNumber')}</label>
                    <input
                      ref={barcodeInputRef}
                      type="text"
                      value={barcode}
                      onChange={(e) => {
                        setBarcode(e.target.value);
                        setSku(e.target.value);
                        setBarcodeRegistered(false);
                      }}
                      onKeyDown={(e) => { if (e.key === 'Enter') e.preventDefault(); }}
                      placeholder={t('scanUsbTypeSku')}
                      className="w-full rounded-xl border border-emerald-200 bg-white px-3 py-2 font-mono dark:border-emerald-900 dark:bg-slate-900"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-[10px] font-semibold text-slate-600 dark:text-slate-400">{t('qrLabelCode')}</label>
                    <input type="text" readOnly value={barcode || sku} placeholder={t('autoSyncedBarcode')} className="w-full rounded-xl border border-emerald-200 bg-white px-3 py-2 font-mono text-slate-500 dark:border-emerald-900 dark:bg-slate-900" />
                  </div>
                </div>
              </section>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div>
                  <label className="mb-1 block font-semibold text-slate-700 dark:text-slate-300">{t('purchaseCostRequired')}</label>
                  <input type="number" min="0" step="0.01" required value={purchaseCost} onChange={(e) => setPurchaseCost(Number(e.target.value))} className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 font-mono dark:border-slate-700 dark:bg-slate-800" />
                </div>
                <div>
                  <label className="mb-1 block font-semibold text-slate-700 dark:text-slate-300">{t('sellingPriceRequired')}</label>
                  <input type="number" min="0" step="0.01" required value={sellingPrice} onChange={(e) => setSellingPrice(Number(e.target.value))} className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 font-mono dark:border-slate-700 dark:bg-slate-800" />
                </div>
                <div>
                  <label className="mb-1 block font-semibold text-slate-700 dark:text-slate-300">{t('currentStockQuantity')}</label>
                  <input type="number" min="0" required value={stock} onChange={(e) => setStock(Number(e.target.value))} className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 font-mono dark:border-slate-700 dark:bg-slate-800" />
                  <p className="mt-1 text-[9px] leading-tight text-slate-500">{t('stockQuantityHelp')}</p>
                </div>
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div>
                  <label className="mb-1 block font-semibold text-slate-700 dark:text-slate-300">{t('lowStockAlertAt')}</label>
                  <input type="number" min="0" value={minStock} onChange={(e) => setMinStock(Number(e.target.value))} className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 dark:border-slate-700 dark:bg-slate-800" />
                  <p className="mt-1 text-[9px] leading-tight text-slate-500">{t('lowStockHelp')}</p>
                </div>
                <div>
                  <label className="mb-1 block font-semibold text-slate-700 dark:text-slate-300">{t('unitLabel')}</label>
                  <input type="text" list="product-units" value={unit} onChange={(e) => setUnit(e.target.value)} placeholder={t('pickOrTypeUnit')} className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 dark:border-slate-700 dark:bg-slate-800" />
                  <datalist id="product-units">
                    {['pcs', 'piece', 'box', 'set', 'kg', 'liter', 'meter', 'packet', 'carton'].map((unitOption) => <option key={unitOption} value={unitOption} />)}
                  </datalist>
                  <p className="mt-1 text-[9px] leading-tight text-slate-500">{t('pickOrTypeUnit')}</p>
                </div>
                <div>
                  <label className="mb-1 block font-semibold text-slate-700 dark:text-slate-300">{t('supplierLabel')}</label>
                  <select value={supplierId} onChange={(e) => setSupplierId(e.target.value)} className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 dark:border-slate-700 dark:bg-slate-800">
                    <option value="">{t('noneGeneral')}</option>
                    {suppliers.map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.name}</option>)}
                  </select>
                  {supplierId && (() => {
                    const selectedSupplier = suppliers.find((supplier) => supplier.id === supplierId);
                    return selectedSupplier ? (
                      <p className="mt-1 text-[10px] text-slate-500">
                        {[selectedSupplier.phone, selectedSupplier.email].filter(Boolean).join(' · ')}
                      </p>
                    ) : null;
                  })()}
                </div>
              </div>

              <div>
                <label className="mb-1 block font-semibold text-slate-700 dark:text-slate-300">{t('descriptionLabel')}</label>
                <textarea rows={2} value={description} onChange={(e) => setDescription(e.target.value)} placeholder={t('productSpecsFeatures')} className="w-full resize-y rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 dark:border-slate-700 dark:bg-slate-800" />
              </div>

              <div className="sticky bottom-0 flex items-center justify-end gap-2 border-t border-slate-100 bg-white pt-3 dark:border-slate-800 dark:bg-slate-900">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 rounded-xl font-semibold text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  {t('cancel')}
                </button>
                <button
                  type="submit"
                  disabled={isSaving}
                  className="px-5 py-2.5 rounded-xl font-bold bg-emerald-600 hover:bg-emerald-500 text-white shadow-sm disabled:cursor-wait disabled:opacity-60"
                >
                  {isSaving ? t('saving') : t('saveProduct')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {showPlanUpgrade && (
        <PlanUpgradeModal
          onClose={() => setShowPlanUpgrade(false)}
          recommendedPlanId={getRecommendedUpgradePlan(license.planId)}
        />
      )}

      {isBarcodeCameraOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/50 p-3 backdrop-blur-xs">
          <div className="w-full max-w-[420px] space-y-3 rounded-2xl border border-slate-200 bg-white p-3 text-slate-900 shadow-2xl">
            <div className="flex items-start justify-between gap-3 border-b border-slate-200 pb-2">
              <h3 className="flex items-center gap-2 text-xs font-bold">
                <ScanLine className="h-3.5 w-3.5 text-emerald-500" />
                {t('scanBarcodeRegisterSku')}
              </h3>
              <button type="button" onClick={closeBarcodeCamera} aria-label={t('closeBarcodeCamera')} className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="relative overflow-hidden rounded-xl border border-emerald-200 bg-slate-900">
              <video ref={barcodeVideoRef} autoPlay playsInline muted className="aspect-[2/1] w-full object-cover" />
              <div aria-hidden="true" className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center">
                <div className="relative h-[36%] w-[58%] border border-white/90">
                  <span className="absolute -left-px -top-px h-5 w-5 border-l-[3px] border-t-[3px] border-white" />
                  <span className="absolute -right-px -top-px h-5 w-5 border-r-[3px] border-t-[3px] border-white" />
                  <span className="absolute -bottom-px -left-px h-5 w-5 border-b-[3px] border-l-[3px] border-white" />
                  <span className="absolute -bottom-px -right-px h-5 w-5 border-b-[3px] border-r-[3px] border-white" />
                </div>
                {barcodeCameraStream && (
                  <div className="animate-laser-sweep absolute left-5 right-5 h-0.5 bg-gradient-to-r from-transparent via-rose-500 to-transparent shadow-[0_0_12px_#f43f5e]" />
                )}
              </div>
              {!barcodeCameraStream && !barcodeCameraError && (
                <div className="absolute inset-0 flex items-center justify-center bg-slate-900/35 text-[10px] font-semibold text-white">{t('startingCamera')}</div>
              )}
              {!barcodeCameraStream && barcodeCameraError && (
                <div className="absolute inset-0 flex items-center justify-center bg-slate-900/55 px-5 text-center text-[10px] font-semibold text-white">
                  {barcodeCameraError}
                </div>
              )}
            </div>
            <div className="space-y-1.5">
              <p className="flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-wide text-emerald-700">
                <ScanLine className="h-3 w-3" />
                {t('scannerUsbInstruction')}
              </p>
              <form className="flex items-center gap-1.5" onSubmit={(event) => { event.preventDefault(); registerScannedBarcode(scannerCode); }}>
                <input
                  ref={scannerCodeInputRef}
                  type="text"
                  autoFocus
                  autoComplete="off"
                  value={scannerCode}
                  onChange={(event) => setScannerCode(event.target.value)}
                  placeholder={t('scannerInputPlaceholder')}
                  aria-label={t('skuBarcodeNumber')}
                  className="min-w-0 flex-1 rounded-lg border border-emerald-300 bg-white px-2.5 py-2 font-mono text-[11px] outline-none placeholder:text-slate-400 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
                />
                <button type="submit" disabled={!scannerCode.trim()} className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-emerald-600 px-3 py-2 text-[10px] font-bold text-white hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-50">
                  <Check className="h-3 w-3" />
                  {t('useCode')}
                </button>
              </form>
            </div>
            {barcodeCameraError && (
              <div role="alert" className="space-y-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-[10px] text-rose-700">
                <p>{barcodeCameraError}</p>
                <p>{t('cameraManualScanHelp')}</p>
                <button type="button" onClick={() => void handleStartBarcodeScan()} className="rounded-lg bg-rose-600 px-3 py-1.5 font-semibold text-white hover:bg-rose-500">{t('retryCamera')}</button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {productToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl w-full max-w-sm shadow-2xl p-6 space-y-4">
            <h3 className="font-bold text-base text-slate-900 dark:text-white">{t('deleteProduct')}</h3>
            <p className="text-xs text-slate-500 leading-relaxed">
              {t('deleteProductConfirmation')} <strong>{language === 'so' && productToDelete.nameSo ? productToDelete.nameSo : productToDelete.name}</strong> ({productToDelete.sku})?
            </p>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setProductToDelete(null)}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-500 hover:bg-slate-100"
              >
                {t('cancel')}
              </button>
              <button
                type="button"
                onClick={handleConfirmDelete}
                className="px-4 py-2 rounded-xl text-xs font-bold bg-rose-600 hover:bg-rose-500 text-white shadow-sm"
              >
                {t('delete')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
