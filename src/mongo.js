import { MongoClient } from 'mongodb'

import { config } from '~/src/config/index.js'
import { secureContext } from '~/src/secure-context.js'

/**
 * @type {Db}
 */
export let db

/**
 * @type {MongoClient}
 */
export let client

export const AUDIT_RECORDS_COLLECTION_NAME = 'audit-records'

/**
 * Connects to mongo database
 * @param {Logger} logger
 */
export async function prepareDb(logger) {
  const mongoUri = config.get('mongo.uri')
  const databaseName = config.get('mongo.databaseName')
  const isSecureContextEnabled = config.get('isSecureContextEnabled')

  logger.info('Setting up mongodb')

  client = await MongoClient.connect(
    mongoUri,
    /** @type {any} */ ({
      retryWrites: false,
      readPreference: 'primary',
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- secureContext can be undefined in non-production
      ...(isSecureContextEnabled && secureContext && { secureContext })
    })
  )

  db = client.db(databaseName)

  // Ensure db indexes
  const coll = db.collection(AUDIT_RECORDS_COLLECTION_NAME)

  await coll.createIndex({ messageId: 1 }, { unique: true })

  logger.info(`Mongodb connected to ${databaseName}`)

  return db
}

/**
 * @import { Db } from 'mongodb'
 * @import { Logger } from 'pino'
 */
