# tflint-ignore: terraform_required_version

# tflint-ignore: terraform_documented_variables
variable "storage_provider" {
  type    = any
  default = null
}

# tflint-ignore: terraform_documented_variables
variable "runner_provider" {
  type    = any
  default = null
}

output "storage_provider" {
  value = var.storage_provider
}

output "runner_provider" {
  value = var.runner_provider
}
