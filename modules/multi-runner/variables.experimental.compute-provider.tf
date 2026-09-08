# Global compute-provider configuration.
variable "global_config_compute_provider" {
  description = <<-EOT
    Global compute-provider configuration shared by all runner lanes.

    global_config_compute_provider = {
      selections: "Compute-provider selections keyed by namespace."
      selections.namespace: "Provider namespace used to resolve a compute implementation."
      selections.type: "Compute-provider type selected for the namespace."
      aws.ec2.vpc_id: "Default VPC for EC2 runners."
      aws.ec2.subnet_ids: "Default subnets for EC2 runners."
      aws.ec2.managed_security_group_enabled: "Whether the module manages the default runner security group."
      aws.ec2.egress_rules: "Egress rules for the managed runner security group."
      aws.ec2.egress_rules.cidr_blocks: "IPv4 CIDR blocks allowed by an egress rule."
      aws.ec2.egress_rules.ipv6_cidr_blocks: "IPv6 CIDR blocks allowed by an egress rule."
      aws.ec2.egress_rules.prefix_list_ids: "AWS prefix lists allowed by an egress rule."
      aws.ec2.egress_rules.from_port: "Start of the egress port range."
      aws.ec2.egress_rules.protocol: "Protocol for the egress rule."
      aws.ec2.egress_rules.security_groups: "Referenced security groups allowed by an egress rule."
      aws.ec2.egress_rules.self: "Whether the security group itself is allowed by an egress rule."
      aws.ec2.egress_rules.to_port: "End of the egress port range."
      aws.ec2.egress_rules.description: "Description of the egress rule."
      aws.ec2.additional_security_group_ids: "Additional security groups attached to EC2 runners."
      aws.ec2.cloudwatch_agent.config: "CloudWatch Agent configuration for EC2 runners."
      aws.ec2.instance_profile_path: "IAM path used for the EC2 instance profile."
      aws.ec2.key_name: "EC2 key pair name assigned to runner instances."
      aws.ec2.associate_public_ipv4_address: "Whether runner instances receive a public IPv4 address."
      aws.ec2.tags: "Tags applied to EC2 runner resources."
      aws.ec2.ami.housekeeper.enabled: "Whether AMI cleanup is enabled."
      aws.ec2.ami.housekeeper.cleanup_config.maxItems: "Maximum number of AMIs retained by cleanup."
      aws.ec2.ami.housekeeper.cleanup_config.minimumDaysOld: "Minimum AMI age in days before cleanup."
      aws.ec2.ami.housekeeper.cleanup_config.amiFilters: "AMI filters used to select AMIs for cleanup."
      aws.ec2.ami.housekeeper.cleanup_config.amiFilters.Name: "AMI filter name."
      aws.ec2.ami.housekeeper.cleanup_config.amiFilters.Values: "Values matched by the AMI filter."
      aws.ec2.ami.housekeeper.cleanup_config.launchTemplateNames: "Launch template names associated with AMIs eligible for cleanup."
      aws.ec2.ami.housekeeper.cleanup_config.ssmParameterNames: "SSM parameter names associated with AMIs eligible for cleanup."
      aws.ec2.ami.housekeeper.cleanup_config.dryRun: "Whether AMI cleanup reports changes without deleting AMIs."
      aws.ec2.ami.housekeeper.artifact.zip: "Local ZIP artifact used for the AMI housekeeper Lambda."
      aws.ec2.ami.housekeeper.artifact.s3.key: "S3 object key for the AMI housekeeper Lambda artifact."
      aws.ec2.ami.housekeeper.artifact.s3.object_version: "Optional S3 object version for the AMI housekeeper artifact."
      aws.ec2.ami.housekeeper.lambda.memory_size: "Memory allocated to the AMI housekeeper Lambda."
      aws.ec2.ami.housekeeper.lambda.timeout: "Timeout in seconds for the AMI housekeeper Lambda."
      aws.ec2.ami.housekeeper.schedule.expression: "Schedule expression for AMI cleanup."
      aws.ec2.instance_termination_watcher.enabled: "Whether the instance termination watcher is enabled."
      aws.ec2.instance_termination_watcher.features.runner_deregistration.enabled: "Whether terminated runners are deregistered."
      aws.ec2.instance_termination_watcher.features.spot_termination_handler.enabled: "Whether spot termination events trigger runner handling."
      aws.ec2.instance_termination_watcher.features.spot_termination_notification_watcher.enabled: "Whether spot termination notification monitoring is enabled."
      aws.ec2.instance_termination_watcher.environment_variables: "Environment variables passed to the termination watcher."
      aws.ec2.instance_termination_watcher.artifact.zip: "Local ZIP artifact used for the termination watcher Lambda."
      aws.ec2.instance_termination_watcher.artifact.s3.key: "S3 object key for the termination watcher Lambda artifact."
      aws.ec2.instance_termination_watcher.artifact.s3.object_version: "Optional S3 object version for the termination watcher artifact."
      aws.ec2.instance_termination_watcher.lambda.memory_size: "Memory allocated to the termination watcher Lambda."
      aws.ec2.instance_termination_watcher.lambda.timeout: "Timeout in seconds for the termination watcher Lambda."
      aws.ec2.runner_binaries.enabled: "Whether runner binary synchronization is enabled."
      aws.ec2.runner_binaries.s3.encryption.enabled: "Whether runner-binary S3 encryption is enabled."
      aws.ec2.runner_binaries.s3.encryption.bucket_key_enabled: "Whether an S3 bucket key is used for KMS encryption."
      aws.ec2.runner_binaries.s3.encryption.sse_algorithm: "S3 server-side encryption algorithm."
      aws.ec2.runner_binaries.s3.encryption.kms_master_key_id: "KMS key ID used for runner-binary S3 encryption."
      aws.ec2.runner_binaries.s3.tags: "Tags applied to the runner-binary S3 bucket."
      aws.ec2.runner_binaries.s3.versioning: "S3 versioning state for the runner-binary bucket."
      aws.ec2.runner_binaries.s3.logging.bucket: "S3 bucket receiving runner-binary access logs."
      aws.ec2.runner_binaries.s3.logging.prefix: "Prefix for runner-binary S3 access logs."
      aws.ec2.runner_binaries.syncer.artifact.zip: "Local ZIP artifact used for the runner-binary syncer Lambda."
      aws.ec2.runner_binaries.syncer.artifact.s3.key: "S3 object key for the runner-binary syncer artifact."
      aws.ec2.runner_binaries.syncer.artifact.s3.object_version: "Optional S3 object version for the runner-binary syncer artifact."
      aws.ec2.runner_binaries.syncer.lambda.memory_size: "Memory allocated to the runner-binary syncer Lambda."
      aws.ec2.runner_binaries.syncer.lambda.timeout: "Timeout in seconds for the runner-binary syncer Lambda."
      aws.ec2.runner_binaries.syncer.schedule.expression: "Schedule expression for runner-binary synchronization."
      aws.ec2.runner_binaries.syncer.schedule.state: "EventBridge rule state for runner-binary synchronization."
    }
  EOT
  type = object({
    selections = optional(map(object({
      namespace = string
      type      = string
    })), null)
    aws = optional(object({
      ec2 = optional(object({
        vpc_id                         = optional(string, null)
        subnet_ids                     = optional(list(string), null)
        managed_security_group_enabled = optional(bool, true)
        egress_rules = optional(list(object({
          cidr_blocks      = list(string)
          ipv6_cidr_blocks = list(string)
          prefix_list_ids  = list(string)
          from_port        = number
          protocol         = string
          security_groups  = list(string)
          self             = bool
          to_port          = number
          description      = string
          })), [{
          cidr_blocks      = ["0.0.0.0/0"]
          ipv6_cidr_blocks = ["::/0"]
          prefix_list_ids  = null
          from_port        = 0
          protocol         = "-1"
          security_groups  = null
          self             = null
          to_port          = 0
          description      = null
        }])
        additional_security_group_ids = optional(list(string), [])
        cloudwatch_agent = optional(object({
          config = optional(string, null)
        }), {})
        instance_profile_path         = optional(string, null)
        key_name                      = optional(string, null)
        associate_public_ipv4_address = optional(bool, false)
        tags                          = optional(map(string), {})
        ami = optional(object({
          housekeeper = optional(object({
            enabled = optional(bool, false)
            cleanup_config = optional(object({
              maxItems       = optional(number)
              minimumDaysOld = optional(number)
              amiFilters = optional(list(object({
                Name   = string
                Values = list(string)
              })))
              launchTemplateNames = optional(list(string))
              ssmParameterNames   = optional(list(string))
              dryRun              = optional(bool)
            }), {})
            artifact = optional(object({
              zip = optional(string, null)
              s3 = optional(object({
                key            = string
                object_version = optional(string, null)
              }), null)
            }), {})
            lambda = optional(object({
              memory_size = optional(number, 256)
              timeout     = optional(number, 300)
            }), {})
            schedule = optional(object({
              expression = optional(string, "cron(11 7 * * ? *)")
            }), {})
          }), {})
        }), {})
        instance_termination_watcher = optional(object({
          enabled = optional(bool, false)
          features = optional(object({
            runner_deregistration = optional(object({
              enabled = optional(bool, true)
            }), {})
            spot_termination_handler = optional(object({
              enabled = optional(bool, true)
            }), {})
            spot_termination_notification_watcher = optional(object({
              enabled = optional(bool, true)
            }), {})
          }), {})
          environment_variables = optional(map(string), {})
          artifact = optional(object({
            zip = optional(string, null)
            s3 = optional(object({
              key            = string
              object_version = optional(string, null)
            }), null)
          }), {})
          lambda = optional(object({
            memory_size = optional(number, null)
            timeout     = optional(number, null)
          }), {})
        }), {})
        runner_binaries = optional(object({
          enabled = optional(bool, true)
          s3 = optional(object({
            encryption = optional(object({
              enabled            = optional(bool, true)
              bucket_key_enabled = optional(bool, null)
              sse_algorithm      = optional(string, "AES256")
              kms_master_key_id  = optional(string, null)
            }), {})
            tags       = optional(map(string), {})
            versioning = optional(string, "Disabled")
            logging = optional(object({
              bucket = optional(string, null)
              prefix = optional(string, null)
            }), {})
          }), {})
          syncer = optional(object({
            artifact = optional(object({
              zip = optional(string, null)
              s3 = optional(object({
                key            = string
                object_version = optional(string, null)
              }), null)
            }), {})
            lambda = optional(object({
              memory_size = optional(number, 256)
              timeout     = optional(number, 300)
            }), {})
            schedule = optional(object({
              expression = optional(string, "cron(27 * * * ? *)")
              state      = optional(string, "ENABLED")
            }), {})
          }), {})
        }), {})
      }), {})
    }), {})
  })
  default = {}
}
