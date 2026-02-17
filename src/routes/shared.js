/**
 * Maps a form audit document from MongoDB to AuditRecord
 * @param {WithId<AuditRecordInput>} document - form audit document (with ID)
 * @returns {AuditRecord}
 */
export function mapAuditRecord(document) {
  const { _id, ...rest } = document

  return {
    ...rest,
    id: _id.toString()
  }
}

/**
 * Maps a consolidated audit result from MongoDB aggregation to AuditRecord or ConsolidatedAuditRecord
 * @param {ConsolidatedAuditResult} document - consolidated audit document
 * @returns {AuditRecord | ConsolidatedAuditRecord}
 */
export function mapConsolidatedAuditRecord(document) {
  const { _id, consolidatedCount, consolidatedFrom, consolidatedTo, ...rest } =
    document

  /** @type {AuditRecord} */
  const baseRecord = {
    ...rest,
    id: _id.toString()
  }

  // Only add consolidation fields when count > 1
  if (consolidatedCount !== undefined && consolidatedCount > 1) {
    return {
      ...baseRecord,
      consolidatedCount,
      consolidatedFrom,
      consolidatedTo
    }
  }

  return baseRecord
}

/**
 * @import { WithId } from 'mongodb'
 * @import { AuditRecord, AuditRecordInput, ConsolidatedAuditRecord } from '@defra/forms-model'
 * @import { ConsolidatedAuditResult } from '~/src/repositories/aggregation/types.js'
 */
