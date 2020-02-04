# Theia - Theia - Plugin API

You can configure paths to folders containing plugins:

    - Environment variables: `DEFAULT_THEIA_PLUGINS`, `THEIA_PLUGINS`. Use comma-separated paths.
    - CLI argument: `--plugins`. Use comma-separated paths.
    - Backend configuration: `plugins` entry. Array or single string.

Use the `local-dir:` file scheme to refer to paths on your local disk (where the backend is hosted).

See [here](https://www.theia-ide.org/doc/index.html) for a detailed documentation.

## License
- [Eclipse Public License 2.0](http://www.eclipse.org/legal/epl-2.0/)
- [一 (Secondary) GNU General Public License, version 2 with the GNU Classpath Exception](https://projects.eclipse.org/license/secondary-gpl-2.0-cp)
