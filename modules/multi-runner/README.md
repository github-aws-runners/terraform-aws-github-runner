# Module - Multi runner

> This module replaces the top-level module to make it easy to create with one deployment multiple type of runners.

This module create many runners with a single GitHub app. The module utiliazed the internal modules and deploys parts of the stack for each runner defined.

The module takes a configuration as input containing a matcher for the labels. The [webhook](../webhook/README.md) lambda is using the configuration to delegate events based on the labels in the workflow job and sent them to a dedicated queue based on the configuration. Events on each queue are processed by a dedicated lambda per configuration to scale runners.

For each configuration:

- When enabled the [distritbution sycner](../runner-binaries-syncer/README.md) is deployed for each unique combination of OS and architecture.
- For each configuration a queue is created and [runner module](../runners/README.md) is deployed


## Matching

Matching of the configuration is done based on the labels specified in labelMatchers configuration. The webhook is processing the workflow_job event and match the labels against the labels specified in labelMatchers configuration in the order of configuration with exact-match true first, followed by all exact matches false.


## The catch

Controlling which event is taken up by which runner is not to this module. It is completely done by GitHub. This means when potentially different runners can run the same job there is nothing that can be done to guarantee a certain runner will take up the job.

An example, given you have two runners one with the labels. `self-hosted, linux, x64, large` and one with the labels `self-hosted, linux, x64, small`. Once you define a subset of the labels in the worklfow, for example `self-hosted, linux, x64`. Both runners can take the job potentially. You can define to scale one of the runners for the event, but still there is no guarantee that the scaled runner take the job. The workflow with subset of labels (`self-hosted, linux, x64`) can take up runner with specific labels (`self-hosted, linux, x64, large`) and leave the workflow with labels (`self-hosted, linux, x64, large`) be without the runner.
The only mitigation that is available right now is to use a small pool of runners. Pool instances can also exists for a short amount of time and only created once in x time based on a cron expressions.


## Usages

A complate example is available in the examples, see the [multi-runner example](../../examples/multi-runner/) for actual implementation.


```hcl

module "multi-runner" {
  prefix = "multi-runner"

  github_app = {
    # app details
  }

  multi_runner_config = {
    "linux-arm" = {
      matcherConfig : {
        labelMatchers = ["self-hosted", "linux", "arm64", "arm"]
        exactMatch    = true
      }
      runner_config = {
        runner_os                      = "linux"
        runner_architecture            = "arm64"
        runner_extra_labels            = "arm"
        enable_ssm_on_runners          = true
        instance_types                 = ["t4g.large", "c6g.large"]
        ...
      }
      ...
    },
    "linux-x64" = {
      matcherConfig : {
        labelMatchers = ["self-hosted", "linux", "x64"]
        exactMatch    = false
      }
      runner_config = {
        runner_os                       = "linux"
        runner_architecture             = "x64"
        instance_types                  = ["m5ad.large", "m5a.large"]
        enable_ephemeral_runners        = true
        ...
      }
      delay_webhook_event = 0
      ...
    }
  }

}

```

<!-- BEGINNING OF PRE-COMMIT-TERRAFORM DOCS HOOK -->

<!-- END OF PRE-COMMIT-TERRAFORM DOCS HOOK -->
