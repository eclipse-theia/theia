# Theia - Editor Preview Extension

A Preview Editor supports the same functionality as a regular editor widget with the exception: if
a preview editor has not "transitioned to a permanent editor" at the time an additional request to
preview a file is received, instead of opening a new editor, it will display the contents of the
newly requested file.

Events that will transition the preview to a permanent editor are as follows:
* Modifying file contents being previewed
* Double clicking the preview tab
* Performing a drag/drop operation of the editor preview tab resulting in the tab being moved.
* Issuing a request to open the file being previewed (e.g. double clicking the file in the
navigator)

The preview editor is enabled by default when the extension is included in a Theia application, but
may be disabled by modifying the preference:
```json
editor.enablePreview
```

In addition to this value, the preference:
```json
list.openMode
```
must be set to "singleClick" to enable opening files in preview mode.

See [here](https://www.theia-ide.org/doc/index.html) for a detailed documentation.

## License
- [Eclipse Public License 2.0](http://www.eclipse.org/legal/epl-2.0/)
- [一 (Secondary) GNU General Public License, version 2 with the GNU Classpath Exception](https://projects.eclipse.org/license/secondary-gpl-2.0-cp)
