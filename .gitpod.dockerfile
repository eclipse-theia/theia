FROM gitpod/workspace-full-vnc:latest

USER root
# Install custom tools, runtime, etc.
RUN apt-get update \
    # window manager
    && apt-get install -y jwm \
    # electron
    && apt-get install -y libgtk-3-0 libnss3 libasound2 \
    # native-keymap
    && apt-get install -y libx11-dev libxkbfile-dev \
    && apt-get clean && rm -rf /var/cache/apt/* && rm -rf /var/lib/apt/lists/* && rm -rf /tmp/*

USER gitpod
# Apply user-specific settings
RUN bash -c ". .nvm/nvm.sh \
    && nvm install 10 \
    && nvm use 10 \
    && npm install -g yarn"

# Give back control
USER root
