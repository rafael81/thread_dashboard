#!/usr/bin/env python3
"""Download videos from a Threads post URL using yt-dlp."""

from __future__ import annotations

import argparse
import html
import re
import shutil
import subprocess
import sys
from pathlib import Path
from urllib.parse import urlparse
from urllib.request import Request, urlopen


SUPPORTED_HOSTS = {"threads.com", "www.threads.com", "threads.net", "www.threads.net"}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Download video media from a Threads original post URL."
    )
    parser.add_argument("url", help="Threads post URL, e.g. https://www.threads.com/@user/post/...")
    parser.add_argument(
        "-o",
        "--output-dir",
        default="downloads",
        help="Directory where downloaded files are saved. Default: downloads",
    )
    parser.add_argument(
        "--cookies-from-browser",
        metavar="BROWSER",
        help="Use browser cookies for private/restricted posts. Examples: chrome, safari, firefox",
    )
    parser.add_argument(
        "--archive",
        default=".threads-download-archive.txt",
        help="Archive file used to skip already downloaded posts. Default: .threads-download-archive.txt",
    )
    parser.add_argument(
        "--audio-only",
        action="store_true",
        help="Download audio only when available.",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Print the yt-dlp command without running it.",
    )
    return parser.parse_args()


def validate_threads_url(url: str) -> None:
    parsed = urlparse(url)
    if parsed.scheme not in {"http", "https"} or parsed.netloc.lower() not in SUPPORTED_HOSTS:
        raise SystemExit("Error: URL must be from threads.com or threads.net.")
    if not parsed.path or parsed.path == "/":
        raise SystemExit("Error: URL does not look like a Threads post URL.")


def build_command(args: argparse.Namespace) -> list[str]:
    ytdlp = shutil.which("yt-dlp")
    if not ytdlp:
        raise SystemExit("Error: yt-dlp is not installed. Install it with: brew install yt-dlp")

    output_dir = Path(args.output_dir).expanduser()
    output_dir.mkdir(parents=True, exist_ok=True)

    command = [
        ytdlp,
        "--no-playlist",
        "--restrict-filenames",
        "--merge-output-format",
        "mp4",
        "--download-archive",
        args.archive,
        "-o",
        str(output_dir / "%(uploader|unknown)s-%(id)s-%(title).80s.%(ext)s"),
    ]

    if args.cookies_from_browser:
        command.extend(["--cookies-from-browser", args.cookies_from_browser])

    if args.audio_only:
        command.extend(["-x", "--audio-format", "m4a"])
    else:
        command.extend(["-f", "bv*+ba/b"])

    command.append(args.url)
    return command


def extract_mp4_urls(page: str) -> list[str]:
    patterns = [
        r"https?://[^\"'<>\\\s]+?\.mp4[^\"'<>\\\s]*",
        r"https?:\\?/\\?/[^\"'<>\\\s]+?\.mp4[^\"'<>\\\s]*",
    ]
    urls: list[str] = []
    seen: set[str] = set()

    for pattern in patterns:
        for match in re.findall(pattern, page):
            cleaned = html.unescape(match)
            cleaned = cleaned.replace("\\/", "/").replace("\\u0026", "&").replace("\\u003d", "=")
            if cleaned not in seen:
                urls.append(cleaned)
                seen.add(cleaned)

    return urls


def filename_from_url(url: str, index: int) -> str:
    parsed = urlparse(url)
    suffix = Path(parsed.path).suffix or ".mp4"
    return f"threads-video-{index}{suffix}"


def direct_download(args: argparse.Namespace) -> int:
    output_dir = Path(args.output_dir).expanduser()
    output_dir.mkdir(parents=True, exist_ok=True)

    request = Request(
        args.url,
        headers={
            "User-Agent": (
                "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
                "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36"
            ),
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        },
    )

    with urlopen(request, timeout=30) as response:
        page = response.read().decode("utf-8", "ignore")

    urls = extract_mp4_urls(page)
    if not urls:
        print(
            "No direct MP4 URL was found in the public page HTML. "
            "This Threads post may require login or client-side media loading.",
            file=sys.stderr,
        )
        return 1

    for index, media_url in enumerate(urls, start=1):
        target = output_dir / filename_from_url(media_url, index)
        media_request = Request(
            media_url,
            headers={
                "User-Agent": request.headers["User-agent"],
                "Referer": args.url,
            },
        )
        print(f"Downloading direct media: {target}")
        with urlopen(media_request, timeout=60) as response, target.open("wb") as file:
            shutil.copyfileobj(response, file)

    return 0


def main() -> int:
    args = parse_args()
    validate_threads_url(args.url)
    command = build_command(args)

    printable = " ".join(subprocess.list2cmdline([part]) for part in command)
    if args.dry_run:
        print(printable)
        return 0

    print(f"Running: {printable}", flush=True)
    try:
        completed = subprocess.run(command, check=False)
    except KeyboardInterrupt:
        print("\nCanceled.", file=sys.stderr)
        return 130

    if completed.returncode != 0:
        print(
            "\nyt-dlp did not download this URL. Trying direct HTML media extraction...",
            file=sys.stderr,
        )
        direct_result = direct_download(args)
        if direct_result != 0:
            print(
                "\nDownload failed. If the post requires login, retry with "
                "`--cookies-from-browser chrome` or `--cookies-from-browser safari`. "
                "If it still fails, this Threads layout likely needs a browser-based extractor.",
                file=sys.stderr,
            )
        return direct_result
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
