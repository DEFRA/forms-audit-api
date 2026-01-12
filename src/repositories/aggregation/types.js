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
 * @typedef {object} MatchCondition
 * @property {Record<string, unknown>} [type] - Type filter condition
 * @property {MatchCondition[]} [$or] - OR conditions
 * @property {MatchCondition[]} [$and] - AND conditions
 * @property {Record<string, unknown>} [$expr] - Expression condition
 */

/**
 * @typedef {object} SetWindowFieldsStage
 * @property {{ createdAt: number }} sortBy - Sort order for window
 * @property {Record<string, unknown>} output - Output fields
 */

/**
 * @typedef {object} AddFieldsStage
 * @property {Record<string, unknown>} isNewGroup - Group boundary condition
 */

/**
 * @typedef {object} GroupStage
 * @property {string} _id - Group key
 * @property {Record<string, unknown>} record - First record in group
 * @property {Record<string, unknown>} consolidatedCount - Count accumulator
 * @property {Record<string, unknown>} consolidatedFrom - First date accumulator
 * @property {Record<string, unknown>} consolidatedTo - Last date accumulator
 */

/**
 * @typedef {object} FacetStage
 * @property {Array<{ $count: string }>} metadata - Count pipeline
 * @property {Array<{ $skip: number } | { $limit: number }>} records - Pagination pipeline
 */

/**
 * @typedef {object} PipelineStage
 * @property {MatchCondition} [$match] - MongoDB $match stage
 * @property {Record<string, number>} [$sort] - MongoDB $sort stage
 * @property {AddFieldsStage} [$addFields] - MongoDB $addFields stage
 * @property {SetWindowFieldsStage} [$setWindowFields] - MongoDB $setWindowFields stage
 * @property {GroupStage} [$group] - MongoDB $group stage
 * @property {FacetStage} [$facet] - MongoDB $facet stage
 * @property {number} [$skip] - MongoDB $skip stage
 * @property {number} [$limit] - MongoDB $limit stage
 * @property {string} [$count] - MongoDB $count stage
 */

/**
 * @import { AuditRecordInput } from '@defra/forms-model'
 * @import { WithId } from 'mongodb'
 */
