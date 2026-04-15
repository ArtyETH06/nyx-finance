import { resetAppData } from '../server/db.js'

async function main() {
  const result = await resetAppData()
  console.log(JSON.stringify(result, null, 2))
}

main().catch((error) => {
  console.error('[reset-state]', error instanceof Error ? error.message : error)
  process.exit(1)
})
