# Local Dependency Manager

A package to manage local dependencies, that:
- installs local dependencies similar to published by not relying on symlinking
- does not require version switching for local development and publishing by managing local dependencies separately from published
- enables incremental builds with local dependencies by running scripts, watching and synching changes on local dependencies
- rewrites source maps of local dependencies to use original sources

## Getting started

### Installing ldm on the command line

Run `npm install` to build ldm and then `npm install -g .` to get an access to ldm from the command line.

### A dependent package configuration

#### Local dependencies

In `package.json` of a dependent package add local packages into `localDependencies` or `localDevDependencies`.
You should not change `dependencies` or `devDependencies`, they should be configured against published versions.

```json
{
  "dependencies": {
    "theia-core": "latest"
  },
  "localDependencies": {
    "theia-core": "../.."
  }
}
```

#### Scripts

Add following scripts to `package.json` of a dependent package:
```json
{
  "scripts": {
    "localinstall": "ldm install --dev --original-sources",
    "build:localdeps": "ldm run build && ldm sync --original-sources",
    "watch:localdeps": "ldm watch --sync --run=watch --original-sources"
  }
}
```

**npm run localinstall**

You should run this script instead of `npm install` to install local dependencies before published for local development.
For publishing you shold run `ldm uninstall` to uninstall local depedendcies and their dependencies
and then `npm install` to install only published dependencies.

**npm run build:localdeps**

This script runs `npm run build` on all local dependencies and then sync changes produced by the build.

**npm run watch:localdeps**

This script runs `npm run watch` on all local dependencies and start watching and synching changes in local dependendencies.

## CLI

- `ldm` to show all local dependencies of this package
- `ldm install` install all local dependencies and then install all published dependencies if they have not been yet installed
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
- `--original-sources` to install original sources in sourcemaps