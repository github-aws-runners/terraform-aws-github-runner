resource "aws_iam_instance_profile" "s3_sccache_access_profile" {
  name = "ec2_aws_runner_s3_sccache_access_instance_profile"
  role = aws_iam_role.s3_sccache_access_role.name

  # provisioner "local-exec" {
  #   command = "aws iam add-role-to-instance-profile --instance-profile-name runner_instance_profile --role-name runner_role"
  # }
}

resource "aws_iam_role" "s3_sccache_access_role" {
  name               = "s3_sccache_access_role"
  path               = "/"
  assume_role_policy = data.aws_iam_policy_document.sts_ec2_assume_role.json
}

data "aws_iam_policy_document" "sts_ec2_assume_role" {
  statement {
    effect = "Allow"

    principals {
      type        = "Service"
      identifiers = ["ec2.amazonaws.com"]
    }

    actions = ["sts:AssumeRole"]
  }
}

resource "aws_iam_policy_attachment" "s3_access_policy_attachment" {
  policy_arn = "arn:aws:iam::aws:policy/AmazonS3FullAccess"
  roles      = [aws_iam_role.s3_sccache_access_role.name]
  name       = "s3_access_policy_attachment"
}

resource "aws_s3_bucket" "sccache_platform" {
  bucket = "sccache-platform"
}

resource "aws_s3_bucket_policy" "sccache_policy" {
  bucket = aws_s3_bucket.sccache_platform.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Principal = {
          AWS = "*"
        }
        Action = [
          "s3:GetObject",
          "s3:PutObject"
        ]
        Resource = aws_s3_bucket.sccache_platform.arn
      },
      {
        Effect = "Allow"
        Principal = {
          Service = "ec2.amazonaws.com"
        }
        Action = "sts:AssumeRole"
        Resource = aws_iam_role.s3_sccache_access_role.arn
      }
    ]
  })
}

data "aws_iam_policy_document" "s3_access_policy_document" {
  statement {
    effect = "Allow"

    actions = [
      "s3:PutObject",
      "s3:GetObject",
      "s3:ListBucket"
    ]

    resources = [
      aws_s3_bucket.sccache_platform.arn,
      "${aws_s3_bucket.sccache_platform.arn}/*"
    ]
  }
}

resource "aws_iam_role_policy_attachment" "s3_access_policy_attachment" {
  policy_arn = aws_iam_policy.s3_access_policy.arn
  role       = aws_iam_role.s3_sccache_access_role.name
}

resource "aws_iam_policy" "s3_access_policy" {
  name = "s3_access_policy"
  policy = data.aws_iam_policy_document.s3_access_policy_document.json
}
