import { config } from '~/src/config/index.js'
import { createLogger } from '~/src/helpers/logging/logger.js'
import { db } from '~/src/mongo.js'
import { MAX_RESULTS } from '~/src/plugins/query-handler/config.js'

const logger = createLogger()

export const CONSOLIDATED_CACHE_COLLECTION_NAME = 'consolidated-audit-cache'
const METADATA_SORT_INDEX = -1
const CACHE_ENABLED_CONFIG_KEY = 'cache.enabled'

/**
 * Gets the cache collection
 * @returns {Collection<CacheDocument>}
 */
function getCacheCollection() {
  return /** @type {Collection<CacheDocument>} */ (
    db.collection(CONSOLIDATED_CACHE_COLLECTION_NAME)
  )
}

/**
 * Checks if cache is populated for an entity
 * @param {string} entityId
 * @returns {Promise<boolean>}
 */
export async function isCachePopulated(entityId) {
  if (!config.get(CACHE_ENABLED_CONFIG_KEY)) {
    return false
  }

  try {
    const coll = getCacheCollection()
    const count = await coll.countDocuments(
      { entityId, sortIndex: METADATA_SORT_INDEX },
      { limit: 1 }
    )
    return count > 0
  } catch (err) {
    logger.warn(err, `Failed to check cache for entity ${entityId}`)
    return false
  }
}

/**
 * Gets cached consolidated audit records with pagination.
 * Returns null if cache is not populated.
 * @param {string} entityId
 * @param {PaginationOptions} pagination
 * @returns {Promise<CacheResult | null>}
 */
export async function getCachedRecords(entityId, pagination) {
  if (!config.get(CACHE_ENABLED_CONFIG_KEY)) {
    return null
  }

  const coll = getCacheCollection()
  const { page, perPage } = pagination
  const skip = (page - 1) * perPage
  const limit = Math.min(perPage, MAX_RESULTS)

  try {
    // Get metadata first to check if cache exists and get totalItems
    const metadata = await coll.findOne({
      entityId,
      sortIndex: METADATA_SORT_INDEX
    })

    if (!metadata) {
      return null
    }

    const records = await coll
      .find({ entityId, sortIndex: { $gte: 0 } })
      .sort({ sortIndex: 1 })
      .skip(skip)
      .limit(limit)
      .toArray()

    const documents = records.map((r) => r.data)

    logger.debug(`Cache hit for entity ${entityId}, page ${page}`)

    return {
      documents,
      totalItems: metadata.totalItems
    }
  } catch (err) {
    logger.warn(err, `Failed to read cache for entity ${entityId}`)
    return null
  }
}

/**
 * Populates the cache with consolidated audit records for an entity.
 * Uses upsert on metadata to prevent race conditions when multiple
 * requests try to populate the cache simultaneously.
 * @param {string} entityId
 * @param {ConsolidatedAuditResult[]} records
 * @param {number} totalItems
 * @returns {Promise<void>}
 */
export async function populateCache(entityId, records, totalItems) {
  if (!config.get(CACHE_ENABLED_CONFIG_KEY)) {
    return
  }

  const coll = getCacheCollection()
  const cachedAt = new Date()

  try {
    const existingMetadata = await coll.findOneAndUpdate(
      { entityId, sortIndex: METADATA_SORT_INDEX },
      {
        $setOnInsert: {
          entityId,
          sortIndex: METADATA_SORT_INDEX,
          totalItems,
          data: /** @type {ConsolidatedAuditResult} */ (
            /** @type {unknown} */ (null)
          ),
          cachedAt
        }
      },
      { upsert: true, returnDocument: 'before' }
    )

    if (existingMetadata) {
      logger.debug(`Cache already being populated for entity ${entityId}`)
      return
    }

    if (records.length > 0) {
      const recordDocuments = records.map((record, index) => ({
        entityId,
        sortIndex: index,
        totalItems,
        data: record,
        cachedAt
      }))

      await coll.insertMany(recordDocuments, { ordered: false })
    }

    logger.info(
      `Populated cache for entity ${entityId} with ${records.length} records`
    )
  } catch (err) {
    logger.warn(err, `Failed to populate cache for entity ${entityId}`)
    await invalidateCache(entityId)
  }
}

/**
 * Invalidates (deletes) all cache entries for an entity.
 * Called when new audit records are created.
 * @param {string} entityId
 * @returns {Promise<void>}
 */
export async function invalidateCache(entityId) {
  if (!config.get(CACHE_ENABLED_CONFIG_KEY)) {
    return
  }

  const coll = getCacheCollection()

  try {
    const result = await coll.deleteMany({ entityId })

    if (result.deletedCount > 0) {
      logger.info(
        `Invalidated cache for entity ${entityId} (${result.deletedCount} documents)`
      )
    }
  } catch (err) {
    logger.warn(err, `Failed to invalidate cache for entity ${entityId}`)
  }
}

/**
 * Creates indexes for the cache collection.
 * Should be called during database initialization.
 * @returns {Promise<void>}
 */
export async function ensureCacheIndexes() {
  if (!config.get(CACHE_ENABLED_CONFIG_KEY)) {
    return
  }

  try {
    const coll = getCacheCollection()
    await coll.createIndex({ entityId: 1, sortIndex: 1 })
    logger.info('Cache indexes created')
  } catch (err) {
    logger.warn(err, 'Failed to create cache indexes')
  }
}

/**
 * @typedef {object} CacheDocument
 * @property {string} entityId - The form/entity ID
 * @property {number} sortIndex - -1 for metadata, 0+ for records
 * @property {number} totalItems - Total consolidated records count
 * @property {ConsolidatedAuditResult} data - The consolidated audit record (null for metadata)
 * @property {Date} cachedAt - When this was cached
 */

/**
 * @typedef {object} CacheResult
 * @property {ConsolidatedAuditResult[]} documents - The consolidated audit records
 * @property {number} totalItems - Total count of all consolidated records
 */

/**
 * @import { Collection } from 'mongodb'
 * @import { PaginationOptions } from '@defra/forms-model'
 * @import { ConsolidatedAuditResult } from '~/src/repositories/aggregation/types.js'
 */
