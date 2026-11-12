#!/usr/bin/env bash

set -euo pipefail

project_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$project_dir"
runtime_dir="$project_dir/extension"

for command_name in node zip unzip; do
  if ! command -v "$command_name" >/dev/null 2>&1; then
    echo "缺少打包命令：$command_name" >&2
    exit 1
  fi
done

run_tests=true
for argument in "$@"; do
  case "$argument" in
    --skip-tests)
      run_tests=false
      ;;
    --help|-h)
      echo "用法：$0 [--skip-tests]"
      echo "生成 dist/tableaf-<版本>.zip（Chromium）"
      echo "生成 dist/tableaf-firefox-<版本>.zip（Firefox）"
      exit 0
      ;;
    *)
      echo "未知参数：$argument" >&2
      exit 1
      ;;
  esac
done

required_files=(
  extension/manifest.json
  extension/manifest.firefox.json
  extension/background.js
  extension/tab.html
  extension/app.js
  extension/styles.css
  extension/lib
  extension/_locales
  extension/images/favicon-16x16.png
  extension/images/favicon-48x48.png
  extension/images/favicon-128x128.png
)

for path in "${required_files[@]}"; do
  if [[ ! -e "$path" ]]; then
    echo "缺少发布文件：$path" >&2
    exit 1
  fi
done

if [[ "$run_tests" == true ]]; then
  npm test
fi

version="$(node -e '
  const fs = require("node:fs");
  const manifest = JSON.parse(fs.readFileSync("extension/manifest.json", "utf8"));
  process.stdout.write(manifest.version);
')"

if [[ -z "$version" ]]; then
  echo "无法从 manifest.json 读取版本号" >&2
  exit 1
fi

mkdir -p dist
staging_dirs=()

cleanup() {
  for staging_dir in "${staging_dirs[@]}"; do
    rm -rf -- "$staging_dir"
  done
}
trap cleanup EXIT

stage_runtime() {
  local staging_dir="$1"
  local manifest_source="$2"
  local runtime_dir="$3"

  # Copy only runtime files. README, tests, screenshots, market badges and
  # source artwork intentionally stay outside the release package.
  cp "$manifest_source" "$staging_dir/manifest.json"
  cp "$runtime_dir/background.js" \
    "$runtime_dir/tab.html" \
    "$runtime_dir/app.js" \
    "$runtime_dir/styles.css" \
    "$staging_dir/"

  mkdir -p "$staging_dir/lib" "$staging_dir/_locales" "$staging_dir/images"

  while IFS= read -r -d '' file; do
    cp "$file" "$staging_dir/lib/"
  done < <(find "$runtime_dir/lib" -maxdepth 1 -type f -name '*.js' -print0)

  while IFS= read -r -d '' file; do
    relative_path="${file#"$runtime_dir/"}"
    mkdir -p "$staging_dir/$(dirname "$relative_path")"
    cp "$file" "$staging_dir/$relative_path"
  done < <(find "$runtime_dir/_locales" -type f -name 'messages.json' -print0)

  cp "$runtime_dir/images/favicon-16x16.png" \
    "$runtime_dir/images/favicon-48x48.png" \
    "$runtime_dir/images/favicon-128x128.png" \
    "$staging_dir/images/"

  find "$staging_dir" -type f \( \
    -name '.DS_Store' -o \
    -name '._*' -o \
    -path '*/__MACOSX/*' \
  \) -delete

  node -e '
    const fs = require("node:fs");
    const manifest = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
    if (manifest.version !== process.argv[2]) {
      throw new Error("清单版本不一致");
    }
  ' "$staging_dir/manifest.json" "$version"
}

archive_staging() {
  local staging_dir="$1"
  local archive="$2"
  local unexpected_files

  rm -f "$archive"
  (
    cd "$staging_dir"
    zip -q -r "$archive" .
  )

  unexpected_files="$(
    unzip -Z1 "$archive" |
      grep -E '(^|/)(\.DS_Store|__MACOSX|README\.md|tests/|assets/|package\.json|manifest\.firefox\.json|TabLeaf\.png|svg/|\.vscode-upload\.json)$' ||
    true
  )"

  if [[ -n "$unexpected_files" ]]; then
    echo "打包失败：压缩包中包含无关文件：" >&2
    echo "$unexpected_files" >&2
    rm -f "$archive"
    exit 1
  fi

  unzip -tq "$archive" >/dev/null
}

chromium_staging="$(mktemp -d "${TMPDIR:-/tmp}/tableaf-chromium.XXXXXX")"
firefox_staging="$(mktemp -d "${TMPDIR:-/tmp}/tableaf-firefox.XXXXXX")"
staging_dirs+=("$chromium_staging" "$firefox_staging")

stage_runtime "$chromium_staging" "$runtime_dir/manifest.json" "$runtime_dir"
stage_runtime "$firefox_staging" "$runtime_dir/manifest.firefox.json" "$runtime_dir"

chromium_archive="$project_dir/dist/tableaf-$version.zip"
firefox_archive="$project_dir/dist/tableaf-firefox-$version.zip"
archive_staging "$chromium_staging" "$chromium_archive"
archive_staging "$firefox_staging" "$firefox_archive"

echo
echo "打包完成：$chromium_archive"
echo "打包完成：$firefox_archive"
echo "版本：$version"
