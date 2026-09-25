# Multi-runner scale-set example

This example combines ordinary webhook-managed lanes with one experimental
GitHub Actions runner scale-set lane. It demonstrates that v2 keeps the
deployment-wide defaults in `global_config*` and places orchestration and
compute-provider settings inside each `multi_runner_config` lane.

The source example is available at
[examples/multi-runner-scale-set](https://github.com/github-aws-runners/terraform-aws-github-runner/tree/main/examples/multi-runner-scale-set).
Read its README before applying: the GitHub App values are sensitive, the
scale-set controller image must be supplied explicitly, and the GitHub scale
set/runner group must be authorized for the selected GitHub scope.

--8<-- "examples/multi-runner-scale-set/README.md"
