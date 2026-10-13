# Makes a scannable QR code (with a label) for a shop's link, then scans it back to prove it works.
# Usage: python qr/make_qr.py <url> "<label>" <output.png>
import sys
import cv2
from PIL import Image, ImageDraw, ImageFont
import qrcode

url, label, out = sys.argv[1], sys.argv[2], sys.argv[3]
font_big = ImageFont.truetype("C:/Windows/Fonts/arialbd.ttf", 64)
font_small = ImageFont.truetype("C:/Windows/Fonts/arial.ttf", 40)


def make_card(mask):
    qr = qrcode.QRCode(error_correction=qrcode.constants.ERROR_CORRECT_H, box_size=20, border=4, mask_pattern=mask)
    qr.add_data(url)
    qr.make(fit=True)
    code = qr.make_image(fill_color="#1A1410", back_color="white").convert("RGB")
    # Label underneath, so a printed code says what it's for.
    w, h = code.size
    card = Image.new("RGB", (w, h + 200), "white")
    card.paste(code, (0, 0))
    draw = ImageDraw.Draw(card)
    draw.text((w / 2, h + 40), label, font=font_big, fill="#1A1410", anchor="mt")
    draw.text((w / 2, h + 125), "Scan to order", font=font_small, fill="#D2341B", anchor="mt")
    return card


# The library's automatic pick (None) is tried first. Some of the 8 QR mask patterns are valid
# but hard for some scanners (OpenCV couldn't read the auto pick for Eli's link), so if the saved
# file doesn't scan back, try the next pattern. Only a file that decodes to the link is kept.
for mask in [None, *range(8)]:
    make_card(mask).save(out)
    decoded, _, _ = cv2.QRCodeDetector().detectAndDecode(cv2.imread(out))
    if decoded == url:
        print(f"OK: scans to the right link (mask {'auto' if mask is None else mask})")
        break
else:
    raise SystemExit(f"No QR pattern scanned back to {url!r}; not saving a code that may not work.")
