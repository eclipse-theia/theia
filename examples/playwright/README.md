<div align='center'>

<br />

<img src='https://raw.githubusercontent.com/eclipse-theia/theia/master/logo/theia.svg?sanitize=true' alt='theia-ext-logo' width='100px' />

<h2>ECLIPSE THEIA - PLAYWRIGHT</h2>

<hr />

</div>

## Description

Theia 🎭 Playwright is a [page object](https://martinfowler.com/bliki/PageObject.html) framework based on [Playwright](https://github.com/microsoft/playwright) for developing system tests of [Theia](https://github.com/eclipse-theia/theia)-based applications. See it in action below.

<div style='margin:0 auto;width:70%;'>

![Theia System Testing in Action](./docs/images/teaser.gif)

</div>

The Theia 🎭 Playwright page objects introduce abstraction over Theia's user interfaces, encapsulating the details of the user interface interactions, wait conditions, etc., to help keeping your tests more concise, maintainable, and stable.
Ready for an [example](./docs/GETTING_STARTED.md)?

The actual interaction with the Theia application is implemented with 🎭 Playwright in Typescript. Thus, we can take advantage of [Playwright's benefits](https://playwright.dev/docs/why-playwright/) and run or debug tests headless or headful across all modern browsers.
Check out [Playwright's documentation](https://playwright.dev/docs/intro) for more information.

This page object framework not only covers Theia's generic capabilities, such as handling views, the quick command palette, file explorer etc.
It is [extensible](./docs/EXTENSIBILITY.md) so you can add dedicated page objects for custom Theia components, such as custom views, editors, menus, etc.

## Documentation

- [Getting Started](./docs/GETTING_STARTED.md)
- [Extensibility](./docs/EXTENSIBILITY.md)
- [Theia 🎭 Playwright Template](https://github.com/eclipse-theia/theia-playwright-template)
- [Building and Developing Theia 🎭 Playwright](./docs/DEVELOPING.md)

## Additional Information

- [Theia - GitHub](https://github.com/eclipse-theia/theia)
- [Theia - Website](https://theia-ide.org/)
- [Playwright - GitHub](https://github.com/microsoft/playwright)
- [Playwright - Website](https://playwright.dev)

## License

- [Eclipse Public License 2.0](http://www.eclipse.org/legal/epl-2.0/)
- [一 (Secondary) GNU General Public License, version 2 with the GNU Classpath Exception](https://projects.eclipse.org/license/secondary-gpl-2.0-cp)

## Trademark

"Theia" is a trademark of the Eclipse Foundation
https://www.eclipse.org/theia
