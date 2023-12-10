
# Runner Labels

Some CI systems mandate that all labels must match between a job and a runner. In the context of GitHub Actions, workflows are assigned to runners that possess all the labels requested by the workflow, even though it is not necessary for the workflow to explicitly mention all labels.

Labels define the capabilities of the runners, and the labels in the workflow represent the required capabilities. A match occurs when the capabilities requested by the workflow are provided by the runners.

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
