import { FormMetricName, FormStatus } from '@defra/forms-model'

import {
  CalculationTypes,
  handleMetricValue,
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
