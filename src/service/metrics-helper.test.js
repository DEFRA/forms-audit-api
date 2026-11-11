import { FormMetricName, FormMetricType, FormStatus } from '@defra/forms-model'
import { endOfDay } from 'date-fns'

import {
  CalculationTypes,
  getMetricCalcType,
  handleMetricValue,
  handleTimeslot,
  setTimeOnDate
} from '~/src/service/metrics-helper.js'

describe('metrics-helper', () => {
  describe('setTimeOnDate', () => {
    it('should set time on date', () => {
      const testDateStr = '2026-02-05'
      const expectedDate = new Date('2026-02-05T08:59:34.000Z')
      expect(setTimeOnDate(testDateStr, expectedDate)).toEqual(expectedDate)
    })
  })

  describe('getMetricCalcType', () => {
    it('should return the configured calculation type', () => {
      expect(
        getMetricCalcType({
          type: FormMetricType.TimelineMetric,
          metricName: FormMetricName.Submissions,
          formId: 'form-id',
          formStatus: FormStatus.Live,
          metricValue: 1,
          createdAt: new Date('2026-05-01T00:00:00.000Z')
        })
      ).toBe(CalculationTypes.AccumulationWithDrilldown)
    })
  })

  describe('handleTimeslot', () => {
    const metric = /** @type {FormTimelineMetric} */ ({
      metricName: FormMetricName.FormsInDraft,
      formStatus: FormStatus.Draft,
      metricValue: 3
    })
    const startOfSlot = new Date('2026-05-01T00:00:00.000Z')
    const endOfSlot = new Date('2026-05-02T00:00:00.000Z')

    it('should include metrics on the start and end dates', () => {
      const period = /** @type {Record<string, { count?: number }>} */ ({})
      handleTimeslot(
        metric,
        period,
        CalculationTypes.Accumulation,
        startOfSlot,
        startOfSlot,
        endOfSlot
      )
      handleTimeslot(
        metric,
        period,
        CalculationTypes.Accumulation,
        endOfDay(endOfSlot),
        startOfSlot,
        endOfSlot
      )

      expect(period).toEqual({ FormsInDraft: { count: 6 } })
    })

    it('should ignore metrics outside the slot', () => {
      const period = /** @type {Record<string, { count?: number }>} */ ({})
      handleTimeslot(
        metric,
        period,
        CalculationTypes.Accumulation,
        new Date('2026-04-30T23:59:59.999Z'),
        startOfSlot,
        endOfSlot
      )
      handleTimeslot(
        metric,
        period,
        CalculationTypes.Accumulation,
        new Date('2026-05-03T00:00:00.000Z'),
        startOfSlot,
        endOfSlot
      )

      expect(period).toEqual({})
    })
  })

  describe('handleMetricValue', () => {
    it('should handle accumulation with drilldown', () => {
      const metric = /** @type {FormTimelineMetric} */ ({
        metricName: FormMetricName.Submissions,
        formStatus: FormStatus.Live,
        metricValue: 5
      })
      const period = { Submissions: { count: 1 } }
      handleMetricValue(
        metric,
        period,
        CalculationTypes.AccumulationWithDrilldown
      )
      expect(period).toEqual({
        Submissions: {
          count: 6
        }
      })
    })

    it('should handle accumulation', () => {
      const metric = /** @type {FormTimelineMetric} */ ({
        metricName: FormMetricName.FormsInDraft,
        formStatus: FormStatus.Live,
        metricValue: 3
      })
      const period = { FormsInDraft: { count: 1 } }
      handleMetricValue(metric, period, CalculationTypes.Accumulation)
      expect(period).toEqual({
        FormsInDraft: {
          count: 4
        }
      })
    })

    it('should handle snapshot', () => {
      const metric = /** @type {FormTimelineMetric} */ ({
        metricName: FormMetricName.TimeToPublish,
        formStatus: FormStatus.Live,
        metricValue: 3
      })
      const period = { TimeToPublish: { count: 7 } }
      handleMetricValue(metric, period, CalculationTypes.Snapshot)
      expect(period).toEqual({
        TimeToPublish: {
          count: 3
        }
      })
    })

    it('should handle average', () => {
      const metric = /** @type {FormTimelineMetric} */ ({
        metricName: FormMetricName.TimeToPublish,
        formStatus: FormStatus.Live,
        metricValue: 3
      })
      const period = { TimeToPublish: { avgCount: 1, avgTotal: 15 } }
      // @ts-expect-error - partial mock of data
      handleMetricValue(metric, period, CalculationTypes.Average)
      expect(period).toEqual({
        TimeToPublish: {
          avgCount: 2,
          avgTotal: 18
        }
      })
    })
  })
})

/**
 * @import { FormTimelineMetric } from '@defra/forms-model'
 */
