# Building and developing Theia 🎭 Playwright

## Building

Run `yarn` in the root directory of the repository.
In order to build Playwright and install dependencies (ex: chromium) run `yarn --cwd examples/playwright` at the root of the repository.

## Executing the tests

### Prerequisites

To work with the tests the Theia Application under test needs to be running.

Run `yarn browser start` to start the browser-app located in this repository.

You may also use the `Launch Browser Backend` launch configuration in VS Code.

### Running the tests headless

To start the tests run `yarn ui-tests` in the root of this package. This will start the tests located in `src/tests` in a headless mode.

To only run a single test file, the path of a test file can be set with `yarn ui-tests <path-to-file>` or `yarn ui-tests -g "<partial test file name>"`.
See the [Playwright Test command line documentation](https://playwright.dev/docs/intro#command-line).

### Debugging the tests

Please refer to the section [debugging tests](./GETTING_STARTED.md#debugging-the-tests).
