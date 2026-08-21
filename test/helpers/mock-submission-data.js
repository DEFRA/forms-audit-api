import { differenceInDays } from 'date-fns'

/**
 * Build an array of mock data to emulate the submissions values for metris calculations
 */
export function buildMockSubmissionData() {
  const data = []
  data.push(
    {
      timeline: [
        {
          type: 'timeline-metric',
          formId: 'form-id-1',
          formStatus: 'live',
          metricName: 'Submissions',
          metricValue: 1,
          createdAt: new Date('2026-07-18T12:00:00.000Z')
        },
        {
          type: 'timeline-metric',
          formId: 'form-id-2',
          formStatus: 'draft',
          metricName: 'Submissions',
          metricValue: 3,
          createdAt: new Date('2026-07-19T15:00:00.000Z')
        }
      ]
    },
    { timeline: [] }, // Welsh
    {
      timeline: [
        {
          type: 'timeline-metric',
          formId: 'form-id-1',
          formStatus: 'draft',
          metricName: 'Submissions',
          metricValue: 2,
          createdAt: new Date('2026-07-20T12:00:00.000Z')
        },
        {
          type: 'timeline-metric',
          formId: 'form-id-welsh',
          formStatus: 'live',
          metricName: 'Submissions',
          metricValue: 1,
          createdAt: new Date('2026-07-20T14:00:00.000Z')
        }
      ]
    },
    {
      timeline: [
        {
          type: 'timeline-metric',
          formId: 'form-id-welsh',
          formStatus: 'live',
          metricName: 'Submissions',
          metricValue: 1,
          createdAt: new Date('2026-07-20T14:00:00.000Z'),
          language: 'cy'
        }
      ]
    },
    {
      timeline: [
        {
          type: 'timeline-metric',
          formId: 'form-id-1',
          formStatus: 'live',
          metricName: 'Submissions',
          metricValue: 7,
          createdAt: new Date('2026-07-23T12:00:00.000Z')
        },
        {
          type: 'timeline-metric',
          formId: 'form-id-welsh',
          formStatus: 'live',
          metricName: 'Submissions',
          metricValue: 4,
          createdAt: new Date('2026-07-25T14:00:00.000Z')
        }
      ]
    },
    {
      timeline: [
        {
          type: 'timeline-metric',
          formId: 'form-id-welsh',
          formStatus: 'live',
          metricName: 'Submissions',
          metricValue: 4,
          createdAt: new Date('2026-07-25T14:00:00.000Z'),
          language: 'cy'
        }
      ]
    },
    {
      timeline: [
        {
          type: 'timeline-metric',
          formId: 'form-id-welsh',
          formStatus: 'draft',
          metricName: 'Submissions',
          metricValue: 1,
          createdAt: new Date('2026-07-27T12:00:00.000Z')
        }
      ]
    }, // English
    {
      timeline: [
        {
          type: 'timeline-metric',
          formId: 'form-id-welsh',
          formStatus: 'draft',
          metricName: 'Submissions',
          metricValue: 1,
          createdAt: new Date('2026-07-27T12:00:00.000Z'),
          language: 'cy'
        }
      ]
    }
  )
  for (
    let i = 0;
    i < differenceInDays(new Date(), new Date('2026-06-10T12:00:00.000Z'));
    i++
  ) {
    data.push(
      { timeline: [] }, // For English
      { timeline: [] } // For Welsh
    )
  }
  return data
}

/**
 * Build dummy summary metrics data
 * @param {string} name
 * @param {string} status
 */
function buildSummaryMetrics(name, status) {
  return {
    name,
    slug: name.toLowerCase().replace(' ', '-'),
    organisation: 'Defra',
    status,
    pages: 5,
    questionTypes: 7,
    conditions: 1,
    sections: 2,
    features: ['Email confirmation', 'Declaration field']
  }
}

/**
 * Build dummy feature metrics data
 */
function buildFeatureMetrics() {
  return {
    questionTypes: { DeclarationField: 1 },
    features: { 'Email confirmation': 1, 'Declaration field': 1 },
    formStructure: {
      pages: 5,
      questions: 12,
      sections: 2,
      conditions: 1,
      questionTypes: 7
    }
  }
}

/**
 * Build an array of mock data to emulate the manager form values for metris calculations
 */
export function buildMockManagerData() {
  return {
    body: {
      data: [
        {
          draft: {
            type: 'overview-metric',
            formId: 'form-id-1',
            formStatus: 'draft',
            summaryMetrics: buildSummaryMetrics('Form 1', 'draft'),
            featureMetrics: buildFeatureMetrics(),
            submissionsCount: 0,
            updatedAt: '2026-08-20T11:11:40.182Z'
          },
          live: {
            type: 'overview-metric',
            formId: 'form-id-1',
            formStatus: 'live',
            summaryMetrics: buildSummaryMetrics('Form 1', 'live'),
            featureMetrics: buildFeatureMetrics(),
            submissionsCount: 0,
            updatedAt: '2026-08-20T11:11:40.182Z'
          }
        },
        {
          draft: {
            type: 'overview-metric',
            formId: 'form-id-2',
            formStatus: 'draft',
            summaryMetrics: buildSummaryMetrics('Form 2', 'draft'),
            featureMetrics: buildFeatureMetrics(),
            submissionsCount: 0,
            updatedAt: '2026-08-20T11:11:40.182Z'
          }
        },
        {
          draft: {
            type: 'overview-metric',
            formId: 'form-id-3',
            formStatus: 'draft',
            summaryMetrics: buildSummaryMetrics('Form 3', 'draft'),
            featureMetrics: buildFeatureMetrics(),
            submissionsCount: 0,
            updatedAt: '2026-08-20T11:11:40.182Z'
          }
        },
        {
          draft: {
            type: 'overview-metric',
            formId: 'form-id-welsh',
            formStatus: 'draft',
            summaryMetrics: buildSummaryMetrics('Form Welsh', 'draft'),
            featureMetrics: buildFeatureMetrics(),
            submissionsCount: 0,
            updatedAt: '2026-08-20T11:11:40.182Z'
          },
          live: {
            type: 'overview-metric',
            formId: 'form-id-welsh',
            formStatus: 'live',
            summaryMetrics: buildSummaryMetrics('Form Welsh', 'live'),
            featureMetrics: buildFeatureMetrics(),
            submissionsCount: 0,
            updatedAt: '2026-08-20T11:11:40.182Z'
          }
        }
      ]
    }
  }
}
