# Local Dependency Manager

- `npm install -g .` to install `ldm` on the path
- `ldm` to show all local dependencies of this package
- `ldm clean` to remove all local dependendencies from `node_modules`
- `ldm update` to remove all local dependencies and install them again
- `ldm sync` to sync all installed local dependencies
- `ldm watch` to watch for changes in all local dependencies and sync them
  - `--sync` can be provided to sync all changes before watching
- all commands accept an additional reg exp pattern option to filter out local dependencies
- `--verbose` can be provided to enable verbose logging