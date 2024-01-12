terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.27"
    }
  }
  required_version = ">= 1"
}
