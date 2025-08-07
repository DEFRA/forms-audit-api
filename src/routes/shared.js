/**
 * Maps a form audit document from MongoDB to AuditRecord
 * @param {WithId<Omit<AuditRecord, 'id'>>} document - form audit document (with ID)
 * @returns {AuditRecord}
 */
export function mapAuditRecord(document) {
  const { _id, ...rest } = document

  const auditRecord = /** @type {AuditRecord} */ ({
    ...rest,
    id: _id.toString()
  })

  return auditRecord
}

/**
 * @import { WithId } from 'mongodb'
 * @import { AuditRecord } from '@defra/forms-model'
 */
