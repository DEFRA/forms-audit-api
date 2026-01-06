import {
  AuditEventMessageCategory,
  idSchema,
  paginationOptionFields
} from '@defra/forms-model'
import Joi from 'joi'

import {
  DEFAULT_PER_PAGE,
  MAX_RESULTS
} from '~/src/plugins/query-handler/config.js'
import { readAuditEvents } from '~/src/service/events.js'

/**
 * @type {ServerRoute}
 */
export default {
  method: 'GET',
  path: '/audit/forms/{id}',
  /**
   * @param {RequestAuditById} request
   * @param {ExtendedResponseToolkit<AuditRecord>} h
   */
  async handler(request, h) {
    const { params, query } = request
    const { id } = params

    const { auditRecords, totalItems } = await readAuditEvents(
      {
        category: AuditEventMessageCategory.FORM,
        entityId: id
      },
      query
    )

    return h.queryResponse(auditRecords, totalItems, query)
  },
  options: {
    auth: false,
    validate: {
      params: Joi.object().keys({
        id: idSchema
      }),
      query: Joi.object().keys({
        page: paginationOptionFields.page,
        perPage: paginationOptionFields.perPage
          .default(DEFAULT_PER_PAGE)
          .max(MAX_RESULTS)
      })
    }
  }
}

/**
 * @typedef {object} RequestAuditParams
 * @property {string} id - The form ID
 */

/**
 * @typedef {Request<{ Params: RequestAuditParams; Query: PaginationOptions }>} RequestAuditById
 */

/**
 * @import { Request, ServerRoute } from '@hapi/hapi'
 * @import { AuditRecord, PaginationOptions } from '@defra/forms-model'
 * @import { ExtendedResponseToolkit } from '~/src/plugins/query-handler/types.js'
 */
