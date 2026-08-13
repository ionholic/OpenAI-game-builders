from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageOps


PROJECT = Path(__file__).resolve().parents[1]
SOURCE = PROJECT / "assets" / "source-generated"
OUTPUT = PROJECT / "public" / "assets" / "generated"


def prepare_background(source_name: str, output_name: str) -> None:
    image = Image.open(SOURCE / source_name).convert("RGB")
    fitted = ImageOps.fit(
        image,
        (1920, 1080),
        method=Image.Resampling.LANCZOS,
        centering=(0.5, 0.5),
    )
    fitted.save(OUTPUT / output_name, "WEBP", quality=88, method=6)


def build_sprite_canvas(source_name: str) -> Image.Image:
    image = Image.open(SOURCE / source_name).convert("RGBA")
    alpha = image.getchannel("A")
    bounds = alpha.getbbox()
    if bounds is None:
        raise ValueError(f"No opaque pixels in {source_name}")

    cropped = image.crop(bounds)
    padding = max(18, round(max(cropped.size) * 0.055))
    padded = Image.new(
        "RGBA",
        (cropped.width + padding * 2, cropped.height + padding * 2),
        (0, 0, 0, 0),
    )
    padded.alpha_composite(cropped, (padding, padding))
    padded.thumbnail((512, 512), Image.Resampling.LANCZOS)

    canvas = Image.new("RGBA", (512, 512), (0, 0, 0, 0))
    offset = ((512 - padded.width) // 2, (512 - padded.height) // 2)
    canvas.alpha_composite(padded, offset)
    return canvas


def prepare_sprite(source_name: str, output_name: str) -> None:
    build_sprite_canvas(source_name).save(OUTPUT / output_name, "PNG", optimize=True)


def prepare_sprite_sheet(source_name: str, output_name: str) -> None:
    base = build_sprite_canvas(source_name)
    sheet = Image.new("RGBA", (512 * 4, 512), (0, 0, 0, 0))
    variants = [
        base,
        ImageOps.contain(base.resize((496, 512), Image.Resampling.LANCZOS).rotate(2.5, Image.Resampling.BICUBIC), (512, 512)),
        ImageOps.contain(base.resize((512, 496), Image.Resampling.LANCZOS).rotate(-2.5, Image.Resampling.BICUBIC), (512, 512)),
        ImageOps.contain(base.resize((512, 454), Image.Resampling.LANCZOS).rotate(6, Image.Resampling.BICUBIC), (512, 512)),
    ]
    for index, variant in enumerate(variants):
        frame = Image.new("RGBA", (512, 512), (0, 0, 0, 0))
        frame.alpha_composite(variant, ((512 - variant.width) // 2, (512 - variant.height) // 2))
        sheet.alpha_composite(frame, (index * 512, 0))
    sheet.save(OUTPUT / output_name, "PNG", optimize=True)


def main() -> None:
    OUTPUT.mkdir(parents=True, exist_ok=True)
    prepare_background("arena-courtyard-source.png", "arena-courtyard.webp")
    prepare_background("arena-bamboo-source.png", "arena-bamboo.webp")
    prepare_background("arena-palace-source.png", "arena-palace.webp")
    prepare_sprite("player-warden-source.png", "player-warden.png")
    prepare_sprite("enemy-dokkaebi-source.png", "enemy-dokkaebi.png")
    prepare_sprite("enemy-wisp-source.png", "enemy-wisp.png")
    prepare_sprite("enemy-gwishin-source.png", "enemy-gwishin.png")
    prepare_sprite("enemy-bulgasari-source.png", "enemy-bulgasari.png")
    prepare_sprite("altar-source.png", "altar.png")
    prepare_sprite_sheet("player-warden-source.png", "player-warden-sheet.png")
    prepare_sprite_sheet("enemy-dokkaebi-source.png", "enemy-dokkaebi-sheet.png")
    prepare_sprite_sheet("enemy-wisp-source.png", "enemy-wisp-sheet.png")
    prepare_sprite_sheet("enemy-gwishin-source.png", "enemy-gwishin-sheet.png")
    prepare_sprite_sheet("enemy-bulgasari-source.png", "enemy-bulgasari-sheet.png")

    for output in sorted(OUTPUT.glob("*")):
        if output.is_file() and output.name != ".gitkeep":
            print(f"{output.name}: {output.stat().st_size} bytes")


if __name__ == "__main__":
    main()
