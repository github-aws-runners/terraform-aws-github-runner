locals {
  action_runner_distribution_object_key = "actions-runner-linux.tar.gz"
}

resource "aws_s3_bucket" "action_dist" {
  bucket        = var.distribution_bucket_name
  acl           = "private"
  force_destroy = true
  tags          = var.tags
}
