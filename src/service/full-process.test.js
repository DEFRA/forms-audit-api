// import { logger } from '~/src/helpers/logging/logger.js'
import {
  getJsonFromManager,
  getJsonFromSubmissions
} from '~/src/service/metrics-call-wrapper.js'
import { runMetricsCollectionJob } from '~/src/service/metrics-job.js'
import { clearMetricsDatabase, generateReport } from '~/src/service/metrics.js'
import {
  buildMockManagerData,
  buildMockSubmissionData
} from '~/test/helpers/mock-submission-data.js'
import { setupIntegrationDb } from '~/test/helpers/mongo-memory.js'
import { seedMetricsRecords } from '~/test/helpers/seed-audit-records.js'

jest.mock('~/src/helpers/logging/logger.js')
jest.mock('~/src/service/metrics-call-wrapper.js')

setupIntegrationDb()

// Route mocked logger calls to the console so they show with --silent=false
// jest.mocked(logger.info).mockImplementation((...args) => console.log(...args))
// jest.mocked(logger.error).mockImplementation((...args) => console.error(...args))

describe('Full process', () => {
  it('should populate full metrics records, then read the report', async () => {
    const mockSubmissionsData = buildMockSubmissionData()
    mockSubmissionsData.forEach((data) =>
      // @ts-expect-error - partial mock of test data
      jest.mocked(getJsonFromSubmissions).mockResolvedValueOnce({ body: data })
    )

    const mockManagerData = buildMockManagerData()
    // @ts-expect-error - partial mock of test data
    jest.mocked(getJsonFromManager).mockResolvedValue(mockManagerData)

    await clearMetricsDatabase()
    // Force collection job to only run from June onwards - for speed of testing
    await seedMetricsRecords()

    // Run the metrcs collection
    await expect(runMetricsCollectionJob()).resolves.not.toThrow()

    // Read back the metrics report and compare the results
    const metrics = await generateReport({})
    expect(metrics.totals.allTime).toEqual({
      FormsFirstPublished: {
        count: 2
      },
      FormsInDraft: {
        count: 2
      },
      FormsRePublished: {
        count: 1
      },
      NewFormsCreated: {
        count: 4
      },
      Submissions: {
        count: 13
      },
      TimeToPublish: {
        count: 13.5
      }
    })
    expect(metrics.overview).toHaveLength(6)
    expect(metrics.overview[0]).toEqual({
      featureMetrics: {
        questionTypes: {
          DeclarationField: 1
        },
        features: {
          'Email confirmation': 1,
          'Declaration field': 1
        },
        formStructure: {
          pages: 5,
          questions: 12,
          sections: 2,
          conditions: 1,
          questionTypes: 7
        }
      },
      summaryMetrics: {
        name: 'Form 1',
        slug: 'form-1',
        organisation: 'Defra',
        status: 'draft',
        pages: 5,
        questionTypes: 7,
        conditions: 1,
        sections: 2,
        features: ['Email confirmation', 'Declaration field'],
        daysToPublish: undefined,
        republished: undefined
      },
      formId: 'form-id-1',
      formName: 'Form 1',
      formStatus: 'draft',
      submissionsCount: 2
    })

    expect(metrics.overview[1].formId).toBe('form-id-1')
    expect(metrics.overview[1].formName).toBe('Form 1')
    expect(metrics.overview[1].formStatus).toBe('live')
    // Doesn't seem to be calculating submissions
    expect(metrics.overview[1].submissionsCount).toBe(8)

    expect(metrics.overview[2].formId).toBe('form-id-2')
    expect(metrics.overview[2].formName).toBe('Form 2')
    expect(metrics.overview[2].formStatus).toBe('draft')
    expect(metrics.overview[2].submissionsCount).toBe(3)

    expect(metrics.overview[3].formId).toBe('form-id-3')
    expect(metrics.overview[3].formName).toBe('Form 3')
    expect(metrics.overview[3].formStatus).toBe('draft')
    expect(metrics.overview[3].submissionsCount).toBe(0)

    expect(metrics.overview[4].formId).toBe('form-id-welsh')
    expect(metrics.overview[4].formName).toBe('Form Welsh')
    expect(metrics.overview[4].formStatus).toBe('draft')
    expect(metrics.overview[4].submissionsCount).toBe(1)

    expect(metrics.overview[5].formId).toBe('form-id-welsh')
    expect(metrics.overview[5].formName).toBe('Form Welsh')
    expect(metrics.overview[5].formStatus).toBe('live')
    expect(metrics.overview[5].submissionsCount).toBe(5)

    expect(metrics.totals.daysToPublish).toEqual({
      'form-id-1': 8,
      'form-id-welsh': 19
    })
    expect(metrics.totals.earliestDate).toEqual(
      new Date('2026-07-18T12:00:00.000Z')
    )
    expect(metrics.totals.liveSubmissions).toEqual({
      'form-id-1': 8,
      'form-id-welsh': 5
    })
    expect(metrics.totals.draftSubmissions).toEqual({
      'form-id-1': 2,
      'form-id-2': 3,
      'form-id-welsh': 1
    })
  }, 20_000)
})

/**
 * @import { Server } from '@hapi/hapi'
 */
