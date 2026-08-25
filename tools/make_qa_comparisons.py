"""Create same-canvas source/implementation comparisons for visual QA."""
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
QA = ROOT / "qa"


def panel(image, size, label, cover=False):
    image = image.convert("RGB")
    if cover:
        scale = max(size[0] / image.width, size[1] / image.height)
        resized = image.resize((round(image.width * scale), round(image.height * scale)), Image.Resampling.LANCZOS)
        left = (resized.width - size[0]) // 2
        top = (resized.height - size[1]) // 2
        image = resized.crop((left, top, left + size[0], top + size[1]))
    else:
        image.thumbnail(size, Image.Resampling.LANCZOS)
        field = Image.new("RGB", size, "#1b1916")
        field.paste(image, ((size[0] - image.width) // 2, (size[1] - image.height) // 2))
        image = field
    draw = ImageDraw.Draw(image)
    draw.rounded_rectangle((18, 18, 236, 56), 7, fill=(12, 12, 12, 220))
    draw.text((32, 29), label, fill="#f7ead7", font=ImageFont.load_default())
    return image


def main():
    QA.mkdir(exist_ok=True)
    desktop_source = Image.open(ROOT / "assets" / "src" / "target_portfolio.png")
    desktop_final = Image.open(QA / "desktop-final.png")
    desktop = Image.new("RGB", (1920, 540), "#1b1916")
    desktop.paste(panel(desktop_source, (960, 540), "SOURCE TARGET"), (0, 0))
    desktop.paste(panel(desktop_final, (960, 540), "IMPLEMENTATION"), (960, 0))
    desktop.save(QA / "desktop-comparison.png", optimize=True)

    mobile_source = Image.open(ROOT / "assets" / "src" / "ChatGPT Image 25 août 2026, 00_31_47 (1).png")
    mobile_final = Image.open(QA / "mobile-final.png")
    mobile = Image.new("RGB", (860, 900), "#1b1916")
    mobile.paste(panel(mobile_source, (430, 900), "SOURCE PLATE", cover=True), (0, 0))
    mobile.paste(panel(mobile_final, (430, 900), "IMPLEMENTATION"), (430, 0))
    mobile.save(QA / "mobile-comparison.png", optimize=True)


if __name__ == "__main__":
    main()
