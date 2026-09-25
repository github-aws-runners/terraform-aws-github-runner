terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = ">= 6.33"
    }
    null = {
      source  = "hashicorp/null"
      version = "~> 3.0"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.0"
    }
  }

  required_version = ">= 1.5.6"
}
