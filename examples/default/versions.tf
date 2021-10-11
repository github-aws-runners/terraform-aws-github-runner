terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = ">= 3.27"
    }
    local = {
      source = "hashicorp/local"
    }
    random = {
      source = "hashicorp/random"
    }
  }
  required_version = ">= 0.14"
}
