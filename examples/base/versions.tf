terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = ">= 6.21" # ensure backwards compatibility with v6.x
    }
  }
  required_version = ">= 1"
}
