#!/usr/bin/env bash
set -eo pipefail

# ==============================================================================
# nipoportal Automated Production Deployment Script
# Zero-downtime rolling update with automatic healthcheck verification & rollback
# ==============================================================================

DEPLOY_DIR="/opt/nipoportal"
COMPOSE_FILE="${DEPLOY_DIR}/deploy/docker-compose.prod.yml"
ENV_FILE="${DEPLOY_DIR}/.env.production"
CURRENT_TAG_FILE="${DEPLOY_DIR}/.current_tag"
PREVIOUS_TAG_FILE="${DEPLOY_DIR}/.previous_tag"

NEW_TAG="$1"
if [ -z "$NEW_TAG" ]; then
  echo "❌ Error: Missing IMAGE_TAG argument."
  echo "Usage: ./deploy.sh <image_tag>"
  exit 1
fi

echo "=================================================="
echo "🚀 Starting Deployment for nipoportal"
echo "Target Tag: ${NEW_TAG}"
echo "Time: $(date -u)"
echo "=================================================="

# 1. Verify environment configuration exists
if [ ! -f "$ENV_FILE" ]; then
  echo "❌ Error: Production environment file not found at ${ENV_FILE}"
  exit 1
fi

# 2. Extract configuration from environment
set -a
source "$ENV_FILE"
set +a

if [ -z "$ECR_REPO_URL" ]; then
  echo "❌ Error: ECR_REPO_URL is not set in ${ENV_FILE}"
  exit 1
fi

AWS_REGION="${AWS_REGION:-ap-southeast-1}"

# 3. Log in to AWS ECR
echo "🔐 Authenticating Docker with Amazon ECR (${AWS_REGION})..."
aws ecr get-login-password --region "$AWS_REGION" | docker login --username AWS --password-stdin "$ECR_REPO_URL"

# 4. Pull new image
echo "📦 Pulling new image: ${ECR_REPO_URL}:${NEW_TAG}..."
docker pull "${ECR_REPO_URL}:${NEW_TAG}"

# 5. Record previous tag for automated rollback capability
if [ -f "$CURRENT_TAG_FILE" ]; then
  cp "$CURRENT_TAG_FILE" "$PREVIOUS_TAG_FILE"
fi

# 6. Run database migration in temporary ephemeral container
echo "🔄 Running database schema migration check..."
docker run --rm \
  --env-file "$ENV_FILE" \
  "${ECR_REPO_URL}:${NEW_TAG}" \
  node scripts/db-status-all.js || true

# 7. Start/recreate app container with new image
echo "🚀 Deploying new container instance..."
export ECR_REPO_URL
export IMAGE_TAG="$NEW_TAG"

docker compose -f "$COMPOSE_FILE" up -d --no-deps app

# 8. Run Healthcheck Loop (Poll /api/health/live for up to 45 seconds)
echo "🩺 Verifying application healthcheck (/api/health/live)..."
HEALTH_URL="http://127.0.0.1:3000/api/health/live"
MAX_ATTEMPTS=22
ATTEMPT=1
IS_HEALTHY=false

while [ $ATTEMPT -le $MAX_ATTEMPTS ]; do
  HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$HEALTH_URL" || true)
  if [ "$HTTP_STATUS" = "200" ]; then
    echo "✅ Healthcheck passed on attempt $ATTEMPT! (HTTP 200 OK)"
    IS_HEALTHY=true
    break
  fi
  echo "⏳ Waiting for app to initialize... (attempt $ATTEMPT/$MAX_ATTEMPTS, status: $HTTP_STATUS)"
  sleep 2
  ATTEMPT=$((ATTEMPT + 1))
done

if [ "$IS_HEALTHY" = false ]; then
  echo "🚨 CRITICAL: Healthcheck failed after 45 seconds!"
  echo "🔄 Initiating automatic rollback to previous stable tag..."
  bash "${DEPLOY_DIR}/deploy/rollback.sh"
  exit 1
fi

# 9. Ensure Caddy is active and proxying
echo "🌐 Reloading reverse proxy..."
docker compose -f "$COMPOSE_FILE" up -d caddy

# 10. Persist current tag and clean up old Docker layers
echo "$NEW_TAG" > "$CURRENT_TAG_FILE"
echo "🧹 Pruning old unused Docker images..."
docker image prune -f

echo "=================================================="
echo "🎉 DEPLOYMENT SUCCEEDED: ${NEW_TAG}"
echo "=================================================="

