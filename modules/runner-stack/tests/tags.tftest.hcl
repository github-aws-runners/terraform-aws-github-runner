mock_provider "aws" {
  mock_data "aws_iam_policy_document" {
    defaults = {
      json = "{\"Version\":\"2012-10-17\",\"Statement\":[]}"
    }
  }

  mock_resource "aws_iam_role" {
    defaults = {
      arn = "arn:aws:iam::123456789012:role/runner-test"
    }
  }

  mock_resource "aws_ssm_parameter" {
    defaults = {
      arn = "arn:aws:ssm:eu-west-1:123456789012:parameter/github-runner/config"
    }
  }
}

variables {
  aws_region = "eu-west-1"

  tags = {
    precedence = "module"
    module     = "yes"
  }

  compute_provider = {
    type = "ec2"
    ec2 = {
      vpc_id         = "vpc-12345678"
      subnet_ids     = ["subnet-12345678"]
      instance_types = ["m5.large"]
      ami = {
        filter = { state = ["available"] }
        owners = ["amazon"]
        id_ssm_parameter = {
          arn = "arn:aws:ssm:eu-west-1:123456789012:parameter/github-runner/external-ami-id"
        }
        kms_key = null
      }
      binaries_syncer = {
        s3 = {
          arn = "arn:aws:s3:::my-bucket"
          id  = "my-bucket"
          key = "runners/linux/actions-runner.tar.gz"
        }
      }
    }
  }

  runner = {
    labels = ["self-hosted", "linux", "x64"]
    tags = {
      precedence = "runner"
      runner     = "yes"
    }
  }

  queue = {
    build = {
      arn = "arn:aws:sqs:eu-west-1:123456789012:build-queue"
      url = "https://sqs.eu-west-1.amazonaws.com/123456789012/build-queue"
    }
    tags = {
      precedence = "queue"
      queue      = "yes"
    }
  }

  lambda = {
    s3 = {
      bucket = "my-lambda-bucket"
      key    = "runners.zip"
    }
    tags = {
      precedence = "lambda"
      lambda     = "yes"
    }
  }

  github = {
    organization_runners = true
    app_parameters = {
      key_base64 = {
        name = "/github-runner/key-base64"
        arn  = "arn:aws:ssm:eu-west-1:123456789012:parameter/github-runner/key-base64"
      }
      id = {
        name = "/github-runner/app-id"
        arn  = "arn:aws:ssm:eu-west-1:123456789012:parameter/github-runner/app-id"
      }
    }
  }

  scale_up = {
    tags = {
      precedence = "scale-up"
      scale_up   = "yes"
    }
  }

  scale_down = {
    tags = {
      precedence = "scale-down"
      scale_down = "yes"
    }
  }

  pool = {
    config = [{
      schedule_expression = "cron(0 8 * * ? *)"
      size                = 1
    }]
    tags = {
      precedence = "pool"
      pool       = "yes"
    }
  }

  job_retry = {
    enabled = true
    tags = {
      precedence = "job-retry"
      job_retry  = "yes"
    }
  }

  ssm = {
    paths = {
      root   = "/github-runner"
      tokens = "tokens"
      config = "config"
    }
    tags = {
      precedence = "ssm"
      ssm        = "yes"
    }
    parameters = {
      tags = {
        precedence = "ssm-parameter"
        parameter  = "yes"
      }
    }
    housekeeper = {
      tags = {
        precedence  = "ssm-housekeeper"
        housekeeper = "yes"
      }
    }
  }

  observability = {
    logs = {
      level = "debug"
      tags = {
        precedence = "log"
        log        = "yes"
      }
    }
  }
}

run "layered_component_tags" {
  command = plan

  assert {
    condition     = aws_lambda_function.scale_up.environment[0].variables["LOG_LEVEL"] == "DEBUG"
    error_message = "The nested observability.logs.level value must configure the control-plane functions."
  }

  assert {
    condition = aws_lambda_function.scale_up.tags == tomap({
      precedence = "scale-up"
      module     = "yes"
      lambda     = "yes"
      scale_up   = "yes"
      }) && aws_cloudwatch_log_group.scale_up.tags == tomap({
      precedence = "scale-up"
      module     = "yes"
      log        = "yes"
      scale_up   = "yes"
      }) && aws_lambda_event_source_mapping.scale_up.tags == tomap({
      precedence = "scale-up"
      module     = "yes"
      queue      = "yes"
      scale_up   = "yes"
      }) && aws_iam_role.scale_up.tags == tomap({
      precedence = "scale-up"
      module     = "yes"
      scale_up   = "yes"
    })
    error_message = "Scale-up tags must layer module, shared resource, and component tags with the component taking precedence."
  }

  assert {
    condition = aws_lambda_function.scale_down.tags == tomap({
      precedence = "scale-down"
      module     = "yes"
      lambda     = "yes"
      scale_down = "yes"
      }) && aws_cloudwatch_log_group.scale_down.tags == tomap({
      precedence = "scale-down"
      module     = "yes"
      log        = "yes"
      scale_down = "yes"
      }) && aws_cloudwatch_event_rule.scale_down.tags == tomap({
      precedence = "scale-down"
      module     = "yes"
      scale_down = "yes"
      }) && aws_iam_role.scale_down.tags == tomap({
      precedence = "scale-down"
      module     = "yes"
      scale_down = "yes"
    })
    error_message = "Scale-down tags must layer module, shared resource, and component tags with the component taking precedence."
  }

  assert {
    condition = aws_iam_role.runner[0].tags == tomap({
      precedence = "runner"
      module     = "yes"
      runner     = "yes"
    })
    error_message = "Runner tags must override module tags on the common runner role."
  }

  assert {
    condition = aws_ssm_parameter.runner_agent_mode.tags == tomap({
      precedence = "ssm-parameter"
      module     = "yes"
      ssm        = "yes"
      parameter  = "yes"
      }) && tomap({
      for tag in jsondecode(aws_lambda_function.scale_up.environment[0].variables["SSM_PARAMETER_STORE_TAGS"]) :
      tag.Key => tag.Value
      }) == tomap({
      precedence = "ssm-parameter"
      module     = "yes"
      ssm        = "yes"
      parameter  = "yes"
    })
    error_message = "Terraform-managed and runtime-created SSM parameters must use the same layered parameter tags."
  }

  assert {
    condition = aws_lambda_function.ssm_housekeeper.tags == tomap({
      precedence  = "ssm-housekeeper"
      module      = "yes"
      lambda      = "yes"
      ssm         = "yes"
      housekeeper = "yes"
      }) && aws_cloudwatch_log_group.ssm_housekeeper.tags == tomap({
      precedence  = "ssm-housekeeper"
      module      = "yes"
      log         = "yes"
      ssm         = "yes"
      housekeeper = "yes"
      }) && aws_iam_role.ssm_housekeeper.tags == tomap({
      precedence  = "ssm-housekeeper"
      module      = "yes"
      ssm         = "yes"
      housekeeper = "yes"
    })
    error_message = "SSM housekeeper tags must layer module, SSM, shared resource, and housekeeper tags."
  }

  assert {
    condition = module.pool[0].lambda.tags == tomap({
      precedence = "pool"
      module     = "yes"
      lambda     = "yes"
      pool       = "yes"
      }) && module.pool[0].lambda_log_group.tags == tomap({
      precedence = "pool"
      module     = "yes"
      log        = "yes"
      pool       = "yes"
      }) && module.pool[0].role_pool.tags == tomap({
      precedence = "pool"
      module     = "yes"
      pool       = "yes"
    })
    error_message = "Pool tags must layer module, shared resource, and component tags with the component taking precedence."
  }

  assert {
    condition = module.job_retry[0].lambda.function.function.tags == tomap({
      precedence = "job-retry"
      module     = "yes"
      lambda     = "yes"
      job_retry  = "yes"
      }) && module.job_retry[0].lambda.log_group.tags == tomap({
      precedence = "job-retry"
      module     = "yes"
      log        = "yes"
      job_retry  = "yes"
      }) && module.job_retry[0].lambda.role.tags == tomap({
      precedence = "job-retry"
      module     = "yes"
      job_retry  = "yes"
      }) && module.job_retry[0].job_retry_check_queue.tags == tomap({
      precedence = "job-retry"
      module     = "yes"
      queue      = "yes"
      job_retry  = "yes"
    })
    error_message = "Job-retry tags must layer module, shared resource, and component tags with the component taking precedence."
  }
}
