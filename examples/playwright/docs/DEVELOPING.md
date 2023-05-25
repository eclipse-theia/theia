# Building and developing Theia 🎭 Playwright

## Building

Run `yarn` in the root directory of the repository to build the Theia application.

In order to build Playwright library, the tests and install all dependencies (ex: chromium) run the build script:

```bash
cd examples/playwright
yarn build
```

## Executing the tests

### Prerequisites

Before running your tests, the Theia application under test needs to be running.

The Playwright configuration however is aware of that and starts the backend (`yarn theia:start`) on port 3000 if not already running.
This is valid for executing tests with the VS Code Playwright extension or from your command line.

You may also use the `Launch Browser Backend` launch configuration in VS Code.

### Running the tests in VS Code via the Playwright extension

For quick and easy execution of tests in VS Code, we recommend using the [VS Code Playwright extension (`ms-playwright.playwright`)](https://marketplace.visualstudio.com/items?itemName=ms-playwright.playwright).

Once you have installed the VS Code Playwright test extension, open the *Test* view and click the `Run Tests` button on the top toolbar or the `Run Test` button for a particular test.
It uses the default configuration with chromium as test profile by default.

To run the tests headful, simply enable the checkbox `Show browser` in the Playwright section of the *Test* view.

### Running the tests headless via CLI

To start the tests run `yarn ui-tests` in the folder `playwright`.
This will start the tests in a headless state.

To only run a single test file, the path of a test file can be set with `yarn ui-tests <path-to-file>` or `yarn ui-tests -g "<partial test file name>"`.
See the [Playwright Test command line documentation](https://playwright.dev/docs/intro#command-line).

### Running the tests headful via CLI

If you want to observe the execution of the tests in a browser, use `yarn ui-tests-headful` for all tests or `yarn ui-tests-headful <path-to-file>` to only run a specific test.

### Watch the tests

Run `yarn watch` in the root of this package to rebuild the test code after each change.
This ensures, that the executed tests are up-to-date also when running them with the [Playwright VS Code Extension](https://marketplace.visualstudio.com/items?itemName=ms-playwright.playwright).

### Debugging the tests

Please refer to the section [Debugging the tests via the VS Code Playwright extension](./GETTING_STARTED.md#debugging-the-tests-via-the-vs-code-playwright-extension).

### UI Mode - Watch and Trace Mode

Please refer to the section [UI Mode - Watch and Trace Mode](./GETTING_STARTED.md#ui-mode---watch-and-trace-mode).
