# Makes a scannable QR code (with a label) for a shop's link, then scans it back to prove it works.
# Usage: python qr/make_qr.py <url> "<label>" <output.png>
import sys
import cv2
import qrcode
from PIL import Image, ImageDraw, ImageFont

url, label, out = sys.argv[1], sys.argv[2], sys.argv[3]

qr = qrcode.QRCode(error_correction=qrcode.constants.ERROR_CORRECT_H, box_size=20, border=4)
qr.add_data(url)
qr.make(fit=True)
code = qr.make_image(fill_color="#1A1410", back_color="white").convert("RGB")

# Label underneath, so a printed code says what it's for.
font_big = ImageFont.truetype("C:/Windows/Fonts/arialbd.ttf", 64)
font_small = ImageFont.truetype("C:/Windows/Fonts/arial.ttf", 40)
w, h = code.size
card = Image.new("RGB", (w, h + 200), "white")
card.paste(code, (0, 0))
draw = ImageDraw.Draw(card)
draw.text((w / 2, h + 40), label, font=font_big, fill="#1A1410", anchor="mt")
draw.text((w / 2, h + 125), "Scan to order", font=font_small, fill="#D2341B", anchor="mt")
card.save(out)

# Prove it: decode the saved file and compare with the intended link.
decoded, _, _ = cv2.QRCodeDetector().detectAndDecode(cv2.imread(out))
print("decoded:", decoded)
assert decoded == url, f"QR decodes to {decoded!r}, expected {url!r}"
print("OK: scans to the right link")
