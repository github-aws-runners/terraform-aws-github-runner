resource "terraform_data" "computed" {
  input = {
    external_cluster_arn = "arn:aws:ecs:eu-west-1:123456789012:cluster/external"
    github_config_url    = "https://github.com/example"
    scale_set_id         = 901
    app_id_arn           = "arn:aws:ssm:eu-west-1:123456789012:parameter/github/computed/app-id"
    private_key_arn      = "arn:aws:ssm:eu-west-1:123456789012:parameter/github/computed/private-key"
    installation_id_arn  = "arn:aws:ssm:eu-west-1:123456789012:parameter/github/computed/installation-id"
    kms_key_arn          = "arn:aws:kms:eu-west-1:123456789012:key/33333333-3333-3333-3333-333333333333"
    launch_template_name = "lt-computed"
    action               = "ec2:RunInstances"
    resource             = "arn:aws:ec2:eu-west-1:123456789012:launch-template/lt-computed"
  }
}

module "subject" {
  source = "../../.."

  prefix = "computed-test"

  runner_configs = {
    computed = {
      github = {
        config_url = terraform_data.computed.output.github_config_url
        app = {
          app_id = {
            name = "/github/computed/app-id"
            arn  = terraform_data.computed.output.app_id_arn
          }
          private_key = {
            name        = "/github/computed/private-key"
            arn         = terraform_data.computed.output.private_key_arn
            kms_key_arn = terraform_data.computed.output.kms_key_arn
          }
          installation_id = {
            name = "/github/computed/installation-id"
            arn  = terraform_data.computed.output.installation_id_arn
          }
        }
      }
      scale_set = {
        id              = terraform_data.computed.output.scale_set_id
        name            = "computed"
        runner_group_id = null
      }
    }
  }

  compute_provider_contracts = {
    computed = {
      type = "ec2"
      capabilities = {
        scale_set = {
          configuration_json = jsonencode({
            region                 = "eu-west-1"
            environment            = "computed-test"
            runnerOwner            = "example"
            runnerType             = "Org"
            runnerNamePrefix       = "computed-"
            jitConfigParameterPath = "/computed-test/runners/tokens"
            subnets                = ["subnet-12345678"]
            launchTemplateName     = terraform_data.computed.output.launch_template_name
            ec2instanceCriteria = {
              instanceTypes              = ["m7i.large"]
              targetCapacityType         = "on-demand"
              instanceAllocationStrategy = "lowest-price"
            }
            scaleErrors = []
          })
          iam_statements = {
            run_instances = {
              actions   = [terraform_data.computed.output.action]
              resources = [terraform_data.computed.output.resource]
            }
          }
        }
      }
    }
  }

  ecs = {
    cluster = {
      mode = "external"
      arn  = terraform_data.computed.output.external_cluster_arn
    }
  }

  network = {
    vpc_id     = "vpc-12345678"
    subnet_ids = ["subnet-12345678"]
  }
}

output "controller_groups" {
  value = module.subject.controller_groups
}

output "cluster" {
  value = module.subject.cluster
}

output "reconciler_config_parameters" {
  value = module.subject.reconciler_config_parameters
}
