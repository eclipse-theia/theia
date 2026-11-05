# plugin-view-layout

A sample Theia/VS Code plugin that contributes views with the `visibility` and `initialSize` fields of `contributes.views`. It has no code; each view shows welcome content that says what it declares.

## Testing

1. Copy the plugin into the deployed `plugins` directory, as described in the [sample plugins README](../../README.md).
2. In a workspace with no saved layout, open the `View Layout Sample` container from the activity bar.
3. Resize the views, then run `Reload Window` from the command palette.
4. With the container showing, drag another view into it.
5. Open the Explorer.

## Expected

- After step 2, `Small` and `Large` split the expanded space about 1:3, `Collapsed` starts collapsed, and `Hidden` is not shown but is listed, unchecked, in the container's `...` menu.
- After steps 3 and 4, the sizes you set are kept.
- In step 5, the `View Layout Sample` view in the Explorer starts collapsed and its `initialSize` has no effect, as the Explorer belongs to another plugin.

## License

EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
