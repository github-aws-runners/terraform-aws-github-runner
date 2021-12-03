$TOP_DIR=$(git rev-parse --show-toplevel)
$OUTPUT_DIR="$TOP_DIR/lambda_output"

New-Item "$OUTPUT_DIR" -ItemType Directory -ErrorAction SilentlyContinue

$env:DOCKER_BUILDKIT=1 
docker build --no-cache --target=final --output=type=local,dest="$OUTPUT_DIR" -f "$TOP_DIR/.ci/Dockerfile" "$TOP_DIR"

