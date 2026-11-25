# Build environment for the Tauri 1 desktop app on Ubuntu 20.04 (focal).
# Built on focal itself, so the binary links against focal's glibc 2.31 and webkit2gtk-4.0.
FROM --platform=linux/amd64 ubuntu:20.04

ENV DEBIAN_FRONTEND=noninteractive

RUN apt-get update && apt-get install -y --no-install-recommends \
		build-essential ca-certificates curl wget file git pkg-config xz-utils patchelf \
		libssl-dev libgtk-3-dev libwebkit2gtk-4.0-dev libayatana-appindicator3-dev librsvg2-dev \
	&& rm -rf /var/lib/apt/lists/*

ENV RUSTUP_HOME=/opt/rustup CARGO_HOME=/opt/cargo PATH=/opt/cargo/bin:/opt/node/bin:$PATH
RUN curl -sSf https://sh.rustup.rs | sh -s -- -y --profile minimal --default-toolchain stable

# Node only runs the Tauri 1 CLI; the frontend is built on the host.
ARG NODE_VERSION=20.18.1
RUN mkdir -p /opt/node \
	&& curl -sSfL https://nodejs.org/dist/v${NODE_VERSION}/node-v${NODE_VERSION}-linux-x64.tar.xz \
		| tar -xJ -C /opt/node --strip-components=1

WORKDIR /work
