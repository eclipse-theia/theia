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
# *****************************************************************************

# This is an entry point of Theia Zsh shell integration.
# The goal is to source `zsh-integration.zsh` file after sourcing the user's ~/.zshrc.
# This ensures that Theia's `precmd` hook is appended last to the `precmd_functions`
# array and therefore executed last. This allows control over the PS1 environment
# variable from the `precmd` hook even if other `precmd` hooks are also modifying it.

# According to http://zsh.sourceforge.net/Doc/Release/Files.html, zsh startup configuration files are read in this order:
# 1. /etc/zshenv
# 2. $ZDOTDIR/.zshenv
# 3. /etc/zprofile (if shell is login)
# 4. $ZDOTDIR/.zprofile (if shell is login)
# 5. /etc/zshrc (if shell is interactive)
# 6. $ZDOTDIR/.zshrc (if shell is interactive)
# 7. /etc/zlogin (if shell is login)
# 8. $ZDOTDIR/.zlogin (if shell is login)
#
# If ZDOTDIR is unset, HOME is used instead.

# Theia launches zsh with a custom ZDOTDIR pointing to the parent directory of this file
# in order to source `zsh-integration.zsh` from the custom .zshrc.
# However, using a custom ZDOTDIR prevents the user's configuration files
# (~/.zshenv, ~/.zprofile, ~/.zshrc, ~/.zlogin) from being read.
# To address this, each user's configuration file is sourced manually from its custom counterpart.

# This file is read, because Theia launches zsh with custom ZDOTDIR.

# Implementation notes on safe shell scripting:
# * Use `builtin` prefix to avoid accidentally calling user-defined functions / aliases.
# * Use ${var-default} or ${var:-default} to not fail in configurations with `setopt nounset`.
# * Use "${var}" to preserve whitespaces, ${var} will be split into words in configurations with `setopt sh_word_split`.

THEIA_ORIGINAL_FILENAME_TO_SOURCE='.zshenv'
builtin source "$THEIA_ZSH_DIR/zdotdir/source-original.zsh"
