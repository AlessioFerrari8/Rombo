import { angDist, freeAngle } from './placement';

describe('freeAngle', () => {
  it('senza vincoli mette il primo attributo in alto', () => {
    expect(freeAngle([])).toBeCloseTo(-Math.PI / 2);
  });
  it('con uno in alto sceglie il basso', () => {
    expect(freeAngle([-Math.PI / 2])).toBeCloseTo(Math.PI / 2);
  });
  it('evita le direzioni gia prese', () => {
    const a = freeAngle([0, Math.PI]);
    expect(Math.min(angDist(a, 0), angDist(a, Math.PI))).toBeCloseTo(Math.PI / 2);
  });
});

describe('angDist', () => {
  it('e simmetrica e gira attorno', () => {
    expect(angDist(0.1, 2 * Math.PI - 0.1)).toBeCloseTo(0.2);
    expect(angDist(Math.PI, -Math.PI)).toBeCloseTo(0);
  });
});
