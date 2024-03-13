# Termination watcher

This module shows how to use the termination watcher stand-alone.

## Usages

Esnure your have the lambda for the termination locally build. By default the one in the lambdas folder will be used.

Build lambda's (requires node and yarn).

```bash
cd lambdas
yarn install && yarn dist
```

Next switch to this example directory.

```bash
terraform init
terraform apply
```

Once a Spot instance is terminated a log line and metric will be updated. Spot termiaation can be simulated by navigating to the request and invoce an interruption. 

<!-- BEGIN_TF_DOCS -->
## Requirements

No requirements.

## Providers

No providers.

## Modules

| Name | Source | Version |
|------|--------|---------|
| <a name="module_spot_termination_watchter"></a> [spot\_termination\_watchter](#module\_spot\_termination\_watchter) | ../../modules/termination-watcher | n/a |

## Resources

No resources.

## Inputs

No inputs.

## Outputs

No outputs.
<!-- END_TF_DOCS -->