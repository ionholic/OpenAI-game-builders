from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

from PIL import Image


PROJECT = Path(__file__).resolve().parents[1]
GENERATED = PROJECT / "public" / "assets" / "generated"


@dataclass(frozen=True)
class SheetSpec:
    source: str
    output: str
    columns: int
    rows: int
    cell_width: int
    cell_height: int
    anchor: str
    safe_padding: int


SPECS = (
    SheetSpec(
        source="player-warden-motion-v3.png",
        output="player-warden-motion-v4-normalized.png",
        columns=8,
        rows=4,
        cell_width=224,
        cell_height=256,
        anchor="bottom",
        safe_padding=10,
    ),
    SheetSpec(
        source="combat-vfx-v1-refined.png",
        output="combat-vfx-v2-normalized.png",
        columns=4,
        rows=4,
        cell_width=384,
        cell_height=256,
        anchor="center",
        safe_padding=10,
    ),
)


def projection(alpha: Image.Image, axis: str, threshold: int = 0) -> list[int]:
    pixels = alpha.load()
    width, height = alpha.size
    if axis == "x":
        return [sum(pixels[x, y] > threshold for y in range(height)) for x in range(width)]
    return [sum(pixels[x, y] > threshold for x in range(width)) for y in range(height)]


def transparent_runs(values: list[int], start: int, end: int) -> list[tuple[int, int]]:
    runs: list[tuple[int, int]] = []
    run_start: int | None = None
    for index in range(start, end + 1):
        transparent = index < end and values[index] == 0
        if transparent and run_start is None:
            run_start = index
        elif not transparent and run_start is not None:
            runs.append((run_start, index))
            run_start = None
    return runs


def find_separator(values: list[int], nominal: int, radius: int) -> int:
    start = max(0, nominal - radius)
    end = min(len(values), nominal + radius + 1)
    runs = transparent_runs(values, start, end)
    if not runs:
        raise ValueError(f"No transparent separator near {nominal}")
    best = max(
        runs,
        key=lambda run: (
            run[1] - run[0],
            -abs((run[0] + run[1]) / 2 - nominal),
        ),
    )
    if best[1] - best[0] < 2:
        raise ValueError(f"Unsafe separator near {nominal}: {best}")
    return (best[0] + best[1]) // 2


def source_cells(image: Image.Image, columns: int, rows: int) -> list[Image.Image]:
    alpha = image.getchannel("A")
    width, height = image.size
    y_projection = projection(alpha, "y")
    y_separators = [0]
    for row in range(1, rows):
        nominal = row * height // rows
        y_separators.append(find_separator(y_projection, nominal, height // rows // 4))
    y_separators.append(height)

    frames: list[Image.Image] = []
    for row in range(rows):
        y0, y1 = y_separators[row], y_separators[row + 1]
        row_alpha = alpha.crop((0, y0, width, y1))
        x_projection = projection(row_alpha, "x")
        x_separators = [0]
        for column in range(1, columns):
            nominal = column * width // columns
            x_separators.append(find_separator(x_projection, nominal, width // columns // 3))
        x_separators.append(width)

        for column in range(columns):
            x0, x1 = x_separators[column], x_separators[column + 1]
            frame = image.crop((x0, y0, x1, y1))
            bounds = frame.getchannel("A").getbbox()
            if bounds is None:
                raise ValueError(f"Empty frame at row {row}, column {column}")
            frames.append(frame.crop(bounds))
    return frames


def normalize(spec: SheetSpec) -> None:
    source_path = GENERATED / spec.source
    output_path = GENERATED / spec.output
    source = Image.open(source_path).convert("RGBA")
    frames = source_cells(source, spec.columns, spec.rows)
    canvas = Image.new(
        "RGBA",
        (spec.cell_width * spec.columns, spec.cell_height * spec.rows),
        (0, 0, 0, 0),
    )

    max_width = spec.cell_width - spec.safe_padding * 2
    max_height = spec.cell_height - spec.safe_padding * 2
    for index, frame in enumerate(frames):
        if frame.width > max_width or frame.height > max_height:
            scale = min(max_width / frame.width, max_height / frame.height)
            frame = frame.resize(
                (max(1, round(frame.width * scale)), max(1, round(frame.height * scale))),
                Image.Resampling.LANCZOS,
            )
        x = (index % spec.columns) * spec.cell_width + (spec.cell_width - frame.width) // 2
        if spec.anchor == "bottom":
            y = (index // spec.columns) * spec.cell_height + spec.cell_height - spec.safe_padding - frame.height
        else:
            y = (index // spec.columns) * spec.cell_height + (spec.cell_height - frame.height) // 2
        canvas.alpha_composite(frame, (x, y))

    canvas.save(output_path, "PNG", optimize=True)
    verify(output_path, spec)
    print(f"{spec.output}: {canvas.width}x{canvas.height}, {len(frames)} frames")


def verify(path: Path, spec: SheetSpec) -> None:
    image = Image.open(path).convert("RGBA")
    expected_size = (spec.cell_width * spec.columns, spec.cell_height * spec.rows)
    if image.size != expected_size:
        raise ValueError(f"{path.name}: expected {expected_size}, got {image.size}")

    alpha = image.getchannel("A")
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
            margins = (left, top, spec.cell_width - right, spec.cell_height - bottom)
            if min(margins) < spec.safe_padding - 1:
                raise ValueError(
                    f"{path.name}: frame {row * spec.columns + column} unsafe margins {margins}"
                )


def main() -> None:
    for spec in SPECS:
        normalize(spec)


if __name__ == "__main__":
    main()
