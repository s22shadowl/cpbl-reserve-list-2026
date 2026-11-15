from io import BytesIO

from PIL import Image

from scraper.photos import PHOTO_WIDTH, resize_photo


def jpeg(w, h, mode="RGB"):
    out = BytesIO()
    Image.new(mode, (w, h), "red").save(out, "PNG" if mode == "RGBA" else "JPEG")
    return out.getvalue()


def test_resize_shrinks_wide_photo():
    with Image.open(BytesIO(resize_photo(jpeg(300, 385)))) as img:
        assert (img.format, img.width, img.height) == ("JPEG", PHOTO_WIDTH, 308)


def test_resize_keeps_small_photo_and_converts_png():
    with Image.open(BytesIO(resize_photo(jpeg(200, 250, "RGBA")))) as img:
        assert (img.format, img.mode, img.size) == ("JPEG", "RGB", (200, 250))
