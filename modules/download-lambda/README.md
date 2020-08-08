# Module - Download lambda artifacts

This module is optional and provides an option to download via Terraform the Lambda artifacts from GitHub.

## Usages

```
module "lambdas" {
  source = "<source location>"
  lambdas = [
    {
      name = "webhook"
      tag  = "v0.3.0"
    },
    {
      name = "runners"
      tag  = "v0.3.0"
    },
    {
      name = "runner-binaries-syncer"
      tag  = "v0.3.0"
    }
  ]
}
```

<!-- BEGINNING OF PRE-COMMIT-TERRAFORM DOCS HOOK -->

## Inputs

| Name    | Description                           |  Type  | Default | Required |
| ------- | ------------------------------------- | :----: | :-----: | :------: |
| lambdas | Name and tag for lambdas to download. | object |   n/a   |   yes    |

## Outputs

| Name  | Description |
| ----- | ----------- |
| files |             |

<!-- END OF PRE-COMMIT-TERRAFORM DOCS HOOK -->

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
