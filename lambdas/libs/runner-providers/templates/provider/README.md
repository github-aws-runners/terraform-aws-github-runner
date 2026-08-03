# Runner provider template

Copy this directory to the appropriate provider namespace, for example
`aws/codebuild`, and replace `template` with the new lane type.

The template is compile-checked but intentionally not registered. A provider
has separate webhook and control-plane entry points so each Lambda bundles only
the code it uses. To enable a completed provider, add its lane type to
`provider-types.ts`, then register each entry point in its matching file:

- `providers.config.webhook.ts`
- `providers.config.control-plane.ts`

Each entry point exports its module as `provider`. Alias that export to the lane
name when enabling it, for example:

```ts
import { provider as codebuild } from './aws/codebuild/webhook';
```

Implement every capability before registering the provider:

- `pool`: list managed runners, count available runners, and create runners.
- `scaleUp`: prepare lane state, count current runners, and create runners.
- `scaleDown`: list, inspect, mark, unmark, and terminate runners.
- `dynamicLabels`: select a webhook dispatch target for supported labels.

Provider-specific tests should remain beside the provider implementation. The
generic orchestration contracts remain owned by the control-plane package.
