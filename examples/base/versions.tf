terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = ">= 5.27" # ensure backwards compatibility with v5.x
    }
  }
  required_version = ">= 1"
}
