import { PrismaClient } from '../node_modules/@prisma/client'
const p = new PrismaClient({ log: [] })
const ext = p.$extends({
  query: {
    $allModels: {
      async $allOperations({ model, operation, args, query }) {
        console.log('[EXT]', model, operation)
        return query(args)
      },
    },
  },
})
async function main() {
  const n1 = await ext.tenant.count()
  console.log('count via ext:', n1)
  const n2 = await p.tenant.count()
  console.log('count via raw:', n2)
}
main().then(() => process.exit(0)).catch((e) => { console.error(String(e).slice(0, 300)); process.exit(1) })
