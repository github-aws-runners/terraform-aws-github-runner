terraform {
  required_providers {
    aws = {
      version = "3.20"
    }
    random = {
      version = "3.1.0"
    }
  }
}


provider "aws" {
  region  = local.aws_region
}

provider "random" {
}
