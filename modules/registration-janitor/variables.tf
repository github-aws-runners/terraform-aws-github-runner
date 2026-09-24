variable "config" {
  description = "Opt-in GitHub registration cleanup for EC2 runners. The name prefix must be exclusive to this AWS account within the configured groups; regions must include every region using it."
  type = object({
    prefix              = string
    organization        = string
    runner_group_ids    = set(number)
    runner_name_prefix  = string
    regions             = set(string)
    dry_run             = optional(bool, true)
    max_candidates      = optional(number, 100)
    schedule_expression = optional(string, "rate(30 minutes)")
    schedule_state      = optional(string, "ENABLED")
    ghes_api_url        = optional(string, "")
    github_app_parameters = object({
      id                            = object({ name = string, arn = string })
      key_base64                    = object({ name = string, arn = string })
      additional_apps_manifest      = optional(object({ name = string, arn = string }))
      additional_app_parameter_arns = optional(list(string), [])
    })
    github_app_kms_key_arn    = optional(string)
    zip                       = optional(string)
    s3_bucket                 = optional(string)
    s3_key                    = optional(string)
    s3_object_version         = optional(string)
    architecture              = optional(string, "arm64")
    runtime                   = optional(string, "nodejs24.x")
    memory_size               = optional(number, 512)
    timeout                   = optional(number, 300)
    log_level                 = optional(string, "info")
    logging_retention_in_days = optional(number, 30)
    logging_kms_key_id        = optional(string)
    role_path                 = optional(string)
    role_permissions_boundary = optional(string)
    tags                      = optional(map(string), {})
  })

  validation {
    condition     = length(trimspace(var.config.organization)) > 0 && length(trimspace(var.config.runner_name_prefix)) > 0
    error_message = "An organization and a nonempty, account-exclusive runner name prefix are required."
  }
  validation {
    condition     = length(var.config.regions) > 0 && alltrue([for region in var.config.regions : length(trimspace(region)) > 0])
    error_message = "Include every AWS region used by runners with this prefix."
  }
  validation {
    condition     = length(var.config.runner_group_ids) > 0 && alltrue([for id in var.config.runner_group_ids : id > 0 && floor(id) == id])
    error_message = "At least one positive integer runner group ID is required."
  }
  validation {
    condition     = var.config.max_candidates >= 1 && var.config.max_candidates <= 1000 && floor(var.config.max_candidates) == var.config.max_candidates
    error_message = "max_candidates must be an integer between 1 and 1000."
  }
}
