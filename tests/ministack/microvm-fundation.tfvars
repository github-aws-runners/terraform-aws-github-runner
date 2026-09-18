aws_region = "eu-west-1"

network_connectors = {
  ministack = {
    name       = "ministack"
    vpc_id     = "vpc-0123456789abcdef0"
    subnet_ids = ["subnet-0123456789abcdef0"]
  }
}

artifact_bucket_name = "ministack-microvm-artifacts-eu-west-1"
