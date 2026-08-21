resource "terraform_data" "validate_experimental" {
  lifecycle {
    precondition {
      condition     = local.use_multi_runner_config_v2 || var.github_app != null
      error_message = "github_app is required when experimental.multi_runner_config is empty."
    }

    precondition {
      condition = local.use_multi_runner_config_v2 ? true : (
        var.github_app == null ? true : (
          (try(var.github_app.key_base64, null) != null || try(var.github_app.key_base64_ssm, null) != null) &&
          (try(var.github_app.id, null) != null || try(var.github_app.id_ssm, null) != null) &&
          (try(var.github_app.webhook_secret, null) != null || try(var.github_app.webhook_secret_ssm, null) != null)
        )
      )
      error_message = "github_app must set one value from each pair: key_base64 or key_base64_ssm, id or id_ssm, and webhook_secret or webhook_secret_ssm."
    }

    precondition {
      condition     = local.use_multi_runner_config_v2 || var.vpc_id != null
      error_message = "vpc_id is required when experimental.multi_runner_config is empty."
    }

    precondition {
      condition     = local.use_multi_runner_config_v2 || var.subnet_ids != null
      error_message = "subnet_ids is required when experimental.multi_runner_config is empty."
    }

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
          (var.experimental.github.app.webhook_secret != null || var.experimental.github.app.webhook_secret_ssm != null)
        )
      )
      error_message = "experimental.github.app must set one value from each pair: key_base64 or key_base64_ssm, id or id_ssm, and webhook_secret or webhook_secret_ssm."
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
        length(flatten([
          for provider_namespace, provider_configs in runner_config.compute_provider : [
            for provider_type, provider_config in provider_configs :
            "${provider_namespace}.${provider_type}"
            if provider_config != null
          ]
        ])) == 1
      ])
      error_message = "Each experimental runner configuration must set exactly one compute-provider block. Supported compute-provider blocks: aws.ec2, aws.microvm."
    }

    precondition {
      condition = var.experimental.compute_provider.selections == null ? true : (
        toset(keys(var.experimental.compute_provider.selections)) ==
        toset(keys(var.experimental.multi_runner_config))
      )
      error_message = "experimental.compute_provider.selections must contain exactly the same keys as experimental.multi_runner_config when set."
    }

    precondition {
      condition = var.experimental.compute_provider.selections == null ? true : alltrue([
        for selection in values(var.experimental.compute_provider.selections) :
        selection.namespace == "aws" && contains(["ec2", "microvm"], selection.type)
      ])
      error_message = "experimental.compute_provider.selections supports only namespace = aws and type = ec2 or microvm."
    }

    precondition {
      condition = var.experimental.compute_provider.selections == null ? true : alltrue([
        for runner_key, selection in var.experimental.compute_provider.selections :
        try(var.experimental.multi_runner_config[runner_key].compute_provider[selection.namespace][selection.type] != null, false)
      ])
      error_message = "Each experimental.compute_provider.selections entry must identify the non-null typed compute-provider block selected by the matching runner configuration."
    }

    precondition {
      condition = alltrue([
        for runner_config in values(var.experimental.multi_runner_config) :
        length([
          for orchestration_type, orchestration_config in runner_config.orchestration_provider : orchestration_type
          if orchestration_config != null
        ]) == 1
      ])
      error_message = "Each experimental runner configuration must set exactly one orchestration block. Supported orchestration blocks: webhook."
    }

    precondition {
      condition = alltrue([
        for runner_config in values(var.experimental.multi_runner_config) :
        try(coalesce(runner_config.runner.os, var.experimental.runner.os), null) != null &&
        try(coalesce(runner_config.runner.architecture, var.experimental.runner.architecture), null) != null
      ])
      error_message = "Each experimental runner configuration must resolve runner.os and runner.architecture from the configuration or experimental global runner defaults."
    }

    precondition {
      condition = alltrue([
        for runner_config in values(var.experimental.multi_runner_config) :
        runner_config.orchestration_provider.webhook == null ? true :
        try(coalesce(
          runner_config.orchestration_provider.webhook.runner.boot_time_in_minutes,
          var.experimental.orchestration_provider.webhook.runner.boot_time_in_minutes,
        ), null) != null
      ])
      error_message = "Each experimental webhook runner configuration must resolve orchestration_provider.webhook.runner.boot_time_in_minutes from the configuration or experimental global webhook defaults."
    }

    precondition {
      condition = alltrue([
        for runner_config in values(var.experimental.multi_runner_config) :
        runner_config.orchestration_provider.webhook == null ? true :
        try(coalesce(
          runner_config.orchestration_provider.webhook.runner.maximum_count,
          var.experimental.orchestration_provider.webhook.runner.maximum_count,
        ), null) != null
      ])
      error_message = "Each experimental webhook runner configuration must resolve orchestration_provider.webhook.runner.maximum_count from the configuration or experimental global webhook defaults."
    }

    precondition {
      condition = alltrue([
        for runner_config in values(var.experimental.multi_runner_config) :
        runner_config.compute_provider.aws.ec2 == null ? true : (
          try(coalesce(runner_config.compute_provider.aws.ec2.vpc_id, var.experimental.compute_provider.aws.ec2.vpc_id), null) != null &&
          try(coalesce(runner_config.compute_provider.aws.ec2.subnet_ids, var.experimental.compute_provider.aws.ec2.subnet_ids), null) != null
        )
      ])
      error_message = "Each experimental EC2 runner configuration must resolve compute_provider.aws.ec2.vpc_id and subnet_ids from the configuration or experimental global EC2 defaults. Flat v1 inputs are not inherited by v2."
    }

    precondition {
      condition = alltrue([
        for runner_config in values(var.experimental.multi_runner_config) :
        runner_config.compute_provider.aws.microvm == null ? true : (
          try(coalesce(runner_config.runner.os, var.experimental.runner.os), null) == "linux" &&
          try(coalesce(runner_config.runner.architecture, var.experimental.runner.architecture), null) == "arm64"
        )
      ])
      error_message = "Each experimental Lambda MicroVM runner configuration must resolve runner.os = linux and runner.architecture = arm64."
    }

    precondition {
      condition = alltrue([
        for runner_config in values(var.experimental.multi_runner_config) :
        runner_config.compute_provider.aws.microvm == null ? true : try(
          runner_config.orchestration_provider.webhook != null &&
          coalesce(
            runner_config.orchestration_provider.webhook.runner.ephemeral,
            var.experimental.orchestration_provider.webhook.runner.ephemeral,
          ) &&
          coalesce(
            runner_config.orchestration_provider.webhook.runner.jit_config_enabled,
            var.experimental.orchestration_provider.webhook.runner.jit_config_enabled,
            runner_config.orchestration_provider.webhook.runner.ephemeral,
            var.experimental.orchestration_provider.webhook.runner.ephemeral,
          ),
          false,
        )
      ])
      error_message = "Each experimental Lambda MicroVM runner configuration must select webhook orchestration with ephemeral and JIT runner configuration enabled."
    }

    precondition {
      condition = alltrue([
        for runner_config in values(var.experimental.multi_runner_config) :
        runner_config.compute_provider.aws.microvm == null ? true : try(
          can(regex(
            "^arn:[^:]+:lambda:[^:]+:[0-9]{12}:microvm-image:.+$",
            coalesce(
              runner_config.compute_provider.aws.microvm.image_arn,
              var.experimental.compute_provider.aws.microvm.image_arn,
            ),
          )),
          false,
        )
      ])
      error_message = "Each experimental Lambda MicroVM runner configuration must resolve a valid compute_provider.aws.microvm.image_arn from the configuration or experimental global MicroVM defaults."
    }

    precondition {
      condition = alltrue([
        for runner_config in values(var.experimental.multi_runner_config) :
        runner_config.orchestration_provider.webhook == null ? true : (
          coalesce(
            runner_config.orchestration_provider.webhook.queue.visibility_timeout_seconds,
            var.experimental.orchestration_provider.webhook.queue.visibility_timeout_seconds,
            ) >= 6 * coalesce(
            runner_config.orchestration_provider.webhook.lambda.scale.up.timeout,
            var.experimental.orchestration_provider.webhook.lambda.scale.up.timeout,
          )
        )
      ])
      error_message = "Each experimental orchestration_provider.webhook.queue.visibility_timeout_seconds must be at least six times the resolved orchestration_provider.webhook.lambda.scale.up.timeout."
    }

    precondition {
      condition = !local.use_multi_runner_config_v2 || (
        (
          var.experimental.orchestration_provider.webhook.queue.encryption.sqs_managed_sse_enabled != null &&
          var.experimental.orchestration_provider.webhook.queue.encryption.kms_master_key_id == null &&
          var.experimental.orchestration_provider.webhook.queue.encryption.kms_data_key_reuse_period_seconds == null
          ) || (
          var.experimental.orchestration_provider.webhook.queue.encryption.sqs_managed_sse_enabled == null &&
          var.experimental.orchestration_provider.webhook.queue.encryption.kms_master_key_id != null
        )
      )
      error_message = "Invalid experimental.orchestration_provider.webhook.queue.encryption configuration for webhook orchestration. Use SQS-managed encryption, disable it, or configure a KMS key."
    }

    precondition {
      condition = !local.use_multi_runner_config_v2 || (
        var.experimental.orchestration_provider.webhook.queue.encryption.kms_master_key_id == null ||
        can(regex(
          "^arn:[^:]+:kms:[^:]+:[0-9]{12}:key/.+$",
          var.experimental.orchestration_provider.webhook.queue.encryption.kms_master_key_id,
        ))
      )
      error_message = "experimental.orchestration_provider.webhook.queue.encryption.kms_master_key_id must be a KMS key ARN; key IDs and aliases cannot be used in runner-config IAM policies."
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
      error_message = "Experimental ssm.paths.root base paths must start with '/'. The configuration key is appended during normalization."
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
        try(runner_config.compute_provider.aws.ec2.binaries_syncer.enabled, false)
        ]) || contains(
        ["Disabled", "Enabled", "Suspended"],
        var.experimental.compute_provider.aws.ec2.runner_binaries.s3.versioning,
      )
      error_message = "experimental.compute_provider.aws.ec2.runner_binaries.s3.versioning must be Disabled, Enabled, or Suspended."
    }

    precondition {
      condition = !local.use_multi_runner_config_v2 || !anytrue([
        for runner_config in values(local.translated_experimental_base.multi_runner_config) :
        try(runner_config.compute_provider.aws.ec2.binaries_syncer.enabled, false)
        ]) || contains(
        ["DISABLED", "ENABLED", "ENABLED_WITH_ALL_CLOUDTRAIL_MANAGEMENT_EVENTS"],
        var.experimental.compute_provider.aws.ec2.runner_binaries.syncer.schedule.state,
      )
      error_message = "experimental.compute_provider.aws.ec2.runner_binaries.syncer.schedule.state must be DISABLED, ENABLED, or ENABLED_WITH_ALL_CLOUDTRAIL_MANAGEMENT_EVENTS."
    }

    precondition {
      condition = var.experimental.compute_provider.aws.ec2.runner_binaries.targets == null ? true : alltrue([
        for key, target in var.experimental.compute_provider.aws.ec2.runner_binaries.targets :
        key == "${target.os}_${target.architecture}" &&
        contains(["linux", "osx", "windows"], target.os) &&
        contains(["x64", "arm64"], target.architecture)
      ])
      error_message = "experimental.compute_provider.aws.ec2.runner_binaries.targets keys must use <os>_<architecture> and values must use a supported runner OS and architecture."
    }

    precondition {
      condition = !local.use_multi_runner_config_v2 || contains(
        ["first", "random", "all"],
        var.experimental.orchestration_provider.webhook.queue_selection_strategy,
      )
      error_message = "experimental.orchestration_provider.webhook.queue_selection_strategy must be first, random, or all."
    }

    precondition {
      condition = !local.use_multi_runner_config_v2 || contains(
        ["Standard", "Advanced"],
        var.experimental.orchestration_provider.webhook.matcher_config_parameter_store_tier,
      )
      error_message = "experimental.orchestration_provider.webhook.matcher_config_parameter_store_tier must be Standard or Advanced."
    }

    precondition {
      condition = !local.use_multi_runner_config_v2 || (
        !(
          var.experimental.orchestration_provider.webhook.lambda.artifact.zip != null &&
          var.experimental.orchestration_provider.webhook.lambda.artifact.s3 != null
          ) && (
          var.experimental.orchestration_provider.webhook.lambda.artifact.s3 == null || (
            var.experimental.lambda.artifact.s3.bucket != null &&
            try(var.experimental.orchestration_provider.webhook.lambda.artifact.s3.key != null, false)
          )
        )
      )
      error_message = "experimental.orchestration_provider.webhook.lambda.artifact must set at most one of zip or s3; an s3 wrapper requires experimental.lambda.artifact.s3.bucket and a non-null key."
    }

    precondition {
      condition = !local.use_multi_runner_config_v2 || (
        !(
          var.experimental.orchestration_provider.webhook.lambda.webhook.artifact.zip != null &&
          var.experimental.orchestration_provider.webhook.lambda.webhook.artifact.s3 != null
          ) && (
          var.experimental.orchestration_provider.webhook.lambda.webhook.artifact.s3 == null || (
            var.experimental.lambda.artifact.s3.bucket != null &&
            try(var.experimental.orchestration_provider.webhook.lambda.webhook.artifact.s3.key != null, false)
          )
        )
      )
      error_message = "experimental.orchestration_provider.webhook.lambda.webhook.artifact must set at most one of zip or s3; an s3 wrapper requires experimental.lambda.artifact.s3.bucket and a non-null key."
    }

    precondition {
      condition = !local.use_multi_runner_config_v2 || (
        !(
          var.experimental.ssm.housekeeper.lambda.artifact.zip != null &&
          var.experimental.ssm.housekeeper.lambda.artifact.s3 != null
          ) && alltrue([
            for runner_config in values(var.experimental.multi_runner_config) : !(
              runner_config.ssm.housekeeper.lambda.artifact.zip != null &&
              runner_config.ssm.housekeeper.lambda.artifact.s3 != null
            )
        ])
      )
      error_message = "experimental ssm.housekeeper.lambda.artifact must set at most one of zip or s3 at each global or runner-configuration scope."
    }

    precondition {
      condition = !local.use_multi_runner_config_v2 || alltrue([
        for runner_config in values(local.translated_experimental_base.multi_runner_config) :
        runner_config.ssm.housekeeper.lambda.artifact.s3 == null || (
          var.experimental.lambda.artifact.s3.bucket != null &&
          try(runner_config.ssm.housekeeper.lambda.artifact.s3.key != null, false)
        )
      ])
      error_message = "A resolved experimental ssm.housekeeper.lambda.artifact.s3 wrapper requires experimental.lambda.artifact.s3.bucket and a non-null key."
    }

    precondition {
      condition = !local.use_multi_runner_config_v2 || (
        !(
          var.experimental.compute_provider.aws.ec2.instance_termination_watcher.artifact.zip != null &&
          var.experimental.compute_provider.aws.ec2.instance_termination_watcher.artifact.s3 != null
          ) && (
          var.experimental.compute_provider.aws.ec2.instance_termination_watcher.artifact.s3 == null || (
            var.experimental.lambda.artifact.s3.bucket != null &&
            try(var.experimental.compute_provider.aws.ec2.instance_termination_watcher.artifact.s3.key != null, false)
          )
        )
      )
      error_message = "experimental.compute_provider.aws.ec2.instance_termination_watcher.artifact must set at most one of zip or s3; an s3 wrapper requires experimental.lambda.artifact.s3.bucket and a non-null key."
    }

    precondition {
      condition = !local.use_multi_runner_config_v2 || (
        !(
          var.experimental.compute_provider.aws.ec2.ami.housekeeper.artifact.zip != null &&
          var.experimental.compute_provider.aws.ec2.ami.housekeeper.artifact.s3 != null
          ) && (
          var.experimental.compute_provider.aws.ec2.ami.housekeeper.artifact.s3 == null || (
            var.experimental.lambda.artifact.s3.bucket != null &&
            try(var.experimental.compute_provider.aws.ec2.ami.housekeeper.artifact.s3.key != null, false)
          )
        )
      )
      error_message = "experimental.compute_provider.aws.ec2.ami.housekeeper.artifact must set at most one of zip or s3; an s3 wrapper requires experimental.lambda.artifact.s3.bucket and a non-null key."
    }

    precondition {
      condition = !local.use_multi_runner_config_v2 || !(
        var.experimental.compute_provider.aws.ec2.runner_binaries.syncer.artifact.zip != null &&
        var.experimental.compute_provider.aws.ec2.runner_binaries.syncer.artifact.s3 != null
      )
      error_message = "experimental.compute_provider.aws.ec2.runner_binaries.syncer.artifact must set at most one of zip or s3."
    }

    precondition {
      condition = !local.use_multi_runner_config_v2 || (
        var.experimental.compute_provider.aws.ec2.runner_binaries.syncer.artifact.s3 == null ? true : (
          var.experimental.lambda.artifact.s3.bucket != null &&
          var.experimental.compute_provider.aws.ec2.runner_binaries.syncer.artifact.s3.key != null
        )
      )
      error_message = "experimental.compute_provider.aws.ec2.runner_binaries.syncer.artifact.s3 requires experimental.lambda.artifact.s3.bucket and a non-null key."
    }

    precondition {
      condition = !local.use_multi_runner_config_v2 || contains(
        ["AES256", "aws:kms", "aws:kms:dsse"],
        var.experimental.compute_provider.aws.ec2.runner_binaries.s3.encryption.sse_algorithm,
      )
      error_message = "experimental.compute_provider.aws.ec2.runner_binaries.s3.encryption.sse_algorithm must be AES256, aws:kms, or aws:kms:dsse."
    }

    precondition {
      condition = !local.use_multi_runner_config_v2 || (
        !var.experimental.compute_provider.aws.ec2.runner_binaries.s3.encryption.enabled ? (
          var.experimental.compute_provider.aws.ec2.runner_binaries.s3.encryption.kms_master_key_id == null
          ) : (
          var.experimental.compute_provider.aws.ec2.runner_binaries.s3.encryption.kms_master_key_id == null ||
          contains(
            ["aws:kms", "aws:kms:dsse"],
            var.experimental.compute_provider.aws.ec2.runner_binaries.s3.encryption.sse_algorithm,
          )
        )
      )
      error_message = "experimental.compute_provider.aws.ec2.runner_binaries.s3.encryption.sse_algorithm must be aws:kms or aws:kms:dsse when kms_master_key_id is set."
    }

    precondition {
      condition = alltrue([
        for runner_config in values(local.translated_experimental_base.multi_runner_config) :
        runner_config.orchestration_provider.webhook == null ? true : (
          !runner_config.orchestration_provider.webhook.queue.redrive_build_queue.enabled || try(
            runner_config.orchestration_provider.webhook.queue.redrive_build_queue.maxReceiveCount > 0,
            false,
          )
        )
      ])
      error_message = "An enabled experimental orchestration_provider.webhook.queue.redrive_build_queue requires maxReceiveCount greater than zero."
    }

    precondition {
      condition = !local.use_multi_runner_config_v2 || (
        var.experimental.compute_provider.aws.ec2.runner_binaries.s3.logging.prefix == null ||
        var.experimental.compute_provider.aws.ec2.runner_binaries.s3.logging.bucket != null
      )
      error_message = "experimental.compute_provider.aws.ec2.runner_binaries.s3.logging.prefix requires logging.bucket."
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

  }
}
