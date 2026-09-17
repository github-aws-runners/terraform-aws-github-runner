terraform {
  required_version = ">= 1.5.6"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = ">= 6.21"
    }

    null = {
      source  = "hashicorp/null"
      version = "~> 3"
    }
  }
}
