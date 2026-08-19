resource "terraform_data" "config_version" {
  triggers_replace = sensitive({
    global_records = sha256(jsonencode(var.global_records))
    entry_records  = sha256(jsonencode(var.entry_records))
  })
}
