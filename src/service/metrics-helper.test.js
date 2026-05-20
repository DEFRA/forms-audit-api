import { setTimeOnDate } from '~/src/service/metrics-helper.js'

describe('metrics-helper', () => {
  describe('setTimeOnDate', () => {
    it('should set time on date', () => {
      const testDateStr = '2026-02-05'
      const expectedDate = new Date('2026-02-05T08:59:34.000Z')
      expect(setTimeOnDate(testDateStr, expectedDate)).toEqual(expectedDate)
    })
  })
})
