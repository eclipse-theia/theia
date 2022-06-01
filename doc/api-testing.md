# API Integration Testing

- [**Testing principles**](#testing-principles)
- [**Writing tests**](#writing-tests)
  - [**Declaring a test suite**](#declaring-a-test-suite)
  - [**Accessing application services**](#accessing-application-services)
  - [**Writing a test**](#writing-a-test)
- [**Running tests**](#running-tests)
- [**Inspecting tests**](#inspecting-tests)
- [**Running a single test**](#running-a-single-test)

Usually, integration tests are written against DOM/CSS
and executed from a separate process with frameworks like Selenium.
After experimenting with such approach we learned that
they are slow, unstable, hard to develop, debug, maintain and
miss actual issues.

Theia comes with own integration testing framework which is designed
to overcome the shortcomings of the conventional approach:
- tests are written against the application APIs
ensuring that completeness and timing of APIs are tested;
- tests are executed within the application process
ensuring their speed and robustness.

## Testing principles
- **Information Hiding**: API should provide the application object model
hiding DOM/CSS implementation details behind.
Test against the application API, not implementation details, like DOM/CSS.
- **Completeness**: API should be complete, i.e. stateful service
should provide accessor functions and events.
Instead of introducing helper test functions, implement missing APIs.
- **Extensibility**: API should be broken down to minimal interfaces
with simple functions since minimal interfaces are easy to implement and
new functionality can be developed by composing simple functions.
Watch out for complex functions that do everything in tests and implementation.
- **Convenience**: API should provide convenient functions
for typical complex tasks, such functions although
it should not be complex, but broken down to follow the extensibility principle.
Simplify tests by extracting convenient APIs.
- **Robustness**: API should provide reliable timing, e.g. if a test focuses the editor,
a function should resolve when an editor focused.
Watch out for tests which are guessing based on DOM event listeners
instead of relying on API events and promises.

## Writing tests

New tests should be added in `examples/api-tests` package.
This package is published to allow adopters to run tests against end products.
Tests should be decomposed to different test suite files that adopters could include only some.

### Declaring a test suite

All test files are loaded one by own in the application process in the global scope.
It means that they are sharing variables declared in the global scope.
To avoid name conflicts each test file should start with a declaration of the test suite
with the function scope. New variables have to be declared only within this function scope.

```js
describe('Editors', function () {

    const { assert } = chai;

});
```

### Accessing application services

The application is always bundled. Bundles exposing application modules via `theia` namespace.
One can access a module with `window.theia.moduleName`, where `moduleName`
is the absolute path to a module file relative to a containing package.
For instance `editor-manager.js` can be accessed with `window.theia['@theia/editor/lib/browser/editor-manager']`.
Testing framework as well injects `require` function to lookup modules.
It can be useful with enabled typescript checks for js files to write statically checked code.

Importing symbols from an exposed module is not enough,
one has to access their implementations from the application container.
The application container is exposed via `theia` namespace as well
and can be accessed with `window.theia.container`.

```js
// @ts-check
describe('Editors', function () {

    const { assert } = chai;

    const { EditorManager } = require('@theia/editor/lib/browser/editor-manager');
    const Uri = require('@theia/core/lib/common/uri');
    const { WorkspaceService } = require('@theia/workspace/lib/browser/workspace-service');

    /** @type {import('inversify').Container} */
    const container = window['theia'].container;
    const editorManager = container.get(EditorManager);
    const workspaceService = container.get(WorkspaceService);

});
```

### Writing a test

An example of the complete test suite can be found below. You can see how it follows design principles:
- **Information Hiding**: the object model (EditorManager) is provided to access editors, no DOM/CSS are used.
- **Completeness**: API provides a way to access existing editors and open new editors,
there are also events notifying when a new editor get created or closed. More tests can be added to test it.
- **Extensibility**: EditorManager is not implementing everything but reuses WidgetOpenHandler and WidgetManager.
Different specialized widget managers can be built on top of it.
Improvements in WidgetOpenHandler and WidgetManager translate to all specialized widget managers.
- **Convenience**: Test is not written with using `WidgetManager.open` API,
but such logic is already encapsulated in `EditorManager.open` which allows keeping a test simple.
- **Robustness**: Test relies on `EditorManager.open` to resolve when a widget is revealed.

```js
// @ts-check
describe('Editors', function () {

    const { assert } = chai;

    const { EditorManager } = require('@theia/editor/lib/browser/editor-manager');
    const Uri = require('@theia/core/lib/common/uri');
    const { WorkspaceService } = require('@theia/workspace/lib/browser/workspace-service');

    /** @type {import('inversify').Container} */
    const container = window['theia'].container;
    const editorManager = container.get(EditorManager);
    const workspaceService = container.get(WorkspaceService);

    before(() => editorManager.closeAll({ save: false });

    it('open', async () => {
        const root = (await workspaceService.roots)[0];
        assert.equal(editorManager.all.length, 0);
        await editorManager.open(new Uri.default(root.uri).resolve('package.json'), {
            mode: 'reveal'
        });
        assert.equal(editorManager.all.length, 1);
    });

});
```

The framework ensures that tests are executed
only when the application is ready, workspace is initialized and all preferences are loaded.

Since tests are executed within the same process,
each test suite should take care to bring the application in the proper state.
For instance, an example test awaits when all editors are closed before testing the open function.

## Running tests

> See [theia CLI docs](../dev-packages/cli/README.md#testing) to learn more about how to use  `test` command.

Commands below should be executed from `examples/browser`.

To run tests once:

    yarn test

This command starts the browser example application and runs tests from `examples/api-tests` against it.

### Inspecting tests

To inspect tests:

    yarn test:debug

This command runs tests but as well
opens the Chrome devtools that you can debug the frontend code and test files.
After doing changes to source code or tests, reload the page to run new code and tests.

> Important! Since tests are relying on focus while running tests keep the page focused.

To inspect tests and backend code:

    yarn test:debug --inspect

Use the debug view to attach to the backend server for debugging as usual.

### Running a single test

Modify a test case to use `it.only` instead of `it` and reload the page.
One can also add `?grep=foo` query to the page URL to run only matching tests.
