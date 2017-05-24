# Local Dependency Manager

- `npm install -g .` to install `ldm` on the path
- `ldm` to show all local dependencies of this package
- `ldm clean` to remove all local dependendencies from `node_modules`
- `ldm update` to remove all local dependencies and install them again
- `ldm watch` to watch for changes in all local dependencies and copy them
- all commands accept an additional reg exp pattern option to filter out local dependencies
- `--verbose` option can be provided to enable verbose logging