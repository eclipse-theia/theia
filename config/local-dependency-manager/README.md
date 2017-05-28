# Local Dependency Manager

- `npm install` and `npm install -g .` to install `ldm` on the path
- `ldm` to show all local dependencies of this package
- `ldm install` install all local dependencies and then install all remote dependencies if they have not been yet installed
- `ldm uninstall` to uninstall all local dependendencies
- `ldm clean` to remove all local dependencies from `node_modules`
- `ldm update` to clean all local dependencies and then install again
- `ldm run ${script}` to run a script on all local dependencies
- `ldm sync` to sync all installed local dependencies
- `ldm watch` to watch for changes in all local dependencies and sync them
  - `--run=${script}` can be provided to run async a script on all dependencies
  - `--sync` can be provided to sync all changes before watching
- all commands accept an additional reg exp pattern option to filter out local dependencies
- `--verbose` can be provided to enable verbose logging
- `--dev` to include `devDependencies`