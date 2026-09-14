import { PrismaClient } from '@prisma/client'
const db = new PrismaClient()
async function main() {
  await db.agent.update({ where: { code: 'PaymentAgent' }, data: { maxAmount: 2000000 } })
  await db.agent.update({ where: { code: 'SalesAgent' }, data: { maxAmount: 500000 } })
  console.log('DB agents updated')
}
main().finally(() => db.$disconnect())
