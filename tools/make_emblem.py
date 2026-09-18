#!/usr/bin/env python3
"""
Extract the DRISHTI eagle emblem from its rectangular gray background.

Approach:
  1. Flood fill from the image edges, masking pixels whose color is close to
     the flat background gray. Only background CONNECTED to the border is
     removed, so the eagle, its glow, and the dark navy shield interior stay.
  2. Feather the cut edge (slight erode + alpha blur) so the emblem blends
     into the near-black app background without a gray fringe.
  3. Drop the detached "sparkle" decoration, crop to content, and save as
     assets/drishTI-emblem.png with transparency.

Usage:  py tools/make_emblem.py
"""

from PIL import Image, ImageDraw, ImageFilter

SRC = "assets/drishTI-logo.png"
DST = "assets/drishTI-emblem.png"
TOLERANCE = 52          # how far from the gray a pixel may be and still count as bg
SENTINEL = (255, 0, 254, 255)   # magenta-ish; not present in the artwork

im = Image.open(SRC).convert("RGBA")
w, h = im.size
print(f"source: {w}x{h}")

# 1. Flood fill the background from many edge seeds with the sentinel color.
seeds = [
    (0, 0), (w - 1, 0), (0, h - 1), (w - 1, h - 1),      # corners
    (w // 2, 0), (w // 2, h - 1), (0, h // 2), (w - 1, h // 2),  # edge midpoints
]
for seed in seeds:
    # Fill only if the seed itself is still background (later seeds may land
    # inside already-sentinel regions; floodfill would then repaint them with
    # the same sentinel, which is harmless, so no guard is strictly needed).
    ImageDraw.floodfill(im, seed, SENTINEL, thresh=TOLERANCE)

px = im.load()
removed = 0
for y in range(h):
    for x in range(w):
        if px[x, y] == SENTINEL:
            px[x, y] = (0, 0, 0, 0)
            removed += 1
print(f"background removed: {removed} px ({100.0 * removed / (w * h):.1f}%)")

# 2. Clear the detached sparkle decoration (bottom-right of the artwork).
sx0, sy0, sx1, sy1 = int(w * 0.76), int(h * 0.84), w, h
for y in range(sy0, sy1):
    for x in range(sx0, sx1):
        px[x, y] = (0, 0, 0, 0)

# 3. Feather: erode alpha 1px so the blur pulls the edge inward (no halo),
#    then soften it so the silhouette melts into dark backgrounds.
a = im.getchannel("A")
a = a.filter(ImageFilter.MinFilter(3))
a = a.filter(ImageFilter.GaussianBlur(1.2))
im.putalpha(a)

# 4. Crop to content with a small pad.
bbox = im.getchannel("A").getbbox()
pad = 6
bbox = (max(0, bbox[0] - pad), max(0, bbox[1] - pad),
        min(w, bbox[2] + pad), min(h, bbox[3] + pad))
im = im.crop(bbox)
print(f"cropped to: {im.size[0]}x{im.size[1]} at {bbox}")

im.save(DST)
print(f"saved: {DST}")

# 5. Regenerate the Windows .ico from the transparent emblem (square canvas,
#    eagle centered) so the title-bar / taskbar icon matches the header.
ico_src = Image.new("RGBA", (256, 256), (0, 0, 0, 0))
fit = im.copy()
fit.thumbnail((244, 244), Image.LANCZOS)   # small margin inside the canvas
ico_src.alpha_composite(fit, ((256 - fit.width) // 2, (256 - fit.height) // 2))
ico_src.save("assets/drishTI.ico", sizes=[(16, 16), (32, 32), (48, 48), (256, 256)])
print("saved: assets/drishTI.ico")
