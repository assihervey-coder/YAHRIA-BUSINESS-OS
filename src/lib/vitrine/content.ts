// YAHRIA BUSINESS OS V1 — Contenu éditorial du site vitrine (10 pages)
// Données statiques servies par les pages publiques — cohérentes avec la
// plateforme réelle (13 extensions sectorielles, Country Packs CI/SN/BJ,
// invariants PAR CONSTRUCTION, baseline 1.2.0).

export interface VitrinePage { href: string; label: string }

/** Les 10 pages du site vitrine, dans l'ordre du menu. */
export const VITRINE_PAGES: VitrinePage[] = [
  { href: '/', label: 'Accueil' },
  { href: '/solution', label: 'Solution' },
  { href: '/fonctionnalites', label: 'Fonctionnalités' },
  { href: '/secteurs', label: 'Secteurs' },
  { href: '/pays', label: 'Pays' },
  { href: '/securite', label: 'Sécurité' },
  { href: '/tarifs', label: 'Tarifs' },
  { href: '/annonces', label: 'Annonces' },
  { href: '/a-propos', label: 'À propos' },
  { href: '/contacts', label: 'Contacts' },
]

// ── Annonces ─────────────────────────────────────────────────────────────────
export interface Annonce {
  slug: string
  date: string // ISO
  categorie: 'PRODUIT' | 'PAYS' | 'SECURITE' | 'ENTREPRISE' | 'EVENEMENT'
  titre: string
  extrait: string
  contenu: string[]
}

export const ANNONCES: Annonce[] = [
  {
    slug: 'webinaire-gouvernance',
    date: '2026-09-15',
    categorie: 'EVENEMENT',
    titre: 'Webinaire — « Gouverner l\u2019IA de décision : invariants et Evidence »',
    extrait:
      'Le 15 octobre 2026 à 10h GMT : démonstration en direct des sondes d\u2019invariants, de la chaîne d\u2019Evidence signée et du test d\u2019isolation pays.',
    contenu: [
      'Au programme : pourquoi les garanties « par configuration » ne suffisent pas, comment des invariants PAR CONSTRUCTION ferment les angles morts, et comment la chaîne d\u2019Evidence HMAC-SHA256 rend chaque décision auditable.',
      'La session inclut une démonstration en direct : exécution des six sondes, tentative de falsification d\u2019une Evidence, paiement transfrontalier rejeté en DENY.',
      'Inscription gratuite depuis la page Contacts — places limitées, replay envoyé aux inscrits.',
    ],
  },
  {
    slug: 'baseline-1-2-0',
    date: '2026-09-08',
    categorie: 'PRODUIT',
    titre: 'Baseline 1.2.0 — mur 2FA structurel et verrouillage par vagues',
    extrait:
      'La double authentification TOTP devient obligatoire pour l\u2019ensemble des rôles, déployée par vagues : direction, administration & comptabilité, opérations & audit.',
    contenu: [
      'La baseline 1.2.0 généralise le verrou 2FA PAR CONSTRUCTION : un rôle relevant d\u2019une vague active ne peut accéder à aucune route métier tant que l\u2019enrôlement TOTP n\u2019est pas terminé. Le mur est structurel — seule une whitelist explicite de chemins d\u2019authentification reste ouverte.',
      'L\u2019enrôlement reste simple : QR code, 8 codes de récupération à usage unique, assistance au code courant en mode démonstration (YAHRIA_DEMO_2FA=assist) et verrouillage progressif configurable par la variable YAHRIA_MFA_WAVE.',
      'Cette version s\u2019appuie sur les sessions rotatives livrées en 1.1.0 : TTL glissant, plafond absolu, détection de rejeu et révocation familiale. Ensemble, ces deux couches ferment les vecteurs d\u2019attaque les plus courants sur les sessions web.',
    ],
  },
  {
    slug: 'country-pack-benin',
    date: '2026-08-21',
    categorie: 'PAYS',
    titre: 'Country Pack Bénin — rails nationaux actifs',
    extrait:
      'Le Bénin rejoint la Côte d\u2019Ivoire et le Sénégal : isolation des rails de paiement nationaux, INV-011 appliqué en runtime, tests multi-tenants étendus.',
    contenu: [
      'Le troisième Country Pack isole les rails autorisés par organisation : une entité béninoise ne peut exécuter que les rails de son marché national. Toute tentative transfrontalière est rejetée en DENY avec Evidence et trace d\u2019audit.',
      'Le pack embarque les opérateurs Mobile Money locaux et les règles de conformité applicables. L\u2019isolation est prouvée en runtime par la sonde INV-011 et vérifiable depuis l\u2019onglet Gouvernance de la plateforme.',
      'Les tenants Sahel Agro (Sénégal) et Golfe Trading (Bénin) démontrent le cloisonnement complet : données, rails, utilisateurs et journal d\u2019audit restent bornés à leur périmètre national.',
    ],
  },
  {
    slug: 'recrutement-2026',
    date: '2026-08-05',
    categorie: 'ENTREPRISE',
    titre: 'YAHRIA recrute — ingénieurs plateforme et experts comptables OHADA',
    extrait:
      'Pour accélérer le déploiement des Country Packs, nous ouvrons quatre postes : deux ingénieurs plateforme (Next.js/Prisma), un expert comptable OHADA, un responsable conformité.',
    contenu: [
      'Ingénieurs plateforme : conception des extensions sectorielles, durcissement des invariants, industrialisation des tests multi-tenants. Stack : Next.js 16, TypeScript, Prisma, PostgreSQL.',
      'Expert comptable OHADA : cadrage des états SYSCOHADA, lettrage, réconciliation, logique de clôture. Poste transversal entre le produit et la conformité.',
      'Candidatures via la page Contacts (sujet « Carrière ») — postes basés à Abidjan, télétravail partiel possible.',
    ],
  },
  {
    slug: 'exports-syscohada',
    date: '2026-07-30',
    categorie: 'PRODUIT',
    titre: 'Exports SYSCOHADA — balance, grand livre et journaux en PDF/Excel',
    extrait:
      'Générez vos états financiers conformes OHADA en un clic : balance générale par classes 1-8, grand livre avec lettrage réel, journaux VTE/ACH/TRE/PAIE/OD.',
    contenu: [
      'Le module Finance produit désormais les trois états de base du référentiel SYSCOHADA révisé : balance générale, grand livre et journaux. Chaque document embarque l\u2019en-tête entité (NCC, RCCM), la pagination et les totaux.',
      'Le lettrage est réel : il repose sur les rapprochements factures-paiements de la plateforme (Payment.invoiceId / expenseId), pas sur une convention de présentation. Les codes journaux sont configurables par entité.',
      'Exports disponibles en PDF (pdf-lib) et Excel (exceljs), avec sanitisation des caractères et bornes de colonnes vérifiées par une suite de tests dédiée.',
    ],
  },
  {
    slug: 'sessions-rotatives',
    date: '2026-07-14',
    categorie: 'SECURITE',
    titre: 'Sessions rotatives — détection de rejeu et révocation familiale',
    extrait:
      'Chaque rotation de token piège l\u2019ancien : tout rejeu révoque immédiatement la famille entière. TTL glissant 7 jours, plafond absolu 30 jours.',
    contenu: [
      'La couche session introduit la rotation transparente : à intervalle throttlé, un nouveau token est émis et l\u2019ancien devient un piège à rejeu. La réutilisation d\u2019un token rotaté déclenche la révocation de toute la famille et l\u2019événement d\u2019audit SESSION_REUSE_DETECTED.',
      'L\u2019utilisateur garde la maîtrise : liste des sessions actives par appareil, révocation unitaire ou globale, rotation manuelle. Une session morte (expiration, révocation, rejeu) redirige l\u2019interface vers la connexion en moins de 15 secondes.',
      'Le cookie reste httpOnly et inchangé côté client : la rotation est invisible pour l\u2019utilisateur légitime, insurmontable pour un attaquant qui aurait intercepté un ancien token.',
    ],
  },
  {
    slug: 'country-pack-senegal',
    date: '2026-06-25',
    categorie: 'PAYS',
    titre: 'Country Pack Sénégal — deuxième marché national',
    extrait:
      'Après Abidjan, Dakar : rails de paiement sénégalais, devise et conformité locales, isolation INV-011 de bout en bout.',
    contenu: [
      'Le pack Sénégal étend l\u2019architecture multi-pays : chaque organisation opère exclusivement sur les rails de son marché, avec les opérateurs Mobile Money et les règles fiscales locales.',
      'Le tenant de démonstration Sahel Agro illustre le cloisonnement : ses comptes, ses paiements et son audit ne mélangent jamais les données ivoiriennes.',
      'L\u2019isolation est garantie PAR CONSTRUCTION : le rail étranger est refusé au niveau de la couche policy, avant toute écriture en base.',
    ],
  },
  {
    slug: 'invariants-par-construction',
    date: '2026-06-03',
    categorie: 'SECURITE',
    titre: 'Six invariants élevés au statut PAR CONSTRUCTION',
    extrait:
      'Isolation tenant, authorization, immutabilité des événements, isolation pays et secteur, versionnage des contrats : garantis par la structure du code, prouvés en runtime.',
    contenu: [
      'Les six invariants fondateurs — INV-001 (isolation tenant), INV-002 (authorization), INV-007 (immutabilité des événements), INV-011 (isolation pays), INV-012 (isolation sectorielle), INV-013 (versionnage des contrats) — sont désormais garantis par la structure du code, non par des conventions.',
      'Chaque invariant dispose d\u2019une sonde runtime exécutable depuis la plateforme : lecture cross-tenant refusée, scans de frontières d\u2019imports, attaques de falsification d\u2019Evidence rejetées, rails étrangers en DENY.',
      'Le rapport d\u2019audit stratégique V1 recommandait de transformer les promesses architecturales en garanties vérifiables : c\u2019est chose faite, avec preuves exécutables à l\u2019appui.',
    ],
  },
  {
    slug: 'country-pack-cote-ivoire',
    date: '2026-05-12',
    categorie: 'PAYS',
    titre: 'Country Pack Côte d\u2019Ivoire — premier marché national',
    extrait:
      'Le pack ivoirien ouvre l\u2019architecture multi-pays : Orange Money, MTN, Moov et Wave, conformité locale et isolation des rails.',
    contenu: [
      'Premier Country Pack de la plateforme : les entités ivoiriennes opèrent sur les rails Orange Money, MTN MoMo, Moov et Wave, avec vérification sectorielle de chaque paiement.',
      'Le pack définit les rails autorisés par organisation — la couche policy rejette toute opération hors périmètre national, avec Evidence signée et audit.',
      'La structure multi-tenant est en place dès le premier jour : chaque entité dispose de ses propres comptes, rôles, journaux et indicateurs.',
    ],
  },
  {
    slug: 'lancement-v1',
    date: '2026-04-02',
    categorie: 'ENTREPRISE',
    titre: 'Lancement de YAHRIA BUSINESS OS V1',
    extrait:
      'Le système d\u2019exploitation intelligent des entreprises africaines est disponible : données → intelligence → décision → exécution, sous gouvernance.',
    contenu: [
      'YAHRIA BUSINESS OS V1 est né d\u2019un constat simple : les PME africaines pilotent leur croissance avec des tableurs, des carnets et des applications compartimentées. La donnée existe, l\u2019intelligence non.',
      'La V1 embarque le Cockpit décisionnel, le module Money (paiements Mobile Money sous policy), la Finance (engagements, dépenses, TVA), le graphe relationnel, les agents IA sous gouvernance et la Gouvernance (invariants, Evidence, audit).',
      'Six rôles, trois pays, treize secteurs : la plateforme est multi-tenant de bout en bout et respecte les fondamentaux du référentiel OHADA.',
    ],
  },
]

export function latestAnnonces(n: number): Annonce[] {
  return [...ANNONCES].sort((a, b) => b.date.localeCompare(a.date)).slice(0, n)
}

export const CATEGORIE_LABELS: Record<string, string> = {
  PRODUIT: 'Produit',
  PAYS: 'Pays',
  SECURITE: 'Sécurité',
  ENTREPRISE: 'Entreprise',
  EVENEMENT: 'Événement',
}

// ── Modules de la plateforme ─────────────────────────────────────────────────
export interface ModuleInfo {
  id: string
  titre: string
  description: string
  points: string[]
}

export const MODULES: ModuleInfo[] = [
  {
    id: 'cockpit',
    titre: 'Cockpit',
    description:
      'Le tableau de bord décisionnel : trésorerie, créances clients, dettes à régler et TVA nette consolidées en temps réel, avec comptes actifs et alertes.',
    points: ['KPI consolidés multi-comptes', 'Créances en retard identifiées', 'TVA collectée / déductible'],
  },
  {
    id: 'core',
    titre: 'Core',
    description:
      'Le socle métier : clients, fournisseurs, articles, factures et dépenses structurés, prêts pour la facturation électronique et la réconciliation.',
    points: ['Référentiels clients / fournisseurs', 'Factures & dépenses liées', 'Traçabilité complète'],
  },
  {
    id: 'money',
    titre: 'Money',
    description:
      'Encaissements Mobile Money sous policy : Orange Money, MTN, Moov, Wave… Chaque paiement traverse policy, extension sectorielle et Evidence signée.',
    points: ['Rails nationaux isolés (INV-011)', 'Constats sectoriels attachés', 'Décisions ALLOW / REVIEW / DENY'],
  },
  {
    id: 'finance',
    titre: 'Finance',
    description:
      'Engagements, approbations séparées de la saisie comptable, dépenses, TVA et exports SYSCOHADA : balance, grand livre et journaux avec lettrage réel.',
    points: ['Séparation comptable / approbateur', 'Exports SYSCOHADA PDF & Excel', 'Lettrage factures-paiements'],
  },
  {
    id: 'graph',
    titre: 'Graphe',
    description:
      'La cartographie relationnelle de votre entreprise : entités, flux et dépendances reconstruits depuis les données, pour révéler ce que les tableurs cachent.',
    points: ['Reconstruction depuis les données', 'Détection de zones grises', 'Vision réseau des partenaires'],
  },
  {
    id: 'agents',
    titre: 'Agents IA',
    description:
      'Des agents sous gouvernance : permissions par rôle, exécution tracée, Evidence signée pour chaque action. L\u2019IA décide avec vous, jamais à votre place.',
    points: ['Permissions héritées du RBAC', 'Chaque run audité', 'Copilot conversationnel inclus'],
  },
]

// ── Pays (Country Packs) ─────────────────────────────────────────────────────
export interface CountryPack {
  code: string
  drapeau: string
  nom: string
  devise: string
  ville: string
  rails: string[]
  statut: string
  detail: string
}

export const COUNTRY_PACKS: CountryPack[] = [
  {
    code: 'CI',
    drapeau: '\u{1F1E8}\u{1F1EE}',
    nom: 'Côte d\u2019Ivoire',
    devise: 'XOF (FCFA)',
    ville: 'Abidjan — siège',
    rails: ['Orange Money', 'MTN MoMo', 'Moov Money', 'Wave'],
    statut: 'Actif',
    detail:
      'Premier Country Pack : rails Mobile Money nationaux, conformité DGI, tenant de démonstration Ivoire Distribution complet (6 comptes, 6 rôles).',
  },
  {
    code: 'SN',
    drapeau: '\u{1F1F8}\u{1F1F3}',
    nom: 'Sénégal',
    devise: 'XOF (FCFA)',
    ville: 'Dakar',
    rails: ['Orange Money', 'Free Money', 'Wave', 'Expresso'],
    statut: 'Actif',
    detail:
      'Deuxième pack national : isolation INV-011 de bout en bout, tenant Sahel Agro en démonstration, conformité OHADA identique au siège.',
  },
  {
    code: 'BJ',
    drapeau: '\u{1F1E7}\u{1F1EF}',
    nom: 'Bénin',
    devise: 'XOF (FCFA)',
    ville: 'Cotonou',
    rails: ['MTN MoMo', 'Moov Money', 'Celtiis Cash'],
    statut: 'Actif',
    detail:
      'Troisième pack : rails béninois isolés, tenant Golfe Trading avec historique de paiement rejeté (DENY) pour démontrer l\u2019isolation en runtime.',
  },
]

// ── Tarifs ───────────────────────────────────────────────────────────────────
export interface PlanTarif {
  nom: string
  prix: string
  periode: string
  cible: string
  points: string[]
  vedette?: boolean
}

export const PLANS: PlanTarif[] = [
  {
    nom: 'Essentiel',
    prix: '49 000 FCFA',
    periode: '/ mois',
    cible: 'PME en organisation — 1 à 5 utilisateurs',
    points: [
      'Cockpit & Core (clients, factures, dépenses)',
      'Money : 2 rails Mobile Money nationaux',
      'Finance : TVA & engagements',
      'Export SYSCOHADA mensuel',
      '3 rôles (Dirigeant, Comptable, Opérations)',
      'Support email 48 h',
    ],
  },
  {
    nom: 'Business',
    prix: '129 000 FCFA',
    periode: '/ mois',
    cible: 'Entreprises en croissance — jusqu\u2019à 25 utilisateurs',
    vedette: true,
    points: [
      'Tout Essentiel, plus :',
      'Money : tous les rails du Country Pack',
      'Approbations & séparation des pouvoirs',
      'Graphe relationnel & détection d\u2019anomalies',
      'Agents IA sous gouvernance (runs audités)',
      'Exports SYSCOHADA illimités (PDF & Excel)',
      '6 rôles RBAC + 2FA obligatoire',
      'Support prioritaire 8 h',
    ],
  },
  {
    nom: 'Entreprise',
    prix: 'Sur devis',
    periode: '',
    cible: 'Groupes multi-entités & secteurs régulés',
    points: [
      'Tout Business, plus :',
      'Multi-tenants & multi-pays (packs additionnels)',
      'Extensions sectorielles dédiées (13 secteurs)',
      'Chaîne d\u2019Evidence signée & audit externable',
      'SLA 99,9 %, environnements dédiés',
      'Accompagnement & formation des équipes',
      'Intégrations comptable / banque sur mesure',
    ],
  },
]

// ── Fonctionnalités (page dédiée) ────────────────────────────────────────────
export interface FeatureGroup {
  titre: string
  icone: 'gauge' | 'landmark' | 'shield' | 'users' | 'workflow' | 'file'
  items: { nom: string; detail: string }[]
}

export const FEATURE_GROUPS: FeatureGroup[] = [
  {
    titre: 'Pilotage & décision',
    icone: 'gauge',
    items: [
      { nom: 'KPI temps réel', detail: 'Trésorerie, créances, dettes et TVA consolidées, rafraîchies à chaque opération.' },
      { nom: 'Créances en retard', detail: 'Identification immédiate des factures échues et du montant à recouvrer.' },
      { nom: 'Graphe relationnel', detail: 'Cartographie entités/flux reconstruite depuis les données réelles.' },
      { nom: 'Copilot conversationnel', detail: 'Interrogation du système en langage naturel, dans le périmètre de vos droits.' },
    ],
  },
  {
    titre: 'Trésorerie & paiements',
    icone: 'landmark',
    items: [
      { nom: 'Mobile Money natif', detail: 'Orange Money, MTN, Moov, Wave… selon le Country Pack de votre entité.' },
      { nom: 'Policy de paiement', detail: 'Chaque paiement traverse policy + extension sectorielle avant exécution.' },
      { nom: 'Décisions explicites', detail: 'ALLOW, REVIEW ou DENY — jamais d\u2019exécution silencieuse d\u2019une opération sensible.' },
      { nom: 'Isolation des rails', detail: 'INV-011 : un rail étranger est refusé par construction, preuve à l\u2019appui.' },
    ],
  },
  {
    titre: 'Finance & conformité OHADA',
    icone: 'file',
    items: [
      { nom: 'Balance générale', detail: 'Classes 1 à 8, soldes progressifs, export PDF/Excel prêt pour l\u2019expert comptable.' },
      { nom: 'Grand livre & lettrage', detail: 'Lettrage réel issu des rapprochements factures-paiements, report à nouveau inclus.' },
      { nom: 'Journaux normalisés', detail: 'VTE, ACH, TRE, PAIE, OD avec codes journaux configurables par entité.' },
      { nom: 'Séparation des pouvoirs', detail: 'Le comptable saisit, le dirigeant ou le DAF approuve — structurellement.' },
    ],
  },
  {
    titre: 'Sécurité & gouvernance',
    icone: 'shield',
    items: [
      { nom: '6 invariants PAR CONSTRUCTION', detail: 'Isolation tenant, authorization, immutabilité, pays, secteur, contrats — prouvés en runtime.' },
      { nom: 'Sessions rotatives', detail: 'TTL glissant, plafond absolu, détection de rejeu et révocation familiale.' },
      { nom: '2FA TOTP', detail: 'Obligatoire par vagues de rôles, QR + codes de récupération à usage unique.' },
      { nom: 'Evidence signée', detail: 'Chaîne HMAC-SHA256 par organisation : chaque décision est auditable et infalsifiable.' },
    ],
  },
  {
    titre: 'Organisation & rôles',
    icone: 'users',
    items: [
      { nom: 'RBAC 6 rôles', detail: 'Dirigeant, Admin, DAF, Comptable, Opérations, Auditeur — matrice de permissions fine.' },
      { nom: 'Multi-tenant strict', detail: 'Données, utilisateurs et audit bornés au tenant — INV-001 vérifié par sonde.' },
      { nom: 'Gestion des utilisateurs', detail: 'Création, suspension, changement de rôle — réservé aux Admins.' },
      { nom: 'Audit complet', detail: 'Connexions, décisions, invariants, exports : tout est tracé et consultable.' },
    ],
  },
  {
    titre: 'Automatisation & IA',
    icone: 'workflow',
    items: [
      { nom: 'Agents à périmètre borné', detail: 'Les agents héritent des permissions de leur rôle — pas de contournement possible.' },
      { nom: 'Extensions sectorielles', detail: '13 secteurs auto-contenus : le cœur ne dépend jamais d\u2019une extension.' },
      { nom: 'Constats sectoriels', detail: 'Chaque paiement peut embarquer des findings (situations BTP, conformité santé…).' },
      { nom: 'Contrats versionnés', detail: 'INV-013 : API, Evidence, packs et secteurs sous semver — aucune rupture silencieuse.' },
    ],
  },
]

// ── Contacts ─────────────────────────────────────────────────────────────────
export const BUREAUX = [
  {
    ville: 'Abidjan — Siège',
    pays: 'Côte d\u2019Ivoire \u{1F1E8}\u{1F1EE}',
    adresse: 'Cocody Riviera 3, Bd Latrille — Immeuble A2',
    tel: '+225 27 20 00 00 00',
  },
  {
    ville: 'Dakar',
    pays: 'Sénégal \u{1F1F8}\u{1F1F3}',
    adresse: 'Plateau, Av. Léopold Sédar Senghor — Immeuble SD',
    tel: '+221 33 800 00 00',
  },
  {
    ville: 'Cotonou',
    pays: 'Bénin \u{1F1E7}\u{1F1EF}',
    adresse: 'Ganhi, Av. Steinmetz — Résistance C',
    tel: '+229 21 00 00 00',
  },
]

export const SUJETS_CONTACT = [
  'Demande de démonstration',
  'Essai & souscription',
  'Support technique',
  'Partenariat / intégration',
  'Presse & médias',
  'Carrière',
  'Autre',
]
