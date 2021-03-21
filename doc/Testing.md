# Testing

## Running tests

Before running make sure to compile tests with `compile` or `watch` scripts.

To run tests on theia run:

`yarn test`

This will run all CI enabled tests.

If you want to run all tests for a particular Theia extension, execute the following command from the root:

`npx run test @theia/extension-name`


Add the following npm script to the `package.json` of the desired Theia extension, if you would like to enable the watch mode for the tests.

```json
  "test:watch": "theiaext test:watch"
```

After editing the `package.json` you can run the tests in watch mode with:

`npx run test:watch @theia/extension-name`

## Test directory structure

The test directory structure is as follows:

 - `src/node/foo.ts`: Code to be tested.
 - `src/node/foo.spec.ts`: Unit tests for foo.ts.
 - `src/node/test/test-helper.ts`: Any mocks, fixture or utility test code
 goes here.
 - `src/node/foo.slow-spec.ts`: Any slow running tests such as integration
 tests should be labeled as such so that they can be excluded.
 - `src/browser/foo.ui-spec.ts`: UI tests.
 - `test-resources`: Any resources needed for the tests like configuration
 files or scripts.
 - `test-resources/ui`: Resources for UI testing.
 - `test-resources/slow`: Resources for slow running tests.

## Publishing

### Published test files

Unit tests named as `foo.spec.ts` will be published since they're also for
documentation purposes.

### Unpublished

 - `*ui-spec.ts`
 - `*slow-spec.ts`
 - `test-resources`
