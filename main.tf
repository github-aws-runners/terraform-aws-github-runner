resource "random_string" "random" {
  length  = 24
  special = false
  upper   = false
}

module "dsitrubtion_cache" {
  source = "./modules/action-runner-binary-cache"

  aws_region  = var.aws_region
  environment = var.environment
  tags        = var.tags

  distribution_bucket_name = "${var.environment}-dist-${random_string.random.result}"
}

module "runners" {
  source = "./modules/runners"

  aws_region  = var.aws_region
  vpc_id      = var.vpc_id
  environment = var.environment
  tags        = var.tags

  s3_location_runner_distribution = module.dsitrubtion_cache.s3_location_runner_distribution
}


resource "aws_iam_policy" "dist_bucket" {
  name        = "${var.environment}-gh-distribution-bucket"
  path        = "/"
  description = "Policy for the runner to download the github action runner."

  policy = templatefile("${path.module}/policies/action-runner-s3-policy.json",
    {
      s3_arn = module.dsitrubtion_cache.distribution_bucket.arn
    }
  )
}

resource "aws_iam_role_policy_attachment" "dist_bucket" {
  role       = module.runners.role.name
  policy_arn = aws_iam_policy.dist_bucket.arn
}

resource "aws_resourcegroups_group" "resourcegroups_group" {
  name = "${var.environment}-group"

  resource_query {
    query = <<-JSON
{
  "ResourceTypeFilters": [
    "AWS::AllSupported"
  ],
  "TagFilters": [
    {
      "Key": "Environment",
      "Values": ["${var.environment}"]
    }
  ]
}
  JSON
  }
}
