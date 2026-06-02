import { FormMetricName, Scopes } from '@defra/forms-model'
import Joi from 'joi'

import {
  clearMetricsDatabase,
  generateDrilldownReport,
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

const drilldownSchema = Joi.object({
  period: Joi.string().valid('last7Days', 'last30Days', 'allTime').required(),
  metricName: Joi.string()
    .valid(...Object.values(FormMetricName))
    .required()
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
   * @satisfies {ServerRoute<{ Params: { period: string, metricName: FormMetricName } }>}
   */
  ({
    method: 'GET',
    path: '/report/{period}/{metricName}',
    async handler(request, h) {
      const { params } = request
      const metrics = await generateDrilldownReport(
        params.period,
        params.metricName
      )

      return h.response(metrics).code(HTTP_OK)
    },
    options: {
      auth: false,
      validate: {
        params: drilldownSchema
      }
    }
  }),

  /**
   * @satisfies {ServerRoute}
   */
  ({
    method: 'POST',
    path: '/report/regenerate',
    async handler(_request, h) {
      await clearMetricsDatabase()
      // Fire-and-forget so UI doesn't timeout
      // eslint-disable-next-line no-void
      void runMetricsCollectionJob()
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
