from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

from PIL import Image


PROJECT = Path(__file__).resolve().parents[1]
SOURCE = PROJECT / "assets" / "source-generated"
OUTPUT = PROJECT / "public" / "assets" / "generated"


@dataclass(frozen=True)
class SheetSpec:
    source: str
    output: str
    columns: int
    rows: int
    cell_width: int
    cell_height: int
    padding: int = 12


SPECS = (
    SheetSpec("player-warden-combo-v1-transparent.png", "player-warden-combo-v1.png", 4, 3, 256, 256),
    SheetSpec("melee-enemy-attacks-v1-transparent.png", "melee-enemy-attacks-v1.png", 4, 3, 320, 256),
)


def projection(alpha: Image.Image, axis: str) -> list[int]:
    pixels = alpha.load()
    width, height = alpha.size
    if axis == "x":
        return [sum(pixels[x, y] > 0 for y in range(height)) for x in range(width)]
    return [sum(pixels[x, y] > 0 for x in range(width)) for y in range(height)]


def blank_runs(values: list[int], start: int, end: int) -> list[tuple[int, int]]:
    runs: list[tuple[int, int]] = []
    run_start: int | None = None
    for index in range(start, end + 1):
        is_blank = index < end and values[index] == 0
        if is_blank and run_start is None:
            run_start = index
        elif not is_blank and run_start is not None:
            runs.append((run_start, index))
            run_start = None
    return runs


def separator(values: list[int], nominal: int, radius: int) -> int:
    start = max(0, nominal - radius)
    end = min(len(values), nominal + radius + 1)
    candidates = blank_runs(values, start, end)
    if not candidates:
        raise ValueError(f"No transparent separator near {nominal}")
    selected = max(
        candidates,
        key=lambda run: (run[1] - run[0], -abs((run[0] + run[1]) / 2 - nominal)),
    )
    if selected[1] - selected[0] < 3:
        raise ValueError(f"Unsafe separator near {nominal}: {selected}")
    return (selected[0] + selected[1]) // 2


def extract_frames(image: Image.Image, columns: int, rows: int) -> list[Image.Image]:
    alpha = image.getchannel("A")
    width, height = image.size
    y_values = projection(alpha, "y")
    y_separators = [0]
    for row in range(1, rows):
        y_separators.append(separator(y_values, row * height // rows, height // rows // 3))
    y_separators.append(height)

    frames: list[Image.Image] = []
    for row in range(rows):
        y0, y1 = y_separators[row], y_separators[row + 1]
        row_alpha = alpha.crop((0, y0, width, y1))
        x_values = projection(row_alpha, "x")
        x_separators = [0]
        for column in range(1, columns):
            x_separators.append(separator(x_values, column * width // columns, width // columns // 3))
        x_separators.append(width)

        for column in range(columns):
            x0, x1 = x_separators[column], x_separators[column + 1]
            frame = image.crop((x0, y0, x1, y1))
            bounds = frame.getchannel("A").getbbox()
            if bounds is None:
                raise ValueError(f"Empty frame at row {row}, column {column}")
            frames.append(frame.crop(bounds))
    return frames


def repack(spec: SheetSpec) -> None:
    image = Image.open(SOURCE / spec.source).convert("RGBA")
    frames = extract_frames(image, spec.columns, spec.rows)
    sheet = Image.new(
        "RGBA",
        (spec.cell_width * spec.columns, spec.cell_height * spec.rows),
        (0, 0, 0, 0),
    )
    max_width = spec.cell_width - spec.padding * 2
    max_height = spec.cell_height - spec.padding * 2

    for index, frame in enumerate(frames):
        scale = min(max_width / frame.width, max_height / frame.height, 1)
        if scale < 1:
            frame = frame.resize(
                (max(1, round(frame.width * scale)), max(1, round(frame.height * scale))),
                Image.Resampling.LANCZOS,
            )
        cell_x = (index % spec.columns) * spec.cell_width
        cell_y = (index // spec.columns) * spec.cell_height
        x = cell_x + (spec.cell_width - frame.width) // 2
        y = cell_y + spec.cell_height - spec.padding - frame.height
        sheet.alpha_composite(frame, (x, y))

    path = OUTPUT / spec.output
    sheet.save(path, "PNG", optimize=True)
    verify(path, spec)
    print(f"{spec.output}: {sheet.width}x{sheet.height}, {len(frames)} frames")


def verify(path: Path, spec: SheetSpec) -> None:
    alpha = Image.open(path).convert("RGBA").getchannel("A")
    margins: list[int] = []
    for row in range(spec.rows):
        for column in range(spec.columns):
            frame = alpha.crop(
                (
                    column * spec.cell_width,
                    row * spec.cell_height,
                    (column + 1) * spec.cell_width,
                    (row + 1) * spec.cell_height,
                )
            )
            bounds = frame.getbbox()
            if bounds is None:
                raise ValueError(f"{path.name}: empty frame {row * spec.columns + column}")
            left, top, right, bottom = bounds
            margins.append(min(left, top, spec.cell_width - right, spec.cell_height - bottom))
    if min(margins) < spec.padding - 1:
        raise ValueError(f"{path.name}: unsafe margins {margins}")


def main() -> None:
    OUTPUT.mkdir(parents=True, exist_ok=True)
    for spec in SPECS:
        repack(spec)


if __name__ == "__main__":
    main()
