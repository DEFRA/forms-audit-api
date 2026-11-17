import {
  AuditEventMessageType,
  CopyAnswersMetricName,
  FormMetricName,
  FormMetricType,
  FormStatus,
  FunctionalAreaType,
  SigninMetricName
} from '@defra/forms-model'
import { MongoMemoryServer } from 'mongodb-memory-server'

import { config } from '~/src/config/index.js'
import { WELSH } from '~/src/constants.js'
import { logger } from '~/src/helpers/logging/logger.js'
import {
  AUDIT_RECORDS_COLLECTION_NAME,
  client,
  prepareDb
} from '~/src/mongo.js'
import { saveFunctionalAreaTimelineMetrics } from '~/src/repositories/metrics-func-area-repository.js'
import { saveFormTimelineMetrics } from '~/src/repositories/metrics-repository.js'
import {
  allowedCopyAnswersMetricNames,
  collectCopyAnswersMetricsFromAudit
} from '~/src/service/metrics-copy-answers.js'
import { recalcFunctionalAreaMetrics } from '~/src/service/metrics-helper.js'
import {
  collectSigninMetricsFromAudit,
  recalcSigninMetrics
} from '~/src/service/metrics-signin.js'
import {
  collectTimelineMetricsFromAudit,
  recalcFormMetrics
} from '~/src/service/metrics.js'

describe('metrics reporting periods with MongoDB', () => {
  /** @type {MongoMemoryServer | undefined} */
  let server
  /** @type {import('mongodb').ClientSession | undefined} */
  let session
  /** @type {import('mongodb').MongoClient | undefined} */
  let databaseClient
  let auditCount = 0
  const originalMongoUri = config.get('mongo.uri')

  /** @returns {import('mongodb').ClientSession} */
  function getSession() {
    if (!session) {
      throw new Error('MongoDB session was not initialized')
    }
    return session
  }

  beforeAll(async () => {
    server = await MongoMemoryServer.create()
    config.set('mongo.uri', server.getUri())
    const database = await prepareDb(logger)
    databaseClient = client
    session = client.startSession()

    /** @type {{ type: string, createdAt: Date, entityId: string, messageId: string, data?: { formId: string, changes: { new: { allowCopy: boolean } } } }[]} */
    const records = []
    const welshFormIds = new Set()
    /**
     * @param {string} type
     * @param {Date} createdAt
     * @param {{ formId: string, changes: { new: { allowCopy: boolean } } }} [data]
     */
    function addRecord(type, createdAt, data) {
      const id = records.length
      records.push({
        type,
        createdAt,
        entityId: `form-${id}`,
        messageId: `message-${id}`,
        ...(data ? { data } : {})
      })
      return `form-${id}`
    }

    // One form event per day, stretching back nearly six months.
    for (let daysAgo = 0; daysAgo < 170; daysAgo++) {
      const formId = addRecord(
        AuditEventMessageType.FORM_CREATED,
        new Date(2026, 5, 30 - daysAgo, 12)
      )
      if (daysAgo % 20 === 0) {
        welshFormIds.add(formId)
      }
    }

    /** @type {Array<[AuditEventMessageType, Date]>} */
    const boundaries = [
      [
        AuditEventMessageType.IDENTITY_SIGN_IN_SUCCESSFUL,
        new Date(2026, 5, 24)
      ],
      [
        AuditEventMessageType.IDENTITY_TOO_MANY_OTPS_REQUESTED,
        new Date(2026, 5, 17)
      ],
      [
        AuditEventMessageType.IDENTITY_INCORRECT_CODE_ENTERED,
        new Date(2026, 5, 1)
      ],
      [AuditEventMessageType.IDENTITY_ACCOUNT_DELETION, new Date(2026, 4, 2)],
      [
        AuditEventMessageType.IDENTITY_EMAIL_ADDRESS_UPDATED,
        new Date(2026, 6, 1)
      ]
    ]

    for (const [type, boundary] of boundaries) {
      for (const offset of [-1, 0, 1]) {
        addRecord(type, new Date(boundary.getTime() + offset))
      }
    }
    for (const boundary of [new Date(2026, 5, 24), new Date(2026, 5, 1)]) {
      for (const offset of [-1, 0, 1]) {
        welshFormIds.add(
          addRecord(
            AuditEventMessageType.FORM_CREATED,
            new Date(boundary.getTime() + offset)
          )
        )
      }
    }
    for (let i = 0; i < 9; i++) {
      addRecord(
        AuditEventMessageType.FORM_UPDATED,
        new Date(2026, 5, i + 1, 12)
      )
    }
    for (const [index, date] of [
      new Date(2026, 2, 1, 12),
      new Date(2026, 4, 2, 12),
      new Date(2026, 5, 1, 12),
      new Date(2026, 5, 24, 12),
      new Date(2026, 5, 30, 12)
    ].entries()) {
      addRecord(AuditEventMessageType.FORM_OPTION_UPDATED, date, {
        formId: `copy-form-${index}`,
        changes: { new: { allowCopy: true } }
      })
    }
    addRecord(
      AuditEventMessageType.FORM_OPTION_UPDATED,
      new Date(2026, 5, 30, 13),
      { formId: 'copy-form-4', changes: { new: { allowCopy: true } } }
    )
    addRecord(
      AuditEventMessageType.FORM_OPTION_UPDATED,
      new Date(2026, 5, 30, 14),
      { formId: 'copy-disabled', changes: { new: { allowCopy: false } } }
    )

    await database.collection(AUDIT_RECORDS_COLLECTION_NAME).insertMany(records)
    auditCount = await database
      .collection(AUDIT_RECORDS_COLLECTION_NAME)
      .countDocuments()

    // Collection queries operate on UTC calendar days, including the day after
    // the report for the exclusive-end boundary events.
    const days = [
      ...new Set(
        records.map(({ createdAt }) => createdAt.toISOString().slice(0, 10))
      )
    ].sort()
    for (const day of days) {
      const date = new Date(`${day}T12:00:00.000Z`)
      await collectTimelineMetricsFromAudit(date, undefined, undefined, session)
      await collectTimelineMetricsFromAudit(
        date,
        WELSH,
        { draftIds: welshFormIds, liveIds: new Set() },
        session
      )
      await collectSigninMetricsFromAudit(date, session)
      await collectCopyAnswersMetricsFromAudit(date, session)
    }

    // Copy Answers submission metrics come from the submissions service,
    // rather than the audit collection.
    for (const [index, [, boundary]] of boundaries.entries()) {
      for (const offset of [-1, 0, 1]) {
        await saveFunctionalAreaTimelineMetrics(
          /** @type {import('@defra/forms-model').FunctionalAreaTimelineMetric & Pick<import('@defra/forms-model').FormTimelineMetric, 'formStatus'>} */ ({
            type: FormMetricType.TimelineMetric,
            metricName: CopyAnswersMetricName.CopyAnswersSubmission,
            formId: 'copy-live',
            formStatus: FormStatus.Live,
            metricValue: 10 ** index,
            createdAt: new Date(boundary.getTime() + offset)
          }),
          session
        )
      }
    }
    await saveFunctionalAreaTimelineMetrics(
      /** @type {import('@defra/forms-model').FunctionalAreaTimelineMetric & Pick<import('@defra/forms-model').FormTimelineMetric, 'formStatus'>} */ ({
        type: FormMetricType.TimelineMetric,
        metricName: CopyAnswersMetricName.CopyAnswersSubmission,
        formId: 'copy-live',
        formStatus: FormStatus.Live,
        metricValue: 5,
        createdAt: new Date(2026, 0, 15, 12)
      }),
      session
    )
    await saveFunctionalAreaTimelineMetrics(
      /** @type {import('@defra/forms-model').FunctionalAreaTimelineMetric & Pick<import('@defra/forms-model').FormTimelineMetric, 'formStatus'>} */ ({
        type: FormMetricType.TimelineMetric,
        metricName: CopyAnswersMetricName.CopyAnswersSubmission,
        formId: 'copy-draft',
        formStatus: FormStatus.Draft,
        metricValue: 4,
        createdAt: new Date(2026, 5, 30, 12)
      }),
      session
    )

    // Unlabelled submission metrics represent all languages; Welsh is a subset.
    for (const [index, [, boundary]] of boundaries.entries()) {
      for (const offset of [-1, 0, 1]) {
        for (const language of [undefined, WELSH]) {
          await saveFormTimelineMetrics(
            'submission-form',
            {
              type: FormMetricType.TimelineMetric,
              formId: 'submission-form',
              formStatus: FormStatus.Live,
              metricName: FormMetricName.Submissions,
              metricValue: (language ? 1 : 2) * 10 ** index,
              createdAt: new Date(boundary.getTime() + offset),
              ...(language ? { language } : {})
            },
            session
          )
        }
      }
    }
    for (const language of [undefined, WELSH]) {
      await saveFormTimelineMetrics(
        'submission-form',
        {
          type: FormMetricType.TimelineMetric,
          formId: 'submission-form',
          formStatus: FormStatus.Live,
          metricName: FormMetricName.Submissions,
          metricValue: language ? 5 : 10,
          createdAt: new Date(2026, 0, 15, 12),
          ...(language ? { language } : {})
        },
        session
      )
    }
  }, 120_000)

  afterAll(async () => {
    if (session) {
      await session.endSession()
    }
    if (databaseClient) {
      await databaseClient.close()
    }
    if (server) {
      await server.stop()
    }
    config.set('mongo.uri', originalMongoUri)
  })

  it('places form creation events in the correct adjacent periods', async () => {
    const totals = await recalcFormMetrics(
      new Date(2026, 5, 30, 12),
      undefined,
      getSession()
    )

    expect(auditCount).toBe(207)
    expect(totals.last7Days?.[FormMetricName.NewFormsCreated]?.count).toBe(9)
    expect(totals.prev7Days?.[FormMetricName.NewFormsCreated]?.count).toBe(8)
    expect(totals.last30Days?.[FormMetricName.NewFormsCreated]?.count).toBe(35)
    expect(totals.prev30Days?.[FormMetricName.NewFormsCreated]?.count).toBe(31)
    expect(totals.allTime?.[FormMetricName.NewFormsCreated]?.count).toBe(176)
  })

  it('keeps Welsh form metrics and submissions separate from all-language totals', async () => {
    const reportDate = new Date(2026, 5, 30, 12)
    const allLanguages = await recalcFormMetrics(
      reportDate,
      undefined,
      getSession()
    )
    const welsh = await recalcFormMetrics(reportDate, WELSH, getSession())
    const welshForm = await recalcFormMetrics(
      reportDate,
      WELSH,
      getSession(),
      'submission-form'
    )

    expect([
      welsh.last7Days?.[FormMetricName.NewFormsCreated]?.count,
      welsh.prev7Days?.[FormMetricName.NewFormsCreated]?.count,
      welsh.last30Days?.[FormMetricName.NewFormsCreated]?.count,
      welsh.prev30Days?.[FormMetricName.NewFormsCreated]?.count,
      welsh.allTime?.[FormMetricName.NewFormsCreated]?.count
    ]).toEqual([3, 1, 7, 2, 15])

    /** @type {Array<[import('@defra/forms-model').FormTotalsMetric, number[]]>} */
    const submissionCases = [
      [allLanguages, [20004, 42, 20466, 4200, 66676]],
      [welsh, [10002, 21, 10233, 2100, 33338]],
      [welshForm, [10002, 21, 10233, 2100, 33338]]
    ]
    for (const [totals, expected] of submissionCases) {
      expect([
        totals.last7Days?.[FormMetricName.Submissions]?.count,
        totals.prev7Days?.[FormMetricName.Submissions]?.count,
        totals.last30Days?.[FormMetricName.Submissions]?.count,
        totals.prev30Days?.[FormMetricName.Submissions]?.count,
        totals.allTime?.[FormMetricName.Submissions]?.count
      ]).toEqual(expected)
    }
  })

  it('assigns sign-in events on both sides of each boundary without overlap', async () => {
    const totals = await recalcSigninMetrics(
      new Date(2026, 5, 30, 12),
      getSession()
    )
    const periods = [
      totals.last7Days,
      totals.prev7Days,
      totals.last30Days,
      totals.prev30Days,
      totals.allTime
    ]
    /** @type {Array<[SigninMetricName, number[]]>} */
    const cases = [
      [SigninMetricName.SuccessfulAuthentication, [2, 1, 3, 0, 3]],
      [SigninMetricName.TooManyCodeRequests, [0, 2, 3, 0, 3]],
      [SigninMetricName.IncorrectCodeEntered, [0, 0, 2, 1, 3]],
      [SigninMetricName.AccountDeletion, [0, 0, 0, 2, 3]],
      [SigninMetricName.EmailAddressUpdate, [1, 0, 1, 0, 3]]
    ]

    for (const [metricName, expected] of cases) {
      expect(
        periods.map((period) =>
          period && metricName in period ? period[metricName].count : 0
        )
      ).toEqual(expected)
    }
  })

  it('places Copy Answers snapshots and live submissions in the correct periods', async () => {
    const totals = await recalcFunctionalAreaMetrics(
      new Date(2026, 5, 30, 12),
      FunctionalAreaType.CopyAnswers,
      allowedCopyAnswersMetricNames,
      getSession()
    )
    const periods = [
      totals.last7Days,
      totals.prev7Days,
      totals.last30Days,
      totals.prev30Days,
      totals.allTime
    ]

    expect(
      periods.map(
        (period) => period?.[CopyAnswersMetricName.CopyAnswersForm].count
      )
    ).toEqual([5, 3, 5, 2, 5])
    expect(
      periods.map(
        (period) => period?.[CopyAnswersMetricName.CopyAnswersSubmission].count
      )
    ).toEqual([10002, 21, 10233, 2100, 33338])
    expect(totals.liveSubmissions).toEqual({ 'copy-live': 33338 })
    expect(totals.draftSubmissions).toEqual({ 'copy-draft': 4 })
  })
})
