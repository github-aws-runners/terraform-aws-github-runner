
# Runner Labels

Some CI systems require that all labels match between a job and a runner. In the case of GitHub Actions, workflows will be assigned to runners which have all the labels requested by the workflow, however it is not necessary that the workflow mentions all labels.

Labels specify the capabilities the runners have. The labels in the workflow are the capabilities needed. If the capabilities requested by the workflow are provided by the runners, there is match.

Examples:

| Runner Labels | Workflow runs-on: | Result |
| ------------- | ------------- | ------------- |
| 'self-hosted', 'Linux', 'X64' | self-hosted | matches |
| 'self-hosted', 'Linux', 'X64' | Linux | matches |
| 'self-hosted', 'Linux', 'X64' | X64 | matches |
| 'self-hosted', 'Linux', 'X64' | [ self-hosted, Linux ] | matches |
| 'self-hosted', 'Linux', 'X64' | [ self-hosted, X64 ] | matches |
| 'self-hosted', 'Linux', 'X64' | [ self-hosted, Linux, X64 ] | matches |
| 'self-hosted', 'Linux', 'X64' | other1 | no match |
| 'self-hosted', 'Linux', 'X64' | [ self-hosted, other2 ] | no match |
| 'self-hosted', 'Linux', 'X64' | [ self-hosted, Linux, X64, other2 ] | no match |
| 'self-hosted', 'Linux', 'X64', 'custom3' | custom3 | matches |
| 'self-hosted', 'Linux', 'X64', 'custom3' | [ custom3, Linux ] | matches |
| 'self-hosted', 'Linux', 'X64', 'custom3' | [ custom3, X64 ] | matches |
| 'self-hosted', 'Linux', 'X64', 'custom3' | [ custom3, other7 ] | no match |

If default labels are removed:

| Runner Labels | Workflow runs-on: | Result |
| ------------- | ------------- | ------------- |
| 'custom5' | custom5 | matches |
| 'custom5' | self-hosted | no match |
| 'custom5' | Linux | no match |
| 'custom5' | [ self-hosted, Linux ] | no match |
| 'custom5' | [ custom5, self-hosted, Linux ] | no match |

# Preventing Runner Scale-Down for Debugging

The module supports a bypass mechanism that allows you to prevent specific runners from being scaled down during debugging or investigation. This is useful when you need to access a runner instance directly to troubleshoot issues.

## Usage

To prevent a runner from being terminated during scale-down operations, add the `ghr:bypass-removal` tag to the EC2 instance with a value of `true`:

```bash
aws ec2 create-tags --resources <instance-id> --tags Key=ghr:bypass-removal,Value=true
```

When this tag is set, the scale-down process will skip the runner and log a message indicating that the runner is protected:

```
Runner 'i-xxxxxxxxxxxx' has bypass-removal tag set, skipping removal. Remove the tag to allow scale-down.
```

## Removing the Protection

Once you've finished debugging and want to allow the runner to be scaled down normally, remove the tag or set it to any other value:

```bash
aws ec2 delete-tags --resources <instance-id> --tags Key=ghr:bypass-removal
```

**Note:** The bypass-removal tag only prevents automatic scale-down. The runner will still continue to process job(s) as normal. Make sure to remove the tag after debugging to ensure proper resource management. It will also still terminate itself if the instance is empheral and the job is complete.
