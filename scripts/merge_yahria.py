#!/usr/bin/env python3
"""Fusion couverture + corps -> PDF final unique, pages normalisées A4."""
from pypdf import PdfReader, PdfWriter

A4_W, A4_H = 595.28, 841.89

COVER = '/home/z/my-project/assets_yahria/cover_yahria.pdf'
BODY = '/home/z/my-project/assets_yahria/yahria_body.pdf'
OUT = '/home/z/my-project/download/YAHRIA_BUSINESS_OS_V1_Audit_Strategique.pdf'


def normalize_page_to_a4(page):
    box = page.mediabox
    w, h = float(box.width), float(box.height)
    if abs(w - A4_W) > 0.1 or abs(h - A4_H) > 0.1:
        page.scale_to(A4_W, A4_H)
    return page


def main():
    writer = PdfWriter()
    cover_page = PdfReader(COVER).pages[0]
    writer.add_page(normalize_page_to_a4(cover_page))
    for page in PdfReader(BODY).pages:
        writer.add_page(normalize_page_to_a4(page))
    writer.add_metadata({
        '/Title': 'YAHRIA BUSINESS OS V1 - Audit stratégique approfondi',
        '/Author': 'Z.ai',
        '/Creator': 'Z.ai',
        '/Subject': "Audit critique de l'architecture YAHRIA BUSINESS OS V1 : boucle opérationnelle, risques, périmètre V1 et roadmap priorisée",
    })
    with open(OUT, 'wb') as f:
        writer.write(f)
    print('OK %s (%d pages)' % (OUT, len(writer.pages)))


if __name__ == '__main__':
    main()
