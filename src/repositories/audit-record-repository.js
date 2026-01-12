import { getErrorMessage } from '~/src/helpers/error-message.js'
import { createLogger } from '~/src/helpers/logging/logger.js'
import { AUDIT_RECORDS_COLLECTION_NAME, db } from '~/src/mongo.js'
import { MAX_RESULTS } from '~/src/plugins/query-handler/config.js'
import {
  buildConsolidationPipeline,
  mapConsolidationResults
} from '~/src/repositories/aggregation/consolidation-aggregation.js'

const logger = createLogger()

/**
 * Gets the audit records collection
 * @returns {Collection<AuditRecordInput>}
 */
function getCollection() {
  return /** @type {Collection<AuditRecordInput>} */ (
    db.collection(AUDIT_RECORDS_COLLECTION_NAME)
  )
}

/**
 * Gets a filtered list of audit records with optional pagination.
 * When pagination is provided, returns paginated results with total count.
 * When pagination is omitted, returns all matching records.
 * @param {Filter<WithId<AuditRecordInput>>} filter
 * @param {PaginationOptions} [pagination] - Optional pagination options
 * @returns {Promise<{ documents: WithId<AuditRecordInput>[], totalItems?: number }>}
 */
export async function getAuditRecords(filter, pagination) {
  const coll = getCollection()

  try {
    const cursor = coll.find(filter).sort({ createdAt: -1 })

    if (pagination) {
      const { page, perPage } = pagination
      const skip = (page - 1) * perPage
      const limit = Math.min(perPage, MAX_RESULTS)

      const [documents, totalItems] = await Promise.all([
        cursor.skip(skip).limit(limit).toArray(),
        coll.countDocuments(filter)
      ])

      return { documents, totalItems }
    }

    const documents = await cursor.toArray()
    return { documents }
  } catch (err) {
    logger.error(err, `Failed to read audit records - ${getErrorMessage(err)}`)
    throw err
  }
}

/**
 * Gets consolidated audit records using aggregation pipeline.
 * Filters out no-change events and consolidates consecutive FORM_UPDATED events by the same user.
 * @param {Filter<WithId<AuditRecordInput>>} filter
 * @param {PaginationOptions} pagination
 * @returns {Promise<{ documents: ConsolidatedAuditResult[], totalItems: number }>}
 */
export async function getConsolidatedAuditRecords(filter, pagination) {
  const coll = getCollection()

  try {
    const pipeline = buildConsolidationPipeline(filter, pagination)
    const results = await coll.aggregate(pipeline).toArray()
    const result = /** @type {FacetResult | undefined} */ (results[0])

    if (!result) {
      return { documents: [], totalItems: 0 }
    }

    const { metadata, records } = result
    const totalItems = metadata[0]?.totalItems ?? 0
    const documents = mapConsolidationResults(records)

    return { documents, totalItems }
  } catch (err) {
    logger.error(
      err,
      `Failed to get consolidated audit records - ${getErrorMessage(err)}`
    )
    throw err
  }
}

/**
 * Creates an audit record from AuditRecordInput
 * @param {AuditRecordInput} auditRecordInput
 * @param {ClientSession} session
 */
export async function createAuditRecord(auditRecordInput, session) {
  logger.info(`Inserting ${auditRecordInput.messageId}`)

  const coll = getCollection()

  try {
    await coll.insertOne(auditRecordInput, { session })

    logger.info(`Inserted ${auditRecordInput.messageId}`)
  } catch (err) {
    logger.error(
      err,
      `Failed to insert ${auditRecordInput.messageId} - ${getErrorMessage(err)} `
    )
    throw err
  }
}

/**
 * @import { AuditRecordInput, PaginationOptions } from '@defra/forms-model'
 * @import { ClientSession, Collection, Filter, WithId } from 'mongodb'
 * @import { ConsolidatedAuditResult, FacetResult } from '~/src/repositories/aggregation/types.js'
 */
