data "aws_iam_policy_document" "lambda_assume_role_policy" {
  statement {
    actions = ["sts:AssumeRole"]

    principals {
      type        = "Service"
      identifiers = ["lambda.amazonaws.com"]
    }
  }
}

resource "aws_iam_policy" "ami_id_ssm_parameter_read" {
  count       = var.ami_id_ssm_parameter_name != null ? 1 : 0
  name        = "${var.prefix}-ami-id-ssm-parameter-read"
  path        = local.role_path
  description = "Allows for reading ${var.prefix} GitHub runner AMI ID from an SSM parameter"
  tags        = local.tags
  policy      = <<-JSON
    {
      "Version": "2012-10-17",
      "Statement": [
        {
          "Effect": "Allow",
          "Action": [
            "ssm:GetParameter"
          ],
          "Resource": [
            "arn:${var.aws_partition}:ssm:${var.aws_region}:${data.aws_caller_identity.current.account_id}:parameter/${trimprefix(var.ami_id_ssm_parameter_name, "/")}"
          ]
        }
      ]
    }
  JSON
}

data "aws_iam_policy_document" "lambda_xray" {
  count = var.lambda_tracing_mode != null ? 1 : 0
  statement {
    actions = [
      "xray:BatchGetTraces",
      "xray:GetTraceSummaries",
      "xray:PutTelemetryRecords",
      "xray:PutTraceSegments"
    ]
    effect = "Allow"
    resources = [
      "*"
    ]
    sid = "AllowXRay"
  }
}
