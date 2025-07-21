terraform {
  required_version = ">= 1.3"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = ">= 5.77"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.0"
    }
  }
}
