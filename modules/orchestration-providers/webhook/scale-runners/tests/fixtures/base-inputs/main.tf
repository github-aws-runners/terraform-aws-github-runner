# tflint-ignore: terraform_required_version

# tflint-ignore: terraform_documented_variables
variable "config" {
  type    = any
  default = null
}

# tflint-ignore: terraform_documented_variables
variable "storage_provider" {
  type    = any
  default = null
}

output "config" {
  value = var.config
}

output "storage_provider" {
  value = var.storage_provider
}
