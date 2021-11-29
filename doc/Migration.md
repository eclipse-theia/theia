# Migration Guide

## Description

The following guide highlights potential migration steps necessary during `theia` upgrades discovered when adopting the framework.
Please see the latest version (`master`) for the most up-to-date information. Please contribute any issues you experienced when upgrading to a newer version of Theia to this document, even for previous releases.

## Guide

### v1.21.0

#### Frontend Source Maps

The frontend's source map naming changed. If you had something like the following in your debug configurations:

```json
      "sourceMapPathOverrides": {
        "webpack://@theia/example-electron/*": "${workspaceFolder}/examples/electron/*"
      }
```

You can delete this whole block and replace it by the following:

```json
      "webRoot": "${workspaceFolder}/examples/electron"
```

### v1.19.0

#### Runtime System Plugin Resolvement

Introduced in `v1.19.0` was the feature to better support extension-packs which both contribute functionality and reference plugins (by `id`).
The feature works best when there is no runtime plugin resolvement for system (builtin) plugins as it should be done at build time instead.
In order not to change behavior today, the feature is behind an application prop (acting as a flag). If you want to enable better support for
extension-packs and extension-dependencies as builtins the property should be turned off. You can disable the resolvement in your application's
`package.json` like so:


```json
"theia": {
  "backend": {
    "config": {
      "resolveSystemPlugins": false
    }
  }
}
```

### v1.17.0

#### ES2017

- Theia was updated to ES2017
  - es5 VS Code extensions and Theia plugins are still supported
  - If you require an es5 codebase you should be able to transpile back to es5 using webpack
  - The following code transpiles back to an es2015 codebase:
    ```
    config.module.rules.push({
        test: /\.js$/,
        use: {
            loader: 'babel-loader',
            options: {
                presets: [['@babel/preset-env', { targets: { chrome: '58', ie: '11' } }]],
            }
        }
    });
    ```
  - Replace the targets with the ones that are needed for your use case
  - Make sure to use `inversify@5.1.1`. Theia requires `inversify@^5.0.1` which means that `5.1.1` is compatible,
    but your lockfile might reference an older version.

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
