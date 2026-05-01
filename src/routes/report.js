import { Scopes } from '@defra/forms-model'

import {
  generateReport,
  runMetricsCollectionJob
} from '~/src/service/metrics.js'

export default [
  /**
   * @satisfies {ServerRoute}
   */
  ({
    method: 'GET',
    path: '/report',
    async handler(_request, h) {
      const metrics = await generateReport()

      return h.response(metrics).code(200)
    },
    options: {
      auth: false
    }
  }),

  /**
   * @satisfies {ServerRoute}
   */
  ({
    method: 'POST',
    path: '/report/regenerate',
    handler(_request, h) {
      // eslint-disable-next-line no-void
      void runMetricsCollectionJob(true)
      return h.response({ message: 'success' }).code(200)
    },
    options: {
      auth: {
        scope: [`+${Scopes.DeadLetterQueues}`]
      }
    }
  })
]

/**
 * @import { ServerRoute } from '@hapi/hapi'
 */
