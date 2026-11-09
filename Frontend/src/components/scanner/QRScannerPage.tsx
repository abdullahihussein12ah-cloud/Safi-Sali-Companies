import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  Boxes,
  Camera,
  CameraOff,
  CheckCircle2,
  Clock3,
  QrCode,
  RotateCcw,
  ShoppingCart,
  Trash2,
} from 'lucide-react';
import { BrowserMultiFormatReader, IScannerControls } from '@zxing/browser';
import { BarcodeFormat, DecodeHintType } from '@zxing/library';
import { useApp } from '../../context/AppContext';
import { isBusinessAdministratorRole } from '../../services/permissions';
import { AppStore } from '../../services/store';
import { Product } from '../../types';
import { QRLabelGenerator } from './QRLabelGenerator';

type ScanEvent = {
  id: string;
  code: string;
  product: Product | null;
  scannedAt: Date;
  quantity: number;
  status: 'matched' | 'not-found';
};

const SCAN_DEBOUNCE_MS = 1800;
const MAX_SCAN_HISTORY = 100;

const formatScanDate = (value: Date): string =>
  value.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });

const formatScanTime = (value: Date): string =>
  value.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' });

const getProductStatus = (product: Product): string => {
  if (product.archived) return 'Archived';
  if (product.approvalStatus === 'pending') return 'Pending approval';
  if (product.approvalStatus === 'rejected') return 'Rejected';
  if (product.stock <= 0) return 'Out of stock';
  if (product.stock <= product.minStock) return 'Low stock';
  return 'In stock';
};

export const QRScannerPage: React.FC = () => {
  const { showToast, setActiveTab, setPosCartProductToAdd, t, activeUser } = useApp();
  const [scannedProduct, setScannedProduct] = useState<Product | null>(null);
  const [scanHistory, setScanHistory] = useState<ScanEvent[]>([]);
  const [manualCode, setManualCode] = useState('');
  const [isScanning, setIsScanning] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [scanError, setScanError] = useState('');
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
  const [activeView, setActiveView] = useState<'scan' | 'labels'>('scan');

  const videoRef = useRef<HTMLVideoElement>(null);
  const cameraStreamRef = useRef<MediaStream | null>(null);
  const controlsRef = useRef<IScannerControls | null>(null);
  const sessionRef = useRef(0);
  const lastScannedRef = useRef({ code: '', scannedAt: 0 });
  const isScanningRef = useRef(false);
  const purchasePriceAuthorized = isBusinessAdministratorRole(activeUser.role);
  const processScannedCode = useCallback((code: string) => {
    const clean = code.trim();
    if (!clean) return;
    const now = Date.now();
    if (
      clean.toLocaleLowerCase() === lastScannedRef.current.code.toLocaleLowerCase() &&
      now - lastScannedRef.current.scannedAt < SCAN_DEBOUNCE_MS
    ) return;
    lastScannedRef.current = { code: clean, scannedAt: now };

    const product = AppStore.getProductByBarcodeOrQR(clean) || null;
    if (product) {
      setScannedProduct(product);
      setScanError('');
    } else {
      setScannedProduct(null);
      setScanError(`No product found for "${clean}". Check the SKU, QR code, or barcode.`);
    }
    const scanStatus: ScanEvent['status'] = product ? 'matched' : 'not-found';
    setScanHistory((previous) => [{
      id: `${now}-${Math.random().toString(36).slice(2, 8)}`,
      code: clean,
      product,
      scannedAt: new Date(now),
      quantity: 1,
      status: scanStatus,
    }, ...previous].slice(0, MAX_SCAN_HISTORY));

    if (!product) {
      showToast(`No product found for "${clean}". Check the SKU, QR code, or barcode.`, 'error');
      return;
    }
    showToast(`Product found: ${product.name}`, 'success');
  }, [showToast]);

  const releaseCamera = useCallback(() => {
    controlsRef.current?.stop();
    controlsRef.current = null;
    cameraStreamRef.current?.getTracks().forEach((track) => track.stop());
    cameraStreamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
  }, []);

  const stopCamera = useCallback(() => {
    sessionRef.current += 1;
    isScanningRef.current = false;
    releaseCamera();
    setCameraStream(null);
    setIsScanning(false);
  }, [releaseCamera]);

  const startCamera = async () => {
    if (isScanningRef.current) return;
    releaseCamera();
    setCameraError(null);
    lastScannedRef.current = { code: '', scannedAt: 0 };
    const session = ++sessionRef.current;
    isScanningRef.current = true;
    setIsScanning(true);
    try {
      if (!window.isSecureContext) throw new Error(t('cameraRequiresSecureContext'));
      if (!navigator.mediaDevices?.getUserMedia) throw new Error(t('cameraNotSupported'));
      const video = videoRef.current;
      if (!video) throw new Error('Camera preview is unavailable. Switch back to Scan Products and try again.');
      const hints = new Map<DecodeHintType, BarcodeFormat[]>([
        [DecodeHintType.POSSIBLE_FORMATS, [
          BarcodeFormat.AZTEC,
          BarcodeFormat.CODABAR,
          BarcodeFormat.CODE_39,
          BarcodeFormat.CODE_93,
          BarcodeFormat.CODE_128,
          BarcodeFormat.DATA_MATRIX,
          BarcodeFormat.EAN_8,
          BarcodeFormat.EAN_13,
          BarcodeFormat.ITF,
          BarcodeFormat.PDF_417,
          BarcodeFormat.QR_CODE,
          BarcodeFormat.UPC_A,
          BarcodeFormat.UPC_E,
          BarcodeFormat.MICRO_QR_CODE,
        ]],
      ]);
      const reader = new BrowserMultiFormatReader(hints);
      const onDecode = (result: { getText: () => string } | undefined) => {
        if (!result || session !== sessionRef.current) return;
        processScannedCode(result.getText());
      };
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
      if (session !== sessionRef.current) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      cameraStreamRef.current = stream;
      const controls: IScannerControls = await reader.decodeFromStream(stream, video, onDecode);
      if (session !== sessionRef.current) {
        controls.stop();
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      controlsRef.current = controls;
      setCameraStream(stream);
    } catch (error) {
      if (session !== sessionRef.current) return;
      isScanningRef.current = false;
      releaseCamera();
      const errorName = error instanceof DOMException ? error.name : '';
      const message = errorName === 'NotAllowedError' || errorName === 'SecurityError'
        ? t('cameraAccessDenied')
        : errorName === 'NotFoundError'
          ? t('cameraNotFound')
          : errorName === 'NotReadableError'
            ? t('cameraInUse')
            : error instanceof Error
              ? error.message
              : t('cameraPermissionError');
      setCameraError(message);
      if (errorName !== 'NotAllowedError' && errorName !== 'SecurityError') showToast(message, 'error');
      setIsScanning(false);
    }
  };

  useEffect(() => () => {
    sessionRef.current += 1;
    releaseCamera();
  }, [releaseCamera]);

  const handleManualSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!manualCode.trim()) return;
    processScannedCode(manualCode);
    setManualCode('');
  };

  const handleSendToPOS = (product: Product) => {
    setPosCartProductToAdd(product.id);
    setActiveTab('pos');
  };

  const clearScanHistory = () => {
    if (!scanHistory.length) return;
    if (!window.confirm('Clear all scans from this session?')) return;
    setScanHistory([]);
    setScannedProduct(null);
    setScanError('');
  };

  return (
    <div className="space-y-4">
      <header className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-base font-extrabold tracking-tight text-slate-900 dark:text-white">QR &amp; Barcode Scanner</h1>
          <p className="mt-1 max-w-3xl text-[10px] text-slate-500 dark:text-slate-400">
            {activeView === 'scan'
              ? 'Scan a product label with your camera or enter its SKU manually.'
              : 'Create and print QR code price labels for your catalog products.'}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setActiveView('scan')}
            aria-pressed={activeView === 'scan'}
            className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-[10px] font-bold text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            <Camera className="h-3.5 w-3.5" /> Scan products
          </button>
          <button
            type="button"
            onClick={() => { stopCamera(); setActiveView('labels'); }}
            aria-pressed={activeView === 'labels'}
            className={`inline-flex min-h-9 items-center gap-1.5 rounded-lg px-3 text-[10px] font-bold text-white ${
              activeView === 'labels' ? 'bg-emerald-700' : 'bg-emerald-600 hover:bg-emerald-500'
            }`}
          >
            <QrCode className="h-3.5 w-3.5" /> Generate Labels
          </button>
        </div>
      </header>

      {activeView === 'labels' ? (
        <QRLabelGenerator showToast={showToast} />
      ) : (
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
          <section className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900 lg:col-span-7">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3 dark:border-slate-800">
              <div>
                <h2 className="flex items-center gap-2 text-xs font-bold text-slate-900 dark:text-white">
                  <QrCode className="h-4 w-4 text-emerald-600" /> Camera scanner
                </h2>
                <p className="mt-1 flex items-center gap-1.5 text-[9px] font-semibold">
                  <span className={`h-2 w-2 rounded-full ${cameraStream ? 'animate-pulse bg-emerald-500' : 'bg-slate-400'}`} />
                  <span className={cameraStream ? 'text-emerald-700 dark:text-emerald-300' : 'text-slate-500'}>
                    {cameraStream ? 'Camera Active – Ready to Scan' : 'Optical Sensor Standby'}
                  </span>
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                {!isScanning ? (
                  <button
                    type="button"
                    onClick={() => void startCamera()}
                    disabled={isScanning}
                    className="inline-flex min-h-9 items-center gap-1.5 rounded-lg bg-emerald-600 px-3 text-[10px] font-bold text-white hover:bg-emerald-500 disabled:opacity-50"
                  >
                    <Camera className="h-3.5 w-3.5" /> Start Camera
                  </button>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={stopCamera}
                      className="inline-flex min-h-9 items-center gap-1.5 rounded-lg bg-rose-100 px-3 text-[10px] font-bold text-rose-700 dark:bg-rose-950 dark:text-rose-300"
                    >
                      <CameraOff className="h-3.5 w-3.5" /> Stop Camera
                    </button>
                    <button
                      type="button"
                      onClick={() => { stopCamera(); window.setTimeout(() => void startCamera(), 0); }}
                      className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-slate-200 px-3 text-[10px] font-bold text-slate-700 dark:border-slate-700 dark:text-slate-200"
                    >
                      <RotateCcw className="h-3.5 w-3.5" /> Restart Camera
                    </button>
                  </>
                )}
              </div>
            </div>

            <div className="relative mx-auto aspect-square w-full max-w-[300px] overflow-hidden rounded-2xl border border-emerald-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-800">
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                aria-label="Live camera preview for QR and barcode scanning"
                className={`absolute inset-0 h-full w-full object-cover ${cameraStream ? 'opacity-100' : 'opacity-0'}`}
              />
              <div className="pointer-events-none absolute inset-[6%] z-10">
                <span className="absolute left-0 top-0 h-6 w-6 rounded-tl-lg border-l-[3px] border-t-[3px] border-emerald-500" />
                <span className="absolute right-0 top-0 h-6 w-6 rounded-tr-lg border-r-[3px] border-t-[3px] border-rose-500" />
                <span className="absolute bottom-0 left-0 h-6 w-6 rounded-bl-lg border-b-[3px] border-l-[3px] border-rose-500" />
                <span className="absolute bottom-0 right-0 h-6 w-6 rounded-br-lg border-b-[3px] border-r-[3px] border-emerald-500" />
                {cameraStream ? (
                  <div className="absolute inset-x-0 inset-y-0">
                    <div className="absolute left-[18%] right-[18%] top-[8%] bottom-[18%] border border-white/90 shadow-[0_0_0_999px_rgba(2,6,23,0.48)]">
                      <span className="absolute -left-px -top-px h-7 w-7 border-l-[3px] border-t-[3px] border-white" />
                      <span className="absolute -right-px -top-px h-7 w-7 border-r-[3px] border-t-[3px] border-white" />
                      <span className="absolute -bottom-px -left-px h-7 w-7 border-b-[3px] border-l-[3px] border-white" />
                      <span className="absolute -bottom-px -right-px h-7 w-7 border-b-[3px] border-r-[3px] border-white" />
                      <div className="safi-scanner-beam absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-transparent via-rose-400 to-transparent shadow-[0_0_12px_#fb7185]" />
                    </div>
                  </div>
                ) : (
                  <div className="safi-standby-beam absolute inset-x-5 top-1/2 h-0.5 bg-gradient-to-r from-transparent via-rose-400 to-transparent shadow-[0_0_12px_#fb7185]" />
                )}
              </div>
              {!cameraStream && (
                <div className="absolute inset-0 flex flex-col items-center justify-center px-6 text-center">
                  {isScanning ? (
                    <span className="mb-3 h-7 w-7 animate-spin rounded-full border-2 border-emerald-500 border-t-transparent" aria-label="Starting camera" />
                  ) : (
                    <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
                      <Camera className="h-5 w-5" />
                    </div>
                  )}
                  <p className="text-xs font-bold text-slate-800 dark:text-slate-100">{isScanning ? 'Starting camera…' : 'Optical Sensor Standby'}</p>
                  <p className="mt-1 max-w-[230px] text-[10px] text-slate-500 dark:text-slate-400">
                    {isScanning ? 'Allow camera access in your browser to start scanning.' : 'Press Start Camera above, or enter the SKU or barcode below.'}
                  </p>
                </div>
              )}
            </div>
            {cameraStream && <p className="text-center text-[10px] text-slate-500 dark:text-slate-400">{t('alignQRCodeToScan')}</p>}

            {cameraError && (
              <div role="alert" className="space-y-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-300">
                <p className="flex items-start gap-2"><AlertCircle className="h-4 w-4 shrink-0" />{cameraError}</p>
                {cameraError === t('cameraAccessDenied') && <p>{t('cameraAccessSteps')}</p>}
                <p>{t('cameraManualScanHelp')}</p>
                <button type="button" onClick={() => void startCamera()} className="rounded-lg bg-amber-700 px-3 py-2 font-semibold text-white hover:bg-amber-800">
                  Retry Camera
                </button>
              </div>
            )}
            {scanError && (
              <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-300">
                {scanError}
              </p>
            )}

            <form onSubmit={handleManualSubmit} className="space-y-2 border-t border-slate-100 pt-3 dark:border-slate-800">
              <label htmlFor="scanner-manual-code" className="block text-[10px] font-bold text-slate-700 dark:text-slate-200">
                Manual SKU Lookup / USB Barcode Gun Input
              </label>
              <div className="flex gap-2">
                <input
                  id="scanner-manual-code"
                  type="text"
                  value={manualCode}
                  onChange={(event) => setManualCode(event.target.value)}
                  placeholder="Enter SKU, QR code or barcode..."
                  autoComplete="off"
                  className="min-h-11 min-w-0 flex-1 rounded-xl border border-slate-200 bg-slate-50 px-3 font-mono text-sm text-slate-900 outline-none focus:border-emerald-500 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                />
                <button type="submit" disabled={!manualCode.trim()} className="min-h-11 rounded-xl bg-emerald-600 px-5 text-xs font-bold text-white hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-50">
                  Lookup
                </button>
              </div>
            </form>
          </section>

          <aside className="space-y-4 lg:col-span-5">
            <section className="rounded-3xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
              {scannedProduct ? (
                <div className="space-y-4">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2 text-sm font-bold text-emerald-700 dark:text-emerald-300">
                      <CheckCircle2 className="h-5 w-5" /> Product found
                    </div>
                    <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-[10px] font-bold text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                      {getProductStatus(scannedProduct)}
                    </span>
                  </div>
                  {scannedProduct.image && (
                    <img src={scannedProduct.image} alt={scannedProduct.name} className="h-36 w-full rounded-2xl bg-slate-50 object-contain dark:bg-slate-800" />
                  )}
                  <div>
                    <h2 className="text-lg font-extrabold text-slate-900 dark:text-white">{scannedProduct.name}</h2>
                    {scannedProduct.nameSo && <p className="text-xs text-slate-500">{scannedProduct.nameSo}</p>}
                  </div>
                  <dl className="grid grid-cols-2 gap-3 text-xs">
                    <div><dt className="text-slate-500">SKU</dt><dd className="mt-0.5 break-all font-mono font-semibold text-slate-900 dark:text-white">{scannedProduct.sku}</dd></div>
                    <div><dt className="text-slate-500">Barcode</dt><dd className="mt-0.5 break-all font-mono font-semibold text-slate-900 dark:text-white">{scannedProduct.barcode || '—'}</dd></div>
                    <div><dt className="text-slate-500">QR Code</dt><dd className="mt-0.5 break-all font-mono font-semibold text-slate-900 dark:text-white">{scannedProduct.qrCode || '—'}</dd></div>
                    <div><dt className="text-slate-500">Category</dt><dd className="mt-0.5 font-semibold text-slate-900 dark:text-white">{scannedProduct.category || '—'}</dd></div>
                    <div><dt className="text-slate-500">Selling price</dt><dd className="mt-0.5 font-semibold text-slate-900 dark:text-white">{AppStore.formatMoney(scannedProduct.sellingPrice)}</dd></div>
                    {purchasePriceAuthorized && (
                      <div><dt className="text-slate-500">Purchase price</dt><dd className="mt-0.5 font-semibold text-slate-900 dark:text-white">{AppStore.formatMoney(scannedProduct.purchaseCost)}</dd></div>
                    )}
                    <div><dt className="text-slate-500">Available stock</dt><dd className="mt-0.5 font-semibold text-slate-900 dark:text-white">{scannedProduct.stock} {scannedProduct.unit}</dd></div>
                    <div><dt className="text-slate-500">Brand</dt><dd className="mt-0.5 font-semibold text-slate-900 dark:text-white">{scannedProduct.brand || '—'}</dd></div>
                  </dl>
                  {scannedProduct.description && <p className="text-xs leading-relaxed text-slate-500">{scannedProduct.description}</p>}
                  <button type="button" onClick={() => handleSendToPOS(scannedProduct)} className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-emerald-600 px-4 text-xs font-bold text-white hover:bg-emerald-500">
                    <ShoppingCart className="h-4 w-4" /> Add to POS
                  </button>
                </div>
              ) : (
                <div className="flex min-h-[150px] flex-col items-center justify-center text-center">
                  <Boxes className="mb-2 h-8 w-8 text-emerald-400" aria-hidden="true" />
                  <p className="text-sm font-bold text-slate-700 dark:text-slate-200">Ready to Detect Product</p>
                  <p className="mt-1 max-w-xs text-xs text-slate-500">Point your camera at a QR label or enter the SKU code manually.</p>
                </div>
              )}
            </section>

            <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
              <header className="flex items-center justify-between gap-3 border-b border-slate-100 p-4 dark:border-slate-800">
                <div>
                  <h3 className="flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-white">
                    <Clock3 className="h-4 w-4 text-emerald-500" /> Recent Scanned Session
                  </h3>
                  <p className="mt-1 text-[10px] text-slate-500">{scanHistory.length} scan events this session</p>
                </div>
                <button
                  type="button"
                  onClick={clearScanHistory}
                  disabled={!scanHistory.length}
                  className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 text-[10px] font-bold text-slate-600 disabled:opacity-40 dark:border-slate-700 dark:text-slate-300"
                >
                  <Trash2 className="h-3.5 w-3.5" /> Clear Session
                </button>
              </header>
              <div className="max-h-80 overflow-y-auto">
                {scanHistory.length ? (
                  <div className="divide-y divide-slate-100 dark:divide-slate-800">
                    {scanHistory.map((event) => (
                      <article key={event.id} className="flex items-start justify-between gap-3 p-3">
                        <div className="min-w-0">
                          <p className="truncate text-xs font-bold text-slate-800 dark:text-slate-200">{event.product?.name || 'Unknown product'}</p>
                          <p className="mt-0.5 break-all font-mono text-[10px] text-slate-500">
                            {event.product ? `${event.product.sku} / ${event.product.barcode || event.code}` : event.code}
                          </p>
                          <p className="mt-1 text-[9px] text-slate-400">{formatScanDate(event.scannedAt)} · {formatScanTime(event.scannedAt)}</p>
                        </div>
                        <div className="shrink-0 text-right">
                          <span className={`rounded-full px-2 py-1 text-[9px] font-bold ${event.status === 'matched' ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300' : 'bg-rose-50 text-rose-700 dark:bg-rose-950 dark:text-rose-300'}`}>
                            {event.status === 'matched' ? 'Matched' : 'Not found'}
                          </span>
                          <p className="mt-1 text-[9px] text-slate-500">Qty {event.quantity}</p>
                        </div>
                      </article>
                    ))}
                  </div>
                ) : <p className="p-5 text-center text-xs text-slate-500">No scans yet</p>}
              </div>
            </section>
          </aside>
        </div>
      )}
    </div>
  );
};
