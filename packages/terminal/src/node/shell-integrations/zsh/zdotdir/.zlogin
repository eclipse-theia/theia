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

# See doc in .zshenv for how Theia injects itself into Zsh startup process.

# Actually, this file is not expected to be be read, as ZDOTDIR is restored to its
# original value in the Theia's .zshrc and Theia always starts Zsh in an interactive
# mode, a behavior that, according to the documentation, cannot be modified afterward:
#
# INTERACTIVE shell state option (https://zsh.sourceforge.io/Doc/Release/Options.html)
#  "The value of this option can only be changed via flags supplied at invocation of
#  the shell. It cannot be changed once zsh is running."
#
# However, just in case, let's take a safety net and proxy .zlogin.

if [[ -n "${THEIA_ORIGINAL_ZDOTDIR-}" ]]; then
  ZDOTDIR="$THEIA_ORIGINAL_ZDOTDIR"
  builtin unset 'THEIA_ORIGINAL_ZDOTDIR'
else
  # defaults ZDOTDIR to HOME
  builtin unset 'ZDOTDIR'
fi

THEIA_ORIGINAL_FILENAME_TO_SOURCE='.zlogin'
builtin source "$THEIA_ZSH_DIR/zdotdir/source-original.zsh"
