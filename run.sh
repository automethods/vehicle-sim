#!/usr/bin/env bash
set -euo pipefail

cd -- "$(dirname -- "${BASH_SOURCE[0]}")"

browser=true
case "${1:-}" in
  '') ;;
  --no-browser) browser=false ;;
  -h|--help)
    printf 'Usage: %s [--no-browser]\n' "$0"
    exit 0
    ;;
  *)
    printf 'Usage: %s [--no-browser]\n' "$0" >&2
    exit 2
    ;;
esac

default_port=8794
default_preview=1
if [[ -n "${BASE_PATH:-}" ]]; then
  default_port=8792
  default_preview=0
fi
export LAB_LOCAL_PREVIEW="${LAB_LOCAL_PREVIEW:-$default_preview}"
port=${PORT:-$default_port}
export PORT="$port"
url="http://127.0.0.1:$port${BASE_PATH:-}/"

lab_ready() {
  [[ -n "$expected_build" ]] &&
    [[ "$(curl --noproxy '*' --fail --silent --max-time 1 "${url}api/build")" == "$expected_build" ]]
}

open_browser() {
  if [[ "$browser" == true && -n "${DISPLAY:-}${WAYLAND_DISPLAY:-}" ]] && command -v xdg-open >/dev/null; then
    xdg-open "$url" >/dev/null 2>&1 &
  fi
}

expected_build=
if [[ "$port" != 0 ]] && command -v curl >/dev/null && command -v sha256sum >/dev/null && [[ -r dist/server.js ]]; then
  export LC_COLLATE=C
  build=$(cat dist/*.js public/index.html public/style.css scripts/render-run-report.py bridge.py | sha256sum)
  preview=false
  if [[ "$LAB_LOCAL_PREVIEW" == 1 ]]; then preview=true; fi
  expected_build=$(printf '{"build":"%s","localPreview":%s}' "${build%% *}" "$preview")
  if lab_ready; then
    printf 'Vehicle lab is already running at %s\n' "$url"
    open_browser
    exit 0
  fi
  if curl --noproxy '*' --fail --silent --max-time 1 "$url" >/dev/null; then
    printf 'A different build or mode is running at %s\nStop that server and relaunch, or set PORT to a free local port.\n' "$url" >&2
    exit 1
  fi
fi

if ! command -v node >/dev/null || ! node -e 'process.exit(Number(process.versions.node.split(".")[0]) < 22 ? 1 : 0)'; then
  printf 'My Vehicle Sim requires Node.js 22 or newer on PATH.\n' >&2
  exit 1
fi
python_bin=${PYTHON:-python3}
if ! command -v "$python_bin" >/dev/null || ! "$python_bin" -c 'import sys; sys.exit(sys.version_info < (3, 10))'; then
  printf 'My Vehicle Sim requires Python 3.10 or newer. Check PATH or the PYTHON setting.\n' >&2
  exit 1
fi

if [[ ! -r dist/server.js ]]; then
  printf 'The simulator build is missing. Run npm ci and npm run build from %s.\n' "$PWD" >&2
  exit 1
fi

if [[ "$port" != 0 && "$browser" == true && -n "${DISPLAY:-}${WAYLAND_DISPLAY:-}" ]] &&
    command -v curl >/dev/null && command -v xdg-open >/dev/null; then
  (
    for attempt in {1..40}; do
      if lab_ready; then
        open_browser
        exit 0
      fi
      sleep 0.25
    done
  ) &
fi

exec node dist/server.js
