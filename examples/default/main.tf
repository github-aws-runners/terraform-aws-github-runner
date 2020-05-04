locals {
  environment = "default"
  aws_region  = "eu-west-1"
}


resource "random_password" "random" {
  length = 32
}


module "runners" {
  source = "../../"

  aws_region = local.aws_region
  vpc_id     = module.vpc.vpc_id

  environment = local.environment
  tags = {
    Project = "ProjectX"
  }

  github_app_webhook_secret = random_password.random.result

}

resource "null_resource" "trigger_syncLambda" {
  # Trigger the sync lambda after creation to ensure an action runner distribution is available
  triggers = {
    function_name = module.runners.lambda_s3_action_runner_dist_syncer.id
  }

  provisioner "local-exec" {
    when       = create
    on_failure = continue
    command    = "sleep 30 && aws lambda invoke --function-name ${self.triggers.function_name} response.json"
  }
}

