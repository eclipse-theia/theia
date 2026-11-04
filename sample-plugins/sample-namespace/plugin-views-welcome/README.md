# plugin-views-welcome

A sample Theia/VS Code plugin that contributes a view with `viewsWelcome` content and no `TreeDataProvider`. VS Code renders the welcome content of such a view whether or not a provider is ever registered, and so should Theia, both when the view is first opened and after the window restores a saved layout.

## Testing

1. Copy the plugin into the deployed `plugins` directory, as described in the [sample plugins README](../../README.md).
2. Open the `Views Welcome Sample` container from the activity bar.
3. Run `Reload Window` from the command palette.

## Expected

After both steps 2 and 3, the `Actions` view shows the welcome text and a `Say Hello` button, and clicking the button shows `Hello from plugin-views-welcome`.

## License

EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
