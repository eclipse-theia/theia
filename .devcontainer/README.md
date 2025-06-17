# Theia Development Container

This directory contains configuration for a development container that provides a consistent environment for Theia development.

## Features

- Node.js 20 development environment
- Python 3.11 for required scripts
- Desktop environment with VNC access for GUI applications
- X11 and audio libraries for Electron support
- Pre-configured ports for Theia applications

## Usage

### Starting Theia

The container provides several convenience aliases:

- `theia-browser` - Start Theia in browser mode (port 3000)
- `theia-watch` - Watch for changes in both browser and electron apps

### Ports

- 3000: Theia Browser App

## Customizing

You can customize this development container by:

1. Modifying `devcontainer.json` to add features or extensions
2. Updating `Dockerfile` to install additional dependencies
3. Adjusting `post-create.sh` to configure the environment during setup
