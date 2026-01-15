import {
  AuditEventMessageType,
  alwaysValidEvents,
  fieldConfigs,
  supportContactFields
} from '@defra/forms-model'

import {
  addConsolidationGroupStage,
  addGroupBoundaryStage,
  addGroupNumberStage,
  addPaginationFacetStage,
  addWindowFieldsStage,
  buildAlwaysValidCondition,
  buildConsolidationPipeline,
  buildFieldConfigConditions,
  buildHasActualChangeConditions,
  buildNoDataCondition,
  buildSupportContactCondition,
  buildUnknownTypeCondition,
  mapConsolidationResults
} from '~/src/repositories/aggregation/consolidation-aggregation.js'

describe('Consolidation aggregation', () => {
  /** @type {*[]} */
  let pipeline

  beforeEach(() => {
    pipeline = []
  })

  describe('buildAlwaysValidCondition', () => {
    it('should return condition matching all always valid event types', () => {
      /** @type {*} */
      const condition = buildAlwaysValidCondition()

      expect(condition).toEqual({
        type: { $in: [...alwaysValidEvents] }
      })
      expect(condition.type.$in).toContain(AuditEventMessageType.FORM_CREATED)
      expect(condition.type.$in).toContain(AuditEventMessageType.FORM_UPDATED)
    })
  })

  describe('buildNoDataCondition', () => {
    it('should return condition for records without data field', () => {
      const condition = buildNoDataCondition()

      expect(condition).toEqual({
        $or: [{ data: { $exists: false } }, { data: null }]
      })
    })
  })

  describe('buildFieldConfigConditions', () => {
    it('should build conditions for each field config event type', () => {
      const conditions = buildFieldConfigConditions()

      expect(conditions).toHaveLength(Object.keys(fieldConfigs).length)
    })

    it('should check that previous and new values differ', () => {
      /** @type {*[]} */
      const conditions = buildFieldConfigConditions()
      /** @type {*} */
      const titleCondition = conditions.find(
        (c) => c.$and[0].type === AuditEventMessageType.FORM_TITLE_UPDATED
      )

      expect(titleCondition).toBeDefined()
      expect(titleCondition?.$and[1].$expr.$ne).toEqual([
        '$data.changes.previous.title',
        '$data.changes.new.title'
      ])
    })
  })

  describe('buildSupportContactCondition', () => {
    it('should return condition for FORM_SUPPORT_CONTACT_UPDATED', () => {
      /** @type {*} */
      const condition = buildSupportContactCondition()

      expect(condition.$and[0].type).toBe(
        AuditEventMessageType.FORM_SUPPORT_CONTACT_UPDATED
      )
      expect(condition.$and[1].$or).toHaveLength(supportContactFields.length)
    })

    it('should check each support contact field for changes', () => {
      /** @type {*} */
      const condition = buildSupportContactCondition()
      const fieldConditions = condition.$and[1].$or

      // The first field condition checks phone field exists and is not null/empty
      expect(fieldConditions[0].$and[0]).toEqual({
        'data.changes.new.contact.phone': { $exists: true, $nin: [null, ''] }
      })
    })
  })

  describe('buildUnknownTypeCondition', () => {
    it('should exclude known event types', () => {
      /** @type {*} */
      const condition = buildUnknownTypeCondition()

      expect(condition.type.$nin).toContain(AuditEventMessageType.FORM_CREATED)
      expect(condition.type.$nin).toContain(
        AuditEventMessageType.FORM_TITLE_UPDATED
      )
      expect(condition.type.$nin).toContain(
        AuditEventMessageType.FORM_SUPPORT_CONTACT_UPDATED
      )
    })
  })

  describe('buildHasActualChangeConditions', () => {
    it('should return array of all change detection conditions', () => {
      const conditions = buildHasActualChangeConditions()

      // Should have: alwaysValid, noData, fieldConfigs (10), supportContact, unknownType
      expect(conditions).toHaveLength(
        2 + Object.keys(fieldConfigs).length + 1 + 1
      )
    })

    it('should be usable in $or query', () => {
      const conditions = buildHasActualChangeConditions()
      const matchStage = { $match: { $or: conditions } }

      expect(matchStage.$match.$or).toBe(conditions)
    })
  })

  describe('addWindowFieldsStage', () => {
    it('should add $setWindowFields stage with $shift operators', () => {
      addWindowFieldsStage(pipeline)

      expect(pipeline).toHaveLength(1)
      expect(pipeline[0].$setWindowFields).toBeDefined()
    })

    it('should sort by createdAt descending for window operations', () => {
      addWindowFieldsStage(pipeline)

      /** @type {*} */
      const stage = pipeline[0]
      expect(stage.$setWindowFields.sortBy).toEqual({ createdAt: -1 })
    })

    it('should output prevUserId and prevType fields', () => {
      addWindowFieldsStage(pipeline)

      /** @type {*} */
      const stage = pipeline[0]
      const output = stage.$setWindowFields.output
      expect(output.prevUserId.$shift).toEqual({
        output: '$createdBy.id',
        by: -1,
        default: null
      })
      expect(output.prevType.$shift).toEqual({
        output: '$type',
        by: -1,
        default: null
      })
    })
  })

  describe('addGroupBoundaryStage', () => {
    it('should add $addFields stage with isNewGroup logic', () => {
      addGroupBoundaryStage(pipeline)

      expect(pipeline).toHaveLength(1)
      expect(pipeline[0].$addFields).toBeDefined()
      /** @type {*} */
      const stage = pipeline[0]
      expect(stage.$addFields.isNewGroup).toBeDefined()
    })

    it('should mark new group when type is not FORM_UPDATED', () => {
      addGroupBoundaryStage(pipeline)

      /** @type {*} */
      const stage = pipeline[0]
      const orConditions = stage.$addFields.isNewGroup.$or
      expect(orConditions).toContainEqual({
        $ne: ['$type', AuditEventMessageType.FORM_UPDATED]
      })
    })

    it('should mark new group when user changes', () => {
      addGroupBoundaryStage(pipeline)

      /** @type {*} */
      const stage = pipeline[0]
      const orConditions = stage.$addFields.isNewGroup.$or
      expect(orConditions).toContainEqual({
        $ne: ['$createdBy.id', '$prevUserId']
      })
    })

    it('should mark new group for first record', () => {
      addGroupBoundaryStage(pipeline)

      /** @type {*} */
      const stage = pipeline[0]
      const orConditions = stage.$addFields.isNewGroup.$or
      expect(orConditions).toContainEqual({ $eq: ['$prevUserId', null] })
    })
  })

  describe('addGroupNumberStage', () => {
    it('should add $setWindowFields stage with cumulative sum', () => {
      addGroupNumberStage(pipeline)

      expect(pipeline).toHaveLength(1)
      expect(pipeline[0].$setWindowFields).toBeDefined()
    })

    it('should sort by createdAt descending for window operations', () => {
      addGroupNumberStage(pipeline)

      /** @type {*} */
      const stage = pipeline[0]
      expect(stage.$setWindowFields.sortBy).toEqual({ createdAt: -1 })
    })

    it('should use unbounded window for cumulative sum', () => {
      addGroupNumberStage(pipeline)

      /** @type {*} */
      const stage = pipeline[0]
      const output = stage.$setWindowFields.output
      expect(output.groupNumber.window).toEqual({
        documents: ['unbounded', 'current']
      })
    })
  })

  describe('addConsolidationGroupStage', () => {
    it('should add $group stage grouping by groupNumber', () => {
      addConsolidationGroupStage(pipeline)

      expect(pipeline).toHaveLength(1)
      expect(pipeline[0].$group).toBeDefined()
      /** @type {*} */
      const stage = pipeline[0]
      expect(stage.$group._id).toBe('$groupNumber')
    })

    it('should keep first record and calculate count and dates', () => {
      addConsolidationGroupStage(pipeline)

      /** @type {*} */
      const stage = pipeline[0]
      const group = stage.$group
      expect(group.record).toEqual({ $first: '$$ROOT' })
      expect(group.consolidatedCount).toEqual({ $sum: 1 })
      expect(group.consolidatedFrom).toEqual({ $last: '$createdAt' })
      expect(group.consolidatedTo).toEqual({ $first: '$createdAt' })
    })
  })

  describe('addPaginationFacetStage', () => {
    it('should add $facet stage with metadata and records', () => {
      addPaginationFacetStage(pipeline, 10, 20)

      expect(pipeline).toHaveLength(1)
      expect(pipeline[0].$facet).toBeDefined()
      /** @type {*} */
      const stage = pipeline[0]
      expect(stage.$facet.metadata).toEqual([{ $count: 'totalItems' }])
    })

    it('should apply skip and limit to records', () => {
      addPaginationFacetStage(pipeline, 10, 20)

      /** @type {*} */
      const stage = pipeline[0]
      expect(stage.$facet.records).toEqual([{ $skip: 10 }, { $limit: 20 }])
    })
  })

  describe('buildConsolidationPipeline', () => {
    it('should build complete pipeline with all stages when pagination provided', () => {
      const filter = { entityId: 'test-entity' }
      const pagination = { page: 1, perPage: 10 }

      const result = buildConsolidationPipeline(filter, pagination)

      // Pipeline has 8 stages
      expect(result).toHaveLength(8)
      expect(result[0].$match).toEqual(filter)
      /** @type {*} */
      const matchStage = result[1]
      expect(matchStage.$match.$or).toBeDefined()
      expect(result[2].$setWindowFields).toBeDefined()
      expect(result[3].$addFields).toBeDefined()
      expect(result[4].$setWindowFields).toBeDefined()
      expect(result[5].$group).toBeDefined()
      expect(result[6].$sort).toEqual({ 'record.createdAt': -1 })
      expect(result[7].$facet).toBeDefined()
    })

    it('should calculate correct skip for pagination', () => {
      const filter = {}
      const pagination = { page: 3, perPage: 10 }

      const result = buildConsolidationPipeline(filter, pagination)
      /** @type {*} */
      const facetStage = result[7]

      expect(facetStage.$facet.records[0].$skip).toBe(20) // (3-1) * 10
    })

    it('should cap limit at MAX_RESULTS', () => {
      const filter = {}
      const pagination = { page: 1, perPage: 500 }

      const result = buildConsolidationPipeline(filter, pagination)
      /** @type {*} */
      const facetStage = result[7]

      expect(facetStage.$facet.records[1].$limit).toBe(100) // MAX_RESULTS
    })

    it('should return all records when pagination is not provided', () => {
      const filter = { entityId: 'test-entity' }

      const result = buildConsolidationPipeline(filter)

      expect(result).toHaveLength(8)
      /** @type {*} */
      const facetStage = result[7]
      // No skip/limit means empty records array in facet
      expect(facetStage.$facet.records).toEqual([])
      expect(facetStage.$facet.metadata).toEqual([{ $count: 'totalItems' }])
    })

    it('should build same base stages regardless of pagination', () => {
      const filter = { entityId: 'test-entity' }

      const withPagination = buildConsolidationPipeline(filter, {
        page: 1,
        perPage: 10
      })
      const withoutPagination = buildConsolidationPipeline(filter)

      // First 7 stages should be identical
      expect(withPagination.slice(0, 7)).toEqual(withoutPagination.slice(0, 7))
    })
  })

  describe('mapConsolidationResults', () => {
    it('should remove temporary aggregation fields', () => {
      /** @type {*[]} */
      const results = [
        {
          record: {
            _id: 'test-id',
            type: AuditEventMessageType.FORM_UPDATED,
            prevUserId: 'should-remove',
            prevType: 'should-remove',
            isNewGroup: true,
            groupNumber: 1
          },
          consolidatedCount: 1,
          consolidatedFrom: new Date('2025-01-01'),
          consolidatedTo: new Date('2025-01-01')
        }
      ]

      const mapped = mapConsolidationResults(results)

      expect(mapped[0]).not.toHaveProperty('prevUserId')
      expect(mapped[0]).not.toHaveProperty('prevType')
      expect(mapped[0]).not.toHaveProperty('isNewGroup')
      expect(mapped[0]).not.toHaveProperty('groupNumber')
    })

    it('should not add consolidation fields when count is 1', () => {
      /** @type {*[]} */
      const results = [
        {
          record: { _id: 'test-id', type: AuditEventMessageType.FORM_CREATED },
          consolidatedCount: 1,
          consolidatedFrom: new Date('2025-01-01'),
          consolidatedTo: new Date('2025-01-01')
        }
      ]

      const mapped = mapConsolidationResults(results)

      expect(mapped[0]).not.toHaveProperty('consolidatedCount')
      expect(mapped[0]).not.toHaveProperty('consolidatedFrom')
      expect(mapped[0]).not.toHaveProperty('consolidatedTo')
    })

    it('should remove temp fields even when count is 1', () => {
      /** @type {*[]} */
      const results = [
        {
          record: {
            _id: 'test-id',
            type: AuditEventMessageType.FORM_CREATED,
            prevUserId: 'should-remove',
            prevType: 'should-remove',
            isNewGroup: true,
            groupNumber: 1
          },
          consolidatedCount: 1,
          consolidatedFrom: new Date('2025-01-01'),
          consolidatedTo: new Date('2025-01-01')
        }
      ]

      const mapped = mapConsolidationResults(results)

      expect(mapped[0]).not.toHaveProperty('prevUserId')
      expect(mapped[0]).not.toHaveProperty('prevType')
      expect(mapped[0]).not.toHaveProperty('isNewGroup')
      expect(mapped[0]).not.toHaveProperty('groupNumber')
      expect(mapped[0]).not.toHaveProperty('consolidatedCount')
    })

    it('should add consolidation fields when count is greater than 1', () => {
      const fromDate = new Date('2025-01-01T10:00:00Z')
      const toDate = new Date('2025-01-01T12:00:00Z')
      /** @type {*[]} */
      const results = [
        {
          record: { _id: 'test-id', type: AuditEventMessageType.FORM_UPDATED },
          consolidatedCount: 3,
          consolidatedFrom: fromDate,
          consolidatedTo: toDate
        }
      ]

      /** @type {*[]} */
      const mapped = mapConsolidationResults(results)

      expect(mapped[0].consolidatedCount).toBe(3)
      expect(mapped[0].consolidatedFrom).toEqual(fromDate)
      expect(mapped[0].consolidatedTo).toEqual(toDate)
    })

    it('should handle empty results', () => {
      const mapped = mapConsolidationResults([])

      expect(mapped).toEqual([])
    })
  })
})
