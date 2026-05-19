import { decodeParamList, setTimeOnDate } from '~/src/service/metrics-helper.js'

describe('metrics-helper', () => {
  describe('setTimeOnDate', () => {
    it('should set time on date', () => {
      const testDateStr = '2026-02-05'
      const expectedDate = new Date('2026-02-05T08:59:34.000Z')
      expect(setTimeOnDate(testDateStr, expectedDate)).toEqual(expectedDate)
    })
  })

  describe('decodeParamList', () => {
    it('should decode params', () => {
      const params = ['abc%20def', 'def%20ghi']
      const expectedParams = ['abc def', 'def ghi']
      expect(decodeParamList(params)).toEqual(expectedParams)
    })

    it('should return undefined for no params', () => {
      const params = /** @type {string[]} */ ([])
      expect(decodeParamList(params)).toBeUndefined()
    })
  })
})
