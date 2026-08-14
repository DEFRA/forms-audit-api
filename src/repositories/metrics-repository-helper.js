/**
 * Creates a filter to query records with a specific language (or all records if language not provided)
 * @param { string | undefined } language
 */
export function getLanguageFilter(language) {
  return language ? { language } : {}
}

/**
 * Creates a filter to query records with a specific language (or ONLY records that do NOT have a  language property)
 * @param { string | undefined } language
 */
export function getLanguageNoPropertyFilter(language) {
  return language ? { language } : { language: { $exists: false } }
}
