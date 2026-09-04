terraform {
  required_version = ">= 1.4.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = ">= 6.61"
    }
    time = {
      source  = "hashicorp/time"
      version = ">= 0.13"
    }
  }
}
