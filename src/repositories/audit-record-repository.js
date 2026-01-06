import { getErrorMessage } from '~/src/helpers/error-message.js'
import { createLogger } from '~/src/helpers/logging/logger.js'
import { AUDIT_RECORDS_COLLECTION_NAME, db } from '~/src/mongo.js'
import { MAX_RESULTS } from '~/src/plugins/query-handler/config.js'

const logger = createLogger()

/**
 * Gets a filtered list of audit records with pagination
 * @param {Filter<WithId<AuditRecordInput>>} filter
 * @param {PaginationOptions} pagination
 * @returns {Promise<{ documents: WithId<AuditRecordInput>[], totalItems: number }>}
 */
export async function getAuditRecords(filter, pagination) {
  const coll = /** @type {Collection<AuditRecordInput>} */ (
    db.collection(AUDIT_RECORDS_COLLECTION_NAME)
  )

  const { page, perPage } = pagination
  const skip = (page - 1) * perPage
  const limit = Math.min(perPage, MAX_RESULTS)

  try {
    const [documents, totalItems] = await Promise.all([
      coll
        .find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .toArray(),
      coll.countDocuments(filter)
    ])

    return { documents, totalItems }
  } catch (err) {
    logger.error(err, `Failed to read audit records - ${getErrorMessage(err)}`)
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

  const coll = /** @type {Collection<AuditRecordInput>} */ (
    db.collection(AUDIT_RECORDS_COLLECTION_NAME)
  )

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
 */
