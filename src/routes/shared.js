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
 * @import { WithId } from 'mongodb'
 * @import { AuditRecord, AuditRecordInput } from '@defra/forms-model'
 */
