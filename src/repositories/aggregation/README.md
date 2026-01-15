# Audit Event Consolidation

This document explains the MongoDB aggregation pipeline used in [consolidation-aggregation.js](consolidation-aggregation.js).

## What is Consolidation?

When a user edits a form multiple times in succession, each save creates a separate `FORM_UPDATED` audit event. Without consolidation, the audit log becomes cluttered with repetitive entries that don't add meaningful information.

**Consolidation** groups consecutive `FORM_UPDATED` events by the same user into a single entry, showing:

- The most recent event details
- How many events were consolidated (`consolidatedCount`)
- The time range of the consolidated events (`consolidatedFrom` → `consolidatedTo`)

### Example

**Before consolidation** (raw audit log):

```
10:05 - User A - FORM_UPDATED
10:04 - User A - FORM_UPDATED
10:03 - User A - FORM_UPDATED
10:00 - User B - FORM_PUBLISHED
09:55 - User A - FORM_UPDATED
```

**After consolidation**:

```
10:05 - User A - FORM_UPDATED (3 changes, 10:03 → 10:05)
10:00 - User B - FORM_PUBLISHED
09:55 - User A - FORM_UPDATED
```

### What Gets Consolidated

Only consecutive `FORM_UPDATED` events by the **same user** are consolidated. A new group starts when:

- The event type changes (e.g. `FORM_PUBLISHED`)
- A different user made the change
- It's the first record

### Filtering No-Change Events

Before consolidation, records are filtered to remove "no-change" events - where the previous and new values are identical. This happens when a user saves without making actual modifications.

Events pass through if they:

- Are "always valid" types (create, publish, delete, etc.)
- Have no `data` field
- Have different `prev` and `new` values in their data
- Are unknown event types (passed through for safety)

## Pipeline Overview

The pipeline performs these steps:

1. **Filter** - Match base query and filter out no-change records
2. **Detect boundaries** - Use window functions to identify where groups start
3. **Assign groups** - Calculate cumulative group numbers
4. **Consolidate** - Group consecutive events together
5. **Paginate** - Return paginated results with total count

## MongoDB Operators Used

### Query Operators

| Operator  | Purpose                                                        | Docs                                                                         |
| --------- | -------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| `$in`     | Match event types in the "always valid" list                   | [Docs](https://www.mongodb.com/docs/manual/reference/operator/query/in/)     |
| `$nin`    | Exclude known event types (for unknown type handling)          | [Docs](https://www.mongodb.com/docs/manual/reference/operator/query/nin/)    |
| `$exists` | Check if `data` field exists                                   | [Docs](https://www.mongodb.com/docs/manual/reference/operator/query/exists/) |
| `$or`     | Combine multiple match conditions                              | [Docs](https://www.mongodb.com/docs/manual/reference/operator/query/or/)     |
| `$and`    | Combine field existence + change detection                     | [Docs](https://www.mongodb.com/docs/manual/reference/operator/query/and/)    |
| `$expr`   | Use aggregation expressions in `$match` (for field comparison) | [Docs](https://www.mongodb.com/docs/manual/reference/operator/query/expr/)   |

### Aggregation Stages

| Stage              | Purpose                                             | Docs                                                                                        |
| ------------------ | --------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| `$match`           | Filter documents by criteria                        | [Docs](https://www.mongodb.com/docs/manual/reference/operator/aggregation/match/)           |
| `$setWindowFields` | Access previous document's values without self-join | [Docs](https://www.mongodb.com/docs/manual/reference/operator/aggregation/setWindowFields/) |
| `$addFields`       | Add computed `isNewGroup` boolean                   | [Docs](https://www.mongodb.com/docs/manual/reference/operator/aggregation/addFields/)       |
| `$group`           | Consolidate records by group number                 | [Docs](https://www.mongodb.com/docs/manual/reference/operator/aggregation/group/)           |
| `$sort`            | Re-sort after grouping (grouping disrupts order)    | [Docs](https://www.mongodb.com/docs/manual/reference/operator/aggregation/sort/)            |
| `$facet`           | Run parallel pipelines for pagination + count       | [Docs](https://www.mongodb.com/docs/manual/reference/operator/aggregation/facet/)           |
| `$skip`            | Skip records for pagination offset                  | [Docs](https://www.mongodb.com/docs/manual/reference/operator/aggregation/skip/)            |
| `$limit`           | Limit records per page                              | [Docs](https://www.mongodb.com/docs/manual/reference/operator/aggregation/limit/)           |
| `$count`           | Count total matching documents                      | [Docs](https://www.mongodb.com/docs/manual/reference/operator/aggregation/count/)           |

### Aggregation Expressions

| Operator | Purpose                                                | Docs                                                                                                        |
| -------- | ------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------- |
| `$shift` | Access previous record's fields (within window)        | [Docs](https://www.mongodb.com/docs/manual/reference/operator/aggregation/shift/)                           |
| `$sum`   | Count records in group / running sum for group numbers | [Docs](https://www.mongodb.com/docs/manual/reference/operator/aggregation/sum/)                             |
| `$first` | Get first (newest) record in group                     | [Docs](https://www.mongodb.com/docs/manual/reference/operator/aggregation/first/)                           |
| `$last`  | Get last (oldest) record's timestamp in group          | [Docs](https://www.mongodb.com/docs/manual/reference/operator/aggregation/last/)                            |
| `$ne`    | Check if two values are not equal                      | [Docs](https://www.mongodb.com/docs/manual/reference/operator/aggregation/ne/)                              |
| `$eq`    | Check if value equals null                             | [Docs](https://www.mongodb.com/docs/manual/reference/operator/aggregation/eq/)                              |
| `$cond`  | Conditional: return 1 if new group, else 0             | [Docs](https://www.mongodb.com/docs/manual/reference/operator/aggregation/cond/)                            |
| `$$ROOT` | Reference entire current document                      | [Docs](https://www.mongodb.com/docs/manual/reference/aggregation-variables/#mongodb-variable-variable.ROOT) |

## Key Logic Explained

### Detecting Group Boundaries

A new consolidation group starts when **any** of these are true:

- Event type is NOT `FORM_UPDATED`
- Previous event type was NOT `FORM_UPDATED`
- User changed from previous record
- It's the first record (no previous)

```js
isNewGroup: {
  $or: [
    { $ne: ['$type', 'FORM_UPDATED'] },
    { $eq: ['$prevUserId', null] },
    { $ne: ['$createdBy.id', '$prevUserId'] },
    { $ne: ['$prevType', 'FORM_UPDATED'] }
  ]
}
```

### Assigning Group Numbers

Uses a **running sum** over the `isNewGroup` boolean (converted to 1/0). Each time `isNewGroup` is true, the sum increments, giving each group a unique number.

```js
$setWindowFields: {
  sortBy: { createdAt: -1 },
  output: {
    groupNumber: {
      $sum: { $cond: ['$isNewGroup', 1, 0] },
      window: { documents: ['unbounded', 'current'] }
    }
  }
}
```

### Pagination with Facet

`$facet` runs two sub-pipelines in parallel on the same dataset:

- `metadata`: Counts total items for pagination info
- `records`: Applies `$skip` and `$limit` for the current page

This avoids running two separate queries.

## Temporary Fields

These fields are added during aggregation and removed from final results:

| Field         | Purpose                                            |
| ------------- | -------------------------------------------------- |
| `prevUserId`  | Previous record's user ID (for boundary detection) |
| `prevType`    | Previous record's event type                       |
| `isNewGroup`  | Boolean marking group boundaries                   |
| `groupNumber` | Numeric group identifier                           |
