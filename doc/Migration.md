# Migration Guide

## Description

The following guide highlights potential migration steps necessary during `theia` upgrades discovered when adopting the framework.
Please see the latest version (`master`) for the most up-to-date information.

## Guide

### v1.16.0

[Release](https://github.com/eclipse-theia/theia/releases/tag/v1.16.0)

- N/A.

### v1.15.0

[Release](https://github.com/eclipse-theia/theia/releases/tag/v1.15.0)

#### Keytar:

- [`keytar`](https://github.com/atom/node-keytar) was added as a dependency for the secrets API. and may require `libsecret` in your particular distribution to be functional:
  - Debian/Ubuntu: `sudo apt-get install libsecret-1-dev`
  - Red Hat-based: `sudo yum install libsecret-devel`
  - Arch Linux: `sudo pacman -S libsecret`
  - Alpine: `apk add libsecret-dev`
- It is possible that a `yarn resolution` is necessary for `keytar` to work on older distributions (the fix was added in `1.16.0` by downgrading the dependency version):
  
  ```json
  "resolutions": {
    "**/keytar": "7.6.0",
  }
  ```

- `keytar` uses [`prebuild-install`](https://github.com/prebuild/prebuild-install) to download prebuilt binaries. If you are experiencing issues where some shared libraries are missing from the system it was originally built upon, you can tell `prebuild-install` to build the native extension locally by setting the environment variable before performing `yarn`:

  ```sh
  # either:
  export npm_config_build_from_source=true
  yarn
  # or:
  npm_config_build_from_source=true yarn
  ```

#### Webpack

- The version of webpack was upgraded from 4 to 5 and may require additional shims to work properly given an application's particular setup.
- The `webpack` dependency may need to be updated if there are errors when performing a `production` build of the application due to a bogus `webpack-sources` dependency. The valid `webpack` version includes `^5.36.2 <5.47.0`. If necessary, you can use a `yarn resolution` to fix the issue:

  ```json
  "resolutions": {
    "**/webpack": "5.46.0",
  }
  ```

