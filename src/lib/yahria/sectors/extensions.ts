// YAHRIA BUSINESS OS V1 — Extensions sectorielles concrètes (INV-012)
// Chaque extension est AUTO-CONTENUE : elle n'importe que le contrat
// (./contract) et ne connaît ni le Core, ni la base, ni les autres
// extensions. Toute la logique est pure et déclarative — une extension ne
// peut jamais modifier le comportement du noyau, elle ne fait que répondre
// à des hooks consultatifs.

import type { SectorExtension, SectorPaymentContext, SectorInvoiceContext, SectorPayrollContext, SectorFinding } from './contract'

const F = (code: string, severity: 'INFO' | 'WARN', note: string) => ({ code, severity, note })

// ── enterprise ───────────────────────────────────────────────────────────────
const enterprise: SectorExtension = {
  code: 'enterprise', name: 'Entreprise', version: '1.0.0', contractVersion: '1.0.0',
  entities: ['Devis', 'Facture', 'Achat', 'Employé', 'Report'],
  kpis: ['CA', 'Marge', 'DSO', 'Effectif'],
}

// ── ngo ──────────────────────────────────────────────────────────────────────
const ngo: SectorExtension = {
  code: 'ngo', name: 'ONG', version: '1.0.0', contractVersion: '1.0.0',
  entities: ['Financement', 'Bailleur', 'Projet', 'Justificatif'],
  kpis: ['Taux d\u2019absorption', 'Fonds par projet', 'Conformité bailleur'],
}

// ── microfinance ─────────────────────────────────────────────────────────────
const microfinance: SectorExtension = {
  code: 'microfinance', name: 'Microfinance', version: '2.0.0', contractVersion: '2.0.0',
  entities: ['Dossier de crédit', 'Échéancier', 'Portefeuille'],
  kpis: ['PAR30', 'Taux de remboursement', 'Encours'],
  evaluatePayment: (ctx: SectorPaymentContext) => {
    const f: SectorFinding[] = []
    if (ctx.direction === 'OUT' && ctx.counterpartyType === 'CUSTOMER') {
      f.push(F('MFI_DECAISSEMENT', 'WARN', 'Décaissement vers un client : vérifier dossier de crédit et échéancier avant exécution'))
    }
    if (ctx.direction === 'IN' && ctx.amount >= 2_000_000) {
      f.push(F('MFI_REMBOURSEMENT_GROS', 'INFO', 'Grosses entrées : rapprocher avec l\u2019échéancier du dossier correspondant (PAR)'))
    }
    return f
  },
  evaluateInvoice: (ctx: SectorInvoiceContext) => {
    if (ctx.amount >= 500_000) {
      return [F('MFI_FACT_INTERETS', 'INFO', 'Facturation d\u2019intérêts ou de frais de dossier importante : vérifier la conformité du taux au plafond réglementaire et le rattachement à l\u2019échéancier du dossier')]
    }
    return []
  },
  evaluatePayroll: (ctx: SectorPayrollContext) => {
    if (ctx.headcount >= 10) {
      return [F('MFI_PAIE_AGENTS', 'INFO', 'Effectif de terrain important : ventiler la paie agents de crédit par portefeuille pour le coût complet de gestion (PAR30)')]
    }
    return []
  },
}

// ── retail ───────────────────────────────────────────────────────────────────
const retail: SectorExtension = {
  code: 'retail', name: 'Commerce de détail', version: '1.0.0', contractVersion: '1.0.0',
  entities: ['Caisse', 'Boutique', 'Stock', 'SKU'],
  kpis: ['Marge par SKU', 'Rotation stock', 'Ventes caisse'],
  evaluatePayment: (ctx: SectorPaymentContext) => {
    if (ctx.direction === 'OUT' && ctx.amount >= 1_500_000) {
      return [F('RETAIL_ACHAT_MASSE', 'INFO', 'Achat de masse : s\u2019assurer que la réception marchandise et le stock multi-boutiques seront saisis le jour même')]
    }
    return []
  },
}

// ── education ────────────────────────────────────────────────────────────────
const education: SectorExtension = {
  code: 'education', name: 'Éducation', version: '2.0.0', contractVersion: '2.0.0',
  entities: ['Scolarité', 'Inscription', 'Classe', 'Personnel'],
  kpis: ['Effectifs', 'Taux de recouvrement scolarité', 'Masse salariale'],
  evaluatePayment: (ctx: SectorPaymentContext) => {
    if (ctx.direction === 'IN' && ctx.counterpartyType === 'CUSTOMER') {
      return [F('EDU_SCOLARITE', 'INFO', 'Encaissement élève : ventiler la trace sur la période de scolarité concernée')]
    }
    return []
  },
  evaluatePayroll: (ctx: SectorPayrollContext) => {
    return [F('EDU_MASSE_SALARIALE', 'INFO', `Masse salariale ${ctx.period} : rapprocher les charges de personnel du taux d\u2019encadrement et de l\u2019effectif scolarisé (coût par élève)`)]
  },
}

// ── construction ─────────────────────────────────────────────────────────────
const construction: SectorExtension = {
  code: 'construction', name: 'BTP', version: '2.0.0', contractVersion: '2.0.0',
  entities: ['Chantier', 'Situation de travaux', 'Attachement', 'Métré'],
  kpis: ['Avancement', 'Marge chantier', 'Rétention'],
  evaluatePayment: (ctx: SectorPaymentContext) => {
    if (ctx.direction === 'OUT' && ctx.amount >= 2_000_000) {
      return [F('BTP_SITUATION', 'WARN', 'Décaissement chantier majeur : exige une situation de travaux validée (attachements + métré) en pièce jointe')]
    }
    return []
  },
  evaluateInvoice: (ctx: SectorInvoiceContext) => {
    if (ctx.amount >= 2_000_000) {
      return [F('BTP_FACT_SITUATION', 'WARN', 'Facture chantier majeure : exiger la situation de travaux validée (avancement, rétention, retenue de garantie) avant émission')]
    }
    return []
  },
  evaluatePayroll: (ctx: SectorPayrollContext) => {
    const f: SectorFinding[] = []
    if (ctx.headcount >= 5) {
      f.push(F('BTP_PAIE_CHANTIER', 'INFO', 'Main-d\u2019œuvre nombreuse : ventiler les salaires (6611) par chantier pour la marge par affaire et vérifier la couverture risques professionnels (CNSS)'))
    }
    return f
  },
}

// ── industry ─────────────────────────────────────────────────────────────────
const industry: SectorExtension = {
  code: 'industry', name: 'Industrie', version: '1.0.0', contractVersion: '1.0.0',
  entities: ['Ordre de fabrication', 'Nomenclature', 'Coût de revient'],
  kpis: ['Capacité', 'Coût unitaire', 'Rendement'],
}

// ── toll ─────────────────────────────────────────────────────────────────────
const toll: SectorExtension = {
  code: 'toll', name: 'Péage', version: '1.0.0', contractVersion: '1.0.0',
  entities: ['Passage', 'Voie', 'Recette journalière'],
  kpis: ['Recettes/voie', 'Écart caisse', 'Trafic'],
  evaluatePayment: (ctx: SectorPaymentContext) => {
    if (ctx.direction === 'IN') {
      return [F('TOLL_RECONCILIATION', 'INFO', 'Recette de passage : rapprochement quotidien par voie attendu (INV-REC)')]
    }
    return []
  },
}

// ── restaurant ───────────────────────────────────────────────────────────────
const restaurant: SectorExtension = {
  code: 'restaurant', name: 'Restauration', version: '1.0.0', contractVersion: '1.0.0',
  entities: ['Carte', 'Table', 'Matières premières'],
  kpis: ['Food cost', 'Ventes par service', 'Gaspi'],
  evaluatePayment: (ctx: SectorPaymentContext) => {
    if (ctx.direction === 'OUT' && ['SUPPLIER', 'OTHER'].includes(ctx.counterpartyType ?? '') && ctx.amount >= 300_000) {
      return [F('RESTO_MP', 'INFO', 'Achat de matières premières : mettre à jour le food cost du service courant')]
    }
    return []
  },
}

// ── ecommerce ────────────────────────────────────────────────────────────────
const ecommerce: SectorExtension = {
  code: 'ecommerce', name: 'E-commerce', version: '1.0.0', contractVersion: '1.0.0',
  entities: ['Catalogue', 'Commande', 'Livraison'],
  kpis: ['Taux de conversion', 'Panier moyen', 'Délai livraison'],
  evaluatePayment: (ctx: SectorPaymentContext) => {
    if (ctx.direction === 'IN' && ctx.provider) {
      return [F('ECOM_GATEWAY', 'INFO', `Encaissement en ligne via ${ctx.provider} : réconcilier avec le rapport passerelle (fees + remittance)`)]
    }
    return []
  },
}

// ── travel ───────────────────────────────────────────────────────────────────
const travel: SectorExtension = {
  code: 'travel', name: 'Voyages', version: '1.0.0', contractVersion: '1.0.0',
  entities: ['Billet', 'Dossier voyageur', 'Commission IATA'],
  kpis: ['Commissions', 'Émissions', 'Annulations'],
  evaluatePayment: (ctx: SectorPaymentContext) => {
    if (ctx.direction === 'OUT' && ctx.amount >= 1_000_000) {
      return [F('TRAVEL_BSP', 'WARN', 'Gros décaissement billetterie : contrôler la provision BSP/IATA et les commissions avant exécution')]
    }
    return []
  },
}

// ── healthcare ───────────────────────────────────────────────────────────────
const healthcare: SectorExtension = {
  code: 'healthcare', name: 'Santé', version: '1.0.0', contractVersion: '1.0.0',
  entities: ['Patient', 'Consultation', 'Acte', 'Caisse clinique'],
  kpis: ['Actes/jour', 'Recettes par acte', 'Taux occupation'],
}

// ── money_transfer ───────────────────────────────────────────────────────────
const moneyTransfer: SectorExtension = {
  code: 'money_transfer', name: 'Transfert d\u2019argent', version: '1.0.0', contractVersion: '1.0.0',
  entities: ['Transfert KYC', 'Agence', 'Réconciliation fournisseur'],
  kpis: ['Volume transféré', 'Frais', 'Écart agence'],
  evaluatePayment: (ctx: SectorPaymentContext) => {
    const f: SectorFinding[] = []
    if (ctx.direction === 'OUT' && ctx.provider && ctx.amount >= 1_000_000) {
      f.push(F('MTO_KYC', 'WARN', 'Transfert sortant majeur via mobile money : KYC complet du donneur d\u2019ordre requis (pièce +justificatif de fonds)'))
    }
    if (ctx.direction === 'OUT' && ctx.amount >= 4_000_000) {
      f.push(F('MTO_SEUIL_REPORT', 'INFO', 'Au-delà de 4 M XOF : déclaration de soupçon éventuelle à anticiper avec le conformité'))
    }
    return f
  },
}

/** Ordre stable = ordre de présentation (aligné sur le seed SectorEngine). */
export const SECTOR_EXTENSIONS: readonly SectorExtension[] = [
  enterprise, ngo, microfinance, retail, education, construction, industry,
  toll, restaurant, ecommerce, travel, healthcare, moneyTransfer,
]
