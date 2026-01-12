import {
  AuditEventMessageType,
  alwaysValidEvents,
  fieldConfigs,
  supportContactFields
} from '@defra/forms-model'

import { MAX_RESULTS } from '~/src/plugins/query-handler/config.js'

/**
 * Sort order for window functions - newest records first.
 * Used consistently across all $setWindowFields stages.
 */
const CREATED_AT_DESC = { createdAt: -1 }

/**
 * Builds the $match condition for "always valid" event types.
 * These events don't require change comparison.
 * @returns {object}
 */
export function buildAlwaysValidCondition() {
  return {
    type: { $in: [...alwaysValidEvents] }
  }
}

/**
 * Builds the $match condition for records with no data field.
 * Records without data are considered valid changes.
 * @returns {object}
 */
export function buildNoDataCondition() {
  return {
    $or: [{ data: { $exists: false } }, { data: null }]
  }
}

/**
 * Builds $match conditions for field config event types.
 * Each condition checks that previous and new values differ.
 * @returns {object[]}
 */
export function buildFieldConfigConditions() {
  return Object.entries(fieldConfigs).map(([eventType, config]) => ({
    $and: [
      { type: eventType },
      {
        $expr: {
          $ne: [`$data.${config.prevPath}`, `$data.${config.newPath}`]
        }
      }
    ]
  }))
}

/**
 * Builds the $match condition for FORM_SUPPORT_CONTACT_UPDATED events.
 * Checks if any support contact field has changed.
 * @returns {object}
 */
export function buildSupportContactCondition() {
  return {
    $and: [
      { type: AuditEventMessageType.FORM_SUPPORT_CONTACT_UPDATED },
      {
        $or: supportContactFields.map((field) => ({
          $and: [
            {
              [`data.${field.newPath}`]: { $exists: true, $nin: [null, ''] }
            },
            {
              $expr: {
                $ne: [`$data.${field.prevPath}`, `$data.${field.newPath}`]
              }
            }
          ]
        }))
      }
    ]
  }
}

/**
 * Builds the $match condition for unknown event types.
 * Unknown types pass through as they may represent valid changes.
 * @returns {object}
 */
export function buildUnknownTypeCondition() {
  return {
    type: {
      $nin: [
        ...alwaysValidEvents,
        ...Object.keys(fieldConfigs),
        AuditEventMessageType.FORM_SUPPORT_CONTACT_UPDATED
      ]
    }
  }
}

/**
 * Builds all conditions for the "has actual change" filter.
 * Records pass if they match any of these conditions.
 * @see {@link https://www.mongodb.com/docs/manual/reference/operator/query/or/}
 * @returns {object[]}
 */
export function buildHasActualChangeConditions() {
  return [
    buildAlwaysValidCondition(),
    buildNoDataCondition(),
    ...buildFieldConfigConditions(),
    buildSupportContactCondition(),
    buildUnknownTypeCondition()
  ]
}

/**
 * Adds the $setWindowFields stage to detect group boundaries.
 * Uses $shift to access previous record's user ID and event type.
 * @see {@link https://www.mongodb.com/docs/manual/reference/operator/aggregation/setWindowFields/}
 * @see {@link https://www.mongodb.com/docs/manual/reference/operator/aggregation/shift/}
 * @param {PipelineStage[]} pipeline - The aggregation pipeline stages
 */
export function addWindowFieldsStage(pipeline) {
  pipeline.push({
    $setWindowFields: {
      sortBy: CREATED_AT_DESC,
      output: {
        prevUserId: {
          $shift: { output: '$createdBy.id', by: -1, default: null }
        },
        prevType: { $shift: { output: '$type', by: -1, default: null } }
      }
    }
  })
}

/**
 * Adds the $addFields stage to mark consolidation group boundaries.
 * A new group starts when:
 * - The event type is NOT FORM_UPDATED, OR
 * - Previous record was NOT FORM_UPDATED, OR
 * - Different user from previous record, OR
 * - It's the first record (prevUserId is null)
 * @see {@link https://www.mongodb.com/docs/manual/reference/operator/aggregation/addFields/}
 * @param {PipelineStage[]} pipeline - The aggregation pipeline stages
 */
export function addGroupBoundaryStage(pipeline) {
  pipeline.push({
    $addFields: {
      isNewGroup: {
        $or: [
          { $ne: ['$type', AuditEventMessageType.FORM_UPDATED] },
          { $eq: ['$prevUserId', null] },
          { $ne: ['$createdBy.id', '$prevUserId'] },
          { $ne: ['$prevType', AuditEventMessageType.FORM_UPDATED] }
        ]
      }
    }
  })
}

/**
 * Adds the $setWindowFields stage to assign cumulative group numbers.
 * Uses a running sum of isNewGroup markers to assign group IDs.
 * @see {@link https://www.mongodb.com/docs/manual/reference/operator/aggregation/setWindowFields/}
 * @param {PipelineStage[]} pipeline - The aggregation pipeline stages
 */
export function addGroupNumberStage(pipeline) {
  pipeline.push({
    $setWindowFields: {
      sortBy: CREATED_AT_DESC,
      output: {
        groupNumber: {
          $sum: { $cond: ['$isNewGroup', 1, 0] },
          window: { documents: ['unbounded', 'current'] }
        }
      }
    }
  })
}

/**
 * Adds the $group stage to consolidate consecutive events.
 * Groups by groupNumber and aggregates count and date range.
 * @see {@link https://www.mongodb.com/docs/manual/reference/operator/aggregation/group/}
 * @param {PipelineStage[]} pipeline - The aggregation pipeline stages
 */
export function addConsolidationGroupStage(pipeline) {
  pipeline.push({
    $group: {
      _id: '$groupNumber',
      record: { $first: '$$ROOT' },
      consolidatedCount: { $sum: 1 },
      consolidatedFrom: { $last: '$createdAt' },
      consolidatedTo: { $first: '$createdAt' }
    }
  })
}

/**
 * Adds the $facet stage for pagination and total count.
 * Returns both metadata (count) and paginated records in a single query.
 * @see {@link https://www.mongodb.com/docs/manual/reference/operator/aggregation/facet/}
 * @param {PipelineStage[]} pipeline - The aggregation pipeline stages
 * @param {number} skip - Number of records to skip
 * @param {number} limit - Maximum number of records to return
 */
export function addPaginationFacetStage(pipeline, skip, limit) {
  pipeline.push({
    $facet: {
      metadata: [{ $count: 'totalItems' }],
      records: [{ $skip: skip }, { $limit: limit }]
    }
  })
}

/**
 * Builds the complete aggregation pipeline for consolidated audit records.
 * Handles filtering, consecutive grouping by user, and pagination.
 * @param {object} filter - MongoDB filter for base query
 * @param {PaginationOptions} pagination - Pagination options
 * @returns {PipelineStage[]}
 */
export function buildConsolidationPipeline(filter, pagination) {
  const { page, perPage } = pagination
  const skip = (page - 1) * perPage
  const limit = Math.min(perPage, MAX_RESULTS)

  /** @type {PipelineStage[]} */
  const pipeline = []

  // 1. Match the base filter
  pipeline.push({ $match: filter })

  // 2. Filter out records with no actual change
  pipeline.push({ $match: { $or: buildHasActualChangeConditions() } })

  // 3. Add window fields to detect group boundaries
  addWindowFieldsStage(pipeline)

  // 4. Mark group boundaries
  addGroupBoundaryStage(pipeline)

  // 5. Assign cumulative group numbers
  addGroupNumberStage(pipeline)

  // 6. Group by groupNumber to consolidate
  addConsolidationGroupStage(pipeline)

  // 7. Sort by the newest record's createdAt (grouping disrupts order)
  pipeline.push({ $sort: { 'record.createdAt': -1 } })

  // 8. Use $facet for pagination and total count
  addPaginationFacetStage(pipeline, skip, limit)

  return pipeline
}

/**
 * Temporary fields added during aggregation that are removed from results.
 */
const AGGREGATION_TEMP_FIELDS = new Set([
  'prevUserId',
  'prevType',
  'isNewGroup',
  'groupNumber'
])

/**
 * Removes temporary aggregation fields from a record.
 * @param {AggregationRecord} record - Record with temporary fields
 * @returns {WithId<AuditRecordInput>} Clean record without aggregation fields
 */
function cleanAggregationFields(record) {
  return /** @type {WithId<AuditRecordInput>} */ (
    Object.fromEntries(
      Object.entries(record).filter(
        ([key]) => !AGGREGATION_TEMP_FIELDS.has(key)
      )
    )
  )
}

/**
 * Maps aggregation results to clean consolidated audit results.
 * Removes temporary aggregation fields and adds consolidation metadata only when applicable.
 * @param {ConsolidatedAggregationResult[]} results - Raw aggregation results
 * @returns {ConsolidatedAuditResult[]}
 */
export function mapConsolidationResults(results) {
  return results.map((item) => {
    const { record, consolidatedCount, consolidatedFrom, consolidatedTo } = item

    const cleanRecord = cleanAggregationFields(record)

    if (consolidatedCount > 1) {
      return {
        ...cleanRecord,
        consolidatedCount,
        consolidatedFrom: new Date(consolidatedFrom),
        consolidatedTo: new Date(consolidatedTo)
      }
    }

    return cleanRecord
  })
}

/**
 * @import { AuditRecordInput, PaginationOptions } from '@defra/forms-model'
 * @import { WithId } from 'mongodb'
 * @import { AggregationRecord, ConsolidatedAggregationResult, ConsolidatedAuditResult, PipelineStage } from '~/src/repositories/aggregation/types.js'
 */
