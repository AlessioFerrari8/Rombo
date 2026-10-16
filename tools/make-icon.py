"""Genera l'icona di Rombo (rombo di Chen su carta) in tutte le misure."""
from PIL import Image, ImageDraw
import sys

S = 4096  # supersampling
INK, PAPER, ACCENT = (38, 82, 156), (250, 246, 238), (38, 82, 156)

def draw() -> Image.Image:
    img = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    d.rounded_rectangle((0, 0, S - 1, S - 1), radius=int(S * 0.225), fill=PAPER)
    cx = cy = S // 2
    rx, ry = int(S * 0.27), int(S * 0.25)
    pts = [(cx, cy - ry), (cx + rx, cy), (cx, cy + ry), (cx - rx, cy)]
    d.polygon(pts, fill=ACCENT)
    # bordo interno chiaro: il rombo "doppio" della relazione identificante
    k = 0.72
    inner = [(cx, cy - ry * k), (cx + rx * k, cy), (cx, cy + ry * k), (cx - rx * k, cy)]
    d.polygon(inner, outline=PAPER, width=int(S * 0.012))
    # entita': rettangolo piccolo a sinistra e ovale a destra, uniti al rombo
    w = int(S * 0.012)
    d.line([(cx - rx, cy), (int(S * 0.2), cy)], fill=INK, width=w * 2)
    d.line([(cx + rx, cy), (int(S * 0.8), cy)], fill=INK, width=w * 2)
    d.rectangle((int(S * 0.13), cy - int(S * 0.05), int(S * 0.2), cy + int(S * 0.05)), fill=INK)
    d.ellipse((int(S * 0.8), cy - int(S * 0.05), int(S * 0.87), cy + int(S * 0.05)), fill=INK)
    return img

big = draw()
out = sys.argv[1] if len(sys.argv) > 1 else "."
big.resize((1024, 1024), Image.LANCZOS).save(f"{out}/build/icon.png")
for n in (72, 96, 128, 144, 152, 192, 384, 512):
    big.resize((n, n), Image.LANCZOS).save(f"{out}/web/public/icons/icon-{n}x{n}.png")
big.resize((256, 256), Image.LANCZOS).save(
    f"{out}/web/public/favicon.ico", sizes=[(16, 16), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)])

# icone di piattaforma pregenerate: evitano l'icon-tool di electron-builder (crash su Windows CI)
big.resize((1024, 1024), Image.LANCZOS).save(f"{out}/build/icon.ico", sizes=[(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)])
big.resize((1024, 1024), Image.LANCZOS).save(f"{out}/build/icon.icns")
