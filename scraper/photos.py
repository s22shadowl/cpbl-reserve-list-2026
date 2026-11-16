"""Shrink official player photos to the square the site displays."""

from io import BytesIO

from PIL import Image

PHOTO_SIZE = 240
WEBP_QUALITY = 75
# Official photos are portrait, head near the top. The card used to show a 1:1
# object-fit:cover window at object-position 50% 10%; keep exactly that window.
TOP_BIAS = 0.10


def crop_box(width: int, height: int) -> tuple[int, int, int, int]:
    """Square crop box: horizontally centred, 10% of the vertical overflow from the top."""
    side = min(width, height)
    left = (width - side) // 2
    top = round((height - side) * TOP_BIAS)
    return (left, top, left + side, top + side)


def resize_photo(data: bytes, quality: int = WEBP_QUALITY) -> bytes:
    """Return a square WebP no larger than PHOTO_SIZE (never upscaled)."""
    with Image.open(BytesIO(data)) as img:
        rgb = img.convert("RGB")
    square = rgb.crop(crop_box(rgb.width, rgb.height))
    if square.width > PHOTO_SIZE:
        square = square.resize((PHOTO_SIZE, PHOTO_SIZE), Image.LANCZOS)
    out = BytesIO()
    square.save(out, "WEBP", quality=quality, method=6)
    return out.getvalue()
