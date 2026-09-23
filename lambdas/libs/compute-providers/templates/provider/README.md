# Compute provider template

Copy this directory to the appropriate provider namespace, for example
`aws/codebuild`, and replace `template` with the new compute-provider type.

The template is compile-checked but intentionally not registered. A provider
has separate webhook and control-plane entry points so each Lambda bundles only
the code it uses. To enable a completed provider, add its compute-provider type to
`provider-types.ts`, then register each entry point in its matching file:

- `providers.config.webhook.ts`
- `providers.config.control-plane.ts`

Each entry point exports its module as `provider`. Alias that export to the compute-provider
name when enabling it, for example:

```ts
import { provider as codebuild } from './aws/codebuild/webhook';
```

Implement every capability before registering the provider:

- `pool`: list managed runners, count available runners, and create runners.
- `scaleUp`: prepare compute-provider state, count current runners, and create runners.
- `scaleDown`: list, inspect, mark, unmark, and terminate runners.
- `dynamicLabels`: select a webhook dispatch target for supported labels.

Provider-specific tests should remain beside the provider implementation. The
generic orchestration contracts remain owned by the control-plane package.

Scale-down providers may optionally implement `listPage` to process inventory incrementally. Each paged record needs a GitHub runner ID or a complete registration name from a trusted source; missing identities are retained, never treated as absent. Existing list-only providers remain compatible and use a complete, invocation-cached GitHub owner listing when identity fields are absent. A failed listing is not cached as an empty result.

For EC2, scale-down receives `RUNNER_NAME_PREFIX` from the same Terraform runner configuration as scale-up. The instance prefix tag must match that configuration before it can supply a missing-ID lookup name. Instances with missing or mismatched prefix tags and no GitHub ID are retained; correct their tags or restore the registration ID before expecting automatic cleanup.
