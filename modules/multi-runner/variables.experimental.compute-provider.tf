# Experimental global compute-provider configuration.
variable "experimental_global_config_compute_provider" {
  description = "Experimental global compute-provider configuration."
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
            spot_termination_handler_enabled              = optional(bool, true)
            spot_termination_notification_watcher_enabled = optional(bool, true)
          }), {})
          runner_deregistration_enabled = optional(bool, true)
          environment_variables         = optional(map(string), {})
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
