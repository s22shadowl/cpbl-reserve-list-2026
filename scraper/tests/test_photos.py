from io import BytesIO

from PIL import Image

from scraper.photos import PHOTO_SIZE, crop_box, resize_photo

def encoded(w, h, mode="RGB"):
    out = BytesIO()
    Image.new(mode, (w, h), "red").save(out, "PNG" if mode == "RGBA" else "JPEG")
    return out.getvalue()

def test_crop_box_takes_square_near_top():
    # Same window the card showed with object-fit:cover; object-position 50% 10%.
    assert crop_box(240, 320) == (0, 8, 240, 248)
    assert crop_box(200, 250) == (0, 5, 200, 205)

def test_crop_box_centres_landscape_and_keeps_square():
    assert crop_box(300, 200) == (50, 0, 250, 200)
    assert crop_box(240, 240) == (0, 0, 240, 240)

def test_resize_outputs_square_webp():
    with Image.open(BytesIO(resize_photo(encoded(300, 385)))) as img:
        assert (img.format, img.size) == ("WEBP", (PHOTO_SIZE, PHOTO_SIZE))

def test_resize_does_not_upscale_small_photo_and_converts_png():
    with Image.open(BytesIO(resize_photo(encoded(200, 250, "RGBA")))) as img:
        assert (img.format, img.mode, img.size) == ("WEBP", "RGB", (200, 200))
