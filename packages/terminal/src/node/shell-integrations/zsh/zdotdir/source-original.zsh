# *****************************************************************************
# Copyright (C) 2000-2025 JetBrains s.r.o.
# Modifications (C) 2025 Fangxing Liu
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#     http://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS IS" BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions
# and limitations under the License.
#
# Source:
# https://github.com/JetBrains/intellij-community/blob/8d02751ced444e5b70784fe0a757f960fe495a67/plugins/terminal/resources/shell-integrations/zsh/zdotdir/source-original.zsh
# *****************************************************************************

# This is a helper script for loading Zsh user configuration files in the global scope.
# How to use it: 
# 1. Set THEIA_ORIGINAL_FILENAME_TO_SOURCE to the name of the configuration file to load.
# 2. Source this script to load the file in the global Zsh scope.

# We are in the global scope => prefix variables with `THEIA_`.

THEIA_ORIGINAL_FILE="${THEIA_ORIGINAL_ZDOTDIR:-$HOME}/$THEIA_ORIGINAL_FILENAME_TO_SOURCE"

if [[ -f "$THEIA_ORIGINAL_FILE" ]]; then
  # prevent recursion, just in case
  if [[ "$ZDOTDIR" != "${THEIA_ORIGINAL_ZDOTDIR:-$HOME}" ]]; then
    THEIA_ZDOTDIR_COPY="$ZDOTDIR"

    # Correct ZDOTDIR before sourcing the user's file as it might rely on the value of ZDOTDIR.
    if [[ -n "$THEIA_ORIGINAL_ZDOTDIR" ]]; then
      ZDOTDIR="$THEIA_ORIGINAL_ZDOTDIR"
    else
      builtin unset ZDOTDIR # defaults ZDOTDIR to HOME
    fi

    builtin source "$THEIA_ORIGINAL_FILE"

    # ZDOTDIR might be changed by the user config
    if [[ -n "$ZDOTDIR" ]]; then
      THEIA_ORIGINAL_ZDOTDIR="$ZDOTDIR"
    else
      builtin unset THEIA_ORIGINAL_ZDOTDIR
    fi

    # Set back to the IntelliJ location to continue injecting IntelliJ shell integration.
    ZDOTDIR="$THEIA_ZDOTDIR_COPY"
  fi
fi

builtin unset THEIA_ORIGINAL_FILE
builtin unset THEIA_ZDOTDIR_COPY
builtin unset THEIA_ORIGINAL_FILENAME_TO_SOURCE
