#!/usr/bin/env bash
# Builds the GitYak desktop app as a .deb for Ubuntu 20.04 (Tauri 1 shell, src-tauri-v1).
#
# The frontend and the remote worker are built on the host; the Rust shell is compiled and
# bundled inside an ubuntu:20.04 container (linux/amd64), so the result links against
# focal's glibc 2.31 and webkit2gtk-4.0. Output: dist-linux/*.deb
#
# Requires Docker, plus what `yarn build:remote-worker` needs (Rust, cargo-zigbuild, zig).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
IMAGE=gityak-focal-builder
OUT="$ROOT/dist-linux"

cd "$ROOT"

echo "==> Remote worker (bundled as a resource)"
yarn build:remote-worker

echo "==> Frontend for Tauri 1"
yarn workspace @git-yak/client build:tauri-v1

echo "==> Builder image ($IMAGE)"
docker build --platform linux/amd64 -t "$IMAGE" packages/client/src-tauri-v1

echo "==> Tauri 1 bundle inside ubuntu:20.04"
# Cargo registry, build output and npm cache live in volumes: rebuilds are incremental, and
# no Linux artefacts land in the macOS checkout except the final .deb.
docker run --rm --platform linux/amd64 \
	-v "$ROOT":/work \
	-v gityak-focal-cargo-registry:/opt/cargo/registry \
	-v gityak-focal-cargo-git:/opt/cargo/git \
	-v gityak-focal-target:/target \
	-v gityak-focal-npm:/root/.npm \
	-e CARGO_TARGET_DIR=/target \
	"$IMAGE" \
	bash -euo pipefail -c '
		# The Tauri 1 CLI searches the project for a tauri.conf.json and takes the Tauri 2
		# one in src-tauri. It runs in a copy holding only what the Tauri 1 shell uses, laid
		# out like the repository so the relative paths in its config still resolve.
		rm -rf /build && mkdir -p /build/client/src-tauri/src /build/remote-worker/dist
		cp -r /work/packages/client/src-tauri-v1 /work/packages/client/dist-tauri-v1 /build/client/
		cp -r /work/packages/client/src-tauri/icons /build/client/src-tauri/
		cp /work/packages/client/src-tauri/src/shared_commands.rs /build/client/src-tauri/src/
		cp /work/packages/remote-worker/dist/remote-worker-linux-x64 /build/remote-worker/dist/

		cd /build/client/src-tauri-v1
		npx --yes @tauri-apps/cli@^1.6 build

		# Keep the resolved dependency versions with the sources.
		cp Cargo.lock /work/packages/client/src-tauri-v1/
		mkdir -p /work/dist-linux
		cp /target/release/bundle/deb/*.deb /work/dist-linux/
	'

echo "==> Done:"
ls -lh "$OUT"/*.deb
