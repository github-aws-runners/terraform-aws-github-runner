aws_region  = "eu-west-1"
environment = "multi-runner-webhook"

runners_lambda_zip = "../../lambda_output/runners.zip"
webhook_lambda_zip = "../../lambda_output/webhook.zip"

github = {
  url                = "https://github-api:8443"
  ssl_verify         = false
  runner_owner       = "example"
  registration_level = "organization"
}

scale_set = {
  name              = "linux-scale-set"
  runner_group_name = "experimental-euw1-sl-cicd-forge-emu"
  min_runners       = 1
  container = {
    image = "localhost:4566/scale-set-controller:latest"
  }
  ecs = {
    task = {
      architecture = "ARM64"
    }
  }
}

github_app = {
  id              = "123"
  installation_id = "123"
  key_base64      = "LS0tLS1CRUdJTiBQUklWQVRFIEtFWS0tLS0tCk1JSUV2UUlCQURBTkJna3Foa2lHOXcwQkFRRUZBQVNDQktjd2dnU2pBZ0VBQW9JQkFRRFM3OUJ1dU9rVTJ2V2EKT3J2aHBWNENON1g3dm5qdXBuWlhSZFNvWGVQNWxKMEs4dHhrcnpIaEVyT3JobGJZd1JoUEJjaFFBVzJtemQ4RgpqNytTVGliL0VFd1ZXZVFWUWZMbTFwMDRyR3FNc1B0WkcvcVFWelNwZTkyRWhYTnZzWFRmS0c1UjNYTE5OdS9uCm9PNmRablJvM2U0TENYd1BaMGdMR3Q3K1hrZk9QQU5LZDZnSW1pS1hiQXAxV1VzK0JrdXI1TTBXNjgvWjd0WlgKYnBTcHV3MWVwc2RwM2FpYzM2V2FmVWloZDNMQUR5UFE5c1JkZ2E2VXBaRFJTUEE3VWlUd3FwTlluY2ZEODFkKwpFWnI3ZlNEcjRqb2s5S0F1SzRQWTBML3lMVGlBVEg1aWFKcWhxT252UDN4MFBOSzd4aEw4SHZpVThON0dqNHlhClQ2eDdheC90QWdNQkFBRUNnZ0VBTGZ0SmdpMXNYOWU0Vk1uTFpZMnRIOG9oc1ZKTTNlY3JJbXl1UmhLTGpQODAKdWF1RjJDdnBzV0RvaWpKRGNjWXNCS1BqemU3MXhuZ1h6d2hPTURnNW4zM2Z2QUxIcWN1aHhlalFSb2V0UldTYQpNZ3RibEVYeVRLVGIvZFN5ZkkxZ1J2b3pERVQ4RHRpVU5QZTd0Rk9lZWpLd3ZyYXZWTk5Fbk9rYlpiTkxMMTAzCndtZS9ObDBjTDhVN1lHaGtLRm0wMmZjTVpaWENiT3puYzQ1UFFXNmVJaUhJWW1sZ056Q2lIenRvZS9UZ3JKekoKS1dsMzU5WUM4VGZZd3AydDQ5ZTVSS3BKN0lRY3A5NUEvVFBHVXVHaEMxRkZEZlh0eUgySlYxRGJOQ3RhVjNRcwp3M3g1LzErZDRoN0dxUjFzTW01V0NMUmduSjhYOU0xRm5IMlAvYzAxK1FLQmdRRDBBcWFPQkJ0ay81WFl4YnowCmM1R25iOXdDa0xGaVp1WElGbnV0d0JTaEprU055Q3NFbDB5UHBrV0NnTk1zQ0xtaUNldGpSUm0zMFZXSC9jeUMKekxxb0FXNU5VTmorK3dmZHcrM1hHODlkVjEzRWxLL1VKNDE0RkR4NFZ4NE4rTWtHaHVkZno2dXdUbFVJYXFDVAo0czIrSko4NDBraUIxRUUycFBoYmd4b2c5UUtCZ1FEZFRTT0QxcEl1b29YR0pBQTZxWUVoMWtOb1g1Q0IzOE9TCk92TThwTFV1djN6cmp1QzdQbm5CZEF5aEdGeG9qcFlQbG1pNFIrWDJraGVPd0ZscTM2V3hDOERHeEN2L0h2ODMKV0lLdTc4c25MQmlLMlBzdk9vdmNZZ1BRVVBkZWV4ODkwcU92Tjh1MzV0NjZuNnliOVlCaWNSd01tVFlJS2Irdwp4ZmEzenBWSUdRS0JnRTZaOS9yeFdiMjhFeElFQ0cwYU9VWWRZMXEwTDEvS1U2U1RrWDJUelZGbjJWZHVybVRKCk5CRmw5eWdseFdCKzR3Vk9lck84azU5QjRISnhFQXJtVmc0K2Y4Q0tGWXgxWXNCT0YvUmQ4ZnRZWkUwcHRFWDgKQTdjMWxaRVNSdzBySWQ1bllHcmRvNm1rWWdIWER5ajBPMkJQdmJaNURvQTcxbEg2N0VIV1JubHRBb0dBVUlTeAppRlY0eUpqL2ZWRTUrQjRXU3Q1dmxqazNGZG41aVdvRGVDd2hkQW5lQk1MdWg1STZzS1Z0dHV0cksrdTlNNXl4CksyT1Zpem9xY2hrUUw2K0IxTUlHK1FzRlN3VFhMU2I2SFhaSC8wK3UrazNxVG92SnVYeThFSDUxRXA1UGhxbnUKUG1GWnNPYkNZVHFaamdFc0hpVXpaRzRXVjdBQSsrdDdVZk5MSTNrQ2dZRUFra1VsV3JxdG1rTFV2TlZ4d0tMZwo5eStWcTRrRGRSR2hta3VhQmNFK0NkOW14bVpDbzFMeHU2bWxJRHlvQzV5TVpLVjlNQndOeW5kQTc4UkIxNEtaCkc4aHRCazROd2FPUWlZYmRLbzJMQ2FVSWdyVlorTk1SNHZvU0NNeThHNG5TeUhRWmJ1b1lXdWU1c3JUSFdEcW8KNElaOVJyRXd5ODR4SHl5RE0xVGN1VG89Ci0tLS0tRU5EIFBSSVZBVEUgS0VZLS0tLS0K"
  webhook_secret  = "ministack-webhook-secret"
}

compute_provider = {
  aws = {
    ec2 = {
      instance_types = ["m7a.large", "m5.large"]
      ami = {
        filter = {
          name  = ["multi-runner-orchestration"]
          state = ["available"]
        }
        owners = ["self"]
      }
    }
  }
}
