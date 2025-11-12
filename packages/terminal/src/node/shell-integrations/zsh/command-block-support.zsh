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

__theia_encode_slow() {
  local out=''
  # Use LC_CTYPE=C to process text byte-by-byte and
  # LC_COLLATE=C to compare byte-for-byte. Ensure that
  # LC_ALL and LANG are not set so they don't interfere.
  builtin local i hexch LC_CTYPE=C LC_COLLATE=C LC_ALL= LANG=
  builtin local value="$1"
  for ((i = 1; i <= ${#value}; ++i)); do
    builtin printf -v hexch "%02X" "'$value[i]"
    out+="$hexch"
  done
  builtin print -r "$out"
}

# Encodes the string passed as the first parameter to hex.
__theia_encode() {
  builtin local value="$1"
  if builtin whence od > /dev/null && builtin whence sed > /dev/null && builtin whence tr > /dev/null; then
    builtin printf "%s" "$value" | builtin command od -v -A n -t x1 | builtin command sed 's/ *//g' | builtin command tr -d '\n'
  else
    __theia_encode_slow "$value"
  fi
}

__theia_command_preexec() {
  builtin local entered_command="$1"
  # builtin printf '\e]133;command_started;command=%s\a' "$(__theia_encode "$entered_command")"
  builtin printf '\e]133;command_started;%s\a' "$(__theia_encode "$entered_command")"
  __theia_command_running="1"
  # Restore the original prompt, our integration will be injected back after command execution in `__theia_update_prompt`.
  PS1="$__theia_original_ps1"
}

__theia_command_precmd() {
  # Should be always the first line in the function!
  builtin local LAST_EXIT_CODE="$?"

  if [[ -z "${__theia_initialized-}" ]]; then
    # As `precmd` is executed before each prompt, for the first time it is called after
    # all rc files have been processed and before the first prompt is displayed.
    # So, here it finishes the initialization block, not a user command.
    __theia_initialized=1
    builtin printf '\e]133;initialized\a'
    __theia_update_prompt
    builtin return
  fi
  if [ -n "$__theia_command_running" ]; then
    __theia_update_prompt
    __theia_command_running=""
  fi
}

__theia_update_prompt() {
  # Save the original prompt
  __theia_original_ps1="$PS1"
  PS1="%{$(__theia_prompt_started)%}$PS1%{$(__theia_prompt_finished)%}"
}

__theia_prompt_started() {
  builtin printf '\e]133;prompt_started\a'
}

__theia_prompt_finished() {
  builtin printf '\e]133;prompt_finished\a'
}

autoload -Uz add-zsh-hook
add-zsh-hook preexec __theia_command_preexec
add-zsh-hook precmd __theia_command_precmd

if [[ -n "$THEIA_USER_ZSHRC" && -f "$THEIA_USER_ZSHRC" ]]; then
  source "$THEIA_USER_ZSHRC"
fi
