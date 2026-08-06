# Pre-provider-boundary fixture

This internal test fixture recreates the former `module.runners[<lane>]` address so the multi-runner upgrade test can verify that the EC2 provider `moved` block retains existing resource identities.

<!-- BEGIN_TF_DOCS -->
## Requirements

| Name | Version |
|------|---------|
| <a name="requirement_terraform"></a> [terraform](#requirement\_terraform) | >= 1.14.0 |
| <a name="requirement_aws"></a> [aws](#requirement\_aws) | >= 6.33 |

## Providers

No providers.

## Modules

| Name | Source | Version |
|------|--------|---------|
| <a name="module_runners"></a> [runners](#module\_runners) | ../../../../runners | n/a |

## Resources

No resources.

## Inputs

No inputs.

## Outputs

| Name | Description |
|------|-------------|
| <a name="output_runner_state"></a> [runner\_state](#output\_runner\_state) | Stable resource identities captured before the EC2 provider boundary. |
<!-- END_TF_DOCS -->
