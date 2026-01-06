/**
 * @template T The type of items in the array
 * @typedef {object} QueryHandlerToolkit
 * @property {function(Array<T>, number, PaginationOptions=): AuditQueryResult<T>} queryResponse - Creates a standardised response with pagination and sorting metadata
 */

/**
 * @template T
 * @typedef {ResponseToolkit & QueryHandlerToolkit<T>} ExtendedResponseToolkit
 */

/**
 * @typedef {object} QueryHandlerOptions
 * @property {PaginationOptions} pagination - Options for configuring pagination behavior
 * @property {SortingOptions} sorting - Options for configuring sorting behavior
 */

/**
 * @typedef {object} AuditQueryResultMeta
 * @property {PaginationResult} pagination - Pagination information
 * @property {SortingOptions} sorting - Sorting information
 */

/**
 * Result type for audit API queries. Uses 'auditRecords' instead of 'data'
 * to maintain backward compatibility with existing API consumers.
 * @template T
 * @typedef {object} AuditQueryResult
 * @property {Array<T>} auditRecords - The array of audit records
 * @property {AuditQueryResultMeta} meta - The metadata for the response
 */

/**
 * @import { ResponseToolkit } from '@hapi/hapi'
 * @import { PaginationOptions, PaginationResult, SortingOptions } from '@defra/forms-model'
 */
