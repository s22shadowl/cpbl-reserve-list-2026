"""Shrink official player photos to the size the site displays."""

from io import BytesIO

from PIL import Image

PHOTO_WIDTH = 240
JPEG_QUALITY = 82


def resize_photo(data: bytes) -> bytes:
    """Return a JPEG no wider than PHOTO_WIDTH, keeping the aspect ratio."""
    with Image.open(BytesIO(data)) as img:
        rgb = img.convert("RGB")
    if rgb.width > PHOTO_WIDTH:
        height = round(rgb.height * PHOTO_WIDTH / rgb.width)
        rgb = rgb.resize((PHOTO_WIDTH, height), Image.LANCZOS)
    out = BytesIO()
    rgb.save(out, "JPEG", quality=JPEG_QUALITY, optimize=True)
    return out.getvalue()
