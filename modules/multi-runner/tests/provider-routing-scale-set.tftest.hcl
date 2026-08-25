mock_provider "aws" {
  mock_data "aws_caller_identity" {
    defaults = {
      account_id = "123456789012"
    }
  }

  mock_data "aws_partition" {
    defaults = {
      partition = "aws"
    }
  }

  mock_data "aws_region" {
    defaults = {
      region = "eu-west-1"
    }
  }

  mock_data "aws_iam_policy_document" {
    defaults = {
      json = "{\"Version\":\"2012-10-17\",\"Statement\":[]}"
    }
  }

  mock_resource "aws_iam_role" {
    defaults = {
      arn = "arn:aws:iam::123456789012:role/scale-set-integration"
    }
  }

  mock_resource "aws_ecs_cluster" {
    defaults = {
      arn = "arn:aws:ecs:eu-west-1:123456789012:cluster/scale-set-integration"
    }
  }
}

mock_provider "random" {}
mock_provider "null" {}

variables {
  aws_region = "eu-west-1"
  vpc_id     = "vpc-flat-unused"
  subnet_ids = ["subnet-flat-unused"]

  github_app = {
    id             = "flat-unused"
    key_base64     = "dGVzdA=="
    webhook_secret = "flat-unused"
  }

  lambda_s3_bucket      = "flat-unused"
  webhook_lambda_s3_key = "flat-unused.zip"
  runners_lambda_zip    = "README.md"
  runners_lambda_s3_key = "flat-unused.zip"
  syncer_lambda_s3_key  = "flat-unused.zip"
}

run "rejects_multiple_orchestration_selections" {
  command = plan

  plan_options {
    target = [terraform_data.validate_experimental]
  }

  variables {
    experimental = {
      github = {
        app = {
          id             = "123456"
          key_base64     = "dGVzdA=="
          webhook_secret = "test-secret"
        }
      }
      runner = {
        os           = "linux"
        architecture = "x64"
      }
      orchestration_provider = {
        scale_set = {
          network = {
            vpc_id     = "vpc-controller"
            subnet_ids = ["subnet-controller"]
          }
        }
      }
      compute_provider = {
        aws = {
          ec2 = {
            vpc_id     = "vpc-runners"
            subnet_ids = ["subnet-runners"]
            runner_binaries = {
              enabled = false
            }
          }
        }
      }
      multi_runner_config = {
        invalid = {
          orchestration_provider = {
            webhook = {
              runner = {
                maximum_count = 2
              }
              matcherConfig = {
                labelMatchers = [["linux"]]
              }
            }
            scale_set = {
              github = {
                config_url = "https://github.com/example"
                installation_id_ssm = {
                  name = "/scale-set/installation-id"
                  arn  = "arn:aws:ssm:eu-west-1:123456789012:parameter/scale-set/installation-id"
                }
              }
              name = "invalid"
              id   = 301
            }
          }
          compute_provider = {
            aws = {
              ec2 = {
                instance_types = ["m7i.large"]
                binaries_syncer = {
                  enabled = false
                }
              }
            }
          }
        }
      }
    }
  }

  expect_failures = [terraform_data.validate_experimental]
}

run "rejects_scale_set_without_controller_network" {
  command = plan

  plan_options {
    target = [terraform_data.validate_experimental]
  }

  variables {
    experimental = {
      github = {
        app = {
          id             = "123456"
          key_base64     = "dGVzdA=="
          webhook_secret = "test-secret"
        }
      }
      runner = {
        os           = "linux"
        architecture = "x64"
      }
      compute_provider = {
        aws = {
          ec2 = {
            vpc_id     = "vpc-runners"
            subnet_ids = ["subnet-runners"]
            runner_binaries = {
              enabled = false
            }
          }
        }
      }
      multi_runner_config = {
        scale = {
          orchestration_provider = {
            scale_set = {
              github = {
                config_url = "https://github.com/example"
                installation_id_ssm = {
                  name = "/scale-set/installation-id"
                  arn  = "arn:aws:ssm:eu-west-1:123456789012:parameter/scale-set/installation-id"
                }
              }
              name = "scale"
              id   = 302
            }
          }
          compute_provider = {
            aws = {
              ec2 = {
                instance_types = ["m7i.large"]
                binaries_syncer = {
                  enabled = false
                }
              }
            }
          }
        }
      }
    }
  }

  expect_failures = [terraform_data.validate_experimental]
}

run "rejects_scale_set_with_mutating_termination_watcher" {
  command = plan

  plan_options {
    target = [terraform_data.validate_experimental]
  }

  variables {
    experimental = {
      github = {
        app = {
          id             = "123456"
          key_base64     = "dGVzdA=="
          webhook_secret = "test-secret"
        }
      }
      runner = {
        os           = "linux"
        architecture = "x64"
      }
      orchestration_provider = {
        scale_set = {
          network = {
            vpc_id     = "vpc-controller"
            subnet_ids = ["subnet-controller"]
          }
        }
      }
      compute_provider = {
        aws = {
          ec2 = {
            vpc_id     = "vpc-runners"
            subnet_ids = ["subnet-runners"]
            instance_termination_watcher = {
              enabled                      = true
              enable_runner_deregistration = true
            }
            runner_binaries = {
              enabled = false
            }
          }
        }
      }
      multi_runner_config = {
        scale = {
          orchestration_provider = {
            scale_set = {
              github = {
                config_url = "https://github.com/example"
                installation_id_ssm = {
                  name = "/scale-set/installation-id"
                  arn  = "arn:aws:ssm:eu-west-1:123456789012:parameter/scale-set/installation-id"
                }
              }
              name = "scale"
              id   = 303
            }
          }
          compute_provider = {
            aws = {
              ec2 = {
                instance_types = ["m7i.large"]
                binaries_syncer = {
                  enabled = false
                }
              }
            }
          }
        }
      }
    }
  }

  expect_failures = [terraform_data.validate_experimental]
}

run "webhook_and_scale_set_coexist_with_one_grouped_controller" {
  command = plan

  variables {
    experimental = {
      runner = {
        os           = "linux"
        architecture = "x64"
      }
      github = {
        app = {
          id             = "123456"
          key_base64     = "dGVzdA=="
          webhook_secret = "test-secret"
        }
        enterprise_server = {
          ssl_verify = false
        }
      }
      orchestration_provider = {
        webhook = {
          lambda = {
            artifact = {
              zip = "README.md"
            }
            webhook = {
              artifact = {
                zip = "README.md"
              }
            }
          }
        }
        scale_set = {
          network = {
            vpc_id     = "vpc-controller"
            subnet_ids = ["subnet-controller-a", "subnet-controller-b"]
          }
          tags = {
            Controller = "shared"
          }
        }
      }
      ssm = {
        kms_key_id = "arn:aws:kms:eu-west-1:123456789012:key/11111111-1111-1111-1111-111111111111"
        housekeeper = {
          lambda = {
            artifact = {
              zip = "README.md"
            }
          }
        }
      }
      compute_provider = {
        aws = {
          ec2 = {
            vpc_id     = "vpc-runners"
            subnet_ids = ["subnet-runners"]
            instance_termination_watcher = {
              enabled                      = true
              enable_runner_deregistration = false
              artifact = {
                zip = "README.md"
              }
            }
            runner_binaries = {
              enabled = false
            }
          }
        }
      }
      multi_runner_config = {
        webhook = {
          orchestration_provider = {
            webhook = {
              runner = {
                maximum_count = 2
              }
              github = {
                organization_runners = true
              }
              matcherConfig = {
                labelMatchers = [["self-hosted", "linux", "x64", "webhook"]]
              }
            }
          }
          compute_provider = {
            aws = {
              ec2 = {
                instance_types = ["m7i.large"]
                binaries_syncer = {
                  enabled = false
                }
              }
            }
          }
        }
        scale_a = {
          orchestration_provider = {
            scale_set = {
              github = {
                config_url = "https://github.com/example-a"
                installation_id_ssm = {
                  name        = "/scale-set/a/installation-id"
                  arn         = "arn:aws:ssm:eu-west-1:123456789012:parameter/scale-set/a/installation-id"
                  kms_key_arn = "arn:aws:kms:eu-west-1:123456789012:key/22222222-2222-2222-2222-222222222222"
                }
              }
              name                 = "scale-a"
              id                   = 101
              min_runners          = 1
              max_runners          = 5
              boot_time_in_minutes = 12
              work_folder          = "_work/a"
            }
          }
          compute_provider = {
            aws = {
              ec2 = {
                instance_types = ["m7i.large"]
                binaries_syncer = {
                  enabled = false
                }
              }
            }
          }
        }
        scale_b = {
          orchestration_provider = {
            scale_set = {
              github = {
                config_url = "https://github.com/example-b/repository"
                installation_id_ssm = {
                  name = "/scale-set/b/installation-id"
                  arn  = "arn:aws:ssm:eu-west-1:123456789012:parameter/scale-set/b/installation-id"
                }
              }
              name        = "scale-b"
              id          = 102
              max_runners = 8
            }
          }
          compute_provider = {
            aws = {
              ec2 = {
                instance_types = ["m7i.xlarge"]
                binaries_syncer = {
                  enabled = false
                }
              }
            }
          }
        }
      }
    }
  }

  assert {
    condition = (
      toset(keys(local.webhook_runner_config)) == toset(["webhook"]) &&
      toset(keys(local.scale_set_runner_config)) == toset(["scale_a", "scale_b"]) &&
      toset(keys(aws_sqs_queue.queued_builds)) == toset(["webhook"]) &&
      toset(keys(local.runner_matcher_config)) == toset(["webhook"])
    )
    error_message = "Webhook queues and matcher routing must contain only webhook selections while scale-set selections remain in their own aggregate."
  }

  assert {
    condition = (
      length(module.orchestration_scale_set) == 1 &&
      toset(keys(module.orchestration_scale_set[0].controller_groups)) == toset(["ec2"]) &&
      toset(module.orchestration_scale_set[0].controller_groups["ec2"].runner_configs) == toset(["scale_a", "scale_b"]) &&
      toset(keys(local.scale_set_compute_provider_contracts)) == toset(["scale_a", "scale_b"])
    )
    error_message = "Multi-runner must call one scale-set orchestration module and allow it to group all selected runner configs across runner-config children."
  }

  assert {
    condition = (
      local.scale_set_runner_configs.scale_a.scale_set.boot_time_in_minutes == 12 &&
      local.scale_set_runner_configs.scale_b.scale_set.boot_time_in_minutes == 10 &&
      !local.scale_set_runner_configs.scale_a.github.ssl_verify &&
      local.scale_set_runner_configs.scale_a.github.app.installation_id.name == "/scale-set/a/installation-id" &&
      local.scale_set_runner_configs.scale_a.github.app.app_id.kms_key_arn == "arn:aws:kms:eu-west-1:123456789012:key/11111111-1111-1111-1111-111111111111" &&
      local.scale_set_runner_configs.scale_a.github.app.installation_id.kms_key_arn == "arn:aws:kms:eu-west-1:123456789012:key/22222222-2222-2222-2222-222222222222" &&
      local.scale_set_compute_provider_contracts.scale_a.type == "ec2" &&
      local.scale_set_compute_provider_contracts.scale_a.capabilities.scale_set != null
    )
    error_message = "Per-runner scale-set identity, capacity, boot timeout, credentials, and exact compute capabilities must reach the aggregated controller contract."
  }

  assert {
    condition = (
      output.runners_map_v2.scale_a.scale_up == null &&
      output.runners_map_v2.scale_a.scale_down == null &&
      output.runners_map_v2.scale_a.pool == null &&
      output.runners_map_v2.scale_a.orchestration_provider.webhook == null &&
      output.runners_map_v2.scale_a.orchestration_provider.scale_set != null &&
      output.runners_map_v2.webhook.orchestration_provider.scale_set == null &&
      output.scale_set != null &&
      output.scale_set.controller_groups["ec2"] != null
    )
    error_message = "Scale-set runners must keep webhook aliases null while grouped controller resources are exposed separately without changing runners_map_v2 entry shape."
  }

  assert {
    condition = (
      length(module.instance_termination_watcher) == 1 &&
      !local.translated_experimental.compute_provider.aws.ec2.instance_termination_watcher.enable_runner_deregistration
    )
    error_message = "Mixed webhook and scale-set deployments may retain the shared termination watcher only in metrics-only mode."
  }
}

run "only_scale_set_keeps_shared_ingress_and_supports_custom_groups" {
  command = plan

  variables {
    experimental = {
      runner = {
        os           = "linux"
        architecture = "x64"
      }
      github = {
        app = {
          id             = "123456"
          key_base64     = "dGVzdA=="
          webhook_secret = "test-secret"
        }
      }
      orchestration_provider = {
        webhook = {
          lambda = {
            webhook = {
              artifact = {
                zip = "README.md"
              }
            }
          }
        }
        scale_set = {
          grouping = {
            strategy = "custom"
            custom = {
              groups = {
                general = {
                  runner_configs = ["scale_a"]
                }
                isolated = {
                  runner_configs = ["scale_b"]
                }
              }
            }
          }
          network = {
            vpc_id     = "vpc-controller"
            subnet_ids = ["subnet-controller"]
          }
        }
      }
      ssm = {
        housekeeper = {
          lambda = {
            artifact = {
              zip = "README.md"
            }
          }
        }
      }
      compute_provider = {
        aws = {
          ec2 = {
            vpc_id     = "vpc-runners"
            subnet_ids = ["subnet-runners"]
            runner_binaries = {
              enabled = false
            }
          }
        }
      }
      multi_runner_config = {
        scale_a = {
          orchestration_provider = {
            scale_set = {
              github = {
                config_url = "https://github.com/example-a"
                installation_id_ssm = {
                  name = "/scale-set/a/installation-id"
                  arn  = "arn:aws:ssm:eu-west-1:123456789012:parameter/scale-set/a/installation-id"
                }
              }
              name = "scale-a"
              id   = 201
            }
          }
          compute_provider = {
            aws = {
              ec2 = {
                instance_types = ["m7i.large"]
                binaries_syncer = {
                  enabled = false
                }
              }
            }
          }
        }
        scale_b = {
          orchestration_provider = {
            scale_set = {
              github = {
                config_url = "https://github.com/example-b"
                installation_id_ssm = {
                  name = "/scale-set/b/installation-id"
                  arn  = "arn:aws:ssm:eu-west-1:123456789012:parameter/scale-set/b/installation-id"
                }
              }
              name = "scale-b"
              id   = 202
            }
          }
          compute_provider = {
            aws = {
              ec2 = {
                instance_types = ["m7i.large"]
                binaries_syncer = {
                  enabled = false
                }
              }
            }
          }
        }
      }
    }
  }

  assert {
    condition = (
      length(local.webhook_runner_config) == 0 &&
      length(aws_sqs_queue.queued_builds) == 0 &&
      length(local.runner_matcher_config) == 0 &&
      output.webhook != null &&
      toset(keys(module.orchestration_scale_set[0].controller_groups)) == toset(["general", "isolated"])
    )
    error_message = "A scale-set-only deployment must create no webhook runner queues, retain the unconditional shared ingress, and honor custom cross-runner grouping."
  }
}
