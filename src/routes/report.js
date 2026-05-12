import { Scopes } from '@defra/forms-model'
import Joi from 'joi'

import {
  generateReport,
  runMetricsCollectionJob
} from '~/src/service/metrics.js'

const HTTP_OK = 200

const filteringSchema = Joi.object({
  searchText: Joi.string().optional(),
  status: Joi.array()
    .items(Joi.string().valid('draft', 'live'))
    .single()
    .optional(),
  org: Joi.array().items(Joi.string()).single().optional()
})

export default [
  /**
   * @satisfies {ServerRoute}
   */
  ({
    method: 'GET',
    path: '/report',
    async handler(request, h) {
      const { query } = request
      const metrics = await generateReport(query)

      return h.response(metrics).code(HTTP_OK)
    },
    options: {
      auth: false,
      validate: {
        query: filteringSchema
      }
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
      return h.response({ message: 'success' }).code(HTTP_OK)
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
