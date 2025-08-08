import { getErrorMessage } from '~/src/helpers/error-message.js'
import { createLogger } from '~/src/helpers/logging/logger.js'
import { AUDIT_RECORDS_COLLECTION_NAME, db } from '~/src/mongo.js'

const logger = createLogger()

const MAX_RECORDS = 100

/**
 * Gets a filtered list of audit records
 * @param {Filter<WithId<AuditRecordInput>>} filter
 * @returns {Promise<WithId<AuditRecordInput>[]>}
 */
export async function getAuditRecords(filter) {
  logger.info('Reading audit records')

  const coll = /** @type {Collection<AuditRecordInput>} */ (
    db.collection(AUDIT_RECORDS_COLLECTION_NAME)
  )

  try {
    const results = await coll.find(filter).limit(MAX_RECORDS).toArray()

    logger.info('Read audit records')

    return results
  } catch (e) {
    logger.error(`Failed to read audit records - ${getErrorMessage(e)}`)
    throw e
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
  } catch (e) {
    logger.error(
      `Failed to insert ${auditRecordInput.messageId} - ${getErrorMessage(e)} `
    )
    throw e
  }
}

/**
 * @import { AuditRecordInput, FormDefinition, Page, ComponentDef, PatchPageFields, List, Engine, ConditionWrapperV2 } from '@defra/forms-model'
 * @import { ClientSession, Collection, Filter, WithId } from 'mongodb'
 * @import { ObjectSchema } from 'joi'
 * @import { UpdateCallback, RemovePagePredicate } from '~/src/api/forms/repositories/helpers.js'
 */
