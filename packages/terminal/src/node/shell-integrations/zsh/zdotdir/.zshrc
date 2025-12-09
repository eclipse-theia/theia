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
# https://github.com/JetBrains/intellij-community/blob/master/plugins/terminal/resources/shell-integrations/zsh/zdotdir/.zshrc
# *****************************************************************************

# See doc in .zshenv for how Theia injects itself into Zsh startup process.

# HISTFILE is set to `${ZDOTDIR:-$HOME}/.zsh_history` in /etc/zshrc when ZDOTDIR
# pointed to an internal Theia directory, so the HISTFILE variable is set incorrectly.
# Correct it before sourcing the original .zshrc as user configuration may depend on it.
HISTFILE="${THEIA_ORIGINAL_ZDOTDIR:-$HOME}/.zsh_history"

THEIA_ORIGINAL_FILENAME_TO_SOURCE='.zshrc'
builtin source "$THEIA_ZSH_DIR/zdotdir/source-original.zsh"

# Restore original ZDOTDIR. Once ZDOTDIR is restored, further user configuration files are
# sourced normally by Zsh. At this point, only .zlogin remains, so it's read directly by Zsh.
if [[ -n "${THEIA_ORIGINAL_ZDOTDIR-}" ]]; then
  ZDOTDIR="$THEIA_ORIGINAL_ZDOTDIR"
  builtin unset 'THEIA_ORIGINAL_ZDOTDIR'
else
  # defaults ZDOTDIR to HOME
  builtin unset 'ZDOTDIR'
fi

if [[ -f "${THEIA_ZSH_DIR}/zsh-integration.zsh" ]]; then
  builtin source "${THEIA_ZSH_DIR}/zsh-integration.zsh"
fi
