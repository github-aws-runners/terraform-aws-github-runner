# Multi-runner v2 example

This example demonstrates the experimental multi-runner v2 interface. Shared
defaults are configured with `experimental_global_config*` variables, while
each runner lane uses `experimental_multi_runner_config` for its matcher,
runner lifecycle, and compute-provider settings.

The example creates three lanes from one deployment:

- Linux ARM64 Amazon Linux runners.
- Ephemeral Linux x64 Amazon Linux runners with job retry enabled.
- Windows x64 Server Core 2022 runners.

The v2 interface keeps provider-owned settings inside the selected provider
configuration. For example, VPC and subnet settings are under
`experimental_global_config_compute_provider.aws.ec2`, while the per-lane
instance types and AMI filter are under each lane's compute provider block.

Configure the GitHub App variables before applying:

```bash
terraform init
terraform apply \
  -var='github_app={id="123456",key_base64="..."}'
```

The `github_app` value is sensitive and should be supplied through a secure
variable source in real deployments rather than committed to configuration.
