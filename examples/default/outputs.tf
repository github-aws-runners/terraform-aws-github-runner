output "runners" {
  value = {
    runners = module.runners.runners
  }
}

output "webhook" {
  value = {
    secret  = random_password.random.result
    gateway = module.runners.webhook.gateway
  }
}
