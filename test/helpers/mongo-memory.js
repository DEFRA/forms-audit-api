import { MongoMemoryReplSet } from 'mongodb-memory-server'

import { config } from '~/src/config/index.js'
import { prepareDb } from '~/src/mongo.js'
import { seedAuditRecords } from '~/test/helpers/seed-audit-records.js'

/**
 * The platform runs MongoDB 6.0 (see the CDP compose files), so integration
 * tests exercise the same major version. Keep this in step with the CI cache
 * key in .github/workflows/check-pull-request.yml.
 */
export const MONGO_VERSION = '6.0.14'

/**
 * Booting mongod can include downloading the binary on a cold cache, which is
 * far slower than jest's default timeout allows for.
 */
export const MONGO_BOOT_TIMEOUT_MS = 180_000

/**
 * Boots an in-memory mongod (a real MongoDB binary backed by in-memory
 * storage) and points the app config at it, so integration suites run against
 * genuine Mongo semantics: unique indexes, atomic filtered updates and
 * duplicate-key errors. Callers own the lifecycle — stop() it in afterAll,
 * alongside closing the app's Mongo client.
 */
export async function startMongoMemoryServer() {
  const mongod = await MongoMemoryReplSet.create({
    binary: { version: MONGO_VERSION },
    replSet: { count: 1 }
  })

  config.set('mongo.uri', mongod.getUri())

  return mongod
}

/**
 * Registers suite lifecycle hooks for integration tests that talk to the
 * database directly (no HTTP server): boots an in-memory mongod, runs
 * prepareDb so the real startup indexes exist, and tears both down after
 * the suite
 */
export function setupIntegrationDb() {
  // /** @type {MongoMemoryReplSet} */
  // let mongod

  // eslint-disable-next-line no-undef
  beforeAll(async () => {
    await startMongoMemoryServer()
    await prepareDb(/** @type {never} */ ({ info: () => undefined }))
    await seedAuditRecords()
  }, MONGO_BOOT_TIMEOUT_MS)

  // eslint-disable-next-line no-undef
  afterAll(async () => {
    // await client.close()
    // await mongod.stop()
  })
}
