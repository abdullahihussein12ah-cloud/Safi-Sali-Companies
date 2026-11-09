import JsBarcode from 'jsbarcode';
import { BarcodeFormat, EncodeHintType, QRCodeWriter } from '@zxing/library';

export function generateQRCodeSVG(text: string, size = 180): string {
  const hints = new Map([
    [EncodeHintType.MARGIN, '2'],
    [EncodeHintType.CHARACTER_SET, 'UTF-8'],
  ]);
  const matrix = new QRCodeWriter().encode(text, BarcodeFormat.QR_CODE, 0, 0, hints);
  const width = matrix.getWidth();
  const height = matrix.getHeight();
  let modules = '';

  for (let y = 0; y < height; y++) {
    let x = 0;
    while (x < width) {
      if (!matrix.get(x, y)) {
        x++;
        continue;
      }
      const start = x;
      while (x < width && matrix.get(x, y)) x++;
      modules += `M${start} ${y}h${x - start}v1h-${x - start}z`;
    }
  }

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${width} ${height}" shape-rendering="crispEdges"><rect width="100%" height="100%" fill="#fff"/><path d="${modules}" fill="#0f172a"/></svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

export function generateBarcodeSVG(text: string, width = 300, height = 90): string {
  if (!text.trim()) throw new Error('A product identifier is required to generate a barcode.');
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  let valid = true;
  JsBarcode(svg, text, {
    format: 'CODE128',
    displayValue: false,
    width: 2,
    height,
    margin: 8,
    lineColor: '#0f172a',
    background: '#ffffff',
    valid: (isValid) => { valid = isValid; },
  });
  if (!valid) throw new Error('This product identifier is not valid for a Code 128 barcode.');
  svg.setAttribute('width', String(width));
  svg.setAttribute('height', String(height));
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg.outerHTML)}`;
}

export async function downloadQRCodeImage(svgDataUrl: string, filename: string): Promise<void> {
  const image = new Image();
  image.src = svgDataUrl;
  await new Promise<void>((resolve, reject) => {
    image.onload = () => resolve();
    image.onerror = () => reject(new Error('Could not render the QR code image.'));
  });

  const canvas = document.createElement('canvas');
  const scale = 4;
  canvas.width = image.naturalWidth * scale;
  canvas.height = image.naturalHeight * scale;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Could not prepare the QR image for download.');
  context.imageSmoothingEnabled = false;
  context.drawImage(image, 0, 0, canvas.width, canvas.height);

  const jpeg = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error('Could not create the JPEG QR image.'));
    }, 'image/jpeg', 1);
  });
  const downloadUrl = URL.createObjectURL(jpeg);
  const link = document.createElement('a');
  link.href = downloadUrl;
  link.download = `${filename}.jpg`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(downloadUrl), 1000);
}
