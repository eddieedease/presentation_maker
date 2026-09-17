#!/usr/bin/env bash
#
# Builds a deployable bundle for shared hosting.
#
#   ./scripts/build-release.sh
#
# Produces release/presentation-maker/ and release/presentation-maker.zip.
# Upload the contents of the zip to your web root (or any subdirectory) and
# open install.php in a browser.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT="$ROOT/release/presentation-maker"
ZIP="$ROOT/release/presentation-maker.zip"

echo "==> Building the Angular frontend"
cd "$ROOT/frontend"
[ -d node_modules ] || npm ci
npm run build -- --configuration production

BROWSER_DIR="$ROOT/frontend/dist/frontend/browser"
[ -d "$BROWSER_DIR" ] || { echo "Build output not found at $BROWSER_DIR" >&2; exit 1; }

echo "==> Assembling the bundle"
rm -rf "$OUT" "$ZIP"
mkdir -p "$OUT/app"

# 1. The compiled frontend becomes the web root.
cp -R "$BROWSER_DIR/." "$OUT/"

# 2. The PHP front controller and the installer sit beside it.
cp "$ROOT/backend/public/index.php" "$OUT/api.php"
cp "$ROOT/backend/public/install.php" "$OUT/install.php"

# 3. Everything else goes under app/, which .htaccess blocks from the web.
cp -R "$ROOT/backend/src" "$OUT/app/src"
mkdir -p "$OUT/app/database"
cp "$ROOT/backend/database/schema.sql" "$OUT/app/database/schema.sql"

# 4. Server configuration.
cp "$ROOT/deploy/root.htaccess" "$OUT/.htaccess"
cp "$ROOT/deploy/app.htaccess" "$OUT/app/.htaccess"

echo "==> Zipping"
cd "$OUT"
if command -v zip >/dev/null 2>&1; then
  zip -qr "$ZIP" . -x '.DS_Store'
  echo "    $ZIP"
else
  echo "    zip not installed — upload the folder instead"
fi

echo
echo "Bundle ready: $OUT"
echo "Upload its contents to your web root, then open install.php in a browser."
