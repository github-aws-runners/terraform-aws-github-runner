# Module - Job Retry

This module is listening to a SQS queue where the scale-up lambda publishes messages for jobs that needs to trigger a retry if still queued. The job retry module lambda function is handling the messages, checking if the job is queued. Next for queued jobs a message is published to the build queue for the scale-up lambda. The scale-up lambda will handle the message as any other workflow job event.

## Usages

The module is an inner module and used by the runner module when the opt-in feature for job retry is enabled. The module is not intended to be used standalone.


<!-- BEGIN_TF_DOCS -->

<!-- END_TF_DOCS -->
