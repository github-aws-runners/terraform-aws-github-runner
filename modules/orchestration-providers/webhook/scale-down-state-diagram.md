# GitHub Actions Runner Scale-Down State Diagram

<!-- --8<-- [start:mkdocs_scale_down_state_diagram] -->

Scale-down is stateless. Each invocation lists current EC2 inventory in bounded pages (up to 100 instances per request) and processes orphaned and active runners from each page before requesting the next. It does not collect the entire fleet before cleanup. Successfully terminated instances disappear from subsequent inventories; the next scheduled invocation starts a fresh scan of what remains. Individual runner failures do not block other runners, and a later page failure retains all earlier cleanup. A deadline guard stops new work with ten seconds remaining.

GitHub runner IDs and exact runner names avoid organization-wide inventories. A runner without either identity is left alone rather than blocking cleanup or being assumed absent. The EC2 provider supplies the full name only when its `ghr:runner_name_prefix` tag matches the configured prefix, then appends the instance ID. An exact-name miss without a registration ID is retained because a custom script may have registered a different name.

The eviction strategy orders runners within each page. The idle allowance is shared across pages within one invocation and recalculated on each invocation. Strict global oldest/newest ordering requires a full inventory; incremental cleanup instead preserves the configured allowance while processing each available page. Pagination can shift as instances disappear, so subsequent scheduled scans reconcile remaining items. Busy, retained, and failed runners may be checked again; no cursor or completed-item list is persisted.

```mermaid
stateDiagram-v2
    [*] --> FetchPage : Fresh scheduled scan
    FetchPage --> SelectRunner : One bounded EC2 page
    FetchPage --> [*] : Listing failure retains earlier cleanup
    SelectRunner --> CheckDeadline : Next runner
    CheckDeadline --> [*] : Near deadline
    CheckDeadline --> VerifyRunner : Time remains
    VerifyRunner --> Cleanup : Verified orphan or eligible idle runner
    VerifyRunner --> SelectRunner : Busy, retained, incomplete identity, or lookup error
    Cleanup --> SelectRunner : Success or isolated failure
    SelectRunner --> FetchPage : Page complete with more pages
    SelectRunner --> [*] : Inventory exhausted

    note right of VerifyRunner
        GitHub lookup by runner ID or exact name.
        Retention, busy checks, boot grace, and
        bypass-removal protection still apply.
    end note
```
<!-- --8<-- [end:mkdocs_scale_down_state_diagram] -->

## Key Decision Points

| State | Condition | Action |
|-------|-----------|--------|
| **Orphan w/ Runner ID** | GitHub: offline + busy | Terminate (confirmed orphan) |
| **Orphan w/ Runner ID** | GitHub: exists + healthy | Remove orphan tag (false positive) |
| **Orphan w/o Runner ID** | Exact-name lookup misses | Retain and report unverifiable identity |
| **Orphan w/o identity** | Cannot verify registration | Preserve for a later sweep |
| **Active Runner Found** | Runtime < minimum | Keep (too young) |
| **Active Runner Found** | Idle quota available | Keep as idle |
| **Active Runner Found** | Quota full + idle | Terminate + deregister |
| **Active Runner Found** | Quota full + busy | Keep running |
| **Active Runner Missing** | Absence verified by ID (or complete legacy listing), boot time exceeded | Mark as orphan |
| **Active Runner Missing** | Still booting | Wait |

## Configuration Parameters

- **Cron Schedule**: `cron(*/5 * * * ? *)` (every 5 minutes)
- **Minimum Runtime**: Linux 5min, Windows 15min, OSX 20min
- **Boot Timeout**: Configurable via `orchestration_provider.webhook.runner.boot_time_in_minutes`; stable-v1 inputs are translated from `runner_boot_time_in_minutes`.
- **Idle Config**: Per-environment configuration for desired idle runners

## Operational visibility and naming

Paged cleanup emits an info log for each inventory page and a final `Scale-down inventory scan finished.` summary with `pages`, `scannedRunners`, `terminatedRunners`, `completed`, and `stoppedForDeadline`. These are observations from the scan, not an atomic before/after fleet census. Update dashboards that depend on the old fleet-count log messages to use these fields. Deadline exits and orphan termination also emit info logs; a listing failure still emits the partial summary.

Missing-ID lookups require the configured prefix followed by the instance ID. Custom start scripts should retain the GitHub runner-ID tag. An exact-name miss does not prove absence: paged cleanup preserves the instance and reports `UNVERIFIABLE_RUNNER` at error level. Missing identity and mismatched prefix tags are reported the same way, before attempting authentication. Alert on this code and repair the identity/tag or investigate the instance manually; later scans do not silently turn uncertainty into permission to terminate. Existing list-only providers retain their complete-list fallback.
