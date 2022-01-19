# Performance measurements

This directory contains scripts that measure the start-up performance of the Theia frontend in both the browser and the Electron examples.

The frontend's start-up time is measured using the timestamp of the last recorded `Largest contentful paint (LCP)` candidate metric.

## Running the browser start-up script

### Quick Start

Execute `yarn run performance:startup:browser` in the root directory to startup the backend and execute the script.

### Prerequisites

To run the script the Theia backend needs to be started.
This can either be done with the `Launch Browser Backend` launch config or by running `yarn start` in the `examples/browser-app` directory.

### Executing the script

The script can be executed using `node browser-performance.js` in this directory.

The script accepts the following optional parameters:

-   `--name`: Specify a name for the current measurement (default: `Browser Frontend Startup`)
-   `--url`: Point Theia to a url for example for specifying a specific workspace (default: `http://localhost:3000/#/<pathToMeasurementScript>/workspace`)
-   `--folder`: Folder name for the generated tracing files in the `profiles` folder (default: `browser`)
-   `--runs`: Number of runs for the measurement (default: `10`)
-   `--headless`: Boolean, if the tests should be run in headless mode (default: `true`)

_**Note**: When multiple runs are specified the script will calculate the mean and the standard deviation of all values._

## Running the Electron start-up script

### Quick Start

Execute `yarn run performance:startup:electron` in the root directory to execute the script.

### Prerequisites

To run the script the Theia Electron example needs to be built. In the root directory:

```console
$ yarn
$ yarn electron build
```

### Executing the script

The script can be executed using `node electron-performance.js` in this directory.

The script accepts the following optional parameters:

-   `--name`: Specify a name for the current measurement (default: `Electron Frontend Startup`)
-   `--folder`: Folder name for the generated tracing files in the `profiles` folder (default: `electron`)
-   `--workspace`: Absolute path to a Theia workspace to open (default: an empty workspace folder)
-   `--runs`: Number of runs for the measurement (default: `10`)
-   `--debug`: Whether to log debug information to the console. Currently, this is only the standard error of the Electron app, which ordinarily is suppressed because the child process is detached

_**Note**: When multiple runs are specified the script will calculate the mean and the standard deviation of all values, except for any runs that failed to capture a measurement due to an exception._

It can happen that the Electron app does not start normally because the native browser modules are not properly built for the Electron target.
The symptom for this is usually an error about a module not self-registering; when this condition is detected, the script stops rather than print out an inevitable series of failures to measure the performance.

## Measure impact on startup performance of extensions

To measure the startup performance impact that extensions have on the application, another script is available, which uses the measurements from the `browser-performance.js` or `electron-performance.js` script.
The `extension-impact.js` script runs the measurement for a defined base application (`base-package.json` in this directory) and then measures the startup time when one of the defined extensions is added to the base application.
The script will then print a table (in CSV format) to the console (and store it in a file) which contains the mean, standard deviation (Std Dev) and coefficient of variation (CV) for each extensions run.
Additionally, each extensions entry will contain the difference to the base application time.

Example Table:

| Extension Name    | Mean (10 runs) (in s) | Std Dev (in s) | CV (%) | Delta (in s) |
| ----------------- | --------------------- | -------------- | ------ | ------------ |
| Base Theia        | 2.027                 | 0.084          | 4.144  | -            |
| @theia/git:1.19.0 | 2.103                 | 0.041          | 1.950  | 0.076        |

### Script usage

The script can be executed by running `node extension-impact.js` in this directory.

The following parameters are available:

-   `--app`: The example app in which to measure performance, either `browser` or `electron` (default: `browser`)
-   `--runs`: Specify the number of measurements for each extension (default: `10`)
-   `--base-time`: Provide an existing measurement (mean) for the base Theia application. If none is provided it will be measured.
-   `--extensions`: Provide a list of extensions (need to be locally installed) that shall be tested (default: all extensions in packages folder)

    _**Note**: Each entry should:_

    -   _have the format {name}:{version}_
    -   _not contain whitespaces_
    -   _and be separated by whitespaces_

    _For example: `--extensions @theia/git:1.19.0 @theia/keymaps:1.19.0`_

-   `--yarn`: Flag to trigger a full yarn at script startup (e.g. to build changes to extensions)
-   `--url`: Specify a URL that Theia should be launched with (can be used to specify the workspace to be opened). _Applies only to the `browser` app_ (default: `http://localhost:3000/#/<GIT_ROOT>/scripts/performance/workspace`)
-   `--workspace`: Specify a workspace on which to launch Theia. _Applies only to the `electron` app_ (default: `/<GIT_ROOT>/scripts/performance/workspace`)
-   `--file`: Relative path to the output file (default: `./script.csv`)

_**Note**: If no extensions are provided all extensions from the `packages` folder will be measured._
