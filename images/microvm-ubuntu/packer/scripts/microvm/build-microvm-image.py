#!/usr/bin/env python3
"""Package and publish the ARM64 Lambda MicroVM runner image."""

from __future__ import annotations

import base64
import datetime as dt
import hashlib
import json
import os
import re
import stat
import subprocess
import sys
import tempfile
import time
import zipfile
from dataclasses import dataclass
from decimal import Decimal
from pathlib import Path
from pathlib import PurePosixPath
from typing import Any, Iterable, Mapping

REPOSITORY_ROOT = Path(__file__).resolve().parents[3]
IMAGE_ROOT = Path(__file__).resolve().parent / 'image'
OUTPUT_ROOT = REPOSITORY_ROOT / 'output' / 'microvm'
DOCKERFILE = 'ubuntu24.arm64.Dockerfile'
ZIP_TIMESTAMP = (1980, 1, 1, 0, 0, 0)
WAIT_TIMEOUT_SECONDS = 3000
EXCLUDED_DIRECTORIES = {
    '.cache',
    '.git',
    '.mypy_cache',
    '.pytest_cache',
    '.ruff_cache',
    '__pycache__',
    'dist',
    'node_modules',
}
EXCLUDED_FILES = {'.DS_Store', '.git'}


class BuildError(RuntimeError):
    """Expected publication failure."""


@dataclass(frozen=True)
class Settings:
    region: str
    artifact_bucket: str
    build_role_arn: str
    egress_network_connector_arn: str
    environment_variables: Mapping[str, str]
    image_name: str
    idempotency_nonce: str
    lifecycle_hook_zip: Path
    log_group: str
    memory_mib: int
    output_dir: Path
    release_version: str
    ubuntu_image: str


@dataclass(frozen=True)
class Artifact:
    path: Path
    sha256: str


def environment(name: str, default: str = '') -> str:
    return os.environ.get(name, '').strip() or default


def load_settings() -> Settings:
    return Settings(
        region=environment('AWS_REGION'),
        artifact_bucket=environment('MICROVM_ARTIFACT_BUCKET'),
        build_role_arn=environment('MICROVM_BUILD_ROLE_ARN'),
        egress_network_connector_arn=environment(
            'MICROVM_EGRESS_NETWORK_CONNECTOR_ARN'
        ),
        environment_variables=json.loads(
            environment('MICROVM_ENVIRONMENT_VARIABLES', '{}')
        ),
        image_name=environment('MICROVM_IMAGE_NAME'),
        idempotency_nonce=environment('MICROVM_IDEMPOTENCY_NONCE'),
        lifecycle_hook_zip=Path(
            environment('MICROVM_LIFECYCLE_HOOK_ZIP')
        ).resolve(),
        log_group=environment('MICROVM_LOG_GROUP'),
        memory_mib=int(environment('MICROVM_MEMORY_MIB')),
        output_dir=Path(
            environment('MICROVM_OUTPUT_DIR', str(OUTPUT_ROOT))
        ).resolve(),
        release_version=environment('MICROVM_RELEASE_VERSION'),
        ubuntu_image=environment('MICROVM_UBUNTU_IMAGE'),
    )


def artifact_files(root: Path) -> Iterable[Path]:
    for current_root, directories, files in os.walk(root):
        directories[:] = sorted(
            name for name in directories if name not in EXCLUDED_DIRECTORIES
        )
        current = Path(current_root)
        for name in sorted(files):
            path = current / name
            if all(
                (
                    name not in EXCLUDED_FILES,
                    path.suffix not in {'.pyc', '.pyo'},
                    path.is_file(),
                    not path.is_symlink(),
                )
            ):
                yield path


def render_dockerfile(contents: bytes, ubuntu_image: str) -> bytes:
    rendered = re.sub(
        r'^ARG UBUNTU_IMAGE(?:=.*)?$',
        f"ARG UBUNTU_IMAGE={json.dumps(ubuntu_image)}",
        contents.decode(),
        flags=re.MULTILINE,
    )
    return rendered.encode()


def validate_lifecycle_hook_zip(path: Path) -> None:
    if not path.is_file():
        raise BuildError(
            f'MICROVM_LIFECYCLE_HOOK_ZIP must point to a file: {path}'
        )

    try:
        with zipfile.ZipFile(path) as archive:
            members = archive.infolist()
    except (OSError, zipfile.BadZipFile) as error:
        raise BuildError(
            f'MICROVM_LIFECYCLE_HOOK_ZIP is not a valid ZIP archive: {path}'
        ) from error

    files = set()
    for member in members:
        member_path = PurePosixPath(member.filename)
        if member_path.is_absolute() or '..' in member_path.parts:
            raise BuildError(
                'MICROVM_LIFECYCLE_HOOK_ZIP contains an unsafe archive path: '
                f'{member.filename}'
            )
        if stat.S_IFMT(member.external_attr >> 16) == stat.S_IFLNK:
            raise BuildError(
                'MICROVM_LIFECYCLE_HOOK_ZIP must not contain symbolic links: '
                f'{member.filename}'
            )
        if not member.filename.endswith('/'):
            files.add(member.filename)

    if 'server.js' not in files:
        raise BuildError(
            'MICROVM_LIFECYCLE_HOOK_ZIP must contain a compiled server.js '
            'at the archive root'
        )


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open('rb') as file_handle:
        for chunk in iter(lambda: file_handle.read(1024 * 1024), b''):
            digest.update(chunk)
    return digest.hexdigest()


def create_artifact(settings: Settings, ubuntu_image: str) -> Artifact:
    validate_lifecycle_hook_zip(settings.lifecycle_hook_zip)
    files = [
        (
            'Dockerfile'
            if path == IMAGE_ROOT / DOCKERFILE
            else path.relative_to(IMAGE_ROOT).as_posix(),
            path,
        )
        for path in artifact_files(IMAGE_ROOT)
    ]
    files.append(('lifecycle-hook.zip', settings.lifecycle_hook_zip))
    files.sort(key=lambda item: item[0])
    settings.output_dir.mkdir(parents=True, exist_ok=True)

    with tempfile.TemporaryDirectory(
        prefix='microvm-package-', dir=settings.output_dir
    ) as temporary:
        temporary_zip = Path(temporary) / 'microvm-image.zip'
        with zipfile.ZipFile(
            temporary_zip,
            mode='w',
            compression=zipfile.ZIP_DEFLATED,
            compresslevel=9,
        ) as archive:
            for archive_name, source in files:
                contents = source.read_bytes()
                if archive_name == 'Dockerfile':
                    contents = render_dockerfile(contents, ubuntu_image)
                mode = 0o755 if source.stat().st_mode & 0o111 else 0o644
                info = zipfile.ZipInfo(archive_name, ZIP_TIMESTAMP)
                info.create_system = 3
                info.compress_type = zipfile.ZIP_DEFLATED
                info.external_attr = (stat.S_IFREG | mode) << 16
                archive.writestr(
                    info,
                    contents,
                    compress_type=zipfile.ZIP_DEFLATED,
                    compresslevel=9,
                )

        digest = sha256_file(temporary_zip)
        artifact_path = settings.output_dir / (
            f"{settings.image_name}-{digest[:12]}.zip"
        )
        os.replace(temporary_zip, artifact_path)
    return Artifact(artifact_path, digest)


def source_revision() -> str:
    revision = environment('GITHUB_SHA') or environment('SOURCE_REVISION')
    if revision:
        return revision[:12]
    completed = subprocess.run(
        [
            'git',
            '-C',
            str(REPOSITORY_ROOT),
            'rev-parse',
            '--short=12',
            'HEAD',
        ],
        check=True,
        capture_output=True,
        text=True,
    )
    return completed.stdout.strip()


def aws_session(region: str) -> Any:
    try:
        import boto3  # type: ignore[import-not-found]
    except ModuleNotFoundError as error:
        raise BuildError(
            'boto3 is required to publish the MicroVM image'
        ) from error
    return boto3.Session(region_name=region)


def microvm_client(session: Any, region: str) -> Any:
    try:
        return session.client('lambda-microvms', region_name=region)
    except Exception as error:
        if type(error).__name__ == 'UnknownServiceError':
            raise BuildError(
                'AWS_DATA_PATH must contain the Lambda MicroVM service model'
            ) from error
        raise


def resolve_ubuntu_image(ecr: Any, image: str) -> str:
    if '@' in image:
        return image
    repository_uri, tag = image.rsplit(':', 1)
    registry, repository = repository_uri.split('/', 1)
    account = registry.split('.', 1)[0]
    response = ecr.describe_images(
        registryId=account,
        repositoryName=repository,
        imageIds=[{'imageTag': tag}],
    )
    digest = response['imageDetails'][0]['imageDigest']
    return f"{repository_uri}@{digest}"


def upload_artifact(
    s3: Any, settings: Settings, artifact: Artifact, revision: str
) -> str:
    key = f"lambda-microvms/artifacts/{artifact.sha256}.zip"
    checksum = base64.b64encode(bytes.fromhex(artifact.sha256)).decode()
    with artifact.path.open('rb') as file_handle:
        s3.put_object(
            Bucket=settings.artifact_bucket,
            Key=key,
            Body=file_handle,
            ChecksumSHA256=checksum,
            ContentType='application/zip',
            Metadata={
                'sha256': artifact.sha256,
                'source-revision': revision,
            },
        )
    return f"s3://{settings.artifact_bucket}/{key}"


def find_image(client: Any, name: str) -> str:
    request: dict[str, Any] = {'maxResults': 50, 'nameFilter': name}
    while True:
        response = client.list_microvm_images(**request)
        for image in response.get('items', []):
            if image.get('name') == name:
                return str(image['imageArn'])
        token = response.get('nextToken')
        if not token:
            return ''
        request['nextToken'] = token


def log_stream(settings: Settings) -> str:
    if settings.idempotency_nonce:
        return f"{settings.image_name}/{settings.idempotency_nonce}"
    return settings.image_name


def build_request(
    settings: Settings,
    artifact_uri: str,
    revision: str,
    image_arn: str,
) -> dict[str, Any]:
    operation = 'update' if image_arn else 'create'
    description = f"Ephemeral GitHub Actions runner from {revision}"
    if settings.release_version:
        description = (
            f"Ephemeral GitHub Actions runner release "
            f"{settings.release_version} from {revision}"
        )
    request: dict[str, Any] = {
        'additionalOsCapabilities': ['ALL'],
        'baseImageArn': (
            f"arn:aws:lambda:{settings.region}:aws:microvm-image:al2023-1"
        ),
        'buildRoleArn': settings.build_role_arn,
        'codeArtifact': {'uri': artifact_uri},
        'cpuConfigurations': [{'architecture': 'ARM_64'}],
        'description': description,
        'egressNetworkConnectors': [settings.egress_network_connector_arn],
        'environmentVariables': dict(settings.environment_variables),
        'hooks': {
            'port': 8080,
            'microvmHooks': {
                'run': 'ENABLED',
                'runTimeoutInSeconds': 60,
                'terminate': 'ENABLED',
                'terminateTimeoutInSeconds': 60,
            },
            'microvmImageHooks': {
                'ready': 'ENABLED',
                'readyTimeoutInSeconds': 120,
                'validate': 'ENABLED',
                'validateTimeoutInSeconds': 120,
            },
        },
        'logging': {
            'cloudWatch': {
                'logGroup': settings.log_group,
                'logStream': log_stream(settings),
            }
        },
        'resources': [{'minimumMemoryInMiB': settings.memory_mib}],
    }
    if operation == 'create':
        request['name'] = settings.image_name
    else:
        request['imageIdentifier'] = image_arn

    canonical = json.dumps(request, sort_keys=True, separators=(',', ':'))
    request['clientToken'] = hashlib.sha256(
        (
            f"{settings.region}|{operation}|{settings.idempotency_nonce}|"
            f"{canonical}"
        ).encode()
    ).hexdigest()
    return request


def start_build(client: Any, request: Mapping[str, Any]) -> dict[str, Any]:
    if 'imageIdentifier' in request:
        print('Starting Lambda MicroVM image update')
        return client.update_microvm_image(**request)
    print('Starting Lambda MicroVM image create')
    return client.create_microvm_image(**request)


def wait_for_image(
    client: Any, image_arn: str, image_version: str
) -> tuple[dict[str, Any], dict[str, Any]]:
    deadline = time.monotonic() + WAIT_TIMEOUT_SECONDS
    last_state: tuple[str, str, str] | None = None
    while time.monotonic() < deadline:
        try:
            version = client.get_microvm_image_version(
                imageIdentifier=image_arn,
                imageVersion=image_version,
            )
        except Exception as error:
            response = getattr(error, 'response', {})
            error_code = response.get('Error', {}).get('Code')
            if error_code == 'ResourceNotFoundException':
                time.sleep(10)
                continue
            raise

        state = str(version.get('state', 'UNKNOWN'))
        status = str(version.get('status', 'UNKNOWN'))
        image: dict[str, Any] = {}
        image_state = 'UNKNOWN'
        if state == 'SUCCESSFUL':
            image = client.get_microvm_image(imageIdentifier=image_arn)
            image_state = str(image.get('state', 'UNKNOWN'))
        observed = (state, status, image_state)
        if observed != last_state:
            print(
                f"MicroVM image version {image_version}: state={state} "
                f"status={status} image_state={image_state}"
            )
            last_state = observed
        if state == 'FAILED':
            raise BuildError(
                'MicroVM image build failed: '
                f"{version.get('stateReason', 'no reason returned')}"
            )
        if state == 'SUCCESSFUL' and status == 'ACTIVE' and image_state in {
            'CREATED',
            'UPDATED',
        }:
            return image, version
        time.sleep(10)
    raise BuildError(
        f"timed out waiting for MicroVM image after "
        f"{WAIT_TIMEOUT_SECONDS} seconds"
    )


def print_build_logs(
    logs: Any, settings: Settings, start_time_ms: int
) -> None:
    request: dict[str, Any] = {
        'logGroupName': settings.log_group,
        'logStreamNames': [log_stream(settings)],
        'startTime': start_time_ms,
    }
    while True:
        response = logs.filter_log_events(**request)
        for event in response.get('events', []):
            timestamp = (
                dt.datetime.fromtimestamp(
                    int(event['timestamp']) / 1000,
                    tz=dt.timezone.utc,
                )
                .isoformat(timespec='milliseconds')
                .replace('+00:00', 'Z')
            )
            message = str(event.get('message', '')).rstrip()
            print(f"[microvm-build {timestamp}] {message}")
        token = response.get('nextToken')
        if not token or token == request.get('nextToken'):
            return
        request['nextToken'] = token


def json_value(value: Any) -> Any:
    if isinstance(value, (dt.date, dt.datetime)):
        return value.isoformat()
    if isinstance(value, Decimal):
        return str(value)
    raise TypeError(f"{type(value).__name__} is not JSON serializable")


def write_manifest(path: Path, value: Mapping[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile(
        mode='w',
        encoding='utf-8',
        dir=path.parent,
        delete=False,
    ) as temporary:
        json.dump(
            value,
            temporary,
            default=json_value,
            indent=2,
            sort_keys=True,
        )
        temporary.write('\n')
        temporary_path = Path(temporary.name)
    os.replace(temporary_path, path)


def run() -> int:
    settings = load_settings()
    revision = source_revision()
    session = aws_session(settings.region)
    ecr = session.client('ecr', region_name=settings.region)
    ubuntu_image = resolve_ubuntu_image(ecr, settings.ubuntu_image)
    print(f"Using digest-pinned Ubuntu mirror: {ubuntu_image}")

    artifact = create_artifact(settings, ubuntu_image)
    print(f"Packaged MicroVM artifact: {artifact.path}")
    print(f"Artifact SHA-256: {artifact.sha256}")

    s3 = session.client('s3', region_name=settings.region)
    artifact_uri = upload_artifact(s3, settings, artifact, revision)
    print(f"Uploaded {artifact_uri}")

    client = microvm_client(session, settings.region)
    existing_image_arn = find_image(client, settings.image_name)
    request = build_request(
        settings,
        artifact_uri,
        revision,
        existing_image_arn,
    )
    started_at = int(time.time() * 1000) - 5000
    response = start_build(client, request)
    image_arn = str(response['imageArn'])
    image_version = str(response['imageVersion'])

    manifest = {
        'artifactSha256': artifact.sha256,
        'artifactUri': artifact_uri,
        'egressNetworkConnectorArn': settings.egress_network_connector_arn,
        'imageArn': image_arn,
        'imageVersion': image_version,
        'logGroup': settings.log_group,
        'logStream': log_stream(settings),
        'name': settings.image_name,
        'operation': 'update' if existing_image_arn else 'create',
        'region': settings.region,
        'releaseVersion': settings.release_version,
        'sourceRevision': revision,
        'ubuntuBaseImage': ubuntu_image,
    }
    manifest_path = settings.output_dir / 'microvm-image.json'
    write_manifest(manifest_path, manifest)

    try:
        image, version = wait_for_image(client, image_arn, image_version)
    finally:
        try:
            print_build_logs(
                session.client('logs', region_name=settings.region),
                settings,
                started_at,
            )
        except Exception as error:
            print(
                f"Warning: could not retrieve build logs: {error}",
                file=sys.stderr,
            )

    manifest.update(
        {
            'imageState': image.get('state'),
            'state': version.get('state'),
            'status': version.get('status'),
        }
    )
    write_manifest(manifest_path, manifest)
    print(
        f"Lambda MicroVM image is ready: "
        f"{image_arn} version {image_version}"
    )
    print(f"Manifest: {manifest_path}")
    return 0


def main() -> int:
    try:
        return run()
    except KeyboardInterrupt:
        print('Error: interrupted', file=sys.stderr)
        return 130
    except Exception as error:
        print(f"Error: {error}", file=sys.stderr)
        return 1


if __name__ == '__main__':
    raise SystemExit(main())
