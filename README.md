# Terraform module for scalable self hosted GitHub action runners

This [Terraform](https://www.terraform.io/) modules create the required infra structure needed to host [GitHub Action](https://github.com/features/actions) self hosted runners on [AWS spot instances](https://aws.amazon.com/ec2/spot/). All logic required to handle the lifecycle for an action runners is implemented in AWS Lambda functions.

## Motivation

GitHub Actions `self hosted` runners provides you with a flexible option to run your CI workloads on compute of your choice. Currently there is no option provided to automate the creation and scaling of action runners. This module takes care of creating the AWS infra structure to host action runners on spot instances. And provides lambda modules to orchestrate the life cycle of the action runners.

Lambda is chosen as runtime for two major reasons. First it allows to create small components with minimal access to AWS and GitHub. Secondly it provides a scalable setup for minimal costs that works on repo level and scales to organization level. The lambdas will create Linux based EC2 instances with Docker to serve CI workloads that can run on Linux and/or Docker. The main goal is here to support Docker based workloads.

A logical question would be why not Kubernetes? In the current approach we stay close to the way the GitHub action runners are available today. The approach is to install the runner on a host where the required software is available. With this setup we stay quite close to the current GitHub approach. Another logical choice would be AWS Auto Scaling groups. This choice would typically require much more permissions on instance level to GitHub. And besides that, scaling up and down is not trivial.

## Overview

The process of scaling runners on demand starts by registering a GitHub App which sends a [check run event](https://developer.github.com/v3/activity/events/types/#checkrunevent) via a webhook to the API Gateway. The Gateway triggers a lambda which will verify the signature and filter for queued build events. Accepted events are posted on a SQS queue. Messages on this queue will be delayed for a configurable amount of seconds to give the available runners time to pick up this build.

In case the build is not picked up yet and no limits are reached the lambda requests a registration token for a new runner at GitHub, stores the token in the SSM parameter store and starts an EC2 instance via a launch template. The EC2 instance installs the required software via a [`user_data`](https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/user-data.html) script, fetches and deletes the registration token from SSM and configures the action runner.

Scaling down the runners is at the moment brute-forced, every configurable amount of minutes a lambda will check every runner (instance) if it is busy. In case the runner is not busy it will be removed from GitHub and the instance terminated in AWS. At the moment there seems no other option to scale down more smoothly.

Downloading the GitHub Action Runner distribution can be occasionally slow (more than 10 minutes). Therefore a lambda is introduced that synchronizes the action runner binary from GitHub to an S3 bucket. The EC2 instance will fetch the distribution from the S3 bucket instead of the internet.

![Architecture](docs/component-overview.svg)

Permission are managed on several places. Below the most important ones. For details check the Terraform sources.

- The GitHub App requires access to actions and publish `check_run` events to AWS.
- The scale up lambda should have access to EC2 for creating and tagging instances.
- The scale down lambda should have access to EC2 to terminate instances.

Besides these permissions, the lambdas also need permission to CloudWatch (for logging and scheduling), SSM and S3.

## Usages

Examples are provided in [the example directory](examples/). Please ensure you have installed the following tools.

- Terraform, or [tfenv](https://github.com/tfutils/tfenv).
- Bash shell or compatible
- Docker (optional, to build lambdas without node).
- AWS cli (optional)
- Node and yarn (for lambda development).

The module support two main scenarios for creating runners. On repository level a runner will be dedicated to only one repository, no other repository can use the runner. On organization level you can use the runner(s) for all the repositories within the organization. See https://help.github.com/en/actions/hosting-your-own-runners/about-self-hosted-runners for more information. Before starting the deployment you have to choose one option.

GitHub workflows will fail immediately if there is no action runner available for your builds. Since this module supports to scale from 0 and up, your builds will fail in case there is no active runner available. So we recommend to create an offline runner with matching labels to the configuration. Create this runner by following the GitHub instruction on your local machine. You can stop the process after the step of running the `config.sh`. This offline runner will ensure your builds will not fail immediately and stay queued until there is a runner to pick it up.

The setup consists of running Terraform to create all AWS resources and configure the GitHub App. The Terraform module requires configuration from the GitHub App and the GitHub app requires output from Terraform. Therefore you should first create the GitHub App, configure the basics. Then run Terraform and finalize the configuration of the GitHub App afterwards.

### Setup GitHub App (part 1)

Go to GitHub and create a new app. Beware you can create apps your organization or for a user. For now we handle only the organization level app.

1. Create app in Github
2. Choose a name
3. Choose a website (mandatory, not required for the module).
4. Disable the webhook for now (we will configure this later).
5. Repository permissions, enable `Checks` to receive events for new builds.
6. _Only for repo level runners!_ - Repository permissions, `Administration` - Read and Write (to register runner)
7. _Only for organization level runners!_ - Organization permissions, `Administration` - Read and Write (to register runner)
8. Save the new app.
9. Next generate a private key on the General page.
10. Make a note of the following app parameters: app id , client ID, and client secret

### Setup terraform module

First you need to download the lambda releases. The lambda code is available as a GitHub release asset. Downloading can be done with the provided terraform module for example. Note that this requires `curl` to be installed on your machine. Create an empty workspace with the following terraform code:

```terraform
module "lambdas" {
  source = "../../../modules/download-lambda"
  lambdas = [
    {
      name = "webhook"
      tag  = "v0.0.0-beta"
    },
    {
      name = "runners"
      tag  = "v0.0.0-beta"
    },
    {
      name = "runner-binaries-syncer"
      tag  = "v0.0.0-beta"
    }
  ]
}

output "files" {
  value = module.lambdas.files
}
```

Next run `terraform init && terraform apply` as result the lambdas will be download to the same directory. Alternatively you can download the zip artifacts with any other tool of you favour.

For local development you can build all the lambda's at once using `.ci/build.sh` or per lambda using `yarn dist`.

Next create a second terraform workspace and initiate the module, see the examples for more details.

```terraform
module "runners" {
  source = "git::https://github.com/philips-labs/terraform-aws-github-runner.git?ref=master"

  aws_region = "eu-west-1"
  vpc_id     = "vpc-123"
  subnet_ids = ["subnet-123", "subnet-456"]

  environment = "gh-ci"

  github_app = {
    key_base64     = "base64string"
    id             = "1"
    client_id      = "c-123"
    client_secret  = "client_secret"
    webhook_secret = "webhook_secret"
  }

  webhook_lambda_zip                = "lambdas-download/webhook.zip"
  runner_binaries_syncer_lambda_zip = "lambdas-download/runner-binaries-syncer.zip.zip"
  runners_lambda_zip                = "lambdas-download/runners.zip"
  enable_organization_runners = true
}
```

2. Run terraform by using the following commands

```bash
terraform init
terrafrom apply
```

Check the terraform output for the API gateway url (endpoint), which you need in the next step. The lambda for syncing the GitHub distribution will be executed by a trigger via CloudWatch. To ensure the binary is cached, trigger the `runner-binaries-syncer` manually. The payload does not matter. (e.g. `aws lambda invoke --function-name <environment>-syncer response.json`)

### Setup GitHub App (part 2)

Go back to the GitHub App and update the following settings.

1. Enable the webhook.
2. Provide the webhook url, should be part of the output of terraform.
3. Provide the webhook secret.
4. Enable the `Check run` event for the webhook.

You are now ready to run action workloads on self hosted runner, remember builds will fail if there is no (offline) runner available with matching labels.

## Examples

TODO

## Inputs

| Name                                  | Description                                                                                                         | Type                                                                                                                                             | Default                 | Required |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------- | :------: |
| aws_region                            | AWS region.                                                                                                         | `string`                                                                                                                                         | n/a                     |   yes    |
| enable_organization_runners           | n/a                                                                                                                 | `bool`                                                                                                                                           | n/a                     |   yes    |
| environment                           | A name that identifies the environment, used as prefix and for tagging.                                             | `string`                                                                                                                                         | n/a                     |   yes    |
| github_app                            | GitHub app parameters, see your github aapp. Ensure the key is base64 encoded.                                      | <pre>object({<br> key_base64 = string<br> id = string<br> client_id = string<br> client_secret = string<br> webhook_secret = string<br> })</pre> | n/a                     |   yes    |
| subnet_ids                            | List of subnets in which the action runners will be launched, the subnets needs to be subnets in the `vpc_id`.      | `list(string)`                                                                                                                                   | n/a                     |   yes    |
| vpc_id                                | The VPC for security groups of the action runners.                                                                  | `string`                                                                                                                                         | n/a                     |   yes    |
| minimum_running_time_in_minutes       | The time an ec2 action runner should be running at minium before terminated if non busy.                            | `number`                                                                                                                                         | `5`                     |    no    |
| runner_binaries_syncer_lambda_timeout | Time out of the binaries sync lambda in seconds.                                                                    | `number`                                                                                                                                         | `300`                   |    no    |
| runner_binaries_syncer_lambda_zip     | File location of the binaries sync lambda zip file.                                                                 | `string`                                                                                                                                         | `null`                  |    no    |
| runner_extra_labels                   | Extra labels for the runners (GitHub). Separate each label by a comma                                               | `string`                                                                                                                                         | `""`                    |    no    |
| runners_lambda_zip                    | File location of the lambda zip file for scaling runners.                                                           | `string`                                                                                                                                         | `null`                  |    no    |
| runners_scale_down_lambda_timeout     | Time out for the scale up lambda in seconds.                                                                        | `number`                                                                                                                                         | `60`                    |    no    |
| runners_scale_up_lambda_timeout       | Time out for the scale down lambda in seconds.                                                                      | `number`                                                                                                                                         | `60`                    |    no    |
| scale_down_schedule_expression        | Scheduler expression to check every x for scale down.                                                               | `string`                                                                                                                                         | `"cron(*/5 * * * ? *)"` |    no    |
| tags                                  | Map of tags that will be added to created resources. By default resources will be tagged with name and environment. | `map(string)`                                                                                                                                    | `{}`                    |    no    |
| webhook_lambda_timeout                | Time out of the webhook lambda in seconds.                                                                          | `number`                                                                                                                                         | `10`                    |    no    |
| webhook_lambda_zip                    | File location of the wehbook lambda zip file.                                                                       | `string`                                                                                                                                         | `null`                  |    no    |

## Outputs

| Name            | Description |
| --------------- | ----------- |
| binaries_syncer | n/a         |
| runners         | n/a         |
| webhook         | n/a         |

## Philips Forest

This module is part of the Philips Forest.

```
                                                     ___                   _
                                                    / __\__  _ __ ___  ___| |_
                                                   / _\/ _ \| '__/ _ \/ __| __|
                                                  / / | (_) | | |  __/\__ \ |_
                                                  \/   \___/|_|  \___||___/\__|

                                                                 Infrastructure
```

Talk to the forestkeepers in the `forest`-channel on Slack.

[![Slack](https://philips-software-slackin.now.sh/badge.svg)](https://philips-software-slackin.now.sh)
