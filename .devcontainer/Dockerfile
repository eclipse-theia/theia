FROM mcr.microsoft.com/devcontainers/typescript-node:20-bookworm

# Install dependencies needed for Theia development
RUN apt-get update && apt-get install -y \
    libxkbfile-dev \
    libsecret-1-dev \
    && rm -rf /var/lib/apt/lists/*

# Configure git to not show the codespaces theme status
RUN git config --system codespaces-theme.hide-status 1

# Setup workspace directory with proper permissions
RUN mkdir -p /workspace && chown -R node:node /workspace

# Setup Node user
USER node
WORKDIR /workspace

# Install node-gyp globally for native module compilation
RUN npm install -g node-gyp

# Switch back to root for any remaining setup
USER root

# Set the default command - the container will run indefinitely
CMD ["sleep", "infinity"]
