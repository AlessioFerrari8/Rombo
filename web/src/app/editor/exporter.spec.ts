import { oklchToRgb, prepareExportSvg } from './exporter';

describe('exporter', () => {
  it('converte OKLCH in rgb, che capiscono tutti i programmi', () => {
    expect(oklchToRgb('oklch(100% 0 0)')).toBe('rgb(255, 255, 255)');
    expect(oklchToRgb('oklch(0% 0 0)')).toBe('rgb(0, 0, 0)');
    expect(oklchToRgb('oklch(0.628 0.2577 29.23)')).toBe('rgb(255, 0, 0)');
    expect(oklchToRgb('rgb(1, 2, 3)')).toBe('rgb(1, 2, 3)');
  });

  it('toglie quello che non va consegnato e inquadra il disegno', () => {
    const NS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(NS, 'svg');
    const grid = document.createElementNS(NS, 'rect');
    grid.setAttribute('data-noexport', '');
    const root = document.createElementNS(NS, 'g');
    root.setAttribute('data-export-root', '');
    root.setAttribute('transform', 'translate(10 10) scale(2)');
    const sel = document.createElementNS(NS, 'circle');
    sel.setAttribute('data-noexport', '');
    root.appendChild(sel);
    svg.append(grid, root);
    const out = prepareExportSvg(svg, { minX: 0, minY: 0, maxX: 100, maxY: 50 }, 10);
    expect(out.querySelectorAll('[data-noexport]')).toHaveLength(0);
    expect(out.querySelector('[data-export-root]')!.hasAttribute('transform')).toBe(false);
    expect(out.getAttribute('viewBox')).toBe('-10 -10 120 70');
    expect(out.firstElementChild!.getAttribute('fill')).toBe('#ffffff');
    expect(svg.querySelectorAll('[data-noexport]')).toHaveLength(2); // l'originale resta intatto
  });
});
