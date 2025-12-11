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
# Modifications:
# - Adapted directory variable: `JETBRAINS_INTELLIJ_ZSH_DIR` -> `THEIA_ZSH_DIR`.
# - Removed IntelliJ session bootstrap (JEDITERM_SOURCE and `_INTELLIJ_FORCE_SET_*` / `_INTELLIJ_FORCE_PREPEND_*` handling,
#   plus the one-time `precmd_functions` hook injection).
# - Removed legacy command block support handling.
#
# Source: 
# https://github.com/JetBrains/intellij-community/blob/8d02751ced444e5b70784fe0a757f960fe495a67/plugins/terminal/resources/shell-integrations/zsh/zsh-integration.zsh
# *****************************************************************************

builtin local command_block_support="${THEIA_ZSH_DIR}/command-block-support.zsh"
[ -r "$command_block_support" ] && builtin source "$command_block_support"
builtin unset THEIA_ZSH_DIR
