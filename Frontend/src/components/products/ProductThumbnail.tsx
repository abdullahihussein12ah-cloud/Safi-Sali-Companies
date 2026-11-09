import React from 'react';

interface ProductThumbnailProps {
  src?: string;
  alt: string;
  className: string;
  productName?: string;
  category?: string;
  brand?: string;
}

const escapeXml = (value: string): string =>
  value.replace(/[<>&'"]/g, (character) => ({
    '<': '&lt;',
    '>': '&gt;',
    '&': '&amp;',
    "'": '&apos;',
    '"': '&quot;',
  })[character] || character);

const getIllustration = (name: string, category: string, brand: string) => {
  const identity = `${name} ${category} ${brand}`.toLowerCase();
  let hash = 0;
  for (const character of identity) hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
  const hue = hash % 360;
  const colors = {
    background: `hsl(${hue} 72% 91%)`,
    accent: `hsl(${(hue + 36) % 360} 70% 45%)`,
    shadow: `hsl(${hue} 35% 20%)`,
  };
  let product = '';

  if (/phone|smartphone|mobile|device/.test(identity)) {
    product = `<rect x="34" y="12" width="32" height="76" rx="8" fill="${colors.shadow}"/><rect x="38" y="20" width="24" height="59" rx="3" fill="url(#screen)"/><circle cx="50" cy="84" r="2" fill="#cbd5e1"/><circle cx="59" cy="17" r="1.5" fill="#94a3b8"/>`;
  } else if (/computer|laptop|notebook|macbook|desktop|pc/.test(identity)) {
    product = `<rect x="23" y="20" width="54" height="42" rx="5" fill="${colors.shadow}"/><rect x="28" y="25" width="44" height="32" rx="2" fill="url(#screen)"/><path d="M17 66h66l-6 8H23z" fill="${colors.shadow}"/><path d="M43 67h14" stroke="#cbd5e1" stroke-width="1.5" stroke-linecap="round"/><circle cx="50" cy="22.5" r="1" fill="#cbd5e1"/>`;
  } else if (/network|wifi|router|switch|access point/.test(identity)) {
    product = `<path d="M27 33V17M73 33V17" stroke="${colors.shadow}" stroke-width="4" stroke-linecap="round"/><rect x="19" y="32" width="62" height="39" rx="9" fill="${colors.shadow}"/><rect x="24" y="37" width="52" height="24" rx="5" fill="url(#screen)"/><path d="M35 51q15-15 30 0M41 56q9-9 18 0" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round"/><circle cx="34" cy="66" r="1.8" fill="#4ade80"/><circle cx="42" cy="66" r="1.8" fill="#facc15"/>`;
  } else if (/power bank|battery|charger|accessor|power/.test(identity)) {
    product = `<rect x="31" y="14" width="38" height="72" rx="10" fill="${colors.shadow}"/><rect x="36" y="20" width="28" height="49" rx="6" fill="url(#screen)"/><rect x="43" y="74" width="14" height="5" rx="2.5" fill="#cbd5e1"/><path d="m53 30-11 20h9l-3 13 13-22h-9z" fill="white"/>`;
  } else if (/cable|wiring|cord/.test(identity)) {
    product = `<circle cx="50" cy="51" r="32" fill="${colors.shadow}"/><circle cx="50" cy="51" r="21" fill="url(#screen)"/><circle cx="50" cy="51" r="10" fill="${colors.background}"/><path d="M50 19c18 0 32 14 32 32M50 28c13 0 23 10 23 23M50 37c8 0 14 6 14 14" fill="none" stroke="white" stroke-width="3" stroke-linecap="round"/><path d="M78 52c4 8 1 17-7 20" fill="none" stroke="${colors.accent}" stroke-width="4" stroke-linecap="round"/>`;
  } else if (/printer|pos hardware|receipt/.test(identity)) {
    product = `<path d="M38 12h24v23H38z" fill="white"/><rect x="20" y="34" width="60" height="38" rx="8" fill="${colors.shadow}"/><rect x="27" y="40" width="46" height="20" rx="4" fill="url(#screen)"/><path d="M38 49h24M38 55h17" stroke="white" stroke-width="2" stroke-linecap="round"/><path d="M34 65h32v20H34z" fill="white"/><path d="M40 71h20M40 76h16M40 81h19" stroke="${colors.accent}" stroke-width="2" stroke-linecap="round"/>`;
  } else if (/abaya|cloth|fashion|garment|textile|silk|cabaayad/.test(identity)) {
    product = `<path d="m40 17 10 7 10-7 13 9-8 15-6-4 5 45H26l5-45-6 4-8-15z" fill="${colors.shadow}"/><path d="m43 24 7 8 7-8-7-5z" fill="${colors.accent}"/><path d="M34 46h32M33 53h34" stroke="white" stroke-opacity=".6" stroke-width="2"/>`;
  } else {
    product = `<path d="m50 14 31 16v39L50 86 19 69V30z" fill="${colors.shadow}"/><path d="m50 14 31 16-31 17-31-17z" fill="url(#screen)"/><path d="M50 47v39L19 69V30z" fill="${colors.accent}"/><path d="M50 47 81 30v39L50 86z" fill="${colors.shadow}"/><path d="m42 34 8-5 8 5-8 5z" fill="white" opacity=".8"/>`;
  }

  const label = escapeXml(name.trim().slice(0, 25) || category || brand || 'Product');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><defs><linearGradient id="bg" x2="1" y2="1"><stop stop-color="${colors.background}"/><stop offset="1" stop-color="${colors.accent}" stop-opacity=".25"/></linearGradient><linearGradient id="screen" x2="1" y2="1"><stop stop-color="${colors.accent}"/><stop offset="1" stop-color="${colors.background}"/></linearGradient></defs><rect width="100" height="100" rx="16" fill="url(#bg)"/><circle cx="82" cy="19" r="16" fill="white" opacity=".35"/><ellipse cx="50" cy="89" rx="31" ry="5" fill="${colors.shadow}" opacity=".16"/>${product}<rect x="5" y="76" width="90" height="19" rx="5" fill="white" fill-opacity=".88"/><text x="50" y="88" text-anchor="middle" font-family="Arial,sans-serif" font-size="6" font-weight="700" fill="#1e293b">${label}</text></svg>`;
};

export const ProductThumbnail: React.FC<ProductThumbnailProps> = ({
  src,
  alt,
  className,
  productName = alt,
  category = '',
  brand = '',
}) => {
  const illustration = `data:image/svg+xml,${encodeURIComponent(getIllustration(productName, category, brand))}`;

  return (
    <div className={`relative flex shrink-0 items-center justify-center overflow-hidden bg-slate-100 dark:bg-slate-800 ${className}`}>
      <img
        src={illustration}
        alt={src ? '' : alt}
        aria-hidden={Boolean(src)}
        loading="lazy"
        className="absolute inset-0 h-full w-full object-cover"
      />
      {src && (
        <img
          src={src}
          alt={alt}
          loading="lazy"
          className="absolute inset-0 h-full w-full object-cover"
          onError={(event) => {
            event.currentTarget.style.display = 'none';
          }}
        />
      )}
    </div>
  );
};
