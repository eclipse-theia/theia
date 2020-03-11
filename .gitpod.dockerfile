FROM gitpod/workspace-full-vnc:latest

# Install custom tools, runtime, etc.
RUN sudo apt-get update \
    # window manager
    && sudo apt-get install -y jwm \
    # electron
    && sudo apt-get install -y libgtk-3-0 libnss3 libasound2 \
    # native-keymap
    && sudo apt-get install -y libx11-dev libxkbfile-dev \
    && sudo rm -rf /var/lib/apt/lists/*

# Pin Node.js to v10.
RUN bash -c ". .nvm/nvm.sh \
    && nvm install 10 \
    && nvm use 10 \
    && nvm alias default 10 \
    && npm install -g yarn"
