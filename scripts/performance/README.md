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
