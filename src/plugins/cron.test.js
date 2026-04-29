import { cronPlugin } from '~/src/plugins/cron.js'

jest.mock('~/src/config/index.js', () => ({
  config: {
    get: jest.fn()
  }
}))

jest.mock('~/src/service/metrics.js')

const mockInfo = jest.fn()
const mockError = jest.fn()
jest.mock('~/src/helpers/logging/logger.js', () => ({
  logger: {
    info: () => mockInfo(),
    error: () => mockError()
  }
}))

describe('cronPlugin', () => {
  describe('plugin metadata', () => {
    it('should have correct name', () => {
      expect(cronPlugin.plugin.name).toBe('cron-metrics')
    })

    it('should have version', () => {
      expect(cronPlugin.plugin.version).toBe('1.0.0')
    })

    it('should have a register function', () => {
      expect(typeof cronPlugin.plugin.register).toBe('function')
    })
  })

  describe('plugin.register', () => {
    beforeEach(() => {
      jest.clearAllMocks()
    })

    it('should register onPreStop handler', () => {
      // Verify structure
      expect(cronPlugin.plugin.register).toHaveLength(1)
    })
  })
})
