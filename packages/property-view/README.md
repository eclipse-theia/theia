<div align='center'>

<br />

<img src='https://raw.githubusercontent.com/eclipse-theia/theia/master/logo/theia.svg?sanitize=true' alt='theia-ext-logo' width='100px' />

<h2>ECLIPSE THEIA - PROPERTY-VIEW EXTENSION</h2>

<hr />

</div>

## Description

The `@theia/property-view` extension contributes a generic, global property view based on Theia's global selection.

The property view widget can be opened/toggled either via menu _View->Properties_ or via shortcut <kbd>Shift+Alt+P</kbd>. It is located in the bottom dock area by default.

The following two default content widgets are implemented in this extension:
- EmptyPropertyViewWidget: If no other widget can be provided, a simple message (_No properties available_) is shown.
- ResourcePropertyViewWidget: Can handle `FileSelection`s and `Navigatable` selections (which provide their resource URI) and displays the general `FileStat` information (e.g. location, name, last modified) in a TreeWidget.

To contribute a specific property view, it is necessary to implement a `PropertyViewDataService` which gathers the property data for a selection as well as a `PropertyViewWidgetProvider` which provides a suitable content widget to display the property data for a specific selection inside the property view widget.

</br>

## Additional Information

- [API documentation for `@theia/property-view`](https://eclipse-theia.github.io/theia/docs/next/modules/property_view.html)
- [Theia - GitHub](https://github.com/eclipse-theia/theia)
- [Theia - Website](https://theia-ide.org/)

## License

- [Eclipse Public License 2.0](http://www.eclipse.org/legal/epl-2.0/)
- [一 (Secondary) GNU General Public License, version 2 with the GNU Classpath Exception](https://projects.eclipse.org/license/secondary-gpl-2.0-cp)

## Trademark
"Theia" is a trademark of the Eclipse Foundation
https://www.eclipse.org/theia

## License
- [Eclipse Public License 2.0](http://www.eclipse.org/legal/epl-2.0/)
- [一 (Secondary) GNU General Public License, version 2 with the GNU Classpath Exception](https://projects.eclipse.org/license/secondary-gpl-2.0-cp)
