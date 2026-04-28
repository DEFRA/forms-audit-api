process.env.NODE_ENV = 'test'
process.env.HOST = '0.0.0.0'
process.env.PORT = '3003'
process.env.SERVICE_VERSION = 'test'
process.env.ENVIRONMENT = 'test'

process.env.LOG_ENABLED = 'false'
process.env.LOG_LEVEL = 'debug'
process.env.LOG_FORMAT = 'pino-pretty'

process.env.MONGO_URI =
  'mongodb://localhost:27017/?replicaSet=rs0&directConnection=true'
process.env.MONGO_DATABASE = 'forms-audit-api'

process.env.HTTP_PROXY = ''
process.env.CDP_HTTPS_PROXY = ''

process.env.ENABLE_SECURE_CONTEXT = 'false'
process.env.ENABLE_METRICS = 'false'

process.env.OIDC_JWKS_URI =
  'http://localhost:5556/.well-known/openid-configuration/jwks'
process.env.OIDC_VERIFY_AUD = 'local-test-client'
process.env.OIDC_VERIFY_ISS = 'http://oidc:80'
process.env.ENTITLEMENT_URL = 'http://localhost:3004'
process.env.MANAGER_URL = 'http://localhost:3001'
process.env.SUBMISSION_URL = 'http://localhost:3002'
process.env.TRACING_HEADER = 'x-cdp-request-id'

process.env.AWS_REGION = 'eu-west-2'
process.env.SQS_ENDPOINT = 'http://localhost:4566'
process.env.EVENTS_SQS_QUEUE_URL =
  'http://sqs.eu-west-2.127.0.0.1:4566/000000000000/forms_audit_events'
process.env.EVENTS_SQS_DLQ_ARN =
  'arn:aws:sqs:eu-west-2:000000000000:forms_audit_events-deadletter'
process.env.RECEIVE_MESSAGE_TIMEOUT_MS = '5000'
process.env.SQS_MAX_NUMBER_OF_MESSAGES = '10'
process.env.SQS_VISIBILITY_TIMEOUT = '30'

process.env.CACHE_ENABLED = 'true'
process.env.METRICS_CRONTAB = '* 3 * * *'
