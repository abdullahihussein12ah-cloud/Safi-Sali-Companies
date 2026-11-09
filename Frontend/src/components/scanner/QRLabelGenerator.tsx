import React, { useEffect, useMemo, useState } from 'react';
import { AlertCircle, Printer, QrCode } from 'lucide-react';
import { AppStore } from '../../services/store';
import { Product } from '../../types';
import { generateQRCodeSVG } from '../../utils/qr';

type LabelEntry = {
  product: Product;
  code: string;
  image: string;
};

type QRLabelGeneratorProps = {
  showToast: (message: string, type: 'success' | 'error') => void;
};

const escapeHtml = (value: string): string =>
  value.replace(/[&<>"']/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  })[character] || character);

export const QRLabelGenerator: React.FC<QRLabelGeneratorProps> = ({ showToast }) => {
  const [products, setProducts] = useState<Product[]>(() => AppStore.getProducts());
  const [selectedProductId, setSelectedProductId] = useState('');
  const [copies, setCopies] = useState(1);
  const [qrSize, setQrSize] = useState(150);
  const [showSku, setShowSku] = useState(true);
  const [showPrice, setShowPrice] = useState(true);
  const [labels, setLabels] = useState<LabelEntry[]>([]);

  useEffect(() => AppStore.subscribe(() => setProducts(AppStore.getProducts())), []);

  const selectedProduct = useMemo(
    () => products.find((product) => product.id === selectedProductId),
    [products, selectedProductId],
  );

  const createLabel = (product: Product): LabelEntry => {
    const code = product.qrCode?.trim() || product.barcode?.trim() || product.sku?.trim() || product.id;
    return { product, code, image: generateQRCodeSVG(code, qrSize) };
  };

  const handleProductChange = (productId: string) => {
    setSelectedProductId(productId);
    const product = products.find((item) => item.id === productId);
    if (!product) {
      setLabels([]);
      return;
    }
    try {
      setLabels([createLabel(product)]);
    } catch (error) {
      setLabels([]);
      showToast(error instanceof Error ? error.message : 'Could not generate the product QR label.', 'error');
    }
  };

  const generateAll = () => {
    if (!products.length) {
      showToast('There are no active products to generate labels for.', 'error');
      return;
    }
    try {
      const generated = products.map(createLabel);
      setLabels(generated);
      setSelectedProductId('');
      setCopies(1);
      showToast(`Generated QR labels for ${generated.length} products.`, 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Could not generate the product QR labels.', 'error');
    }
  };

  const printLabels = () => {
    if (!labels.length) {
      showToast('Select a product or generate all labels before printing.', 'error');
      return;
    }
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      showToast('Allow pop-ups in your browser to print QR labels.', 'error');
      return;
    }

    const printableLabels = labels.flatMap(({ product, code, image }) =>
      Array.from({ length: labels.length === 1 ? copies : 1 }, () => `
        <article class="label">
          <strong>${escapeHtml(product.name)}</strong>
          ${showSku ? `<span>SKU: ${escapeHtml(product.sku || '—')}</span>` : ''}
          ${showPrice ? `<span>${escapeHtml(AppStore.formatMoney(product.sellingPrice))}</span>` : ''}
          <img src="${escapeHtml(image)}" alt="QR code for ${escapeHtml(product.name)}">
          <small>${escapeHtml(code)}</small>
        </article>
      `),
    ).join('');

    printWindow.onload = () => {
      printWindow.focus();
      printWindow.print();
    };
    printWindow.document.open();
    printWindow.document.write(`<!doctype html>
      <html><head><title>SAFI SALI COMPANIES QR Labels</title>
      <style>
        @page { margin: 10mm; }
        * { box-sizing: border-box; }
        body { margin: 0; color: #0f172a; font: 12px Arial, sans-serif; }
        main { display: grid; grid-template-columns: repeat(auto-fill, minmax(48mm, 1fr)); gap: 5mm; }
        .label { min-height: 55mm; padding: 3mm; border: 1px solid #cbd5e1; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 2mm; text-align: center; break-inside: avoid; }
        .label strong { font-size: 11pt; }
        .label span, .label small { font-size: 8pt; }
        .label img { width: 35mm; height: 35mm; object-fit: contain; }
        @media print { .label { border-color: #94a3b8; } }
      </style></head><body><main>${printableLabels}</main></body></html>`);
    printWindow.document.close();
  };

  return (
    <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <header className="flex flex-col gap-3 border-b border-slate-100 pb-3 dark:border-slate-800 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="flex items-center gap-2 text-sm font-extrabold text-slate-900 dark:text-white">
            <QrCode className="h-4 w-4 text-emerald-600" />
            SAFI SALI COMPANIES Product QR Label Generator
          </h2>
          <p className="mt-1 text-[10px] text-slate-500 dark:text-slate-400">
            Select one product or generate a printable QR label for every active catalog product.
          </p>
        </div>
        <button
          type="button"
          onClick={printLabels}
          disabled={!labels.length}
          className="inline-flex min-h-9 items-center justify-center gap-1.5 rounded-lg border border-slate-200 px-3 text-[10px] font-bold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
        >
          <Printer className="h-3.5 w-3.5" /> Print Labels
        </button>
      </header>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(260px,0.8fr)]">
        <div className="space-y-4 rounded-xl border border-slate-200 p-4 dark:border-slate-700">
          <div className="space-y-2">
            <label htmlFor="qr-label-product" className="block text-xs font-bold text-slate-800 dark:text-slate-200">
              Select Catalog Product
            </label>
            <select
              id="qr-label-product"
              value={selectedProductId}
              onChange={(event) => handleProductChange(event.target.value)}
              className="min-h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-xs text-slate-900 outline-none focus:border-emerald-500 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
            >
              <option value="">Choose a product...</option>
              {products.map((product) => (
                <option key={product.id} value={product.id}>{product.name} — {product.sku}</option>
              ))}
            </select>
            {!products.length && (
              <p className="flex items-center gap-1.5 text-[10px] text-amber-700 dark:text-amber-300">
                <AlertCircle className="h-3.5 w-3.5" /> No active products are available.
              </p>
            )}
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="space-y-1 text-[10px] font-semibold text-slate-600 dark:text-slate-300">
              Copies per selected product
              <input
                type="number"
                min={1}
                max={50}
                value={copies}
                onChange={(event) => setCopies(Math.min(50, Math.max(1, Number(event.target.value) || 1)))}
                disabled={!selectedProduct}
                className="min-h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-xs text-slate-900 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
              />
            </label>
            <label className="space-y-1 text-[10px] font-semibold text-slate-600 dark:text-slate-300">
              QR code size
              <select
                value={qrSize}
                onChange={(event) => {
                  const size = Number(event.target.value);
                  setQrSize(size);
                  setLabels((previous) => previous.map((entry) => ({
                    ...entry,
                    image: generateQRCodeSVG(entry.code, size),
                  })));
                }}
                className="min-h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
              >
                <option value={120}>Small</option>
                <option value={150}>Medium</option>
                <option value={200}>Large</option>
              </select>
            </label>
          </div>

          <div className="flex flex-wrap gap-4">
            <label className="flex items-center gap-2 text-[10px] font-semibold text-slate-600 dark:text-slate-300">
              <input type="checkbox" checked={showSku} onChange={(event) => setShowSku(event.target.checked)} />
              Show SKU
            </label>
            <label className="flex items-center gap-2 text-[10px] font-semibold text-slate-600 dark:text-slate-300">
              <input type="checkbox" checked={showPrice} onChange={(event) => setShowPrice(event.target.checked)} />
              Show selling price
            </label>
          </div>
        </div>

        <div className="flex flex-col justify-between gap-4 rounded-xl border border-emerald-200 bg-emerald-50/60 p-4 dark:border-emerald-900 dark:bg-emerald-950/20">
          <div>
            <h3 className="text-xs font-extrabold text-slate-900 dark:text-white">Batch Print QR Shelf Labels</h3>
            <p className="mt-1 text-[10px] leading-relaxed text-slate-600 dark:text-slate-300">
              Click “Generate All” to prepare a batch sheet of printable SAFI SALI COMPANIES QR price tags. Each product gets its own label.
            </p>
          </div>
          <div className="space-y-2">
            <button
              type="button"
              onClick={generateAll}
              disabled={!products.length}
              className="inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 text-xs font-extrabold text-white hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <QrCode className="h-4 w-4" /> Generate All ({products.length})
            </button>
            {selectedProduct && (
              <p className="text-center text-[10px] text-slate-600 dark:text-slate-300">
                Previewing {selectedProduct.name}
              </p>
            )}
          </div>
        </div>
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-xs font-bold text-slate-900 dark:text-white">
            Label Preview {labels.length > 0 && <span className="font-normal text-slate-500">({labels.length} products)</span>}
          </h3>
          {labels.length > 0 && (
            <button type="button" onClick={() => setLabels([])} className="text-[10px] font-bold text-slate-500 hover:text-rose-600">
              Clear preview
            </button>
          )}
        </div>
        {labels.length ? (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {labels.map(({ product, code, image }) => (
              <article key={product.id} className="flex min-w-0 items-center gap-3 rounded-xl border border-slate-200 p-3 dark:border-slate-700">
                <img src={image} alt={`QR code for ${product.name}`} className="h-24 w-24 shrink-0 rounded-lg border border-slate-100 bg-white p-1 dark:border-slate-700" />
                <div className="min-w-0 space-y-1">
                  <p className="break-words text-xs font-bold text-slate-900 dark:text-white">{product.name}</p>
                  {showSku && <p className="break-all font-mono text-[10px] text-slate-500">SKU: {product.sku || '—'}</p>}
                  {showPrice && <p className="text-[10px] font-semibold text-emerald-700 dark:text-emerald-300">{AppStore.formatMoney(product.sellingPrice)}</p>}
                  <p className="break-all font-mono text-[9px] text-slate-400">{code}</p>
                  {labels.length === 1 && copies > 1 && <p className="text-[9px] text-slate-400">{copies} copies will print</p>}
                </div>
              </article>
            ))}
          </div>
        ) : (
          <p className="rounded-xl border border-dashed border-slate-300 p-6 text-center text-xs text-slate-500 dark:border-slate-700">
            Select a catalog product or click Generate All to preview your QR labels.
          </p>
        )}
      </div>
    </section>
  );
};
