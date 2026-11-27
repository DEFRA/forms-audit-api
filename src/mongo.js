import { FormMetricType } from '@defra/forms-model'
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
export const METRICS_COLLECTION_NAME = 'metrics'

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
  await coll.createIndex({ entityId: 1, createdAt: -1 })
  await coll.createIndex({ type: 1, createdAt: -1 })

  const coll2 = db.collection(METRICS_COLLECTION_NAME)

  await coll2.createIndex({ type: 1, formId: 1, metricName: 1, formStatus: 1 })
  await coll2.createIndex({ type: 1, metricName: 1, periodName: 1 })
  await coll2.createIndex({ type: 1, metricName: 1, createdAt: 1 })

  await convertMetricsCreatedAtToDate(coll2, logger)

  logger.info(`Mongodb connected to ${databaseName}`)

  return db
}

/**
 * Back-fix: converts any timeline metrics whose 'createdAt' was stored as a string
 * (as received via JSON from forms-submission-api) into a date.
 * Idempotent, so safe to run on every startup and from multiple containers.
 * @param {Collection} coll - the metrics collection
 * @param {Logger} logger
 */
export async function convertMetricsCreatedAtToDate(coll, logger) {
  const { modifiedCount } = await coll.updateMany(
    {
      type: FormMetricType.TimelineMetric,
      createdAt: { $type: 'string' }
    },
    [{ $set: { createdAt: { $toDate: '$createdAt' } } }]
  )

  if (modifiedCount) {
    logger.info(
      `Converted createdAt from string to date on ${modifiedCount} metrics records`
    )
  }
}

/**
 * @import { Collection, Db } from 'mongodb'
 * @import { Logger } from 'pino'
 */
