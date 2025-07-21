# GitHub Actions Runner Scale-Down State Diagram

<!-- --8<-- [start:mkdocs_scale_down_state_diagram] -->

The scale-down Lambda function runs on a scheduled basis (every 5 minutes by default) to manage GitHub Actions runner instances. It performs a two-phase cleanup process: first terminating confirmed orphaned instances, then evaluating active runners to maintain the desired idle capacity while removing unnecessary instances.

```mermaid
stateDiagram-v2
    [*] --> ScheduledExecution : Cron Trigger every 5 min

    ScheduledExecution --> Phase1_OrphanTermination : Start Phase 1

    state Phase1_OrphanTermination {
        [*] --> ListOrphanInstances : Query EC2 for ghr orphan true

        ListOrphanInstances --> CheckOrphanType : For each orphan

        state CheckOrphanType <<choice>>
        CheckOrphanType --> HasRunnerIdTag : Has ghr github runner id
        CheckOrphanType --> TerminateOrphan : No runner ID tag

        HasRunnerIdTag --> LastChanceCheck : Query GitHub API

        state LastChanceCheck <<choice>>
        LastChanceCheck --> ConfirmedOrphan : Offline and busy
        LastChanceCheck --> FalsePositive : Exists and not problematic

        ConfirmedOrphan --> TerminateOrphan
        FalsePositive --> RemoveOrphanTag

        TerminateOrphan --> NextOrphan : Continue processing
        RemoveOrphanTag --> NextOrphan

        NextOrphan --> CheckOrphanType : More orphans?
        NextOrphan --> Phase2_ActiveRunners : All processed
    }

    Phase1_OrphanTermination --> Phase2_ActiveRunners : Phase 1 Complete

    state Phase2_ActiveRunners {
        [*] --> ListActiveRunners : Query non-orphan EC2 instances

        ListActiveRunners --> GroupByOwner : Sort by owner and repo

        GroupByOwner --> ProcessOwnerGroup : For each owner

        state ProcessOwnerGroup {
            [*] --> SortByStrategy : Apply eviction strategy
            SortByStrategy --> ProcessRunner : Oldest first or newest first

            ProcessRunner --> QueryGitHub : Get GitHub runners for owner

            QueryGitHub --> MatchRunner : Find runner by instance ID suffix

            state MatchRunner <<choice>>
            MatchRunner --> FoundInGitHub : Runner exists in GitHub
            MatchRunner --> NotFoundInGitHub : Runner not in GitHub

            state FoundInGitHub {
                [*] --> CheckMinimumTime : Has minimum runtime passed?

                state CheckMinimumTime <<choice>>
                CheckMinimumTime --> TooYoung : Runtime less than minimum
                CheckMinimumTime --> CheckIdleQuota : Runtime greater than or equal to minimum

                TooYoung --> NextRunner

                state CheckIdleQuota <<choice>>
                CheckIdleQuota --> KeepIdle : Idle quota available
                CheckIdleQuota --> CheckBusyState : Quota full

                KeepIdle --> NextRunner

                state CheckBusyState <<choice>>
                CheckBusyState --> KeepBusy : Runner busy
                CheckBusyState --> TerminateIdle : Runner idle

                KeepBusy --> NextRunner
                TerminateIdle --> DeregisterFromGitHub
                DeregisterFromGitHub --> TerminateInstance
                TerminateInstance --> NextRunner
            }

            state NotFoundInGitHub {
                [*] --> CheckBootTime : Has boot time exceeded?

                state CheckBootTime <<choice>>
                CheckBootTime --> StillBooting : Boot time less than threshold
                CheckBootTime --> MarkOrphan : Boot time greater than or equal to threshold

                StillBooting --> NextRunner
                MarkOrphan --> TagAsOrphan : Set ghr orphan true
                TagAsOrphan --> NextRunner
            }

            NextRunner --> ProcessRunner : More runners in group?
            NextRunner --> NextOwnerGroup : Group complete
        }

        NextOwnerGroup --> ProcessOwnerGroup : More owner groups?
        NextOwnerGroup --> ExecutionComplete : All groups processed
    }

    Phase2_ActiveRunners --> ExecutionComplete : Phase 2 Complete

    ExecutionComplete --> [*] : Wait for next cron trigger

    note right of LastChanceCheck
        Uses ghr github runner id tag
        for precise GitHub API lookup
    end note

    note right of MatchRunner
        Matches GitHub runner name
        ending with EC2 instance ID
    end note

    note right of CheckMinimumTime
        Minimum running time in minutes
        (Linux: 5min, Windows: 15min)
    end note

    note right of CheckBootTime
        Runner boot time in minutes
        Default configuration value
    end note
```
<!-- --8<-- [end:mkdocs_scale_down_state_diagram] -->


## Key Decision Points

| State | Condition | Action |
|-------|-----------|--------|
| **Orphan w/ Runner ID** | GitHub: offline + busy | Terminate (confirmed orphan) |
| **Orphan w/ Runner ID** | GitHub: exists + healthy | Remove orphan tag (false positive) |
| **Orphan w/o Runner ID** | Always | Terminate (no way to verify) |
| **Active Runner Found** | Runtime < minimum | Keep (too young) |
| **Active Runner Found** | Idle quota available | Keep as idle |
| **Active Runner Found** | Quota full + idle | Terminate + deregister |
| **Active Runner Found** | Quota full + busy | Keep running |
| **Active Runner Missing** | Boot time exceeded | Mark as orphan |
| **Active Runner Missing** | Still booting | Wait |

## Configuration Parameters

- **Cron Schedule**: `cron(*/5 * * * ? *)` (every 5 minutes)
- **Minimum Runtime**: Linux 5min, Windows 15min
- **Boot Timeout**: Configurable via `runner_boot_time_in_minutes`
- **Idle Config**: Per-environment configuration for desired idle runners
