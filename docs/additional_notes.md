
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

# Exact Match

The multi-runner module has a setting `exactMatch` which affects how the matcherConfig functions.  

The module will decide the runner for the workflow job based on the match in the labels defined in the workflow job and runner configuration. The runner configuration allows the match to be exact or non-exact match. We recommend to use only exact matches. For exact match, all the labels defined in the workflow should be present in the runner configuration matchers and for non-exact match, some of the labels in the workflow, when present in runner configuration, shall be enough for the runner configuration to be used for the job. First the exact matchers are applied, next the non exact ones.

Let's review examples of `exactMatch`.

Scenario 1:

Typical use case. Set `exactMatch` to true.

```
matcherConfig:
  exactMatch: true
  labelMatchers:
    - [self-hosted, linux, x64, ubuntu-latest]
    - [self-hosted, linux, x64, ubuntu-2204]
    ...
runner_config:
  runner_extra_labels: "ubuntu-latest,ubuntu-2204"
    ...
```

GitHub Actions workflow:

```
runs-on: [self-hosted, linux, x64, ubuntu-latest]
```

Runners will launch, and the job will run successfully. 

Scenario 2:

Set `exactMatch` to true. What happens if there are fewer label on the workflow than in the matcher?

```
matcherConfig:
  exactMatch: false
  labelMatchers:
    - [self-hosted, linux, x64, ubuntu-latest]
    - [self-hosted, linux, x64, ubuntu-2204]
    ...
runner_config:
  runner_extra_labels: "ubuntu-latest,ubuntu-2204"
    ...
```

GitHub Actions workflow:

```
runs-on: [self-hosted, linux]
```

Runners will launch, and the job will run successfully. 

Note: This may be a surprising result since "self-hosted, linux" does not look like what you would ordinarily think of as an 'exact match' of "self-hosted, linux, x64, ubuntu-latest".  

A problem with this configuration is the "self-hosted, linux" jobs might consume runners that were really intended for "self-hosted, linux, x64, ubuntu-latest" jobs, leaving those jobs without runners. For this reason, it's not recommended.

Scenario 3:

Set `exactMatch` to true. What happens if there are more label on the workflow than in the matcher?  

```
matcherConfig:
  exactMatch: true
  labelMatchers:
    - [self-hosted, linux, x64]
    ...
runner_config:
  runner_extra_labels: ""
    ...
```

GitHub Actions workflow:

```
runs-on: [self-hosted, linux, x64, ubuntu-latest]
```

`exactMatch` will prevent runners from launching. At least this is a correct outcome in the sense that GitHub would not provision jobs on runners with too few labels.  

Scenario 4:

The same as 1, except set `exactMatch: false`.   

All labels will happen to match (anyway). Runners will launch and the job will run successfully.   
If you are planning to have exact matches it would be clearer to switch this to `exactMatch: true`.  

Scenario 5:

The same as 2, except set `exactMatch: false`.  

The same results and warnings as Scenario 2. Labels will happen to match (anyway). The jobs will run successfully, but might use runners that should be reserved for other jobs.  

Scenario 6:

The same as 3, except set `exactMatch: false`.

Runners will launch. However, GitHub would not provision jobs on those runners with too few labels. This case should definitely be avoided (having runners launch, which GitHub will be unable to use).   

A problem with `exactMatch: false` is that one of the main situations it enables is Scenario 6, which precisely should not happen. 

--- 

In summary, all the examples with `exactMatch: false` are not recommended.  

Mainly, only Scenario 1 includes an unambiguous, correct configuration.  
