variable "table_name" {
  description = "Name of the DynamoDB table"
  type        = string
  default     = "github-runner-config"
}

variable "billing_mode" {
  description = "Billing mode for the DynamoDB table"
  type        = string
  default     = "PAY_PER_REQUEST"
}

variable "tags" {
  description = "Tags to apply to resources"
  type        = map(string)
  default     = {}
}
