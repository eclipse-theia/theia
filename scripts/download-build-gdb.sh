#!/usr/bin/env bash

# * Copyright (c) 2015 Ericsson and others.
# * All rights reserved. This program and the accompanying materials
# * are made available under the terms of the Eclipse Public License v1.0
# * which accompanies this distribution, and is available at
# * http://www.eclipse.org/legal/epl-v10.html
# *
# * Contributors:
# *     Simon Marchi (Ericsson) - Initial implementation

# Stop the script if any command fails
set -o errexit

# Consider using an unset variable as an error
set -o nounset

# Make sure getopt is the command and not the bash built-in
if [[ $(getopt --version) != *"getopt"* ]]; then
  echo "getopt command not found."
  exit 1
fi

# Our work directory
default_base_dir="$HOME/gdb-all"
base_dir="${default_base_dir}"

# Passed to make's -j
default_jlevel="4"
jlevel="${default_jlevel}"

# Supported versions
default_versions="8.0 7.12.1 7.11.1 7.10.1 7.9.1 7.8.2 7.7.1 7.6.2 7.5.1 7.4.1 7.3.1 7.2 7.1 7.0.1 6.8 6.7.1 6.6"

# Is set to "echo" if we are doing a dry-run.
dryrun=""

# Print help and exit with the specified exit code.
#
# $1: The value to pass to exit
function help_and_exit() {
  echo "Usage:"
  echo "  download-build-gdb.sh [OPTIONS] [VERSIONS|all]"

  echo ""
  echo "Description:"
  echo "  This script downloads, builds and installs the given versions of gdb."
  echo "  Passing \"all\" to the script is the same as passing all the supported versions."
  echo ""
  echo "Options:"
  echo "  -b, --base-dir PATH  Set the base directory for downloading, building and "
  echo "                       installing the gdbs (default: ${default_base_dir})."
  echo "  -d, --dry-run        Make a dry-run: print the commands instead of executing"
  echo "                       them."
  echo "  -h, --help           Print this help message and exit."
  echo "  -j, --jobs N         Number of parallel jobs while making. N is passed"
  echo "                       directly to make's -j (default: ${default_jlevel})."
  echo ""
  echo "Supported versions:"
  echo "  ${default_versions}"
  echo ""
  echo "Examples:"
  echo "  Build versions 7.7.1 and 7.8.2:"
  echo "    $ $0 7.7.1 7.8.2"
  echo "  Build all supported versions:"
  echo "    $ $0 all"
  echo ""

  exit "$1"
}

# Output a visible header
#
# $1: Text to display
function echo_header() {
  echo -e "\e[1m\e[7m>>> $1\e[0m"
}


# Check that the version passed is supported by the script.
#
# $1: version number
function check_supported() {
  local supported_pattern="@(${default_versions// /|})"
  local version="$1"

  shopt -s extglob
  case "$version" in
    ${supported_pattern})
      # Supported, do nothing.
      ;;
    *)
      echo "Error: version ${version} is not supported by this script."
      echo ""
      help_and_exit 1
      ;;
  esac
}


# Download the tarball of the given release of gdb.
#
# $1: version number
function download_gdb() {
  local baseaddr="http://ftp.gnu.org/gnu/gdb"
  local version="$1"

  case "$version" in
    "6.6"|"6.7.1"|"6.8"|"7.0.1"|"7.1"|"7.2")
      version="${version}a"
      ;;
  esac

  echo_header "Downloading gdb $version to ${download_dir}"

  ${dryrun} wget --timestamping --directory-prefix "${download_dir}" "${baseaddr}/gdb-${version}.tar.gz"
}


# Extract the gdb tarball.
#
# $1: version number
function extract_gdb() {
  local version="$1"

  case "$version" in
    "6.6"|"6.7.1"|"6.8"|"7.0.1"|"7.1"|"7.2")
      version="${version}a"
      ;;
  esac

  local archive="${download_dir}/gdb-${version}.tar.gz"

  echo_header "Extracting ${archive} to ${build_dir}"

  ${dryrun} mkdir -p "${build_dir}"

  ${dryrun} tar -xf "${archive}" -C "${build_dir}"
}

# Make necessary fixes to build an "old" release on a "modern" system.
#
# $1: version number
function fixup_gdb() {
  local version="$1"
  local build="${build_dir}/gdb-${version}"

  echo_header "Fixing up gdb ${version}"

  # glibc or the kernel changed the signal API at some point
  case "$version" in
    "6.6"|"6.7.1"|"6.8"|"7.0.1"|"7.1"|"7.2"|"7.3.1"|"7.4.1")
      ${dryrun} find "${build}/gdb" -type f -exec sed -i -e 's/struct siginfo;/#include <signal.h>/g' {} \;
      ${dryrun} find "${build}/gdb" -type f -exec sed -i -e 's/struct siginfo/siginfo_t/g' {} \;
      ;;
  esac

  # Fix wrong include on Mac
  ${dryrun} find "${build}" -name "darwin-nat.c" -type f -exec sed -i -e "s/machine\/setjmp.h/setjmp.h/g" {} \;
}

# Run ./configure.
#
# $1: version number
function configure_gdb() {
  local version="$1"

  local build="${build_dir}/gdb-${version}"
  local cflags="-Wno-error -g3 -O0"
  local cxxflags="-Wno-error -g3 -O0"

  echo_header "Configuring in ${build}"

  ${dryrun} pushd "${build}"

  case "${version}" in
    "6.7.1"|"6.8")
      cflags="${cflags} -Wno-error=enum-compare"
      ;;
  esac

  # If there is already some CFLAGS/CXXFLAGS in the environment, add them to the mix.
  cflags="${cflags} ${CFLAGS:-}"
  cxxflags="${cxxflags} ${CXXFLAGS:-}"

  # Need to use eval to allow the ${dryrun} trick to work with the env var command at the start.
  eval ${dryrun} 'CFLAGS="${cflags}" CXXFLAGS="${cxxflags}" ./configure --prefix="${install_dir}/gdb-${version}"'

  ${dryrun} popd
}


# Build gdb.
#
# $1: version number
function make_gdb() {
  local version="$1"

  local build="${build_dir}/gdb-${version}"

  echo_header "Making in ${build}"

  ${dryrun} pushd "${build}"

  ${dryrun} make -j "${jlevel}"

  ${dryrun} popd
}


# Run make install.
#
# $1: version number
function make_install_gdb() {
  local version="$1"

  # Only install gdb, not the whole binutils-gdb
  local install="${build_dir}/gdb-${version}/gdb"

  echo_header "Make installing in ${install}"

  ${dryrun} pushd "${install}"

  # Disable building of the doc, which fails anyway with older gdbs and
  # newer makeinfos.
  ${dryrun} make install MAKEINFO=true

  ${dryrun} popd
}


# Create symlinks in "bin" directory.
#
# $1: version number
function symlink_gdb() {
  local version="$1"

  echo_header "Creating symlinks for gdb ${version} in ${symlinks_dir}"

  ${dryrun} mkdir -p "${symlinks_dir}"
  ${dryrun} ln -sf "${install_dir}/gdb-${version}/bin/gdb" "${symlinks_dir}/gdb.${version}"
  ${dryrun} ln -sf "${install_dir}/gdb-${version}/bin/gdbserver" "${symlinks_dir}/gdbserver.${version}"

  # If the version is a triplet (x.y.z), also create a symlink with just
  # the first two numbers (x.y).
  if [[ "$version" =~ [0-9]+\.[0-9]+\.[0-9]+ ]]; then
    local short_version="${version%.[0-9]}"
    ${dryrun} ln -sf "${install_dir}/gdb-${version}/bin/gdb" "${symlinks_dir}/gdb.${short_version}"
    ${dryrun} ln -sf "${install_dir}/gdb-${version}/bin/gdbserver" "${symlinks_dir}/gdbserver.${short_version}"
  fi
}

# Start argument parsing.  The script will exit (thanks to errexit) if bad arguments are passed.
args=$(getopt -o b:dhj: -l "base-dir:,dry-run,help,jobs" -n "$0" -- "$@");

eval set -- "$args"

while true; do
  case "$1" in
  -b|--base-dir)
    shift
    base_dir="$1"
    shift
    ;;
  -d|--dry-run)
    dryrun="echo"
    shift
    ;;
  -h|--help)
    help_and_exit 0
    break
    ;;
  -j|--jobs)
    shift
    jlevel="$1"
    shift
    ;;
  --)
    shift;
    break;
    ;;
  esac
done

abs_base_dir=$(readlink -f "${base_dir}")

# Where we download the tarballs
download_dir="${base_dir}/download"

# Where we extract the tarballs and build
build_dir="${base_dir}/build"

# Where we make install to
install_dir="${abs_base_dir}/install"

# Where we will create symlinks to all gdb versions (in the form gdb.x.y)
# (Hint: this is so you can add this directory to your PATH and have all
#  versions available quickly.)
symlinks_dir="${base_dir}/bin"

if [ $# -eq 0 ]; then
  echo "Error: you need to specify at least one gdb version or \"all\"."
  echo ""
  help_and_exit 1
fi

versions=$*

if [ "$versions" = "all" ]; then
  versions="${default_versions}"
fi

# End argument parsing

for version in $versions; do
  check_supported "$version"
done

for version in $versions; do
  download_gdb "$version"
  extract_gdb "$version"
  fixup_gdb "$version"
  configure_gdb "$version"
  make_gdb "$version"
  make_install_gdb "$version"
  symlink_gdb "$version"
done

echo_header "Done!"
echo ""
echo "gdb versions built:"
echo "  ${versions}"
echo ""
echo "Symbolic links to binaries have been created in:"
echo "  ${symlinks_dir}"
echo ""
echo "You can add this path to your \$PATH to access them easily."
echo ""
