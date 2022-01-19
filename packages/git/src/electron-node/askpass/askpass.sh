#!/bin/sh
# Based on: https://github.com/Microsoft/vscode/blob/77f0e95307675c3936c05d641f72b8b32dc8e274/extensions/git/src/askpass.sh

"$THEIA_GIT_ASKPASS_NODE" "$THEIA_GIT_ASKPASS_MAIN" $*
