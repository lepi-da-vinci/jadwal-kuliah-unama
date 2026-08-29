#!/usr/bin/env python3
"""
HTML Template Builder
Menggabungkan master template (frontend/templates/index.html) dengan 
komponen-komponen modular (frontend/components/*.html) menjadi index.html siap pakai.
"""
import os
import re

ROOT_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FRONTEND_DIR = os.path.join(ROOT_DIR, "frontend")
TEMPLATE_PATH = os.path.join(FRONTEND_DIR, "templates", "index.html")
OUTPUT_ROOT_PATH = os.path.join(ROOT_DIR, "index.html")

def build_html():
    if not os.path.exists(TEMPLATE_PATH):
        raise FileNotFoundError(f"Template tidak ditemukan: {TEMPLATE_PATH}")

    with open(TEMPLATE_PATH, "r", encoding="utf-8") as f:
        template_content = f.read()

    # Match pattern: <!-- INCLUDE: path/to/file.html -->
    pattern = r"<!--\s*INCLUDE:\s*([^\s]+)\s*-->"

    def replace_include(match):
        rel_path = match.group(1).strip()
        comp_path = os.path.join(FRONTEND_DIR, rel_path)
        if not os.path.exists(comp_path):
            raise FileNotFoundError(f"Komponen include tidak ditemukan: {comp_path}")
        
        with open(comp_path, "r", encoding="utf-8") as comp_file:
            content = comp_file.read()
        return content

    compiled_html = template_content
    # Recursively resolve includes
    for _ in range(10):
        if not re.search(pattern, compiled_html):
            break
        compiled_html = re.sub(pattern, replace_include, compiled_html)

    # Simpan ke root index.html (satu-satunya file HTML output terkompilasi)
    with open(OUTPUT_ROOT_PATH, "w", encoding="utf-8") as f:
        f.write(compiled_html)

    print(f" Berhasil mengompilasi HTML terpadu ke: {OUTPUT_ROOT_PATH}")
    return compiled_html

if __name__ == "__main__":
    build_html()
