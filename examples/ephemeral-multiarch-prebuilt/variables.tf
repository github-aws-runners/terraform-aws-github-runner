variable "github_app" {
  description = "GitHub for API usages."

  type = object({
    id         = string
    key_base64 = string
  })
}

variable "environment" {
  description = "Environment name, used as prefix"

  type    = string
  default = "ci"
}

variable "aws_region" {
  description = "AWS region to deploy to"

  type    = string
  default = "eu-west-1"
}

variable "cleanup_org_runners" {
  description = <<EOF
  Configuration for the cleanup lambda function that will clean up runners for the GitHub org.

  `schedule_expression`: is used to configure the schedule for the lambda.
  `state`: state of the cloudwatch event rule. Valid values are `DISABLED`, `ENABLED`, and `ENABLED_WITH_ALL_CLOUDTRAIL_MANAGEMENT_EVENTS`.
  `lambda_memory_size`: lambda memery size limit.
  `lambda_timeout`: timeout for the lambda in seconds.
  `config`: configuration for the lambda function.
    - `githubOrgOwner` (required if enabled): The GitHub org name to clean up runners for.
  EOF
  type = object({
    schedule_expression = optional(string, "rate(1 day)")
    state               = optional(string, "DISABLED")
    lambda_memory_size  = optional(number, 512)
    lambda_timeout      = optional(number, 30)
    config = object({
      githubOrgOwner = string
    })
  })
  default = { config = { githubOrgOwner = "" } }
}
