#!/usr/bin/env bash
set -eo pipefail

# ==============================================================================
# nipoportal Instant Rollback Script
# Reverts container to the previously verified tag immediately
# ==============================================================================

DEPLOY_DIR="/opt/nipoportal"
COMPOSE_FILE="${DEPLOY_DIR}/deploy/docker-compose.prod.yml"
ENV_FILE="${DEPLOY_DIR}/.env.production"
CURRENT_TAG_FILE="${DEPLOY_DIR}/.current_tag"
PREVIOUS_TAG_FILE="${DEPLOY_DIR}/.previous_tag"

echo "=================================================="
echo "⚠️  ROLLBACK TRIGGERED FOR nipoportal"
echo "=================================================="

if [ ! -f "$PREVIOUS_TAG_FILE" ]; then
  echo "❌ Error: No previous tag recorded at ${PREVIOUS_TAG_FILE} to roll back to!"
  exit 1
fi

PREVIOUS_TAG=$(cat "$PREVIOUS_TAG_FILE")
if [ -z "$PREVIOUS_TAG" ]; then
  echo "❌ Error: Previous tag file is empty!"
  exit 1
fi

echo "⏪ Reverting to previous stable image tag: ${PREVIOUS_TAG}"

set -a
source "$ENV_FILE"
set +a

export ECR_REPO_URL
export IMAGE_TAG="$PREVIOUS_TAG"

docker compose -f "$COMPOSE_FILE" up -d --no-deps app

# Verify rollback health
echo "🩺 Verifying healthcheck for rollback target..."
sleep 4
STATUS=$(curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:3000/api/health/live || true)

if [ "$STATUS" = "200" ]; then
  echo "✅ Rollback verified healthy! Restoring tag pointers."
  cp "$PREVIOUS_TAG_FILE" "$CURRENT_TAG_FILE"
  docker compose -f "$COMPOSE_FILE" up -d caddy
  echo "🎉 ROLLBACK COMPLETED SUCCESSFULLY."
else
  echo "🚨 CRITICAL: Rolled back container also failed healthcheck (HTTP ${STATUS})!"
  echo "Check container logs: docker logs --tail 100 nipoportal_app"
  exit 1
fi

