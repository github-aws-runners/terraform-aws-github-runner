terraform {
  required_version = ">= 1.10.0"

  required_providers {
    archive = {
      source  = "hashicorp/archive"
      version = "~> 2.7"
    }
    local = {
      source  = "hashicorp/local"
      version = "~> 2.0"
    }
  }
}

locals {
  lambda_source = <<-EOT
    const response = async () => ({ statusCode: 200, body: "ministack" });

    export {
      response as adjustPool,
      response as deregisterRetry,
      response as directWebhook,
      response as dispatchToRunners,
      response as eventBridgeWebhook,
      response as handler,
      response as interruptionWarning,
      response as jobRetryCheck,
      response as scaleDownHandler,
      response as scaleUpHandler,
      response as ssmHousekeeper,
      response as termination,
    };
  EOT
}

resource "local_file" "lambda_source" {
  content         = local.lambda_source
  filename        = "${path.module}/../../.terraform/ministack/index.mjs"
  file_permission = "0644"
}

data "archive_file" "lambda" {
  type        = "zip"
  source_file = local_file.lambda_source.filename
  output_path = "${path.module}/../../.terraform/ministack/lambda.zip"
}

output "lambda_archive" {
  description = "Path to the inert Lambda archive used by the MiniStack apply test."
  value       = data.archive_file.lambda.output_path
}
