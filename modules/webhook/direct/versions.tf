terraform {
  required_version = ">= 1.3.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = ">= 5.27"
    }

    null = {
      source  = "hashicorp/null"
      version = "~> 3.2"
    }
  }
}
