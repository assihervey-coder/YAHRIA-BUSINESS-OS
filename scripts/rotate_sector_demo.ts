// Utilitaire de démo INV-012 : change temporairement le secteur de l'org CI
// pour déclencher un hook sectoriel réel via l'API (puis le remet à ENTERPRISE).
// Usage : bun run scripts/rotate_sector_demo.ts set|reset
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()
const mode = process.argv[2] ?? 'set'

async function main() {
  const org = await prisma.organization.findFirst({ where: { countryCode: 'CI' } })
  if (!org) throw new Error('Org CI introuvable')
  const target = mode === 'set' ? 'construction' : 'ENTERPRISE'
  await prisma.organization.update({ where: { id: org.id }, data: { sectorCode: target } })
  console.log(`Org ${org.name} : sectorCode=${org.sectorCode} → ${target}`)
}

main().finally(() => prisma.$disconnect())
