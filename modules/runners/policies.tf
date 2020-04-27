data "aws_caller_identity" "current" {}

resource "aws_iam_role" "runner" {
  name               = "${var.environment}-github-action-runners-runner-role"
  assume_role_policy = templatefile("${path.module}/policies/instance-role-trust-policy.json", {})
  tags               = local.tags
}

resource "aws_iam_instance_profile" "runner" {
  name = "${var.environment}-github-action-runners-profile"
  role = aws_iam_role.runner.name
}

resource "aws_iam_policy" "runner_session_manager_policy" {
  name        = "${var.environment}-github-action-runners-session-manager"
  path        = "/"
  description = "Policy session manager."

  policy = templatefile("${path.module}/policies/instance-session-manager-policy.json", {})
}

resource "aws_iam_role_policy_attachment" "runner_session_manager_policy" {
  role       = aws_iam_role.runner.name
  policy_arn = aws_iam_policy.runner_session_manager_policy.arn
}

resource "aws_iam_role_policy_attachment" "runner_session_manager_aws_managed" {
  role       = aws_iam_role.runner.name
  policy_arn = "arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore"
}

resource "aws_iam_policy" "ssm_parameters" {
  name        = "${var.environment}-runner-ssm-parameters"
  path        = "/"
  description = "Policy for the runner to download the github action runner."

  policy = templatefile("${path.module}/policies/instance-ssm-parameters-policy.json",
    {
      arn_ssm_parameters = "arn:aws:ssm:${var.aws_region}:${data.aws_caller_identity.current.account_id}:parameter/${var.environment}-*"
    }
  )
}

resource "aws_iam_role_policy_attachment" "ssm_parameters" {
  role       = aws_iam_role.runner.name
  policy_arn = aws_iam_policy.ssm_parameters.arn
}
