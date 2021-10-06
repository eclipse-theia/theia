# Performance measurements

This directory contains a script that measures the performance of Theia.
Currently the support is limited to measuring the `browser-app`'s startup time using the `Largest contentful paint (LCP)` value.

## Running the script

### Quick Start

Execute `yarn run performance:startup` in the root directory to startup the backend and execute the script.

### Prerequisites

To run the script the Theia backend needs to be started.
This can either be done with the `Launch Browser Backend` launch config or by running `yarn start` in the `examples/browser-app` directory.

### Executing the script

The script can be executed using `node measure-performance.js` in this directory.

The script accepts the following optional parameters:

-   `--name`: Specify a name for the current measurement (default: `StartupPerformance`)
-   `--url`: Point Theia to a url for example for specifying a specifc workspace (default: `http://localhost:3000/#/<pathToMeasurementScript>/workspace`)
-   `--folder`: Folder name for the generated tracing files in the `profiles` folder (default: `profile`)
-   `--runs`: Number of runs for the measurement (default: `10`)
-   `--headless`: Boolean, if the tests should be run in headless mode (default: `true`)

_**Note**: When multiple runs are specified the script will calculate the mean and the standard deviation of all values._

## Measure impact on startup performance of extensions

To measure the startup performance impact that extensions have on the application, another script is avaiable, which uses the measurements from the `measure-performance.js` script.
The `extension-impact.js` script runs the measurement for a defined base application (`base-package.json` in this directory) and then measures the startup time when one of the defined extensions is added to the base application.
The script will then print a table (in CSV format) to the console (and store it in a file) which contains the mean, standard deviation (Std Dev) and coefficient of variation (CV) for each extensions run.
Additionally, each extensions entry will contain the difference to the base application time.

Example Table:

| Extension Name    | Mean (10 runs) (in s) | Std Dev (in s) | CV (%) | Delta (in s) |
| ----------------- | --------------------- | -------------- | ------ | ------------ |
| Base Theia        | 2.027                 | 0.084          | 4.144  | -            |
| @theia/git:1.17.0 | 2.103                 | 0.041          | 1.950  | 0.076        |

### Script usage

The script can be executed by running `node extension-impact.js` in this directory.

The following parameters are available:

-   `--runs`: Specify the number of measurements for each extension (default: `10`)
-   `--base-time`: Provide an existing measurement (mean) for the base Theia application. If none is provided it will be measured.
-   `--extensions`: Provide a list of extensions (need to be locally installed) that shall be tested (default: all extensions in packages folder)

    _**Note**: Each entry should:_

    -   _have the format {name}:{version}_
    -   _not contain whitespaces_
    -   _and be separated by whitespaces_

    _For example: `--extensions @theia/git:1.18.0 @theia/keymaps:1.18.0`_

-   `--yarn`: Flag to trigger a full yarn at script startup (e.g. to build changes to extensions)
-   `--url`: Specify a URL that Theia should be launched with (can also be used to specify the workspace to be opened) (default: `http://localhost:3000/#/<pathToMeasurementScript>/workspace`)
-   `--file`: Relative path to the output file (default: `./extensions.csv`)

_**Note**: If no extensions are provided all extensions from the `packages` folder will be measured._
