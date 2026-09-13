#!/bin/bash
# ═══ Tests API YAHRIA BUSINESS OS — RBAC + RLS + INV-011 + Evidence signée ═══
BASE=http://localhost:3000
J() { python3 -c "import json,sys; d=json.load(sys.stdin); $1"; }

echo "════ 1. LOGIN OWNER (CI) ════"
curl -s -c /tmp/c_owner.txt -X POST $BASE/api/v1/auth/login -H 'Content-Type: application/json' \
  -d '{"email":"akone@ivoire-distribution.ci","password":"Demo2026!"}' | J "print(d)"
echo ""
echo "════ 2. DASHBOARD OWNER → doit montrer IVOIRE DISTRIBUTION ════"
curl -s -b /tmp/c_owner.txt $BASE/api/v1/dashboard | J "print('org:', d['org']['name'], '| tréso:', d['kpis']['treasury'], '| approbations:', d['kpis']['pendingApprovals'])"
echo ""
echo "════ 3. SANS SESSION → 401 attendu ════"
curl -s -o /dev/null -w "dashboard sans cookie: HTTP %{http_code}\n" $BASE/api/v1/dashboard
echo ""
echo "════ 4. GOVERNANCE : RLS + chaîne Evidence + INV-011 ════"
curl -s -b /tmp/c_owner.txt $BASE/api/v1/governance | J "
print('RLS:', d['rls']['mode'], '|', d['rls']['tenantCount'], 'tenants /', d['rls']['orgCount'], 'orgs')
print('Chaîne Evidence:', d['evidenceChain']['valid'], '/', d['evidenceChain']['total'], 'valides — intacte:', d['evidenceChain']['chainIntact'], '— algo:', d['evidenceChain']['algo'])
for i in d['invariants']:
    if i['id'] in ('INV-001','INV-002','INV-005','INV-008','INV-011'):
        r = i.get('checkResult') or {}
        print(' ', i['id'], i['name'], '→', r.get('status'), '—', r.get('detail','')[:100])
e = d['evidence'][0]
print('Evidence[0]:', e['ref'], '| seq', e['seq'], '| sig', e['signature'][:24]+'…')
"
echo ""
echo "════ 5. TEST PACK ISOLATION (rail BJ depuis org CI → DENY attendu) ════"
curl -s -b /tmp/c_owner.txt -X POST $BASE/api/v1/governance -H 'Content-Type: application/json' -d '{"action":"TEST_PACK_ISOLATION"}' | J "
print('Org:', d['orgCountry'], 'vs pack étranger:', d['foreignPack'])
for r in d['results']: print('  ', r['rail'], '→', 'ALLOW' if r['allowed'] else 'DENY')
"
echo ""
echo "════ 6. RBAC : ACCOUNTANT crée un paiement (OK) mais N'APPROUVE PAS (403 attendu) ════"
curl -s -c /tmp/c_cpt.txt -X POST $BASE/api/v1/auth/login -H 'Content-Type: application/json' \
  -d '{"email":"fdiomande@ivoire-distribution.ci","password":"Demo2026!"}' > /dev/null
curl -s -b /tmp/c_cpt.txt -X POST $BASE/api/v1/governance -H 'Content-Type: application/json' \
  -d '{"action":"TOGGLE_POLICY","code":"PAY-002"}' -o /tmp/r1.json -w "toggle policy par comptable: HTTP %{http_code} (403 attendu)\n"
cat /tmp/r1.json | J "print('  →', d.get('error','?')[:90])"
echo ""
echo "════ 7. AUDITOR : lecture seule partout, écriture interdite ════"
curl -s -c /tmp/c_aud.txt -X POST $BASE/api/v1/auth/login -H 'Content-Type: application/json' \
  -d '{"email":"auditeur@yahria.africa","password":"Demo2026!"}' > /dev/null
curl -s -b /tmp/c_aud.txt $BASE/api/v1/governance | J "print('governance GET auditor: OK —', d['stats']['auditCount'], 'entrées audit')" 
curl -s -b /tmp/c_aud.txt -X POST $BASE/api/v1/finance/expenses -H 'Content-Type: application/json' \
  -d '{"amount":5000,"description":"test"}' -o /tmp/r2.json -w "créer dépense par auditeur: HTTP %{http_code} (403 attendu)\n"
echo ""
echo "════ 8. RLS CROSS-TENANT : OWNER CI tente un paiement avec compte SGCI mais réservé ════"
BJ_ACC=$(curl -s -b /tmp/c_bj.txt $BASE/api/v1/money/payments 2>/dev/null | J "print(d['accounts'][0]['id'])" 2>/dev/null)
echo "(testBJ préparé après login BJ)"
curl -s -c /tmp/c_bj.txt -X POST $BASE/api/v1/auth/login -H 'Content-Type: application/json' \
  -d '{"email":"gnagbe@golfetrading.bj","password":"Demo2026!"}' > /dev/null
BJ_ACC=$(curl -s -b /tmp/c_bj.txt $BASE/api/v1/money/payments | J "print(d['accounts'][0]['id'])")
BJ_INV=$(curl -s -b /tmp/c_bj.txt $BASE/api/v1/finance/invoices | J "print(d['items'][0]['id'])")
echo "════ 9. OWNER BJ : dashboard = SAHEL? NON → GOLFE TRADING (isolation) ════"
curl -s -b /tmp/c_bj.txt $BASE/api/v1/dashboard | J "print('org BJ:', d['org']['name'], '| tréso:', d['kpis']['treasury'])"
echo ""
echo "════ 10. INV-011 RUNTIME : OWNER BJ paie via ORANGE_MONEY (rail CI) → REJECTED attendu ════"
curl -s -b /tmp/c_bj.txt -X POST $BASE/api/v1/money/payments -H 'Content-Type: application/json' \
  -d "{\"type\":\"DISBURSEMENT\",\"amount\":50000,\"counterpartyName\":\"Fournisseur Abidjan Test\",\"counterpartyType\":\"SUPPLIER\",\"method\":\"MOBILE_MONEY\",\"provider\":\"ORANGE_MONEY\",\"sourceAccountId\":\"$BJ_ACC\",\"idempotencyKey\":\"test-inv011-$(date +%s)\"}" | J "
p = d['payment']
print('statut:', p['status'], '| décision:', p['policyDecision'])
print('raison:', (p['policyReason'] or '')[:110])
"
echo ""
echo "════ 11. RLS : OWNER BJ tente de payer avec un compte CI (id volé) → RLS_VIOLATION/404 ════"
CI_ACC=$(curl -s -b /tmp/c_owner.txt $BASE/api/v1/money/payments | J "print(d['accounts'][0]['id'])")
curl -s -b /tmp/c_bj.txt -X POST $BASE/api/v1/money/payments -H 'Content-Type: application/json' \
  -d "{\"type\":\"DISBURSEMENT\",\"amount\":50000,\"counterpartyName\":\"Test RLS\",\"counterpartyType\":\"SUPPLIER\",\"method\":\"BANK_TRANSFER\",\"provider\":\"SBCE\",\"sourceAccountId\":\"$CI_ACC\",\"idempotencyKey\":\"test-rls-$(date +%s)\"}" -o /tmp/r3.json -w "paiement avec compte CI depuis session BJ: HTTP %{http_code} (400/403 attendu)\n"
cat /tmp/r3.json | J "print('  →', d.get('error','?')[:110])"
echo ""
echo "════ 12. Vérification finale de la chaîne Evidence BJ ════"
curl -s -b /tmp/c_bj.txt -X POST $BASE/api/v1/governance -H 'Content-Type: application/json' -d '{"action":"VERIFY_EVIDENCE"}' | J "
c = d['chain']
print('Chaîne BJ:', c['valid'], '/', c['total'], 'valides — intacte:', c['chainIntact'])
"
curl -s -b /tmp/c_owner.txt -X POST $BASE/api/v1/governance -H 'Content-Type: application/json' -d '{"action":"VERIFY_EVIDENCE"}' | J "
c = d['chain']
print('Chaîne CI:', c['valid'], '/', c['total'], 'valides — intacte:', c['chainIntact'])
"
echo ""
echo "════ 13. USERS : comptable liste les utilisateurs → 403 attendu ════"
curl -s -b /tmp/c_cpt.txt $BASE/api/v1/users -o /dev/null -w "users GET par comptable: HTTP %{http_code} (403 attendu)\n"
curl -s -b /tmp/c_owner.txt $BASE/api/v1/users | J "print('users GET par owner:', len(d['users']), 'comptes — tenant CI uniquement')"
echo ""
echo "════ 14. LOGOUT puis réutilisation du cookie → 401 ════"
curl -s -b /tmp/c_aud.txt -X POST $BASE/api/v1/auth/logout > /dev/null
curl -s -b /tmp/c_aud.txt -o /dev/null -w "dashboard après logout: HTTP %{http_code} (401 attendu)\n"
echo ""
echo "════ FIN DES TESTS API ════"
