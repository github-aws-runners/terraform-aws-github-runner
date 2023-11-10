resource "aws_ecr_repository" "drive" {
  name = "drive"
  tags = var.config.tags
}

resource "aws_ecr_repository" "dapi" {
  name = "dapi"
  tags = var.config.tags
}

resource "aws_ecr_repository" "dashmate-helper" {
  name = "dashmate-helper"
  tags = var.config.tags
}

resource "aws_ecr_lifecycle_policy" "drive" {
  repository = aws_ecr_repository.drive.name

  policy = file("${path.module}/policies/ecr-lifecycle-policy.json")
}

resource "aws_ecr_lifecycle_policy" "dapi" {
  repository = aws_ecr_repository.dapi.name

  policy = file("${path.module}/policies/ecr-lifecycle-policy.json")
}

resource "aws_ecr_lifecycle_policy" "dashmate-helper" {
  repository = aws_ecr_repository.dashmate-helper.name

  policy = file("${path.module}/policies/ecr-lifecycle-policy.json")
}
