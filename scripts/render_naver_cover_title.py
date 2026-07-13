#!/usr/bin/env python3
"""Render deterministic Naver Blog covers matching the approved legacy style.

Style contract:
- photographic background in lower area
- soft warm-white title area blended at the top
- dark navy Korean sans-serif
- main phrase large/bold, subtitle smaller/medium
- no card, border, stroke, shadow, badge, or accent bar
"""
from __future__ import annotations

import argparse
import os
from pathlib import Path
from typing import List, Tuple

from PIL import Image, ImageDraw, ImageFont

FONT_PATH = "/System/Library/Fonts/AppleSDGothicNeo.ttc"
BOLD_INDEX = 6
MEDIUM_INDEX = 5
NAVY = (7, 31, 67, 255)
WARM_WHITE = (249, 247, 243, 255)


def font(size: int, index: int) -> ImageFont.FreeTypeFont:
    if not os.path.exists(FONT_PATH):
        raise FileNotFoundError(f"Required font missing: {FONT_PATH}")
    return ImageFont.truetype(FONT_PATH, size=size, index=index)


def text_width(draw: ImageDraw.ImageDraw, text: str, fnt: ImageFont.FreeTypeFont) -> int:
    box = draw.textbbox((0, 0), text, font=fnt)
    return int(box[2] - box[0])


def wrap_words(draw: ImageDraw.ImageDraw, text: str, fnt: ImageFont.FreeTypeFont, max_width: int, max_lines: int) -> List[str]:
    words = text.split()
    lines: List[str] = []
    current = ""
    for word in words:
        candidate = f"{current} {word}".strip()
        if current and text_width(draw, candidate, fnt) > max_width:
            lines.append(current)
            current = word
        else:
            current = candidate
    if current:
        lines.append(current)
    if len(lines) > max_lines:
        raise ValueError(f"Title requires {len(lines)} lines; maximum is {max_lines}: {text}")
    return lines


def choose_layout(draw: ImageDraw.ImageDraw, main: str, sub: str, width: int, height: int) -> Tuple[ImageFont.FreeTypeFont, ImageFont.FreeTypeFont, List[str], List[str]]:
    max_width = int(width * 0.88)
    for main_size in range(int(width * 0.088), int(width * 0.058), -2):
        main_font = font(main_size, BOLD_INDEX)
        try:
            main_lines = wrap_words(draw, main, main_font, max_width, 2)
        except ValueError:
            continue
        for sub_size in range(int(width * 0.058), int(width * 0.042), -2):
            sub_font = font(sub_size, MEDIUM_INDEX)
            try:
                sub_lines = wrap_words(draw, sub, sub_font, max_width, 2) if sub else []
            except ValueError:
                continue
            main_gap = int(main_size * 0.24)
            sub_gap = int(sub_size * 0.28)
            total = len(main_lines) * main_size + max(0, len(main_lines) - 1) * main_gap
            if sub_lines:
                total += int(height * 0.022) + len(sub_lines) * sub_size + max(0, len(sub_lines) - 1) * sub_gap
            if total <= int(height * 0.31):
                return main_font, sub_font, main_lines, sub_lines
    raise ValueError("Could not fit title in approved legacy cover layout")


def render(input_path: Path, output_path: Path, title: str) -> None:
    if not input_path.exists():
        raise FileNotFoundError(input_path)
    image = Image.open(input_path).convert("RGBA")
    if image.width < 700 or image.height < 700:
        raise ValueError(f"Cover too small: {image.size}")

    # Split the keyword-led main phrase from the explanatory subtitle, matching
    # approved covers such as airfryer / summer bottle / humid bedding.
    parts = [part.strip() for part in title.split(",", 1)]
    main = parts[0]
    sub = parts[1] if len(parts) > 1 else ""

    overlay = Image.new("RGBA", image.size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(overlay)
    title_zone_bottom = int(image.height * 0.43)
    draw.rectangle((0, 0, image.width, title_zone_bottom), fill=WARM_WHITE)

    main_font, sub_font, main_lines, sub_lines = choose_layout(draw, main, sub, image.width, image.height)
    main_gap = int(main_font.size * 0.24)
    sub_gap = int(sub_font.size * 0.28)
    heights = len(main_lines) * main_font.size + max(0, len(main_lines) - 1) * main_gap
    if sub_lines:
        heights += int(image.height * 0.022) + len(sub_lines) * sub_font.size + max(0, len(sub_lines) - 1) * sub_gap
    y = max(int(image.height * 0.055), (title_zone_bottom - heights) // 2)

    for line in main_lines:
        w = text_width(draw, line, main_font)
        draw.text(((image.width - w) // 2, y), line, font=main_font, fill=NAVY)
        y += main_font.size + main_gap
    if sub_lines:
        y += int(image.height * 0.005)
        for line in sub_lines:
            w = text_width(draw, line, sub_font)
            draw.text(((image.width - w) // 2, y), line, font=sub_font, fill=NAVY)
            y += sub_font.size + sub_gap

    result = Image.alpha_composite(image, overlay).convert("RGB")
    output_path.parent.mkdir(parents=True, exist_ok=True)
    result.save(output_path, "PNG", optimize=True)
    print(output_path)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--title", required=True)
    args = parser.parse_args()
    render(Path(args.input), Path(args.output), args.title.strip())


if __name__ == "__main__":
    main()
