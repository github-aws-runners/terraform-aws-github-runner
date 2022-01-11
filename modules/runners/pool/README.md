# Pool module

This module creates the AWS resources required to maintain a pool of runners. However terraform modules are always exposed and theoretically can be used anywhere. This module is seen as a strict inner module.

## Why a submodule for the pool

The pool is an opt-in feature. To be able to use the count on a module level to avoid counts per resources a module is created. All inputs of the module are already defined on a higher level. See the mapping of the variables in [`pool.tf`](../pool.tf)