
# Runner Labels

Some CI systems require that all labels match between a job and a runner. In the case of GitHub Actions, workflows will be assigned to runners which have all the labels requested by the workflow, however it is not necessary the workflow mentions all labels.

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
