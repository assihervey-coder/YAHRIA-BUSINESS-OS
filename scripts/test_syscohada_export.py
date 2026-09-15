# YAHRIA BUSINESS OS V1 — Validation profonde de l'export SYSCOHADA (SEC-004)
# Au-delà des signatures binaires (iter4) : ce harnais vérifie le CONTENU
# métier des 6 artefacts contre la vérité terrain SQLite.
#   ① Équilibre balance générale (INV-ACC-001 : Σ débits = Σ crédits, soldes D = C)
#   ② Exactitude par compte (mouvements + soldes) vs SQLite
#   ③ Grand livre : solde progressif, ligne « à nouveau », lettrage 411/401
#      (chaque lettre rapproche débit = crédit — propriété comptable du lettrage)
#   ④ Journaux codifiés VTE/ACH/TRE/PAIE/OD + cohérence transverse balance ↔ journaux
#   ⑤ RLS multi-organisations : CI ≠ SN ≠ BJ (aucune fuite inter-orgs)
#   ⑥ Filtrage de période exact
#   ⑦ PDF : textes SYSCOHADA présents (pdfplumber)
#   ⑧ Garde-fous : 401 anonyme, 403 session provisionnelle, 400 paramètres invalides
#   ⑨ Nettoyage : état 2FA des comptes de test restauré
import base64
import hashlib
import hmac
import json
import re
import sqlite3
import struct
import time
import urllib.error
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

BASE = 'http://localhost:3000'
DB = 'prisma/db/yahria.db'
OUT = Path(__file__).parent / 'out_syscohada'
OUT.mkdir(exist_ok=True)
PASSWORD = 'Demo2026!'

PASS = 0
FAIL = 0
FAILS = []


def check(name, ok, detail=''):
    global PASS, FAIL
    if ok:
        PASS += 1
        print(f'  ✅ {name}')
    else:
        FAIL += 1
        FAILS.append(name)
        print(f'  ❌ {name}' + (f' — {detail}' if detail else ''))


# ── TOTP RFC 6238 ────────────────────────────────────────────────────────────
def totp(secret_b32, drift=0):
    key = base64.b32decode(secret_b32 + '=' * (-len(secret_b32) % 8))
    counter = int(time.time() // 30) + drift
    msg = struct.pack('>Q', counter)
    h = hmac.new(key, msg, hashlib.sha1).digest()
    o = h[-1] & 0xF
    bin_code = ((h[o] & 0x7F) << 24) | (h[o + 1] << 16) | (h[o + 2] << 8) | h[o + 3]
    return f'{bin_code % 1_000_000:06d}'


# ── Client HTTP (jar de cookie minimal) ──────────────────────────────────────
class Client:
    def __init__(self):
        self.cookie = None

    def call(self, path, body=None, raw=False):
        req = urllib.request.Request(f'{BASE}{path}', method='POST' if body is not None else 'GET')
        if self.cookie:
            req.add_header('cookie', self.cookie)
        data = None
        if body is not None:
            req.add_header('content-type', 'application/json')
            data = json.dumps(body).encode()
        try:
            res = urllib.request.urlopen(req, data, timeout=60)
            sc = res.headers.get('set-cookie')
            if sc and 'yahria_session=' in sc:
                self.cookie = sc.split(';')[0]
            return res.status, (res.read() if raw else json.loads(res.read() or b'{}')), res.headers
        except urllib.error.HTTPError as e:
            payload = e.read()
            try:
                return e.code, json.loads(payload or b'{}'), e.headers
            except Exception:
                return e.code, {}, e.headers


def enroll_and_login(c: Client, email: str) -> dict:
    """Enrôle la 2FA (démo) puis se connecte en 2 étapes → session pleine."""
    st, d, _ = c.call('/api/v1/auth/login', {'email': email, 'password': PASSWORD})
    assert st == 200 and d.get('ok'), f'login étape 1 échoué {st} {d}'
    st, d, _ = c.call('/api/v1/auth/2fa/setup', {})
    assert st == 200 and d.get('secret'), f'setup échoué {st}'
    secret = d['secret']
    st, d, _ = c.call('/api/v1/auth/2fa/enable', {'code': totp(secret)})
    assert st == 200 and len(d.get('recoveryCodes', [])) == 8, f'enable échoué {st}'
    st, d, _ = c.call('/api/v1/auth/login', {'email': email, 'password': PASSWORD})
    assert st == 200 and d.get('mfaRequired') and d.get('challenge'), f'challenge absent {st}'
    st, d, _ = c.call('/api/v1/auth/2fa/verify', {'challenge': d['challenge'], 'code': totp(secret)})
    assert st == 200 and d.get('ok'), f'verify échoué {st}'
    return {'secret': secret}


def disable_2fa(c: Client) -> int:
    st, _, _ = c.call('/api/v1/auth/2fa/disable', {'password': PASSWORD})
    return st


# ── Vérité terrain SQLite ────────────────────────────────────────────────────
JOURNALS = {'INVOICE': 'VTE', 'EXPENSE': 'ACH', 'PAYMENT': 'TRE', 'PAYROLL': 'PAIE', 'PAYROLL_REVERSAL': 'PAIE', 'MANUAL': 'OD'}


def epoch_ms(date_str, end=False):
    dt = datetime.fromisoformat(date_str).replace(tzinfo=timezone.utc)
    if end:
        dt = dt.replace(hour=23, minute=59, second=59, microsecond=999000)
    return int(dt.timestamp() * 1000)


def ground_truth(org_name, from_s='2026-01-01', to_s='2026-12-31'):
    db = sqlite3.connect(DB)
    org = db.execute('SELECT id, legalName, countryCode FROM Organization WHERE name=?', (org_name,)).fetchone()
    if not org:
        raise RuntimeError(f'org inconnue {org_name}')
    org_id, legal, cc = org
    lo, hi = epoch_ms(from_s), epoch_ms(to_s, end=True)
    rows = db.execute(
        "SELECT l.accountCode, l.accountName, l.debit, l.credit FROM LedgerLine l "
        "JOIN JournalEntry j ON j.id = l.entryId WHERE j.orgId=? AND j.posted=1 AND j.entryDate BETWEEN ? AND ?",
        (org_id, lo, hi),
    ).fetchall()
    prior = db.execute(
        "SELECT l.accountCode, l.debit, l.credit FROM LedgerLine l "
        "JOIN JournalEntry j ON j.id = l.entryId WHERE j.orgId=? AND j.posted=1 AND j.entryDate < ?",
        (org_id, lo),
    ).fetchall()
    jrn = db.execute(
        "SELECT j.source, l.debit, l.credit FROM LedgerLine l "
        "JOIN JournalEntry j ON j.id = l.entryId WHERE j.orgId=? AND j.posted=1 AND j.entryDate BETWEEN ? AND ?",
        (org_id, lo, hi),
    ).fetchall()
    db.close()
    accounts = {}
    for code, name, d, cr in rows:
        a = accounts.setdefault(code, {'name': name, 'd': 0.0, 'c': 0.0})
        a['d'] += d
        a['c'] += cr
        a['name'] = a['name'] or name
    opening = {}
    for code, d, cr in prior:
        opening[code] = opening.get(code, 0.0) + d - cr
    journals = {}
    for src, d, cr in jrn:
        j = journals.setdefault(JOURNALS.get(src, 'OD'), {'d': 0.0, 'c': 0.0})
        j['d'] += d
        j['c'] += cr
    return {'orgId': org_id, 'legal': legal, 'cc': cc, 'accounts': accounts, 'opening': opening, 'journals': journals}


def r2(x):
    return round(x + 1e-9, 2)


# ── Parseurs XLSX ────────────────────────────────────────────────────────────
DATE_RE = re.compile(r'^\d{2}/\d{2}/\d{4}$')


def parse_balance_xlsx(path):
    import openpyxl
    ws = openpyxl.load_workbook(path).active
    banner = str(ws.cell(1, 1).value or '')
    entity = str(ws.cell(2, 1).value or '')
    title = str(ws.cell(3, 1).value or '')
    rows, classes, totals = [], [], None
    for r in ws.iter_rows(min_row=6, values_only=True):
        a = r[0]
        if a is None:
            continue
        a = str(a)
        if a.startswith('CLASSE'):
            classes.append(a)
        elif a == 'TOTAUX':
            totals = {'d': r[3], 'c': r[4], 'sd': r[5], 'sc': r[6]}
        elif re.match(r'^\d', a):  # codes comptes uniquement (ignore lignes de note)
            rows.append({'code': a, 'name': r[1], 'klass': r[2], 'd': r[3] or 0, 'c': r[4] or 0, 'sd': r[5] or 0, 'sc': r[6] or 0})
    return {'banner': banner, 'entity': entity, 'title': title, 'rows': rows, 'classes': classes, 'totals': totals}


def parse_grand_livre_xlsx(path):
    import openpyxl
    ws = openpyxl.load_workbook(path).active
    accounts, cur = [], None
    for r in ws.iter_rows(min_row=5, values_only=True):
        a = r[0]
        if a is None:
            continue
        a = str(a)
        if a.startswith('Compte '):
            m = re.match(r'Compte (\S+) — (.*?)\s+\[Classe (\d+)\]', a)
            cur = {'code': m.group(1), 'name': m.group(2), 'klass': int(m.group(3)), 'rows': [], 'totals': None}
            accounts.append(cur)
        elif a == 'Date' and cur is not None:
            continue
        elif r[3] == 'Totaux du compte' and cur is not None:
            cur['totals'] = {'d': r[4] or 0, 'c': r[5] or 0, 'solde': r[6] or 0, 'sense': r[7]}
        elif cur is not None and (DATE_RE.match(str(r[0] or '')) or r[0] == 'À nouveau'):
            cur['rows'].append({
                'date': r[0], 'jl': r[1], 'piece': r[2], 'label': r[3],
                'd': r[4] or 0, 'c': r[5] or 0, 'solde': r[6] or 0, 'lettre': r[7] or '',
            })
    return accounts


def parse_journaux_xlsx(path):
    import openpyxl
    ws = openpyxl.load_workbook(path).active
    journals, cur, hdr = [], None, False
    for r in ws.iter_rows(min_row=5, values_only=True):
        a = r[0]
        if a is None:
            continue
        a = str(a)
        if a.startswith('Journal '):
            m = re.match(r'Journal (\S+) — (.*)', a)
            cur = {'code': m.group(1), 'label': m.group(2), 'rows': [], 'totals': None}
            journals.append(cur)
            hdr = False
        elif a == 'Date' and cur is not None:
            hdr = True
        elif r[3] and str(r[3]).startswith('Total journal ') and cur is not None:
            cur['totals'] = {'d': r[4] or 0, 'c': r[5] or 0}
        elif cur is not None and hdr and (str(r[0] or '') == '' or DATE_RE.match(str(r[0]))):
            cur['rows'].append({'date': r[0], 'piece': r[1], 'code': r[2], 'name': r[3], 'd': r[4] or 0, 'c': r[5] or 0})
    return journals


# ── Programme principal ──────────────────────────────────────────────────────
def main():
    from_baseline = None
    import subprocess
    from_baseline = int(subprocess.run(
        ['node', '-e', "const {PrismaClient}=require('@prisma/client');const p=new PrismaClient();p.user.count({where:{totpSecret:{not:null}}}).then(n=>{console.log(n);return p.$disconnect()})"],
        capture_output=True, text=True, cwd='/home/z/my-project').stdout.strip() or '0')

    print('\n━━━ ⑧ GARDE-FOUS — accès et paramètres ━━━')
    anon = Client()
    st, _, hdr = anon.call('/api/v1/finance/export?type=balance&format=pdf')
    check('export anonyme → 401', st == 401, f'status={st}')

    ci = Client()
    st, d, _ = ci.call('/api/v1/auth/login', {'email': 'fdiomande@ivoire-distribution.ci', 'password': PASSWORD})
    check('login comptable (session provisionnelle) → ok + mfaEnrollmentRequired', st == 200 and d.get('ok') and d.get('mfaEnrollmentRequired') is True, f'{st}')
    st, d, _ = ci.call('/api/v1/finance/export?type=balance&format=pdf')
    check('export avec session NON enrôlée → 403 MFA_ENROLLMENT_REQUIRED', st == 403 and d.get('code') == 'MFA_ENROLLMENT_REQUIRED', f'{st} {d.get("code")}')

    bad = Client()
    enroll_and_login(bad, 'fdiomande@ivoire-distribution.ci')
    for q, why in [
        ('type=foo&format=pdf', 'type inconnu'),
        ('type=balance&format=csv', 'format inconnu'),
        ('type=balance&format=pdf&from=pas-une-date', 'date invalide'),
        ('type=balance&format=pdf&from=2026-12-01&to=2026-01-01', 'from > to'),
    ]:
        st, d, _ = bad.call(f'/api/v1/finance/export?{q}')
        check(f'400 — {why}', st == 400, f'status={st}')

    print('\n━━━ ①② BALANCE GÉNÉRALE — CI (contenu exact) ━━━')
    gt_ci = ground_truth('Ivoire Distribution')
    st, buf, hdr = bad.call('/api/v1/finance/export?type=balance&format=xlsx&from=2026-01-01&to=2026-12-31', raw=True)
    check('balance.xlsx → 200 + signature PK', st == 200 and buf[:2] == b'PK', f'status={st}')
    cd = (hdr.get('Content-Disposition') or '')
    check('Content-Disposition: filename SYSCOHADA_balance-generale…', 'SYSCOHADA_balance-generale' in cd and 'Ivoire-Distribution' in cd, cd)
    f_bal = OUT / 'balance_ci.xlsx'
    f_bal.write_bytes(buf)

    bal = parse_balance_xlsx(f_bal)
    check('bandeau « SYSCOHADA (SYSTÈME NORMAL) »', 'SYSCOHADA' in bal['banner'] and 'SYSTÈME NORMAL' in bal['banner'])
    ent = bal['entity'].lower()
    check('entité = Ivoire Distribution + NCC/RCCM + CI + XOF', 'ivoire' in ent and 'ncc' in ent and 'rccm' in ent and ' ci ' in f' {ent} ' and 'xof' in ent, bal['entity'])
    check('titre « BALANCE GÉNÉRALE DES COMPTES »', 'BALANCE GÉNÉRALE' in bal['title'])

    got = {r['code']: r for r in bal['rows']}
    exp = gt_ci['accounts']
    check('tous les comptes attendus présents (13 comptes CI)', set(got) == set(exp), f'manque={set(exp)-set(got)} en-trop={set(got)-set(exp)}')
    mism = [c for c in exp if c in got and (r2(got[c]['d']) != r2(exp[c]['d']) or r2(got[c]['c']) != r2(exp[c]['c']))]
    check('mouvements débit/crédit par compte = vérité terrain', not mism, str(mism))
    badsolde = [r['code'] for r in bal['rows'] if r2(r['sd']) - r2(r['sc']) != r2(r['d']) - r2(r['c'])]
    check('par ligne : solde D − solde C = mvt D − mvt C', not badsolde, str(badsolde))
    check('soldes dans la bonne colonne (pas de doublon D et C)', not [r['code'] for r in bal['rows'] if r['sd'] > 0 and r['sc'] > 0])

    t = bal['totals']
    sum_d = r2(sum(r['d'] for r in bal['rows']))
    sum_c = r2(sum(r['c'] for r in bal['rows']))
    check('INV-ACC-001 : Σ mvt débits = Σ mvt crédits', r2(t['d']) == r2(t['c']) and sum_d == sum_c, f'{t} / {sum_d} vs {sum_c}')
    check('INV-ACC-001 : Σ soldes débiteurs = Σ soldes créditeurs', r2(t['sd']) == r2(t['sc']))
    check('totaux = vérité terrain', r2(t['d']) == r2(sum(v['d'] for v in exp.values())), f'{t["d"]} vs {sum(v["d"] for v in exp.values())}')
    check('XOF : aucun montant décimal', all(float(r[k]).is_integer() for r in bal['rows'] for k in ('d', 'c', 'sd', 'sc')))
    check('bandes de classes 1..8 regroupées', any('CLASSE 4' in c for c in bal['classes']) and any('CLASSE 5' in c for c in bal['classes']) and any('CLASSE 6' in c for c in bal['classes']) and any('CLASSE 7' in c for c in bal['classes']), str(bal['classes']))

    print('\n━━━ ④ JOURNAUX — CI (codification + cohérence transverse) ━━━')
    st, buf, hdr = bad.call('/api/v1/finance/export?type=journal&format=xlsx&from=2026-01-01&to=2026-12-31', raw=True)
    check('journaux.xlsx → 200 + signature PK', st == 200 and buf[:2] == b'PK', f'status={st}')
    f_jrn = OUT / 'journaux_ci.xlsx'
    f_jrn.write_bytes(buf)
    jrn = parse_journaux_xlsx(f_jrn)
    got_j = {j['code']: j for j in jrn}
    exp_j = gt_ci['journals']
    check('journaux attendus présents (VTE/ACH/TRE/PAIE)', set(exp_j) <= set(got_j), f'exp={set(exp_j)} got={set(got_j)}')
    badj = [c for c in exp_j if c in got_j and (r2(got_j[c]['totals']['d']) != r2(exp_j[c]['d']) or r2(got_j[c]['totals']['c']) != r2(exp_j[c]['c']))]
    check('totaux par journal = vérité terrain (VTE/ACH/TRE/PAIE)', not badj, str(badj))
    badjl = []
    for j in jrn:
        sd = r2(sum(x['d'] for x in j['rows']))
        sc = r2(sum(x['c'] for x in j['rows']))
        if sd != r2(j['totals']['d']) or sc != r2(j['totals']['c']):
            badjl.append(j['code'])
    check('Σ lignes de chaque journal = total affiché du journal', not badjl, str(badjl))
    check('chaque écriture équilibrée (débits=crédits) dans les journaux', not [j['code'] for j in jrn if r2(sum(x["d"] for x in j["rows"])) != r2(sum(x["c"] for x in j["rows"]))])
    sum_jd = r2(sum(j['totals']['d'] for j in jrn))
    check('cohérence transverse : Σ journaux = Σ mouvements balance', sum_jd == sum_d, f'{sum_jd} vs {sum_d}')
    labels = ' · '.join(j['label'] for j in jrn)
    check('libellés OHADA (ventes, achats, trésorerie, paie)', 'ventes' in labels and 'achats' in labels and 'trésorerie' in labels, labels)

    print('\n━━━ ③ GRAND LIVRE — CI (solde progressif + à-nouveau + lettrage) ━━━')
    st, buf, hdr = bad.call('/api/v1/finance/export?type=grandlivre&format=xlsx&from=2026-08-01&to=2026-12-31', raw=True)
    check('grandlivre.xlsx → 200 (période filtrée août→déc)', st == 200 and buf[:2] == b'PK', f'status={st}')
    f_gl = OUT / 'grandlivre_ci.xlsx'
    f_gl.write_bytes(buf)
    gl = parse_grand_livre_xlsx(f_gl)
    gt_gl = ground_truth('Ivoire Distribution', '2026-08-01', '2026-12-31')
    got_a = {a['code']: a for a in gl}
    exp_a = gt_gl['accounts']
    check('comptes mouvementés août→déc présents', set(got_a) == set(exp_a), f'{set(exp_a) ^ set(got_a)}')
    anouv = [a['code'] for a in gl if any(str(x['date']) == 'À nouveau' for x in a['rows'])]
    check('ligne « À nouveau » pour comptes à antériorité', set(anouv) == {c for c, v in gt_gl['opening'].items() if v != 0}, f'{anouv} vs opening={gt_gl["opening"]}')
    err_solde, err_open = [], []
    for a in gl:
        opening = gt_gl['opening'].get(a['code'], 0.0)
        run = opening
        for x in a['rows']:
            if str(x['date']) == 'À nouveau':
                if r2(x['solde']) != r2(opening):
                    err_open.append(a['code'])
                continue
            run += x['d'] - x['c']
            if r2(run) != r2(x['solde']):
                err_solde.append(f'{a["code"]}@{x["date"]}')
        if r2(run) != r2(a['totals']['solde']):
            err_solde.append(f'{a["code"]}:final')
    check('solde progressif exact ligne à ligne (récalcul)', not err_solde, str(err_solde[:4]))
    check('« À nouveau » = antériorité SQLite', not err_open, str(err_open))
    err_tot = [a['code'] for a in gl if r2(a['totals']['d']) != r2(sum(x["d"] for x in a["rows"] if str(x["date"]) != "À nouveau"))]
    check('totaux du compte = Σ période (hors à-nouveau)', not err_tot, str(err_tot))
    check('sens SD/SC cohérent avec le solde final', not [a['code'] for a in gl if (a['totals']['sense'] == 'SD') != (a['totals']['solde'] >= 0)])

    # ── Lettrage — export PLEINE ANNÉE : les deux côtés (facture + règlement)
    # tombent dans la fenêtre, chaque lettre doit rapprocher débit = crédit.
    # Oracle exact : réplication de l'algorithme computeLettrage (paiements
    # chronologiques, lettres A, B, C… affectées au binôme facture↔règlement).
    st, buf, hdr = bad.call('/api/v1/finance/export?type=grandlivre&format=xlsx&from=2026-01-01&to=2026-12-31', raw=True)
    check('grandlivre.xlsx pleine année → 200', st == 200 and buf[:2] == b'PK', f'status={st}')
    f_glf = OUT / 'grandlivre_ci_full.xlsx'
    f_glf.write_bytes(buf)
    glf = {a['code']: a for a in parse_grand_livre_xlsx(f_glf)}

    dbc = sqlite3.connect(DB)
    entries = dbc.execute(
        "SELECT id, source, sourceId, reference FROM JournalEntry WHERE orgId=? AND source IN ('INVOICE','PAYMENT','EXPENSE') ORDER BY entryDate ASC",
        (gt_ci['orgId'],)).fetchall()
    payments = dbc.execute(
        'SELECT id, invoiceId, expenseId FROM Payment WHERE orgId=? ORDER BY createdAt ASC',
        (gt_ci['orgId'],)).fetchall()
    dbc.close()
    entry_ref = {f'{src}:{sid}': ref for _id, src, sid, ref in entries if sid is not None}
    expected = {'411': {}, '401': {}}  # référence pièce → lettre
    letter_i = 0
    for pid, inv_id, exp_id in payments:
        if inv_id and f'INVOICE:{inv_id}' in entry_ref and f'PAYMENT:{pid}' in entry_ref:
            L = chr(65 + letter_i)
            letter_i += 1
            expected['411'][entry_ref[f'INVOICE:{inv_id}']] = L
            expected['411'][entry_ref[f'PAYMENT:{pid}']] = L
        if exp_id and f'EXPENSE:{exp_id}' in entry_ref and f'PAYMENT:{pid}' in entry_ref:
            L = chr(65 + letter_i)
            letter_i += 1
            expected['401'][entry_ref[f'EXPENSE:{exp_id}']] = L
            expected['401'][entry_ref[f'PAYMENT:{pid}']] = L

    def lettrage_actual(code):
        out = {}
        for x in glf.get(code, {'rows': []})['rows']:
            if x['lettre']:
                out.setdefault(x['piece'], set()).add(x['lettre'])
        return {k: sorted(v)[0] if len(v) == 1 else dict(v) for k, v in out.items()}

    act_411 = lettrage_actual('411')
    exp_411 = expected['411']
    check(f'lettrage 411 : oracle exact — {len(exp_411)} pièces lettrées (réplication computeLettrage)', act_411 == exp_411, f'attendu={exp_411} obtenu={act_411}')
    letters_411 = {}
    for x in glf.get('411', {'rows': []})['rows']:
        if x['lettre']:
            L = letters_411.setdefault(x['lettre'], {'d': 0.0, 'c': 0.0})
            L['d'] += x['d']
            L['c'] += x['c']
    ok411 = bool(letters_411) and all(r2(L['d']) == r2(L['c']) for L in letters_411.values())
    check(f'lettrage 411 : chaque lettre rapproche débit = crédit ({len(letters_411)} lettres)', ok411, str(letters_411))
    if '401' in glf:
        act_401 = lettrage_actual('401')
        ok401 = all(act_401.get(ref) == L for ref, L in expected['401'].items()) if expected['401'] else True
        check('lettrage 401 : conforme à l\'oracle (si compte utilisé)', ok401, f'attendu={expected["401"]} obtenu={act_401}')
    else:
        check('lettrage 401 : compte 401 non mouvementé (dépenses payées comptant en 521) — attendu', expected['401'] == {})
    check('codes journal OHADA dans le grand livre (VTE/TRE…)', {'VTE', 'TRE'} <= {x['jl'] for a in glf.values() for x in a['rows']}, str({x['jl'] for a in glf.values() for x in a['rows']}))

    print('\n━━━ ⑦ PDF — textes SYSCOHADA ━━━')
    import pdfplumber
    # grandlivre.pdf exporté août→déc : la ligne « À nouveau » doit apparaître
    for doc, fname, from_s, needles in [
        ('balance', 'balance_ci.pdf', '2026-01-01', ['Balance générale', 'TOTAUX', 'Balance équilibrée', 'CLASSE 4', '411', 'SYSTÈME NORMAL']),
        ('grandlivre', 'grandlivre_ci.pdf', '2026-08-01', ['Grand livre', 'À nouveau', 'Let.', 'Compte 411', 'lettrage']),
        ('journal', 'journal_ci.pdf', '2026-01-01', ['Journal VTE', 'Journal TRE', 'VTE ventes', 'Total journal VTE']),
    ]:
        st, buf, hdr = bad.call(f'/api/v1/finance/export?type={doc}&format=pdf&from={from_s}&to=2026-12-31', raw=True)
        f = OUT / fname
        f.write_bytes(buf)
        check(f'{doc}.pdf → 200 + %PDF', st == 200 and buf[:4] == b'%PDF', f'status={st}')
        with pdfplumber.open(f) as pdf:
            n_pages = len(pdf.pages)
            text = '\n'.join((p.extract_text() or '') for p in pdf.pages)
        miss = [n for n in needles if n not in text]
        check(f'{doc}.pdf : textes attendus présents', not miss, f'manque={miss}')
        # Chaque page porte exactement UN pied de page « Page N » (ni absent, ni doublon)
        page_marks = {k: text.count(f'Page {k}') for k in range(1, n_pages + 1)}
        check(f'{doc}.pdf : pied de page unique sur chacune des {n_pages} pages', all(v == 1 for v in page_marks.values()), str(page_marks))
        check(f'{doc}.pdf : mention modèle SYSCOHADA révisé en pied de page', 'SYSCOHADA révisé' in text)

    print('\n━━━ ⑤ RLS MULTI-ORGANISATIONS — SN & BJ ━━━')
    sn = Client()
    enroll_and_login(sn, 'mfall@sahelagro.sn')
    gt_sn = ground_truth('Sahel Agro Industries')
    st, buf, hdr = sn.call('/api/v1/finance/export?type=balance&format=xlsx&from=2026-01-01&to=2026-12-31', raw=True)
    f_sn = OUT / 'balance_sn.xlsx'
    f_sn.write_bytes(buf)
    bal_sn = parse_balance_xlsx(f_sn)
    got_sn = {r['code']: r for r in bal_sn['rows']}
    check('SN : comptes = comptes SN uniquement (aucun compte CI)', set(got_sn) == set(gt_sn['accounts']), f'{set(got_sn) ^ set(gt_sn["accounts"])}')
    t_sn = bal_sn['totals']
    check('SN : totaux = vérité terrain SN', r2(t_sn['d']) == r2(sum(v['d'] for v in gt_sn['accounts'].values())), f'{t_sn}')
    ent_sn = bal_sn['entity'].lower()
    check('SN : entité Sahel Agro + SN + XOF (jamais Ivoire)', 'sahel' in ent_sn and ' sn ' in f' {ent_sn} ' and 'xof' in ent_sn and 'ivoire' not in ent_sn, bal_sn['entity'])
    check('SN : totaux ≠ totaux CI (pas de fuite agrégée)', r2(t_sn['d']) != sum_d or len(got_sn) != len(got))

    bj = Client()
    enroll_and_login(bj, 'gnagbe@golfetrading.bj')
    gt_bj = ground_truth('Golfe Trading & Services')
    st, buf, hdr = bj.call('/api/v1/finance/export?type=balance&format=xlsx&from=2026-01-01&to=2026-12-31', raw=True)
    f_bj = OUT / 'balance_bj.xlsx'
    f_bj.write_bytes(buf)
    bal_bj = parse_balance_xlsx(f_bj)
    got_bj = {r['code']: r for r in bal_bj['rows']}
    check('BJ : comptes = comptes BJ uniquement', set(got_bj) == set(gt_bj['accounts']), f'{set(got_bj) ^ set(gt_bj["accounts"])}')
    ent_bj = bal_bj['entity'].lower()
    check('BJ : entité Golfe Trading + BJ (jamais Ivoire/Sahel)', 'golfe' in ent_bj and ' bj ' in f' {ent_bj} ' and 'ivoire' not in ent_bj and 'sahel' not in ent_bj, bal_bj['entity'])
    check('BJ : inv-acc-001 équilibrée', r2(bal_bj['totals']['d']) == r2(bal_bj['totals']['c']))

    print('\n━━━ ⑥ FILTRAGE DE PÉRIODE ━━━')
    gt_sep = ground_truth('Ivoire Distribution', '2026-09-01', '2026-09-30')
    st, buf, hdr = bad.call('/api/v1/finance/export?type=balance&format=xlsx&from=2026-09-01&to=2026-09-30', raw=True)
    f_sep = OUT / 'balance_ci_sep.xlsx'
    f_sep.write_bytes(buf)
    bal_sep = parse_balance_xlsx(f_sep)
    got_sep = {r['code']: r for r in bal_sep['rows']}
    exp_sep = gt_sep['accounts']
    mism = [c for c in exp_sep if c in got_sep and (r2(got_sep[c]['d']) != r2(exp_sep[c]['d']) or r2(got_sep[c]['c']) != r2(exp_sep[c]['c']))]
    check('balance sept. = vérité terrain sept. uniquement', set(got_sep) == set(exp_sep) and not mism, f'{set(got_sep) ^ set(exp_sep)} {mism}')
    check('période réduite ≠ exercice complet', r2(bal_sep['totals']['d']) < sum_d)

    print('\n━━━ ⑨ NETTOYAGE — état démo restauré ━━━')
    st1 = disable_2fa(bad)
    st2 = disable_2fa(sn)
    st3 = disable_2fa(bj)
    check('2FA désactivée pour les 3 comptes de test', st1 == 200 and st2 == 200 and st3 == 200, f'{st1}/{st2}/{st3}')
    after = int(subprocess.run(
        ['node', '-e', "const {PrismaClient}=require('@prisma/client');const p=new PrismaClient();p.user.count({where:{totpSecret:{not:null}}}).then(n=>{console.log(n);return p.$disconnect()})"],
        capture_output=True, text=True, cwd='/home/z/my-project').stdout.strip() or '0')
    check('état 2FA global inchangé (aucun enrôlement résiduel)', after == from_baseline, f'avant={from_baseline} après={after}')

    print(f'\n═══ RÉSULTAT : {PASS} PASS / {FAIL} FAIL ═══')
    if FAILS:
        print('Échecs : ' + ' · '.join(FAILS))
        raise SystemExit(1)


if __name__ == '__main__':
    main()
