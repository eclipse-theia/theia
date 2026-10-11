<div align='center'>

<br />

<img src='https://raw.githubusercontent.com/eclipse-theia/theia/master/logo/theia.svg?sanitize=true' alt='theia-ext-logo' width='100px' />

<h2>ECLIPSE THEIA - GETTING-STARTED EXTENSION</h2>

<hr />

</div>

## Description

The `@theia/getting-started` extension contributes a default `getting-started` widget which is displayed whenever
opening the application without any workspace present or if the widget is explicitly opened (through the menu or command).

The `getting-started` widget provides useful commands and functionality for quickly getting up to speed with the application. For example:

- `open commands`: commands which are used to open files, folders, and workspaces quickly.
- `recent workspaces`: recently used workspaces are listed for easy and quick access.
- `settings commands`: commands which are used to open the preferences and keyboard shortcuts widgets.
- `help`: useful links pointing to documentation and/or guides.

## Walkthroughs

The widget also lists the available walkthroughs: guided, multi-step introductions whose progress is remembered
across sessions. They come from two sources, which are treated alike:

- VS Code extensions, through the `contributes.walkthroughs` section of their manifest.
- Theia extensions, through the `WalkthroughProvider` contribution point.

A Theia extension contributes one by binding a provider:

```ts
@injectable()
export class MyWalkthroughProvider implements WalkthroughProvider {
    getWalkthroughs(): WalkthroughDefinition[] {
        return [{
            id: 'my-extension.getting-started',
            title: 'Get started with my feature',
            description: 'Set it up and learn how to work with it.',
            icon: 'sparkle',
            steps: [{
                id: 'configure',
                title: 'Configure the feature',
                // Trusted markdown, so `command:` links work.
                description: 'Open the [settings](command:my-extension.openSettings) and pick a mode.',
                completionEvents: ['onContext:myExtension.isConfigured']
            }]
        }];
    }
}

bind(WalkthroughProvider).to(MyWalkthroughProvider).inSingletonScope();
```

The ids are used as they are, so they have to be unique across the application; a walkthrough contributed by a
plugin is identified by `<pluginId>.<walkthroughId>`, which a provider must not imitate. A provider whose
walkthroughs change over time can expose an optional `onDidChange` event to have them collected again.

A step is completed when one of its `completionEvents` fires. Besides `onContext:` these are `onCommand:`,
`onSettingChanged:`, `onView:`, `onLink:` and `extensionInstalled:`, matching the VS Code walkthrough
contribution. Prefer events that describe what the user achieved, so that a step is also ticked for a user who
did the work before opening the walkthrough. A step without any completion event is marked done by hand.

Walkthroughs are opened from the widget, or with the `walkthrough.open` command taking the walkthrough id.

## Additional Information

- [API documentation for `@theia/getting-started`](https://eclipse-theia.github.io/theia/docs/next/modules/_theia_getting-started.html)
- [Theia - GitHub](https://github.com/eclipse-theia/theia)
- [Theia - Website](https://theia-ide.org/)

## License

- [Eclipse Public License 2.0](http://www.eclipse.org/legal/epl-2.0/)
- [一 (Secondary) GNU General Public License, version 2 with the GNU Classpath Exception](https://projects.eclipse.org/license/secondary-gpl-2.0-cp)

## Trademark

"Theia" is a trademark of the Eclipse Foundation
<https://www.eclipse.org/theia>
