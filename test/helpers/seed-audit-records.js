import { randomUUID } from 'node:crypto'

import {
  AUDIT_RECORDS_COLLECTION_NAME,
  METRICS_COLLECTION_NAME,
  db
} from '~/src/mongo.js'

/**
 * @param {object} partial
 */
function createAuditRecord(partial) {
  return {
    messageId: randomUUID(),
    source: 'FORMS_MANAGER',
    schemaVersion: 1,
    category: 'FORM',
    ...partial
  }
}

/**
 * Pre-populate DB with records for testing
 */
export async function seedAuditRecords() {
  await db.collection(AUDIT_RECORDS_COLLECTION_NAME).insertMany([
    createAuditRecord({
      type: 'FORM_CREATED',
      entityId: 'form-id-1',
      createdAt: new Date('2026-06-30')
    }),
    createAuditRecord({
      type: 'FORM_CREATED',
      entityId: 'form-id-2',
      createdAt: new Date('2026-07-01')
    }),
    createAuditRecord({
      type: 'FORM_CREATED',
      entityId: 'form-id-3',
      createdAt: new Date('2026-07-02')
    }),
    createAuditRecord({
      type: 'FORM_CREATED',
      entityId: 'form-id-welsh',
      createdAt: new Date('2026-06-25')
    }),
    createAuditRecord({
      type: 'FORM_LIVE_CREATED_FROM_DRAFT',
      entityId: 'form-id-1',
      createdAt: new Date('2026-07-08')
    }),
    createAuditRecord({
      type: 'FORM_LIVE_CREATED_FROM_DRAFT',
      entityId: 'form-id-welsh',
      createdAt: new Date('2026-07-14')
    }),
    createAuditRecord({
      type: 'FORM_DRAFT_CREATED_FROM_LIVE',
      entityId: 'form-id-1',
      createdAt: new Date('2026-07-16')
    }),
    createAuditRecord({
      type: 'FORM_LIVE_CREATED_FROM_DRAFT',
      entityId: 'form-id-1',
      createdAt: new Date('2026-07-18')
    })
  ])
}

/**
 * Pre-populate DB with records for testing
 */
export async function seedMetricsRecords() {
  await db.collection(METRICS_COLLECTION_NAME).insertMany([
    {
      type: 'form-metric-control',
      locked: false,
      jobStart: new Date('2026-06-10T11:59:00.000Z'),
      jobEnd: new Date('2026-06-10T12:00:00.000Z'),
      lastSuccessfulRunDate: new Date('2026-06-10T12:00:00.000Z'),
      lastRunResult: new Date('Success: Completed ok'),
      updatedAt: new Date('2026-06-10T12:00:00.000Z')
    }
  ])
}
