resource "aws_iam_role" "oidc_role" {
  name = "oidc-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17",
    Statement = [
      {
        Effect = "Allow",
        Action = "sts:AssumeRoleWithWebIdentity",
        Principal = {
          Federated = aws_iam_openid_connect_provider.github_oidc.arn
        },
        Condition = {
          StringEquals = {
            "token.actions.githubusercontent.com:aud" = "sts.amazonaws.com"
          }
          StringLike = {
            "token.actions.githubusercontent.com:sub" = "repo:dashpay/platform:*"
          }
        }
      },
    ]
  })
}

resource "aws_iam_openid_connect_provider" "github_oidc" {
  url      = "https://token.actions.githubusercontent.com"
  client_id_list = ["sts.amazonaws.com"]
  thumbprint_list = ["ffffffffffffffffffffffffffffffffffffffff"]
  tags            = local.tags
}

output "role" {
  value = aws_iam_role.oidc_role.arn
}
