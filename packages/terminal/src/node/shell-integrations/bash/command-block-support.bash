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
# - Rebranded functions/vars from `__jetbrains_intellij_*` to `__theia_*`.
# - Removed the feature gate (`INTELLIJ_TERMINAL_COMMAND_BLOCKS_REWORKED`) so the integration always loads.
# - Switched OSC protocol from JetBrains `OSC 1341;...` to Theia `OSC 133;...` and changed `command_started` payload
#   to emit only the encoded command (no `command=` key); `command_finished` no longer reports exit code/current directory.
# - Improved command capture for `command_started` by reading the last history entry (fallback to `BASH_COMMAND`).
#
# Source:
# https://github.com/JetBrains/intellij-community/blob/8d02751ced444e5b70784fe0a757f960fe495a67/plugins/terminal/resources/shell-integrations/bash/command-block-support-reworked.bash
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
  builtin printf "%s" "$out"
}

# Util method. Serializes string so that it could be safely passed to the escape sequence payload.
__theia_encode() {
  builtin local value="$1"
  if builtin command -v od > /dev/null && builtin command -v tr > /dev/null; then
    builtin printf "%s" "$value" | builtin command od -An -tx1 -v | builtin command tr -d "[:space:]"
  else
    __theia_encode_slow "$value"
  fi
}

# Should be executed before command start
__theia_command_preexec() {
  __theia_command_running="1"
  __theia_should_update_prompt="1"

  builtin local entered_command
  entered_command="$(history 1 | {
    read -r num rest
    # rest now contains the entire command even if HISTTIMEFORMAT is set
    printf '%s\n' "$rest"
  })" || entered_command="${BASH_COMMAND:-}"
  entered_command="$(history 1 | sed 's/^ *[0-9]\+ *//')" || entered_command="${BASH_COMMAND:-}"
  builtin printf '\e]133;command_started;%s\a' "$(__theia_encode "$entered_command")"

  # Restore the original prompt, our integration will be injected back after command execution in `__theia_update_prompt`.
  PS1="$__theia_original_ps1"
}

# Should be executed before printing of the prompt (for example, after command execution)
__theia_command_precmd() {
  builtin local LAST_EXIT_CODE="$?"

  if [[ -z "$__theia_initialized" ]]; then
    __theia_install_debug_trap
    __theia_initialized="1"
    builtin printf '\e]133;initialized\a'
    __theia_get_aliases
  elif [[ -n "$__theia_command_running" ]]; then
    builtin printf '\e]133;command_finished\a'
  fi

  if [ -n "$__theia_should_update_prompt" ]; then
    __theia_update_prompt
  fi

  __theia_should_update_prompt=""
  __theia_command_running=""
}

__theia_update_prompt() {
  if [[ "$__theia_custom_ps1" == "" || "$__theia_custom_ps1" != "$PS1" ]]; then
    # Save the original prompt
    __theia_original_ps1="$PS1"
    __theia_custom_ps1="\[$(__theia_prompt_started)\]$PS1\[$(__theia_prompt_finished)\]"
    PS1="$__theia_custom_ps1"
  fi
}

__theia_prompt_started() {
  builtin printf '\e]133;prompt_started\a'
}

__theia_prompt_finished() {
  builtin printf '\e]133;prompt_finished\a'
}

__theia_install_debug_trap() {
  __theia_original_debug_trap="$(__theia_get_debug_trap)"
  trap '__theia_debug_trap "$_"' DEBUG
}

# Our debug trap is wrapping the original one.
# We execute our preexec function if conditions are met,
# but always execute the original trap after that (if any).
__theia_debug_trap() {
  if __theia_is_prompt_command_contains "${BASH_COMMAND:-}"; then
    # We are executing something inside the PROMPT_COMMAND.
    # It is not the user command, so we need to skip it.
    # But we need to ensure that prompt will be updated.
    # It is important in the case of Ctrl+C in the prompt when there is no running command:
    # in the next precmd we need to update the prompt without sending the command started event.
    __theia_should_update_prompt="1"
    __theia_run_original_debug_trap
    return
  fi

  # This function is executed in a DEBUG trap, so it can be called multiple times when command is started.
  # But we need to handle only first call.
  if [[ -n "$__theia_command_running" ]]; then
    __theia_run_original_debug_trap
    return
  fi

  # Execute our preexec function before the original one.
  __theia_command_preexec

  __theia_run_original_debug_trap
}

__theia_run_original_debug_trap() {
  if [[ -n "$__theia_original_debug_trap" && "$__theia_original_debug_trap" != "-" ]]; then
    builtin eval "${__theia_original_debug_trap}"
  fi
}

# Returns the code that should be executed in the DEBUG trap.
# 'trap -p DEBUG' outputs a shell command in the format `trap -- '<shell_code>' DEBUG`.
# The shell code can contain quotes, spaces and line breaks.
# To get the shell code, we need to parse this string into an array and then get the 2nd item.
# We have to use `eval` to preserve quoting.
__theia_get_debug_trap() {
	builtin local -a values
	builtin eval "values=($(trap -p "DEBUG"))"
	builtin printf '%s' "${values[2]:-}"
}

__theia_trim_whitespaces() {
  builtin local text="$1"
  text="${text#"${text%%[![:space:]]*}"}"   # Remove leading whitespace characters
  text="${text%"${text##*[![:space:]]}"}"   # Remove trailing whitespace characters
  builtin printf '%s' "$text"
}

# Checks if first argument value contains in the PROMPT_COMMAND variable.
__theia_is_prompt_command_contains() {
  builtin local IFS=$'\n;'
  builtin local prompt_command_array
  builtin read -rd '' -a prompt_command_array <<< "${PROMPT_COMMAND[*]:-}"

  builtin local text_to_find="$(__theia_trim_whitespaces "$1")"

  builtin local command
  for command in "${prompt_command_array[@]:-}"; do
    command="$(__theia_trim_whitespaces "$command")"
    if [[ "$command" == "$text_to_find" ]]; then
      return 0
    fi
  done

  return 1
}

# Inspired by https://unix.stackexchange.com/questions/460651/is-prompt-command-a-colon-separated-list/672843#672843
__theia_append_to_prompt_command() {
    local separator=$'\n'
    if [[ ${#PROMPT_COMMAND[@]} -gt 1 ]]; then
    	PROMPT_COMMAND+=("$1")
    else
    	PROMPT_COMMAND="${PROMPT_COMMAND:+$PROMPT_COMMAND${separator}}${1}"
    fi
}

__theia_get_aliases() {
  builtin local aliases_mapping="$(__theia_escape_json "$(alias)")"
  builtin printf '\e]133;aliases_received;%s\a' "$aliases_mapping"
}

__theia_escape_json() {
  builtin command sed -e 's/\\/\\\\/g'\
      -e 's/"/\\"/g'\
      <<< "$1"
}
__theia_original_ps1=""
__theia_custom_ps1=""

__theia_command_running="1"
__theia_should_update_prompt="1"

__theia_append_to_prompt_command "__theia_command_precmd"
