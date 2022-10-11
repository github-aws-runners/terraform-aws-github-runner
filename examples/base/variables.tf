variable "prefix" {
  description = "Prefix used for resource naming."
  type        = string
}

variable "aws_region" {
  description = "AWS region to create the VPC, assuming zones `a` and `b` exists."
  type        = string
}
