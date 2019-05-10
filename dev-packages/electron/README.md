# Electron runtimed dependencies for Theia.

This package has to be installed for `electron` [application
target](dev-packages/cli/README.md#build-target).

It also installs new commands:

- `npx electron-replace-ffmpeg [--help]`
- `npx electron-codecs-test [--help]`

Both scripts will be triggered on post-install, targeting the current
architecture and "closest" Electron installation (in `node_modules`).

The post-install scripts can be skipped by setting an environment variable:

- Mac/Linux: `export THEIA_ELECTRON_SKIP_REPLACE_FFMPEG=1`
- Windows (cmd): `set THEIA_ELECTRON_SKIP_REPLACE_FFMPEG=1`
- Windows (ps): `$env:THEIA_ELECTRON_SKIP_REPLACE_FFMPEG=1`

## License
- [Eclipse Public License 2.0](http://www.eclipse.org/legal/epl-2.0/)
- [一 (Secondary) GNU General Public License, version 2 with the GNU Classpath Exception](https://projects.eclipse.org/license/secondary-gpl-2.0-cp)
