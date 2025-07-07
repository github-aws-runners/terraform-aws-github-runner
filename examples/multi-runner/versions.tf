terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.27" # ensure backwards compatibility with v5.x
    }
    local = {
      source  = "hashicorp/local"
      version = "~> 2.0"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.0"
    }
  }
  required_version = ">= 1.3.0"
}
