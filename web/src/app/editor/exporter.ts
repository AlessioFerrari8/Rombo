import { Bounds } from '../domain/geometry';

const NS = 'http://www.w3.org/2000/svg';
const STYLE_PROPS = [
  'fill', 'stroke', 'stroke-width', 'stroke-dasharray', 'stroke-linecap', 'stroke-linejoin',
  'font-family', 'font-size', 'font-weight', 'text-anchor', 'dominant-baseline', 'opacity', 'text-decoration',
];
const FONTS: Array<[string, string, string]> = [
  ['Comfortaa', '/fonts/comfortaa-latin-wght-normal.woff2', '300 700'],
  ['Nunito', '/fonts/nunito-latin-wght-normal.woff2', '200 1000'],
];

/** I colori del tema sono OKLCH: nel file esportato diventano rgb, che leggono anche Inkscape e Word. */
export function oklchToRgb(css: string): string {
  const m = /^oklch\(\s*([\d.]+)(%?)\s+([\d.]+)\s+([\d.]+)(?:deg)?\s*(?:\/\s*([\d.]+%?))?\s*\)$/i.exec(css.trim());
  if (!m) return css;
  const L = m[2] ? Number(m[1]) / 100 : Number(m[1]);
  const C = Number(m[3]);
  const h = (Number(m[4]) * Math.PI) / 180;
  const a = C * Math.cos(h);
  const b = C * Math.sin(h);
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const mm = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  const lin = [
    4.0767416621 * l - 3.3077115913 * mm + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * mm - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * mm + 1.707614701 * s,
  ];
  const [r, g, bl] = lin.map((x) => {
    const v = x <= 0.0031308 ? 12.92 * x : 1.055 * Math.pow(x, 1 / 2.4) - 0.055;
    return Math.round(Math.min(1, Math.max(0, v)) * 255);
  });
  if (m[5]) {
    const alpha = m[5].endsWith('%') ? Number(m[5].slice(0, -1)) / 100 : Number(m[5]);
    return `rgba(${r}, ${g}, ${bl}, ${alpha})`;
  }
  return `rgb(${r}, ${g}, ${bl})`;
}

export function prepareExportSvg(source: SVGSVGElement, bounds: Bounds, pad = 24): SVGSVGElement {
  const svg = source.cloneNode(true) as SVGSVGElement;
  svg.querySelectorAll('[data-noexport]').forEach((n) => n.remove());
  svg.querySelector('[data-export-root]')?.removeAttribute('transform');
  const x = bounds.minX - pad;
  const y = bounds.minY - pad;
  const w = bounds.maxX - bounds.minX + 2 * pad;
  const h = bounds.maxY - bounds.minY + 2 * pad;
  svg.setAttribute('viewBox', `${x} ${y} ${w} ${h}`);
  svg.setAttribute('width', String(Math.ceil(w)));
  svg.setAttribute('height', String(Math.ceil(h)));
  svg.setAttribute('xmlns', NS);
  svg.removeAttribute('class');
  const bg = document.createElementNS(NS, 'rect');
  bg.setAttribute('x', String(x));
  bg.setAttribute('y', String(y));
  bg.setAttribute('width', String(w));
  bg.setAttribute('height', String(h));
  bg.setAttribute('fill', '#ffffff');
  svg.insertBefore(bg, svg.firstChild);
  return svg;
}

/** Copia negli attributi gli stili calcolati col tema chiaro, che e' quello da consegnare. */
export function inlineStyles(svg: SVGSVGElement): void {
  const host = document.createElement('div');
  host.dataset['theme'] = 'quaderno';
  host.setAttribute('aria-hidden', 'true');
  host.style.position = 'fixed';
  host.style.left = '-100000px';
  host.style.top = '0';
  // .er-appear riparte da opacity:0 quando il nodo clonato entra nel DOM: senza questo,
  // getComputedStyle() legge il fotogramma iniziale dell'animazione e l'export risulta vuoto.
  const kill = document.createElement('style');
  kill.textContent = '*, *::before, *::after { animation: none !important; transition: none !important; }';
  host.append(kill, svg);
  document.body.appendChild(host);
  try {
    for (const el of Array.from(svg.querySelectorAll<SVGElement>('*'))) {
      if (el.tagName === 'style' || el.tagName === 'defs') continue;
      const cs = getComputedStyle(el);
      const decl = STYLE_PROPS.map((p) => [p, cs.getPropertyValue(p).trim()] as const)
        .filter(([, v]) => v)
        .map(([p, v]) => `${p}:${p === 'fill' || p === 'stroke' ? oklchToRgb(v) : v}`)
        .join(';');
      if (decl) el.setAttribute('style', decl);
      el.removeAttribute('class');
    }
  } finally {
    host.remove();
  }
}

function toBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

async function fontCss(): Promise<string> {
  const faces = await Promise.all(
    FONTS.map(async ([family, url, weight]) => {
      const buf = await (await fetch(url)).arrayBuffer();
      return `@font-face{font-family:"${family}";src:url(data:font/woff2;base64,${toBase64(buf)}) format("woff2");font-weight:${weight};}`;
    }),
  );
  return faces.join('');
}

export async function exportSvgString(source: SVGSVGElement, bounds: Bounds): Promise<string> {
  const svg = prepareExportSvg(source, bounds);
  inlineStyles(svg);
  const style = document.createElementNS(NS, 'style');
  style.textContent = await fontCss();
  svg.insertBefore(style, svg.firstChild);
  return new XMLSerializer().serializeToString(svg);
}

export async function svgToPng(svg: string, scale = 2): Promise<Blob> {
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const canvas = document.createElement('canvas');
    canvas.width = Math.ceil(img.naturalWidth * scale);
    canvas.height = Math.ceil(img.naturalHeight * scale);
    const ctx = canvas.getContext('2d')!;
    ctx.scale(scale, scale);
    ctx.drawImage(img, 0, 0);
    return await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('PNG non generato'))), 'image/png'),
    );
  } finally {
    URL.revokeObjectURL(url);
  }
}
