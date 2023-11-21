variable "lambdas" {
  description = "Name and tag for lambdas to download."
  type = list(object({
    name = string
    tag  = string
  }))
}

variable "custom_trigger" {
  description = "Custom trigger for fetching lambda."
  type        = string
  default     = null
}
