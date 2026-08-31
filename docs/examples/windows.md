# Windows runners

The multi-runner example includes a Windows Server 2022 runner configuration. Jobs that use the following labels are matched to this runner:

```yaml
--8<-- "examples/multi-runner/templates/runner-configs/windows-x64.yaml"
```

The configuration uses the Windows Server 2022 ECS-optimized AMI, enables SSM, and limits the runner pool to one instance. The `runner_os` value is `windows` and the runner architecture is `x64`.

See the [Multi Runner example](multi-runner.md) for the complete deployment steps and the other runner configurations included in the same deployment.
