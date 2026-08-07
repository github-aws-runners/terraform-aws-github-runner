mock_provider "aws" {
  mock_data "aws_iam_policy_document" {
    defaults = {
      json = "{\"Version\":\"2012-10-17\",\"Statement\":[]}"
    }
  }
}

run "returns_ec2_assume_role_policy" {
  command = plan

  assert {
    condition     = toset(data.aws_iam_policy_document.assume_role.statement[0].actions) == toset(["sts:AssumeRole"])
    error_message = "The EC2 runner role must allow sts:AssumeRole."
  }

  assert {
    condition = anytrue([
      for principal in data.aws_iam_policy_document.assume_role.statement[0].principals :
      principal.type == "Service" && toset(principal.identifiers) == toset(["ec2.amazonaws.com"])
    ])
    error_message = "The EC2 runner role must trust the EC2 service principal."
  }

  assert {
    condition     = output.assume_role_policy == data.aws_iam_policy_document.assume_role.json
    error_message = "The EC2 runner-role contract must return its rendered assume-role policy."
  }
}
