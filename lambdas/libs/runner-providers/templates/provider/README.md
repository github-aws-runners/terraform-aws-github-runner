# Runner provider template

Copy this directory to the appropriate provider namespace, for example
`aws/codebuild`, and replace `template` with the new lane type.

The template is compile-checked but intentionally not registered. To enable a
completed provider, import its module and add it once to
`providers.config.ts`. The webhook and control-plane registries will then use
the corresponding plugin automatically, and the generic control-plane
contracts will include the new lane type.

Every provider entry point exports its module as `provider`. Alias that export
to the lane name when enabling it, for example:

```ts
import { provider as codebuild } from './aws/codebuild';
```

Implement every capability before registering the provider:

- `pool`: list managed runners, count available runners, and create runners.
- `scaleUp`: prepare lane state, count current runners, and create runners.
- `scaleDown`: list, inspect, mark, unmark, and terminate runners.
- `dynamicLabels`: select a webhook dispatch target for supported labels.

Provider-specific tests should remain beside the provider implementation. The
generic orchestration contracts remain owned by the control-plane package.
