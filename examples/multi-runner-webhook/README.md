# Multi-runner webhook example

This example exercises the shared experimental multi-runner v2 webhook path
with EC2 and Lambda MicroVM compute. The runner lanes, webhook orchestration,
Lambda artifacts, and GitHub configuration are common; provider-owned inputs
are grouped under `compute_provider`.

The example creates both an EC2 lane and a Lambda MicroVM lane behind the same
webhook endpoint. The MiniStack smoke test sends matching jobs to each lane in
sequence, so adding another provider means adding another lane and provider
specific lifecycle assertions to the same deployment.

The runner-control and webhook Lambda archives are explicit inputs:

```sh
terraform apply \
  -var='runners_lambda_zip=/path/to/runners.zip' \
  -var='webhook_lambda_zip=/path/to/webhook.zip'
```
