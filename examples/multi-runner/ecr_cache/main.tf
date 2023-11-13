resource "aws_ecr_repository" "drive" {
  name = "drive"
  tags = var.config.tags
}

resource "aws_ecr_repository" "dapi" {
  name = "dapi"
  tags = var.config.tags
}

resource "aws_ecr_repository" "dashmate_helper" {
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

resource "aws_ecr_lifecycle_policy" "dashmate_helper" {
  repository = aws_ecr_repository.dashmate_helper.name

  policy = file("${path.module}/policies/ecr-lifecycle-policy.json")
}
