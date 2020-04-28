# Action runner module

The module create resources to facilitate the `orchestrator labmda` to recreate action runners.

- *launch template* : A launch template is created that can create an action runner, by default a spot instance is requested. For configuration parameters SSM is used. 
- *security group* : Security groups attached to the action runner.
- *s3 bucket* : To avoid the action runner distribution to be downloaded from Github every time (which could be slow), a version is cached in a S3 bucket.
- *policies and roles* : Policies and roles for the action runner. By default the session manager is enabled
