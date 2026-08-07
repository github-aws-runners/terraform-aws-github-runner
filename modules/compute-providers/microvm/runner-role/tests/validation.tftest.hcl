mock_provider "aws" {}

run "rejects_empty_trust_services" {
  command = plan

  variables {
    trust_services = []
  }

  expect_failures = [terraform_data.validate_config]
}
