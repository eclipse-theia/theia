# Extensibility

Theia is an extensible tool platform for building custom tools with custom user interface elements, such as views, editors, commands, etc.
Correspondingly, Theia 🎭 Playwright supports adding dedicated page objects for your custom user interface elements.
Depending on the nature of your custom components, you can extend the generic base objects, such as for views or editors, or add your own from scratch.

## Custom commands or menu items

Commands and menu items are handled by their label, so no further customization of the page object framework is required.
Simply interact with them via the menu or quick commands.

```typescript
const app = await TheiaAppLoader.load({ playwright, browser });
const menuBar = app.menuBar;

const yourMenu = await menuBar.openMenu('Your Menu');
const yourItem = await mainMenu.menuItemByName('Your Item');

expect(await yourItem?.hasSubmenu()).toBe(true);
```

## Custom Theia applications

The main entry point of the page object model is `TheiaApp`.
To add further capabilities to it, for instance a custom toolbar, extend the `TheiaApp` class and add an accessor for a custom toolbar page object.

```typescript
export class MyTheiaApp extends TheiaApp {
  readonly toolbar = new MyToolbar(this);
}

export class MyToolbar extends TheiaPageObject {
  selector = 'div#myToolbar';
  async clickItem1(): Promise<void> {
    await this.page.click(`${this.selector} .item1`);
  }
}

const ws = new TheiaWorkspace([path.resolve(__dirname, '../../src/tests/resources/sample-files1']);
const app = await TheiaAppLoader.load({ playwright, browser }, ws, MyTheiaApp);
await app.toolbar.clickItem1();
```

## Custom views and status indicators

Many custom Theia applications add dedicated views, editors, or status indicators.
To support these custom user interface elements in the testing framework, you can add dedicated page objects for them.
Typically, these dedicated page objects for your custom user interface elements are subclasses of the generic classes, `TheiaView`, `TheiaEditor`, etc.
Consequently, they inherit the generic behavior of views or editors, such as activating or closing them, querying the title, check whether editors are dirty, etc.

Let's take a custom view as an example. This custom view has a button that we want to be able to click.

```typescript
export class MyView extends TheiaView {
  constructor(public app: TheiaApp) {
    super(
      {
        tabSelector: '#shell-tab-my-view', // the id of the tab
        viewSelector: '#my-view-container', // the id of the view container
        viewName: 'My View', // the user visible view name
      },
      app
    );
  }

  async clickMyButton(): Promise<void> {
    await this.activate();
    const viewElement = await this.viewElement();
    const button = await viewElement?.waitForSelector('#idOfMyButton');
    await button?.click();
  }
}
```

So first, we create a new class that inherits all generic view capabilities from `TheiaView`.
We have to specify the selectors for the tab and for the view container element that we specify in the view implementation.
Optionally we can specify a view name, which corresponds to the label in Theia's view menu.
This information is enough to open, close, find and interact with the view.

Additionally, we can add further custom methods for the specific actions and queries we want to use for our custom view.
As an example, `MyView` above introduces a method that allows to click a button.

To use this custom page object in a test, we pass our custom page object as a parameter when opening the view with `app.openView`.

```typescript
const app = await TheiaAppLoader.load({ playwright, browser });
const myView = await app.openView(MyView);
await myView.clickMyButton();
```

A similar approach is used for custom editors. The only difference is that we extend `TheiaEditor` instead and pass our custom page object as an argument to `app.openEditor`.
As a reference for custom views and editors, please refer to the existing page objects, such as `TheiaPreferenceView`, `TheiaTextEditor`, etc.

Custom status indicators are supported with the same mechanism. They are accessed via `TheiaApp.statusBar`.

```typescript
const app = await TheiaAppLoader.load({ playwright, browser });
const problemIndicator = await app.statusBar.statusIndicator(
  TheiaProblemIndicator
);
const numberOfProblems = await problemIndicator.numberOfProblems();
expect(numberOfProblems).to.be(2);
```
