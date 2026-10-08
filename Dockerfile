FROM node:22-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    git \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

RUN mkdir /repomix
WORKDIR /repomix

# Install dependencies and build repomix, then link the package to the global scope
# To reduce the size of the layer, all steps are executed in the same RUN command
COPY . .
RUN npm ci \
    && npm link \
    && npm prune --omit=dev \
    && npm cache clean --force

WORKDIR /app

# Check the operation of repomix
# The CLI command name follows the npm package name (string-form "bin"), which the
# branding PR renames from "repomix" to "manteka-repomix". Resolving it at build
# time keeps a stable `repomix` entrypoint in the image regardless of the rename,
# so the image builds and runs both before and after the package is renamed.
RUN CLI_NAME="$(node -p "require('/repomix/package.json').name")" \
    && if [ "$CLI_NAME" != "repomix" ]; then ln -sf "$CLI_NAME" /usr/local/bin/repomix; fi \
    && repomix --version \
    && repomix --help

ENTRYPOINT ["repomix"]
