terraform {
  required_version = ">= 1.4"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = ">= 6.33"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.0"
    }
  }
}
