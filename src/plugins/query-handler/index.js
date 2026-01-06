import { defaultConfig } from '~/src/plugins/query-handler/config.js'

/** @satisfies {ServerRegisterPluginObject<void>} */
export const queryHandler = {
  plugin: {
    name: 'queryHandler',
    register(server) {
      server.decorate(
        'toolkit',
        'queryResponse',
        /**
         * @template T
         * @param {Array<T>} data
         * @param {number} totalItems
         * @param {PaginationOptions} [options]
         * @returns {AuditQueryResult<T>}
         */
        function (data, totalItems, options) {
          const defaults = {
            page: defaultConfig.pagination.page,
            perPage: defaultConfig.pagination.perPage
          }

          const { page, perPage } = {
            ...defaults,
            ...options
          }

          return {
            auditRecords: data,
            meta: {
              pagination: {
                page,
                perPage,
                totalItems,
                totalPages: Math.ceil(totalItems / perPage)
              },
              sorting: {
                sortBy: defaultConfig.sorting.sortBy,
                order: defaultConfig.sorting.order
              }
            }
          }
        }
      )
    }
  }
}

/**
 * @import { ServerRegisterPluginObject } from '@hapi/hapi'
 * @import { PaginationOptions } from '@defra/forms-model'
 * @import { AuditQueryResult } from '~/src/plugins/query-handler/types.js'
 */
