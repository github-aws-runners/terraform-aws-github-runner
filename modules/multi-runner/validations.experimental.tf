resource "terraform_data" "validate_experimental" {
  lifecycle {
    precondition {
      condition = (
        length(var.experimental.multi_runner_config) == 0 ||
        var.experimental.github.app != null
      )
      error_message = "experimental.github.app is required when experimental.multi_runner_config is not empty."
    }

    precondition {
      condition = !local.use_multi_runner_config_v2 ? true : (
        var.experimental.github.app == null ? true : (
          (var.experimental.github.app.key_base64 != null || var.experimental.github.app.key_base64_ssm != null) &&
          (var.experimental.github.app.id != null || var.experimental.github.app.id_ssm != null) &&
          (!local.webhook_enabled || var.experimental.github.app.webhook_secret != null || var.experimental.github.app.webhook_secret_ssm != null)
        )
      )
      error_message = "experimental.github.app must set key_base64 or key_base64_ssm and id or id_ssm; webhook lanes additionally require webhook_secret or webhook_secret_ssm."
    }

    precondition {
      condition = !local.use_multi_runner_config_v2 || alltrue([
        for app in var.experimental.github.additional_apps :
        (app.key_base64 != null || app.key_base64_ssm != null) &&
        (app.id != null || app.id_ssm != null)
      ])
      error_message = "Each experimental.github.additional_apps entry must provide either key_base64 or key_base64_ssm, and either id or id_ssm."
    }

    precondition {
      condition = alltrue([
        for runner_config in values(var.experimental.multi_runner_config) :
        length([
          for provider_type, provider_config in runner_config.compute_provider : provider_type
          if provider_config != null
        ]) == 1
      ])
      error_message = "Each experimental runner configuration must set exactly one compute-provider block. Supported compute-provider blocks: ec2."
    }

    precondition {
      condition = alltrue([
        for runner_config in values(var.experimental.multi_runner_config) :
        length([
          for orchestration_type, orchestration_config in runner_config.orchestration : orchestration_type
          if orchestration_config != null
        ]) == 1
      ])
      error_message = "Each experimental runner configuration must set exactly one orchestration block: webhook or scale_set."
    }

    precondition {
      condition = alltrue([
        for runner_config in values(var.experimental.multi_runner_config) :
        try(coalesce(runner_config.runner.os, var.experimental.runner.os), null) != null &&
        try(coalesce(runner_config.runner.architecture, var.experimental.runner.architecture), null) != null &&
        try(coalesce(runner_config.runner.maximum_count, var.experimental.runner.maximum_count), null) != null
      ])
      error_message = "Each experimental runner configuration must resolve runner.os, runner.architecture, and runner.maximum_count from the configuration or experimental global runner defaults."
    }

    precondition {
      condition = alltrue([
        for runner_config in values(var.experimental.multi_runner_config) :
        runner_config.compute_provider.ec2 == null ? true : (
          try(coalesce(runner_config.compute_provider.ec2.vpc_id, var.experimental.compute_provider.ec2.vpc_id), null) != null &&
          try(coalesce(runner_config.compute_provider.ec2.subnet_ids, var.experimental.compute_provider.ec2.subnet_ids), null) != null
        )
      ])
      error_message = "Each experimental EC2 runner configuration must resolve compute_provider.ec2.vpc_id and subnet_ids from the lane or experimental global EC2 defaults. Flat v1 inputs are not inherited by v2."
    }

    precondition {
      condition = alltrue([
        for runner_config in values(var.experimental.multi_runner_config) :
        runner_config.orchestration.webhook == null ? true : (
          coalesce(
            runner_config.orchestration.webhook.queue.visibility_timeout_seconds,
            var.experimental.queue.visibility_timeout_seconds,
            ) >= 6 * coalesce(
            runner_config.orchestration.webhook.lambda.scale_up.timeout,
            var.experimental.lambda.scale_up.timeout,
          )
        )
      ])
      error_message = "Each experimental orchestration.webhook.queue.visibility_timeout_seconds must be at least six times the resolved orchestration.webhook.lambda.scale_up.timeout."
    }

    precondition {
      condition = !local.webhook_enabled || (
        (
          var.experimental.queue.encryption.sqs_managed_sse_enabled != null &&
          var.experimental.queue.encryption.kms_master_key_id == null &&
          var.experimental.queue.encryption.kms_data_key_reuse_period_seconds == null
          ) || (
          var.experimental.queue.encryption.sqs_managed_sse_enabled == null &&
          var.experimental.queue.encryption.kms_master_key_id != null
        )
      )
      error_message = "Invalid experimental.queue.encryption configuration for webhook orchestration. Use SQS-managed encryption, disable it, or configure a KMS key."
    }

    precondition {
      condition = alltrue([
        for runner_config in values(var.experimental.multi_runner_config) :
        try(contains(["linux", "osx", "windows"], coalesce(runner_config.runner.os, var.experimental.runner.os)), false)
      ])
      error_message = "Experimental runner.os must be linux, osx, or windows."
    }

    precondition {
      condition = !local.use_multi_runner_config_v2 || (
        (
          var.experimental.lambda.architecture == null ||
          try(contains(["arm64", "x86_64"], var.experimental.lambda.architecture), false)
          ) && alltrue([
            for runner_config in values(var.experimental.multi_runner_config) :
            runner_config.lambda.architecture == null || try(contains(["arm64", "x86_64"], runner_config.lambda.architecture), false)
        ])
      )
      error_message = "Experimental lambda.architecture must be arm64 or x86_64."
    }

    precondition {
      condition = !local.use_multi_runner_config_v2 || (
        (
          var.experimental.observability.logs.level == null ||
          try(contains(["debug", "info", "warn", "error"], var.experimental.observability.logs.level), false)
          ) && alltrue([
            for runner_config in values(var.experimental.multi_runner_config) :
            runner_config.observability.logs.level == null ||
            try(contains(["debug", "info", "warn", "error"], runner_config.observability.logs.level), false)
        ])
      )
      error_message = "Experimental observability.logs.level must be debug, info, warn, or error."
    }

    precondition {
      condition = !local.use_multi_runner_config_v2 || (
        (
          var.experimental.observability.logs.class == null ||
          try(contains(["STANDARD", "INFREQUENT_ACCESS"], var.experimental.observability.logs.class), false)
          ) && alltrue([
            for runner_config in values(var.experimental.multi_runner_config) :
            runner_config.observability.logs.class == null ||
            try(contains(["STANDARD", "INFREQUENT_ACCESS"], runner_config.observability.logs.class), false)
        ])
      )
      error_message = "Experimental observability.logs.class must be STANDARD or INFREQUENT_ACCESS."
    }

    precondition {
      condition = !local.use_multi_runner_config_v2 || (
        (
          var.experimental.ssm.paths.root == null ||
          try(startswith(var.experimental.ssm.paths.root, "/"), false)
          ) && alltrue([
            for runner_config in values(var.experimental.multi_runner_config) :
            runner_config.ssm.paths.root == null || try(startswith(runner_config.ssm.paths.root, "/"), false)
        ])
      )
      error_message = "Experimental ssm.paths.root base paths must start with '/'. The lane key is appended during normalization."
    }

    precondition {
      condition = !local.use_multi_runner_config_v2 || (
        (
          var.experimental.ssm.housekeeper.state == null ||
          try(contains(["DISABLED", "ENABLED", "ENABLED_WITH_ALL_CLOUDTRAIL_MANAGEMENT_EVENTS"], var.experimental.ssm.housekeeper.state), false)
          ) && alltrue([
            for runner_config in values(var.experimental.multi_runner_config) :
            runner_config.ssm.housekeeper.state == null ||
            try(contains(["DISABLED", "ENABLED", "ENABLED_WITH_ALL_CLOUDTRAIL_MANAGEMENT_EVENTS"], runner_config.ssm.housekeeper.state), false)
        ])
      )
      error_message = "Experimental ssm.housekeeper.state must be DISABLED, ENABLED, or ENABLED_WITH_ALL_CLOUDTRAIL_MANAGEMENT_EVENTS."
    }

    precondition {
      condition = !local.use_multi_runner_config_v2 || !anytrue([
        for runner_config in values(local.translated_experimental_base.multi_runner_config) :
        try(runner_config.compute_provider.ec2.binaries_syncer.enabled, false)
        ]) || contains(
        ["Disabled", "Enabled", "Suspended"],
        var.experimental.compute_provider.ec2.runner_binaries.s3.versioning,
      )
      error_message = "experimental.compute_provider.ec2.runner_binaries.s3.versioning must be Disabled, Enabled, or Suspended."
    }

    precondition {
      condition = !local.use_multi_runner_config_v2 || !anytrue([
        for runner_config in values(local.translated_experimental_base.multi_runner_config) :
        try(runner_config.compute_provider.ec2.binaries_syncer.enabled, false)
        ]) || contains(
        ["DISABLED", "ENABLED", "ENABLED_WITH_ALL_CLOUDTRAIL_MANAGEMENT_EVENTS"],
        var.experimental.compute_provider.ec2.runner_binaries.syncer.schedule.state,
      )
      error_message = "experimental.compute_provider.ec2.runner_binaries.syncer.schedule.state must be DISABLED, ENABLED, or ENABLED_WITH_ALL_CLOUDTRAIL_MANAGEMENT_EVENTS."
    }

    precondition {
      condition = !local.webhook_enabled || contains(
        ["first", "random", "all"],
        var.experimental.webhook.queue_selection_strategy,
      )
      error_message = "experimental.webhook.queue_selection_strategy must be first, random, or all."
    }

    precondition {
      condition = !local.webhook_enabled || contains(
        ["Standard", "Advanced"],
        var.experimental.webhook.matcher_config_parameter_store_tier,
      )
      error_message = "experimental.webhook.matcher_config_parameter_store_tier must be Standard or Advanced."
    }

    precondition {
      condition = !local.use_multi_runner_config_v2 || (
        !(
          var.experimental.lambda.scale.artifact.zip != null &&
          var.experimental.lambda.scale.artifact.s3 != null
          ) && (
          var.experimental.lambda.scale.artifact.s3 == null || (
            var.experimental.lambda.artifact.s3.bucket != null &&
            try(var.experimental.lambda.scale.artifact.s3.key != null, false)
          )
        )
      )
      error_message = "experimental.lambda.scale.artifact must set at most one of zip or s3; an s3 wrapper requires experimental.lambda.artifact.s3.bucket and a non-null key."
    }

    precondition {
      condition = !local.webhook_enabled || (
        !(
          var.experimental.lambda.webhook.artifact.zip != null &&
          var.experimental.lambda.webhook.artifact.s3 != null
          ) && (
          var.experimental.lambda.webhook.artifact.s3 == null || (
            var.experimental.lambda.artifact.s3.bucket != null &&
            try(var.experimental.lambda.webhook.artifact.s3.key != null, false)
          )
        )
      )
      error_message = "experimental.lambda.webhook.artifact must set at most one of zip or s3; an s3 wrapper requires experimental.lambda.artifact.s3.bucket and a non-null key."
    }

    precondition {
      condition = !local.use_multi_runner_config_v2 || (
        !(
          var.experimental.compute_provider.ec2.instance_termination_watcher.artifact.zip != null &&
          var.experimental.compute_provider.ec2.instance_termination_watcher.artifact.s3 != null
          ) && (
          var.experimental.compute_provider.ec2.instance_termination_watcher.artifact.s3 == null || (
            var.experimental.lambda.artifact.s3.bucket != null &&
            try(var.experimental.compute_provider.ec2.instance_termination_watcher.artifact.s3.key != null, false)
          )
        )
      )
      error_message = "experimental.compute_provider.ec2.instance_termination_watcher.artifact must set at most one of zip or s3; an s3 wrapper requires experimental.lambda.artifact.s3.bucket and a non-null key."
    }

    precondition {
      condition = !local.use_multi_runner_config_v2 || (
        !(
          var.experimental.compute_provider.ec2.ami.housekeeper.artifact.zip != null &&
          var.experimental.compute_provider.ec2.ami.housekeeper.artifact.s3 != null
          ) && (
          var.experimental.compute_provider.ec2.ami.housekeeper.artifact.s3 == null || (
            var.experimental.lambda.artifact.s3.bucket != null &&
            try(var.experimental.compute_provider.ec2.ami.housekeeper.artifact.s3.key != null, false)
          )
        )
      )
      error_message = "experimental.compute_provider.ec2.ami.housekeeper.artifact must set at most one of zip or s3; an s3 wrapper requires experimental.lambda.artifact.s3.bucket and a non-null key."
    }

    precondition {
      condition = !local.use_multi_runner_config_v2 || !(
        var.experimental.compute_provider.ec2.runner_binaries.syncer.artifact.zip != null &&
        var.experimental.compute_provider.ec2.runner_binaries.syncer.artifact.s3 != null
      )
      error_message = "experimental.compute_provider.ec2.runner_binaries.syncer.artifact must set at most one of zip or s3."
    }

    precondition {
      condition = !local.use_multi_runner_config_v2 || (
        var.experimental.compute_provider.ec2.runner_binaries.syncer.artifact.s3 == null ? true : (
          var.experimental.lambda.artifact.s3.bucket != null &&
          var.experimental.compute_provider.ec2.runner_binaries.syncer.artifact.s3.key != null
        )
      )
      error_message = "experimental.compute_provider.ec2.runner_binaries.syncer.artifact.s3 requires experimental.lambda.artifact.s3.bucket and a non-null key."
    }

    precondition {
      condition = !local.use_multi_runner_config_v2 || contains(
        ["AES256", "aws:kms", "aws:kms:dsse"],
        var.experimental.compute_provider.ec2.runner_binaries.s3.encryption.sse_algorithm,
      )
      error_message = "experimental.compute_provider.ec2.runner_binaries.s3.encryption.sse_algorithm must be AES256, aws:kms, or aws:kms:dsse."
    }

    precondition {
      condition = !local.use_multi_runner_config_v2 || (
        !var.experimental.compute_provider.ec2.runner_binaries.s3.encryption.enabled ? (
          var.experimental.compute_provider.ec2.runner_binaries.s3.encryption.kms_master_key_id == null
          ) : (
          var.experimental.compute_provider.ec2.runner_binaries.s3.encryption.kms_master_key_id == null ||
          contains(
            ["aws:kms", "aws:kms:dsse"],
            var.experimental.compute_provider.ec2.runner_binaries.s3.encryption.sse_algorithm,
          )
        )
      )
      error_message = "experimental.compute_provider.ec2.runner_binaries.s3.encryption.sse_algorithm must be aws:kms or aws:kms:dsse when kms_master_key_id is set."
    }

    precondition {
      condition = alltrue([
        for runner_config in values(local.translated_experimental_base.multi_runner_config) :
        runner_config.orchestration.webhook == null ? true : (
          !runner_config.orchestration.webhook.queue.redrive_build_queue.enabled || try(
            runner_config.orchestration.webhook.queue.redrive_build_queue.maxReceiveCount > 0,
            false,
          )
        )
      ])
      error_message = "An enabled experimental orchestration.webhook.queue.redrive_build_queue requires maxReceiveCount greater than zero."
    }

    precondition {
      condition = !local.use_multi_runner_config_v2 || (
        var.experimental.compute_provider.ec2.runner_binaries.s3.logging.prefix == null ||
        var.experimental.compute_provider.ec2.runner_binaries.s3.logging.bucket != null
      )
      error_message = "experimental.compute_provider.ec2.runner_binaries.s3.logging.prefix requires logging.bucket."
    }

    precondition {
      condition = alltrue([
        for runner_config in values(var.experimental.multi_runner_config) :
        try(coalesce(runner_config.runner.iam.role, var.experimental.runner.iam.role), null) == null ||
        length(
          runner_config.runner.iam.role != null ? (
            runner_config.runner.iam.managed_policy_arns != null ? runner_config.runner.iam.managed_policy_arns : {}
            ) : (
            runner_config.runner.iam.managed_policy_arns != null ? runner_config.runner.iam.managed_policy_arns : (
              var.experimental.runner.iam.managed_policy_arns != null ? var.experimental.runner.iam.managed_policy_arns : {}
            )
          )
        ) == 0
      ])
      error_message = "runner.iam.managed_policy_arns cannot be set with an external runner.iam.role because external roles are not managed by this module."
    }

    precondition {
      condition = alltrue([
        for runner_config in values(var.experimental.multi_runner_config) :
        try(coalesce(runner_config.runner.iam.role, var.experimental.runner.iam.role), null) == null ||
        (
          runner_config.runner.iam.role != null ? runner_config.runner.iam.additional_trust_policy_json :
          try(coalesce(runner_config.runner.iam.additional_trust_policy_json, var.experimental.runner.iam.additional_trust_policy_json), null)
        ) == null
      ])
      error_message = "runner.iam.additional_trust_policy_json cannot be set with an external runner.iam.role because external roles are not managed by this module."
    }

    precondition {
      condition = alltrue([
        for runner_config in values(local.translated_experimental_base.multi_runner_config) :
        runner_config.orchestration.scale_set == null ? true : (
          runner_config.orchestration.scale_set.id > 0 &&
          floor(runner_config.orchestration.scale_set.id) == runner_config.orchestration.scale_set.id &&
          runner_config.orchestration.scale_set.github_app_index >= 0 &&
          floor(runner_config.orchestration.scale_set.github_app_index) == runner_config.orchestration.scale_set.github_app_index &&
          runner_config.orchestration.scale_set.github_app_index < 1 + length(local.translated_experimental_base.github.additional_apps) &&
          runner_config.orchestration.scale_set.min_runners >= 0 &&
          floor(runner_config.orchestration.scale_set.min_runners) == runner_config.orchestration.scale_set.min_runners &&
          runner_config.orchestration.scale_set.min_runners <= runner_config.runner.maximum_count
        )
      ])
      error_message = "Scale-set IDs and GitHub App indexes must be valid integers, the app index must select a configured app, and 0 <= min_runners <= runner.maximum_count."
    }

    precondition {
      condition = length(distinct([
        for runner_config in values(local.translated_experimental_base.multi_runner_config) :
        "${replace(lower(trimsuffix(trimspace(runner_config.orchestration.scale_set.github_config_url), "/")), "https://www.github.com/", "https://github.com/")}#${runner_config.orchestration.scale_set.id}"
        if runner_config.orchestration.scale_set != null
        ])) == length([
        for runner_config in values(local.translated_experimental_base.multi_runner_config) : runner_config
        if runner_config.orchestration.scale_set != null
      ])
      error_message = "Every experimental scale-set lane must use a unique normalized github_config_url and scale_set.id pair."
    }

    precondition {
      condition = alltrue([
        for runner_config in values(local.translated_experimental_base.multi_runner_config) :
        runner_config.orchestration.scale_set == null ? true : (
          runner_config.compute_provider.ec2 == null ? false : (
            runner_config.runner.ephemeral &&
            coalesce(runner_config.runner.jit_config_enabled, runner_config.runner.ephemeral) &&
            runner_config.compute_provider.ec2.user_data.enabled &&
            runner_config.compute_provider.ec2.user_data.template == null &&
            runner_config.compute_provider.ec2.user_data.content == null &&
            runner_config.compute_provider.ec2.metadata_options.instance_metadata_tags == "enabled" &&
            runner_config.compute_provider.ec2.metadata_options.http_endpoint == "enabled"
          )
        )
      ])
      error_message = "Scale-set lanes require ephemeral JIT EC2 runners, the default user-data bootstrap, and an enabled instance metadata endpoint with instance metadata tags."
    }

    precondition {
      condition = alltrue([
        for runner_config in values(local.translated_experimental_base.multi_runner_config) :
        runner_config.orchestration.scale_set == null ? true : (
          can(regex("^https://[A-Za-z0-9]([A-Za-z0-9.-]*[A-Za-z0-9])?(:([1-9][0-9]{0,3}|[1-5][0-9]{4}|6[0-4][0-9]{3}|65[0-4][0-9]{2}|655[0-2][0-9]|6553[0-5]))?/[A-Za-z0-9_.-]+(/[A-Za-z0-9_.-]+)?/?$", trimspace(runner_config.orchestration.scale_set.github_config_url))) &&
          !can(regex("^https://[^/]+:443/", lower(trimspace(runner_config.orchestration.scale_set.github_config_url)))) &&
          !can(regex("^https://[^/]+/enterprises/", lower(trimspace(runner_config.orchestration.scale_set.github_config_url)))) &&
          can(regex("^[^@ ]+@sha256:[0-9a-fA-F]{64}$", runner_config.orchestration.scale_set.container_image)) &&
          contains(["arm64", "x86_64"], runner_config.orchestration.scale_set.ecs.architecture)
        )
      ])
      error_message = "Scale-set lanes require a canonical HTTPS organization/repository github_config_url with an optional non-default port from 1 to 65535, an immutable container image digest, and an arm64 or x86_64 ECS architecture."
    }

  }
}
