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
# - Rebranded variables from `JETBRAINS_INTELLIJ_*` to `THEIA_*`.
# - Removed optional debug logging controlled by `JETBRAINS_INTELLIJ_TERMINAL_DEBUG_LOG_LEVEL`.
#
# Source:
# https://github.com/JetBrains/intellij-community/blob/8d02751ced444e5b70784fe0a757f960fe495a67/plugins/terminal/resources/shell-integrations/zsh/zdotdir/.zprofile
# *****************************************************************************

# See doc in .zshenv for how IntelliJ injects itself into Zsh startup process.

THEIA_ORIGINAL_FILENAME_TO_SOURCE='.zprofile'
builtin source "$THEIA_ZSH_DIR/zdotdir/source-original.zsh"
