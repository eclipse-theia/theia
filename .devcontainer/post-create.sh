#!/bin/bash
# Exit immediately if a command exits with a non-zero status
set -e

# Install dependencies
echo "Installing dependencies..."
npm ci

# Build Theia
echo "Building Theia..."
npm run build

# Download plugins for browser mode
echo "Downloading plugins..."
npm run download:plugins -- --rate-limit 3

# Add convenience scripts to .bashrc and .zshrc
BROWSER_SCRIPT='alias theia-browser="npm run start:browser"'
WATCH_SCRIPT='alias theia-watch="npm run watch:browser"'

echo "$BROWSER_SCRIPT" >> ~/.bashrc
echo "$WATCH_SCRIPT" >> ~/.bashrc

if [ -f ~/.zshrc ]; then
    echo "$BROWSER_SCRIPT" >> ~/.zshrc
    echo "$WATCH_SCRIPT" >> ~/.zshrc
fi

echo "Setup complete! You can now run:"
echo "- theia-browser      # to start Theia in browser mode (port 3000)"
echo "- theia-watch        # to watch browser app"
echo ""
echo "For debugging:"
echo "- Use 'Launch Browser Backend' to debug backend"
echo "- Open http://localhost:3000 in your browser"
echo "- Use browser DevTools (F12) to debug frontend"
