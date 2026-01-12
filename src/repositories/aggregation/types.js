/**
 * @typedef {object} ConsolidatedAggregationResult
 * @property {AggregationRecord} record - The audit record with temporary aggregation fields
 * @property {number} consolidatedCount - Number of records consolidated
 * @property {Date} consolidatedFrom - Oldest record timestamp in group
 * @property {Date} consolidatedTo - Newest record timestamp in group
 */

/**
 * @typedef {WithId<AuditRecordInput> & AggregationTempFields} AggregationRecord
 */

/**
 * @typedef {object} AggregationTempFields
 * @property {string} [prevUserId] - Previous record's user ID (from $setWindowFields)
 * @property {string} [prevType] - Previous record's event type (from $setWindowFields)
 * @property {boolean} [isNewGroup] - Whether this record starts a new consolidation group
 * @property {number} [groupNumber] - Consolidation group number
 */

/**
 * @typedef {WithId<AuditRecordInput> & ConsolidationFields} ConsolidatedAuditResult
 */

/**
 * @typedef {object} ConsolidationFields
 * @property {number} [consolidatedCount] - Number of records consolidated (only if > 1)
 * @property {Date} [consolidatedFrom] - Oldest record timestamp (only if consolidated)
 * @property {Date} [consolidatedTo] - Newest record timestamp (only if consolidated)
 */

/**
 * @typedef {object} FacetResult
 * @property {Array<{ totalItems: number }>} metadata - Count result
 * @property {ConsolidatedAggregationResult[]} records - Paginated records
 */

/**
 * MongoDB aggregation pipeline stage.
 * Represents any valid MongoDB aggregation stage (e.g., $match, $group, $sort, etc.).
 * @typedef {Record<string, unknown>} PipelineStage
 */

/**
 * @import { AuditRecordInput } from '@defra/forms-model'
 * @import { WithId } from 'mongodb'
 */
