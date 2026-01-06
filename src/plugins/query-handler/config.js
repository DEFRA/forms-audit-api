export const MAX_RESULTS = 100
export const DEFAULT_PER_PAGE = 25

/** @satisfies {QueryHandlerOptions} */
export const defaultConfig = {
  pagination: {
    page: 1,
    perPage: DEFAULT_PER_PAGE
  },
  sorting: {
    sortBy: 'createdAt',
    order: 'desc'
  }
}

/**
 * @import { QueryHandlerOptions } from '~/src/plugins/query-handler/types.js'
 */
