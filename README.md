# Terraform module for scalable self hosted GitHub action runners

> WIP: Module is in development

This modules create the required infra structure needed to host GitHub Action self hosted runners on spot instances in AWS. All logic required to handle the life cycle fo an action runners are implemented in AWS Lambda functions.

## Motivation
GitHub action runners `self hosted` runners provide you with a flexible option to run you build load on compute of your choice. Currently there is no option provide to automate the creation, and scaling of the runners. This module provide besides the logic of the AWS infrastructure for scaling action runners up and down. 

We choose for to run manage the life cycle in several lambda. This gives us the option to grant the most minimal permissions to each step in the process of handle an event, scale up, or scale down. On the other hand the choice for Lambda keeps the costs low at the moment nothing is happening.


## Overview

The process of scaling runners on demand starts by registering a GitHub App which delivers via a webhook protected by a secret a check run event at the API Gateway. The Gateway will trigger a Lambda which will verify the messages and queue a message on a SWS queue. Messages on the queue are read with a delay from 30 seconds. In case the build is not started after this delay, and no limits are reach a new spot instances is created via a launch template. The lambda will store a registration token in SSM Parameter store from where the user data script of the EC2 instance will read the token and register the runner. Stopping the instances is at the moment brute forced, every x minutes a Lambda is checking if a runner (instance) is not busy. In case the runner is not busy it will be removed from GitHub and AWS. Finally a cache is implemented to avoid the runner distribution needs to download every time. The cache is managed by a lambda that checks base on a cron expression if the distribution require an update.

![Architecture](docs/component-overview.svg)

Permission are managed on several places. Below the most important ones. For details check the Terraform sources.
- The GitHub App requires access to actions and publish event to AWS.
- The scale up lambda should have access to EC2 to create instances and tag instances.
- The scale down lambda should have access to EC2 to terminate instances.

Besides the permissions are required to S3, CloudWatch, SSM, and S3. 


## Usages

## Examples





## Philips Forest

This module is part of the Philips Forest.

```
                                                     ___                   _
                                                    / __\__  _ __ ___  ___| |_
                                                   / _\/ _ \| '__/ _ \/ __| __|
                                                  / / | (_) | | |  __/\__ \ |_
                                                  \/   \___/|_|  \___||___/\__|  

                                                                 Infrastructure
```

Talk to the forestkeepers in the `forest`-channel on Slack.

[![Slack](https://philips-software-slackin.now.sh/badge.svg)](https://philips-software-slackin.now.sh)
