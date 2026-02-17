import {
  AuditEventMessageCategory,
  idSchema,
  paginationOptionFields
} from '@defra/forms-model'
import Joi from 'joi'

import {
  DEFAULT_PAGE,
  DEFAULT_PER_PAGE,
  MAX_RESULTS
} from '~/src/plugins/query-handler/config.js'
import {
  readAuditEvents,
  readConsolidatedAuditEvents
} from '~/src/service/events.js'

/**
 * @type {ServerRoute}
 */
export default {
  method: 'GET',
  path: '/audit/forms/{id}',
  /**
   * @param {RequestAuditById} request
   * @param {ExtendedResponseToolkit<AuditRecord | ConsolidatedAuditRecord>} h
   */
  async handler(request, h) {
    const { params, query } = request
    const { id } = params
    const { consolidate, page, perPage } = query

    const filter = {
      category: AuditEventMessageCategory.FORM,
      entityId: id
    }

    const pagination = { page, perPage }

    const { auditRecords, totalItems } = consolidate
      ? await readConsolidatedAuditEvents(filter, pagination)
      : await readAuditEvents(filter, pagination)

    return h.queryResponse(auditRecords, totalItems, pagination)
  },
  options: {
    auth: false,
    validate: {
      params: Joi.object().keys({
        id: idSchema
      }),
      query: Joi.object().keys({
        page: paginationOptionFields.page.default(DEFAULT_PAGE),
        perPage: paginationOptionFields.perPage
          .default(DEFAULT_PER_PAGE)
          .max(MAX_RESULTS),
        consolidate: Joi.boolean().default(false)
      })
    }
  }
}

/**
 * @typedef {object} RequestAuditParams
 * @property {string} id - The form ID
 */

/**
 * @typedef {PaginationOptions & { consolidate?: boolean }} AuditQueryOptions
 */

/**
 * @typedef {Request<{ Params: RequestAuditParams; Query: AuditQueryOptions }>} RequestAuditById
 */

/**
 * @import { Request, ServerRoute } from '@hapi/hapi'
 * @import { AuditRecord, ConsolidatedAuditRecord, PaginationOptions } from '@defra/forms-model'
 * @import { ExtendedResponseToolkit } from '~/src/plugins/query-handler/types.js'
 */
