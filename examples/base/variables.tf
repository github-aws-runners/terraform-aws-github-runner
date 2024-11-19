variable "prefix" {
  description = "Prefix used for resource naming."
  type        = string
  default     = "terraform-gha"
}

variable "aws_region" {
  description = "AWS region to create the VPC, assuming zones `a` and `b` exists."
  type        = string
  default     = "us-east-2"
}
