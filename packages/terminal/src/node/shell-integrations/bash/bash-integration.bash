#!/bin/bash
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
# https://github.com/JetBrains/intellij-community/blob/8d02751ced444e5b70784fe0a757f960fe495a67/plugins/terminal/resources/shell-integrations/bash/bash-integration.bash
# *****************************************************************************

if [ -n "$LOGIN_SHELL" ]; then
  unset LOGIN_SHELL

  #       When bash is invoked as an interactive login shell, or as a  non-interac-
  #       tive  shell with the --login option, it first reads and executes commands
  #       from the file /etc/profile, if that  file  exists.   After  reading  that
  #       file,  it  looks  for  ~/.bash_profile, ~/.bash_login, and ~/.profile, in
  #       that order, and reads and executes  commands  from  the  first  one  that
  #       exists  and  is  readable.

  if [ -f /etc/profile ]; then
     source /etc/profile
  fi

  if [ -f ~/.bash_profile ]; then
    source ~/.bash_profile
  else
    if [ -f ~/.bash_login ]; then
      source ~/.bash_login
    else
      if [ -f ~/.profile ]; then
        source ~/.profile
      fi
    fi
  fi
else
  if [ -f ~/.bashrc ]; then
    source ~/.bashrc
  fi
fi

function disable_posix() {
  if shopt -qo posix
  then
    set +o posix
    __theia_restore_posix_flag=1
  fi
}

function restore_posix() {
  if [ -n "${__theia_restore_posix_flag-}" ]
  then
    set -o posix
    unset __theia_restore_posix_flag
  fi
}

disable_posix

THEIA_BASH_DIR="$(dirname "${BASH_SOURCE[0]}")"
echo "${THEIA_BASH_DIR}"
source "${THEIA_BASH_DIR}/command-block-support.bash"

unset THEIA_BASH_DIR

restore_posix
unset -f disable_posix
unset -f restore_posix
