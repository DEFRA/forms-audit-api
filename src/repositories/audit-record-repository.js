import { createLogger } from '~/src/helpers/logging/logger.js'
import { AUDIT_RECORDS_COLLECTION_NAME, db } from '~/src/mongo.js'

const logger = createLogger()

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

  await coll.insertOne(auditRecordInput, { session })

  logger.info(`Inserted ${auditRecordInput.messageId}`)
}

/**
 * @import { AuditRecordInput, FormDefinition, Page, ComponentDef, PatchPageFields, List, Engine, ConditionWrapperV2 } from '@defra/forms-model'
 * @import { ClientSession, Collection, FindOptions } from 'mongodb'
 * @import { ObjectSchema } from 'joi'
 * @import { UpdateCallback, RemovePagePredicate } from '~/src/api/forms/repositories/helpers.js'
 */
