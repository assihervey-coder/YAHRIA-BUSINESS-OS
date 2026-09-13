# -*- coding: utf-8 -*-
"""Génération du corps du rapport d'audit YAHRIA BUSINESS OS V1 (ReportLab).
Conforme au brief report.md : TocDocTemplate + multiBuild, palette Template 07
Crystal Blue (corps clair), FreeSerif, install_font_fallback, tableaux Paragraph,
CondPageBreak 25% avant H1, KeepTogether plafonné, figures à ratio préservé.
"""
import os
import sys
import hashlib

SKILL_SCRIPTS = '/home/z/my-project/skills/pdf/scripts'
if SKILL_SCRIPTS not in sys.path:
    sys.path.insert(0, SKILL_SCRIPTS)
HERE = os.path.dirname(os.path.abspath(__file__))
ASSETS = '/home/z/my-project/assets_yahria'
OUT = '/home/z/my-project/assets_yahria/yahria_body.pdf'
sys.path.insert(0, HERE)

from reportlab.lib.pagesizes import A4
from reportlab.lib import colors
from reportlab.lib.enums import TA_LEFT, TA_CENTER, TA_JUSTIFY
from reportlab.lib.styles import ParagraphStyle
from reportlab.platypus import (SimpleDocTemplate, Paragraph, Spacer, PageBreak,
                                Table, TableStyle, Image, KeepTogether,
                                CondPageBreak, HRFlowable)
from reportlab.platypus.tableofcontents import TableOfContents
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfbase.pdfmetrics import registerFontFamily
from PIL import Image as PILImage

# ---------------------------------------------------------------- fonts
FONT_DIR = '/usr/share/fonts'
pdfmetrics.registerFont(TTFont('NotoSerifSC', f'{FONT_DIR}/truetype/noto-serif-sc/NotoSerifSC-Regular.ttf'))
pdfmetrics.registerFont(TTFont('NotoSerifSC-Bold', f'{FONT_DIR}/truetype/noto-serif-sc/NotoSerifSC-Bold.ttf'))
# 'Noto Sans SC' not installed on this host: map the fallback-chain names
# onto the available NotoSerifSC files (document is 100% Latin/French).
pdfmetrics.registerFont(TTFont('Noto Sans SC', f'{FONT_DIR}/truetype/noto-serif-sc/NotoSerifSC-Regular.ttf'))
pdfmetrics.registerFont(TTFont('Noto Sans SC Bold', f'{FONT_DIR}/truetype/noto-serif-sc/NotoSerifSC-Bold.ttf'))
pdfmetrics.registerFont(TTFont('FreeSerif', f'{FONT_DIR}/truetype/freefont/FreeSerif.ttf'))
pdfmetrics.registerFont(TTFont('FreeSerif-Bold', f'{FONT_DIR}/truetype/freefont/FreeSerifBold.ttf'))
pdfmetrics.registerFont(TTFont('FreeSerif-Italic', f'{FONT_DIR}/truetype/freefont/FreeSerifItalic.ttf'))
pdfmetrics.registerFont(TTFont('FreeSerif-BoldItalic', f'{FONT_DIR}/truetype/freefont/FreeSerifBoldItalic.ttf'))
pdfmetrics.registerFont(TTFont('DejaVuSans', f'{FONT_DIR}/truetype/dejavu/DejaVuSansMono.ttf'))
registerFontFamily('NotoSerifSC', normal='NotoSerifSC', bold='NotoSerifSC-Bold')
registerFontFamily('Noto Sans SC', normal='Noto Sans SC', bold='Noto Sans SC Bold')
registerFontFamily('FreeSerif', normal='FreeSerif', bold='FreeSerif-Bold',
                   italic='FreeSerif-Italic', boldItalic='FreeSerif-BoldItalic')
registerFontFamily('DejaVuSans', normal='DejaVuSans', bold='DejaVuSans')

from pdf import install_font_fallback  # noqa: E402
install_font_fallback()

# ------------------------------------------------- palette (Template 07 body)
PAGE_BG      = colors.HexColor('#f5f8fc')
SECTION_BG   = colors.HexColor('#edf2f9')
CARD_BG      = colors.HexColor('#e4ecf5')
TABLE_STRIPE = colors.HexColor('#eef3fa')
HEADER_FILL  = colors.HexColor('#1a4a7a')
BORDER       = colors.HexColor('#c0d0e2')
ACCENT       = colors.HexColor('#2d7ab3')
TEXT_PRIMARY = colors.HexColor('#142840')
TEXT_MUTED   = colors.HexColor('#5a7a96')

TABLE_HEADER_COLOR = HEADER_FILL
TABLE_ROW_EVEN     = colors.white
TABLE_ROW_ODD      = TABLE_STRIPE

# ---------------------------------------------------------------- layout
MARGIN = 60.0
TOP_MARGIN = 70.0
BOTTOM_MARGIN = 58.0
PAGE_W, PAGE_H = A4
AVAIL_W = PAGE_W - 2 * MARGIN
AVAIL_H = PAGE_H - TOP_MARGIN - BOTTOM_MARGIN
H1_THRESHOLD = AVAIL_H * 0.25
MAX_KEEP_HEIGHT = PAGE_H * 0.4

DOC_TITLE = 'YAHRIA BUSINESS OS V1 — Audit stratégique approfondi'
DOC_AUTHOR = 'Audit stratégique indépendant'

# ---------------------------------------------------------------- styles
S = {}
S['body'] = ParagraphStyle('Body', fontName='FreeSerif', fontSize=10.5,
                           leading=16.5, alignment=TA_JUSTIFY,
                           textColor=TEXT_PRIMARY, spaceBefore=0, spaceAfter=9)
S['bullet'] = ParagraphStyle('Bullet', parent=S['body'], alignment=TA_LEFT,
                             leftIndent=16, spaceAfter=5)
S['h1'] = ParagraphStyle('H1', fontName='FreeSerif', fontSize=19, leading=24,
                         textColor=HEADER_FILL, spaceBefore=6, spaceAfter=4,
                         alignment=TA_LEFT)
S['h2'] = ParagraphStyle('H2', fontName='FreeSerif', fontSize=13.5, leading=18,
                         textColor=TEXT_PRIMARY, spaceBefore=14, spaceAfter=7,
                         alignment=TA_LEFT)
S['h3'] = ParagraphStyle('H3', fontName='FreeSerif', fontSize=11.5, leading=15.5,
                         textColor=TEXT_PRIMARY, spaceBefore=10, spaceAfter=6,
                         alignment=TA_LEFT)
S['caption'] = ParagraphStyle('Caption', fontName='FreeSerif', fontSize=8.5,
                              leading=12, textColor=TEXT_MUTED,
                              alignment=TA_CENTER, spaceBefore=0, spaceAfter=0)
S['quote'] = ParagraphStyle('Quote', fontName='FreeSerif-Italic', fontSize=11.5,
                            leading=18, textColor=HEADER_FILL, alignment=TA_LEFT,
                            leftIndent=0, spaceBefore=0, spaceAfter=0)
S['th'] = ParagraphStyle('TH', fontName='FreeSerif', fontSize=9.5, leading=12.5,
                         textColor=colors.white, alignment=TA_LEFT)
S['thc'] = ParagraphStyle('THC', parent=S['th'], alignment=TA_CENTER)
S['td'] = ParagraphStyle('TD', fontName='FreeSerif', fontSize=9, leading=12.5,
                         textColor=TEXT_PRIMARY, alignment=TA_LEFT)
S['tdc'] = ParagraphStyle('TDC', parent=S['td'], alignment=TA_CENTER)
S['stat_big'] = ParagraphStyle('StatBig', fontName='FreeSerif', fontSize=19,
                               leading=23, textColor=ACCENT, alignment=TA_CENTER)
S['stat_label'] = ParagraphStyle('StatLabel', fontName='FreeSerif', fontSize=8.5,
                                 leading=11.5, textColor=TEXT_MUTED,
                                 alignment=TA_CENTER)
S['toc_title'] = ParagraphStyle('TocTitle', fontName='FreeSerif', fontSize=19,
                                leading=24, textColor=HEADER_FILL, spaceAfter=14)
S['toc0'] = ParagraphStyle('TOC0', fontName='FreeSerif', fontSize=10.5,
                           leading=17, leftIndent=0, textColor=TEXT_PRIMARY)
S['toc1'] = ParagraphStyle('TOC1', fontName='FreeSerif', fontSize=9.5,
                           leading=15, leftIndent=16, textColor=TEXT_MUTED)

# ---------------------------------------------------------------- doc class
ROMAN = {1: 'i', 2: 'ii', 3: 'iii', 4: 'iv', 5: 'v', 6: 'vi'}


class TocDocTemplate(SimpleDocTemplate):
    """TOC with reader-facing page numbers.

    Front matter (TOC pages) uses roman numerals; body pages restart at
    arabic 1. TOC entries display the reader-facing number (internal page
    minus front-matter offset). The offset is discovered in each pass and
    persisted for the next multiBuild pass (converges)."""

    def __init__(self, *args, **kwargs):
        SimpleDocTemplate.__init__(self, *args, **kwargs)
        self.content_start_page = None  # stable value from previous pass
        self._current_start = None      # discovered during current pass

    def build(self, *args, **kwargs):
        # Reset the per-pass discovery only; never overwrite an externally
        # fixed content_start_page (phase B relies on the fixed offset).
        self._current_start = None
        SimpleDocTemplate.build(self, *args, **kwargs)

    def afterFlowable(self, flowable):
        if hasattr(flowable, 'bookmark_name'):
            if self._current_start is None:
                self._current_start = self.page
            offset = self._current_start - 1
            level = getattr(flowable, 'bookmark_level', 0)
            text = getattr(flowable, 'bookmark_text', '')
            key = getattr(flowable, 'bookmark_key', '')
            self.notify('TOCEntry', (level, text, self.page - offset, key))


def add_heading(text, style, level=0):
    key = 'h_%s' % hashlib.md5(text.encode()).hexdigest()[:8]
    p = Paragraph('<a name="%s"/><b>%s</b>' % (key, text), style)
    p.bookmark_name = key
    p.bookmark_level = level
    p.bookmark_text = text
    p.bookmark_key = key
    return p


def safe_keep_together(elements):
    total_h = 0
    for el in elements:
        w, h = el.wrap(AVAIL_W, PAGE_H)
        total_h += h
    if total_h <= MAX_KEEP_HEIGHT:
        return [KeepTogether(elements)]
    elif len(elements) >= 2:
        return [KeepTogether(elements[:2])] + list(elements[2:])
    return list(elements)


def embed_image(path, max_width=None, max_height=None):
    if max_width is None:
        max_width = AVAIL_W
    if max_height is None:
        max_height = A4[1] * 0.35
    pil = PILImage.open(path)
    ow, oh = pil.size
    ratio = min(max_width / ow if ow > max_width else 1.0,
                max_height / oh if oh > max_height else 1.0)
    return Image(path, width=ow * ratio, height=oh * ratio)

# ---------------------------------------------------------------- renderers

def render_table(block):
    widths = [r * AVAIL_W for r in block['widths']]
    assert abs(sum(widths) - AVAIL_W) < 1.0, 'table widths exceed available width'
    aligns = block.get('aligns', ['l'] * len(block['header']))
    data = [[Paragraph('<b>%s</b>' % h, S['thc'] if a == 'c' else S['th'])
             for h, a in zip(block['header'], aligns)]]
    for row in block['rows']:
        data.append([Paragraph(c, S['tdc'] if a == 'c' else S['td'])
                     for c, a in zip(row, aligns)])
    tbl = Table(data, colWidths=widths, hAlign='CENTER', repeatRows=1)
    style = [
        ('BACKGROUND', (0, 0), (-1, 0), TABLE_HEADER_COLOR),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('GRID', (0, 0), (-1, -1), 0.5, BORDER),
        ('LEFTPADDING', (0, 0), (-1, -1), 7),
        ('RIGHTPADDING', (0, 0), (-1, -1), 7),
        ('TOPPADDING', (0, 0), (-1, -1), 5.5),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 5.5),
    ]
    for i in range(1, len(data)):
        style.append(('BACKGROUND', (0, i), (-1, i),
                      TABLE_ROW_ODD if i % 2 == 0 else TABLE_ROW_EVEN))
    tbl.setStyle(TableStyle(style))
    caption = Paragraph(block['title'], S['caption'])
    out = [Spacer(1, 16)]
    if len(block['rows']) <= 6:
        out += safe_keep_together([tbl, Spacer(1, 6), caption])
    else:
        out += [tbl, Spacer(1, 6), caption]
    out.append(Spacer(1, 16))
    return out


def render_fig(block):
    img = embed_image(os.path.join(ASSETS, block['path']),
                      max_width=AVAIL_W * 0.97, max_height=block.get('maxh', 300))
    caption = Paragraph(block['caption'], S['caption'])
    return [Spacer(1, 18)] + safe_keep_together([img, Spacer(1, 8), caption]) + [Spacer(1, 18)]


def render_stats(block):
    items = block['items']
    n = len(items)
    gap = 0.03 * AVAIL_W
    cell_w = (AVAIL_W - gap * (n - 1)) / n
    widths, row_big, row_lab, boxes = [], [], [], []
    for i, (big, lab) in enumerate(items):
        widths.append(cell_w)
        row_big.append(Paragraph('<b>%s</b>' % big, S['stat_big']))
        row_lab.append(Paragraph(lab, S['stat_label']))
        boxes.append(len(widths) - 1)
        if i < n - 1:
            widths.append(gap)
            row_big.append('')
            row_lab.append('')
    tbl = Table([row_big, row_lab], colWidths=widths, hAlign='CENTER')
    style = [
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('TOPPADDING', (0, 0), (-1, 0), 10),
        ('BOTTOMPADDING', (0, 1), (-1, 1), 9),
        ('TOPPADDING', (0, 1), (-1, 1), 1),
        ('BOTTOMPADDING', (0, 0), (-1, 0), 1),
        ('LEFTPADDING', (0, 0), (-1, -1), 6),
        ('RIGHTPADDING', (0, 0), (-1, -1), 6),
    ]
    for c in boxes:
        style.append(('BACKGROUND', (c, 0), (c, 1), CARD_BG))
        style.append(('LINEBEFORE', (c, 0), (c, 1), 3, ACCENT))
    tbl.setStyle(TableStyle(style))
    return [Spacer(1, 12)] + safe_keep_together([tbl]) + [Spacer(1, 14)]


def render_quote(block):
    inner = Paragraph('« %s »' % block['x'], S['quote'])
    tbl = Table([[inner]], colWidths=[AVAIL_W * 0.88], hAlign='CENTER')
    tbl.setStyle(TableStyle([
        ('LINEBEFORE', (0, 0), (0, -1), 2.5, ACCENT),
        ('LEFTPADDING', (0, 0), (-1, -1), 14),
        ('RIGHTPADDING', (0, 0), (-1, -1), 8),
        ('TOPPADDING', (0, 0), (-1, -1), 4),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
    ]))
    return [Spacer(1, 12)] + safe_keep_together([tbl]) + [Spacer(1, 12)]


def render_blocks(blocks):
    story = []
    for b in blocks:
        t = b['t']
        if t == 'h1':
            story.append(CondPageBreak(H1_THRESHOLD))
            head = add_heading(b['x'], S['h1'], level=0)
            rule = HRFlowable(width='100%', color=ACCENT, thickness=1.2,
                              spaceBefore=2, spaceAfter=10)
            story.extend(safe_keep_together([head, rule]))
        elif t == 'h2':
            story.append(CondPageBreak(70))
            story.append(add_heading(b['x'], S['h2'], level=1))
        elif t == 'h3':
            story.append(CondPageBreak(55))
            story.append(Paragraph('<b>%s</b>' % b['x'], S['h3']))
        elif t == 'p':
            story.append(Paragraph(b['x'], S['body']))
        elif t == 'bullets':
            for it in b['items']:
                story.append(Paragraph('•  ' + it, S['bullet']))
            story.append(Spacer(1, 5))
        elif t == 'table':
            story.extend(render_table(b))
        elif t == 'fig':
            story.extend(render_fig(b))
        elif t == 'stats':
            story.extend(render_stats(b))
        elif t == 'quote':
            story.extend(render_quote(b))
        else:
            raise ValueError('unknown block type: %s' % t)
    return story

# ---------------------------------------------------------------- page deco

def draw_page(canvas, doc):
    canvas.saveState()
    # full-bleed light-blue page background (Template 07 body family)
    canvas.setFillColor(PAGE_BG)
    canvas.rect(0, 0, PAGE_W, PAGE_H, fill=1, stroke=0)
    # header: title left + accent rule
    canvas.setFont('FreeSerif', 7.5)
    canvas.setFillColor(TEXT_MUTED)
    canvas.drawString(MARGIN, PAGE_H - 42, DOC_TITLE)
    canvas.setStrokeColor(ACCENT)
    canvas.setLineWidth(1.2)
    canvas.line(MARGIN, PAGE_H - 48, PAGE_W - MARGIN, PAGE_H - 48)
    # footer: light rule + author left + page number right
    canvas.setStrokeColor(BORDER)
    canvas.setLineWidth(0.5)
    canvas.line(MARGIN, 42, PAGE_W - MARGIN, 42)
    canvas.setFont('FreeSerif', 7.5)
    canvas.setFillColor(TEXT_MUTED)
    canvas.drawString(MARGIN, 30, DOC_AUTHOR)
    cs = doc.content_start_page
    if cs is None or doc.page < cs:
        page_label = ROMAN.get(doc.page, str(doc.page))
    else:
        page_label = str(doc.page - cs + 1)
    canvas.drawRightString(PAGE_W - MARGIN, 30, page_label)
    canvas.restoreState()

# ---------------------------------------------------------------- build

def build_story():
    from yahria_content_a import CH1, CH2, CH3
    from yahria_content_b import CH4, CH5, CH6
    from yahria_content_c import CH7, CH8, CH9

    story = []
    story.append(Paragraph('<b>Table des matières</b>', S['toc_title']))
    toc = TableOfContents()
    toc.levelStyles = [S['toc0'], S['toc1']]
    toc.dotsMinLevel = 0
    story.append(toc)
    story.append(PageBreak())

    for ch in (CH1, CH2, CH3, CH4, CH5, CH6, CH7, CH8, CH9):
        story.extend(render_blocks(ch))
    return story


def make_doc(path):
    return TocDocTemplate(path, pagesize=A4,
                          leftMargin=MARGIN, rightMargin=MARGIN,
                          topMargin=TOP_MARGIN, bottomMargin=BOTTOM_MARGIN,
                          title=DOC_TITLE, author='Z.ai', creator='Z.ai',
                          subject="Audit critique de l'architecture YAHRIA BUSINESS OS V1")


def main():
    # Phase A: discover the stable front-matter offset (TOC page count).
    tmp = OUT.replace('.pdf', '_passA.pdf')
    doc_a = make_doc(tmp)
    doc_a.multiBuild(build_story(), onFirstPage=draw_page, onLaterPages=draw_page)
    cs = doc_a._current_start or doc_a.content_start_page
    print('phase A: content starts at internal page', cs)

    # Phase B: rebuild with the offset fixed from the start, so roman/arabic
    # footers are correct in every pass of the second multiBuild.
    doc_b = make_doc(OUT)
    doc_b.content_start_page = cs
    doc_b.multiBuild(build_story(), onFirstPage=draw_page, onLaterPages=draw_page)

    words = 0
    from yahria_content_a import CH1, CH2, CH3
    from yahria_content_b import CH4, CH5, CH6
    from yahria_content_c import CH7, CH8, CH9
    for ch in (CH1, CH2, CH3, CH4, CH5, CH6, CH7, CH8, CH9):
        for b in ch:
            if b['t'] in ('p', 'h1', 'h2', 'h3', 'quote'):
                words += len(b['x'].split())
            elif b['t'] == 'bullets':
                words += sum(len(i.split()) for i in b['items'])
            elif b['t'] == 'table':
                words += sum(len(' '.join(r).split()) for r in b['rows'])
    print('OK %s — mots de contenu: %d' % (OUT, words))


if __name__ == '__main__':
    main()
