#!/usr/bin/env python3
"""Screenshot HTML diagram -> PNG @2x device scale (300dpi print quality).
Documented pipeline for Report-brief diagram embedding (Playwright+CSS -> PNG -> Image()).
Usage: python3 html2png.py <input.html> <output.png> [selector]
"""
import sys
from pathlib import Path
from playwright.sync_api import sync_playwright


def main():
    if len(sys.argv) < 3:
        print("usage: html2png.py <input.html> <output.png> [selector]")
        sys.exit(1)
    src = Path(sys.argv[1]).resolve()
    out = Path(sys.argv[2]).resolve()
    selector = sys.argv[3] if len(sys.argv) > 3 else "#fig"

    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page(viewport={"width": 1400, "height": 1000},
                                device_scale_factor=2)
        page.goto(src.as_uri())
        page.wait_for_load_state("networkidle")
        # Ensure web fonts are fully loaded before measuring/shooting
        page.evaluate("document.fonts && document.fonts.ready")
        page.wait_for_timeout(400)
        el = page.query_selector(selector)
        if el is None:
            print(f"ERROR: selector {selector} not found in {src}")
            sys.exit(2)
        el.screenshot(path=str(out))
        browser.close()
    print(f"OK {out}")


if __name__ == "__main__":
    main()
