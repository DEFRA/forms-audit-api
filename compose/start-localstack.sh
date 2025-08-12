#!/bin/bash
export AWS_REGION=eu-west-2
export AWS_DEFAULT_REGION=eu-west-2
export AWS_ACCESS_KEY_ID=test
export AWS_SECRET_ACCESS_KEY=test

# Forms Audit Service

# S3 Bucket
aws --endpoint-url=http://localhost:4566 s3 mb s3://form-definition-storage
aws --endpoint-url=http://localhost:4566 s3api put-bucket-versioning \
  --bucket form-definition-storage \
  --versioning-configuration Status=Enabled

# topics
aws --endpoint-url=http://localhost:4566 sns create-topic --name forms_manager_events
aws --endpoint-url=http://localhost:4566 sns create-topic --name forms_entitlement_events

# queues
aws --endpoint-url=http://localhost:4566 sqs create-queue --queue-name forms_audit_events
aws --endpoint-url=http://localhost:4566 sqs create-queue --queue-name forms_audit_events-deadletter

# dead letter
aws --endpoint-url=http://localhost:4566 sqs set-queue-attributes \
    --queue-url http://sqs.eu-west-2.127.0.0.1:4566/000000000000/forms_audit_events \
    --attributes '{
    "RedrivePolicy": "{\"deadLetterTargetArn\":\"http://sqs.eu-west-2.127.0.0.1:4566/000000000000/forms_audit_events-deadletter\",\"maxReceiveCount\":\"3\"}",
    "ReceiveMessageWaitTimeSeconds": "20",
    "VisibilityTimeout": "60"
}'

# subscriptions
aws --endpoint-url=http://localhost:4566 sns subscribe --topic-arn "arn:aws:sns:eu-west-2:000000000000:forms_manager_events" \
  --protocol sqs --attributes RawMessageDelivery=true --notification-endpoint "arn:aws:sqs:eu-west-2:000000000000:forms_audit_events"

aws --endpoint-url=http://localhost:4566 sns subscribe --topic-arn "arn:aws:sns:eu-west-2:000000000000:forms_entitlement_events" \
  --protocol sqs --attributes RawMessageDelivery=true --notification-endpoint "arn:aws:sqs:eu-west-2:000000000000:forms_audit_events"
