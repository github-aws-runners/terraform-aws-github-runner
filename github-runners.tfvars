aws_region = "us-east-1"

prefix = "gh-ci"

create_service_linked_role_spot = true

enable_organization_runners = true

webhook_lambda_zip = "modules/download-lambda/webhook.zip"

runner_binaries_syncer_lambda_zip = "modules/download-lambda/runner-binaries-syncer.zip"

runners_lambda_zip = "modules/download-lambda/runners.zip"
