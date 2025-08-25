# Multi-stage build for Eclipse Theia Monorepo
FROM node:18-alpine AS builder

ARG UID=1000
ARG GID=1000
ARG NAME=theia

# Install necessary system dependencies for building
RUN apk add --no-cache \
    shadow \
    make \
    gcc \
    g++ \
    pkgconfig \
    libx11-dev \
    libxkbfile-dev \
    python3 \
    py3-setuptools \
    git \
    openssh-client \
    curl \
    bash

# Prepare user - handle root case specially
RUN set -eux; \
    if [ "${UID}" = "0" ] && [ "${GID}" = "0" ] && [ "${NAME}" = "root" ]; then \
        # Root case - root user already exists, just ensure /theia directory
        mkdir -p /theia; \
    else \
        # Non-root case - create/modify user and group
        if getent group "${GID}" >/dev/null; then \
            existing_group="$(getent group "${GID}" | cut -d: -f1)"; \
            if [ "${existing_group}" != "${NAME}" ]; then \
                groupmod -n "${NAME}" "${existing_group}"; \
            fi; \
        else \
            addgroup -g "${GID}" -S "${NAME}"; \
        fi; \
        if getent passwd "${UID}" >/dev/null; then \
            existing_user="$(getent passwd "${UID}" | cut -d: -f1)"; \
            if [ "${existing_user}" != "${NAME}" ]; then \
                usermod -l "${NAME}" "${existing_user}"; \
                usermod -d "/theia" -m "${NAME}"; \
                usermod -g "${NAME}" "${NAME}"; \
            fi; \
        else \
            adduser -S -D -H \
                -u "${UID}" \
                -G "${NAME}" \
                -h "/theia" \
                -s /bin/bash \
                "${NAME}"; \
        fi; \
        mkdir -p /theia; \
    fi

# Create working directory
WORKDIR /theia

# Copy root configuration files for monorepo
COPY package*.json ./
COPY lerna.json ./
COPY tsconfig*.json ./
COPY tsfmt.json ./

# Copy important directories
COPY configs/ ./configs/
COPY dev-packages/ ./dev-packages/
COPY packages/ ./packages/
COPY examples/ ./examples/
# COPY sample-plugins/ ./sample-plugins/
COPY scripts/ ./scripts/

# Install dependencies for the entire monorepo
RUN npm install

# Run node-gyp install as specified in preinstall script
RUN npm run preinstall

# Run postinstall to configure all packages
RUN npm run postinstall

# Build browser application
RUN npm run build:browser

# Production stage
FROM node:18-alpine AS production

ARG UID=1000
ARG GID=1000
ARG NAME=theia
ARG PORT=3000

# Install runtime dependencies
RUN apk add --no-cache \
    shadow \
    git \
    openssh-client \
    bash \
    curl \
    python3

# Prepare user - handle root case specially
RUN set -eux; \
    if [ "${UID}" = "0" ] && [ "${GID}" = "0" ] && [ "${NAME}" = "root" ]; then \
        # Root case - root user already exists, just ensure /theia directory
        mkdir -p /theia; \
    else \
        # Non-root case - create/modify user and group
        if getent group "${GID}" >/dev/null; then \
            existing_group="$(getent group "${GID}" | cut -d: -f1)"; \
            if [ "${existing_group}" != "${NAME}" ]; then \
                groupmod -n "${NAME}" "${existing_group}"; \
            fi; \
        else \
            addgroup -g "${GID}" -S "${NAME}"; \
        fi; \
        if getent passwd "${UID}" >/dev/null; then \
            existing_user="$(getent passwd "${UID}" | cut -d: -f1)"; \
            if [ "${existing_user}" != "${NAME}" ]; then \
                usermod -l "${NAME}" "${existing_user}"; \
                usermod -d "/theia" -m "${NAME}"; \
                usermod -g "${NAME}" "${NAME}"; \
            fi; \
        else \
            adduser -S -D -H \
                -u "${UID}" \
                -G "${NAME}" \
                -h "/theia" \
                -s /bin/bash \
                "${NAME}"; \
        fi; \
        mkdir -p /theia; \
    fi

# Create working directory
WORKDIR /theia

# Copy necessary configuration files
COPY --from=builder /theia/package*.json ./
COPY --from=builder /theia/lerna.json ./

# Copy only browser example and its dependencies
COPY --from=builder /theia/examples ./examples
COPY --from=builder /theia/node_modules ./node_modules

# Copy built packages
COPY --from=builder /theia/packages ./packages
COPY --from=builder /theia/dev-packages ./dev-packages

# Copy plugins
# COPY --from=builder /theia/plugins ./plugins

# Set file ownership - only for non-root users
RUN if [ "${UID}" != "0" ]; then \
        chown -R ${NAME}:${NAME} /theia; \
    fi

# Switch to specified user
USER ${NAME}

# Expose port
EXPOSE ${PORT}

# Environment variables for Theia
ENV SHELL=/bin/bash \
    NODE_ENV=production

# Create workspace directory
RUN mkdir -p /theia/workspace

# Start browser application
# CMD ["npm", "run", "start:browser", "--", "--hostname=0.0.0.0", "--port=${PORT}"] # still use localhost
WORKDIR /theia/examples/browser
CMD npx theia start /theia/workspace --hostname=0.0.0.0 --port ${PORT} --plugins=local-dir:/theia/plugins --ovsx-router-config=../ovsx-router-config.json
