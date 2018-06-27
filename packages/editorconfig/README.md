# Theia - Editorconfig Extension

The extension provides supporting for Editorconfig in Theia.

## What is EditorConfig?

EditorConfig helps developers define and maintain consistent coding styles between different editors and IDEs.

Below is an example .editorconfig file setting end-of-line and indentation styles for JavaScript and JSON files.

```ini
# top-most EditorConfig file
root = true

# Unix-style newlines with a newline ending every file
[*]
end_of_line = lf
insert_final_newline = true

# Indentation override for all JS
[*.js]
indent_style = space
indent_size = 4

# Indentation override for JSON files
[*.json]
indent_style = space
indent_size = 2
```

Check [http://EditorConfig.org](http://EditorConfig.org) for more details.

## License
- [Eclipse Public License 2.0](http://www.eclipse.org/legal/epl-2.0/)
- [一 (Secondary) GNU General Public License, version 2 with the GNU Classpath Exception](https://projects.eclipse.org/license/secondary-gpl-2.0-cp)
