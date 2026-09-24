resource "terraform_data" "config_version" {
  triggers_replace = sensitive({
    global_records = sha256(jsonencode(var.global_records))
    entry_records  = sha256(jsonencode(var.entry_records))
  })

  lifecycle {
    precondition {
      condition     = toset(keys(var.runner_config_access_scope_prefixes)) == var.entry_ids && alltrue([for prefix in values(var.runner_config_access_scope_prefixes) : trimspace(prefix) != ""])
      error_message = "runner_config_access_scope_prefixes must contain one non-empty prefix for every entry_id."
    }

    precondition {
      condition     = var.runner_state_ttl_seconds > var.runner_config_ttl_seconds && floor(var.runner_state_ttl_seconds) == var.runner_state_ttl_seconds
      error_message = "runner_state_ttl_seconds must be an integer greater than runner_config_ttl_seconds."
    }

    precondition {
      condition     = toset(keys(var.entry_records)) == var.entry_ids
      error_message = "entry_records must contain exactly one durable bootstrap record for every entry_id."
    }
  }
}
