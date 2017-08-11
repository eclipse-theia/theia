/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { MasterProcess } from './master-process';
import * as cluster from 'cluster';

const args = require('yargs').argv;
const noCluster = args['cluster'] === false;
const isMaster = !noCluster && cluster.isMaster;

if (isMaster) {
    // tslint:disable:no-console
    if (process.env.NODE_ENV === "development") {
        // https://github.com/Microsoft/vscode/issues/3201
        process.execArgv = process.execArgv.reduce((result, arg) => {
            result.push(arg.replace('-brk', ''));
            return result;
        }, [] as string[]);
    }
}

export default (serverPath: string) => {
    if (isMaster) {
        const process = new MasterProcess();
        process.start();
    } else {
        const { port, hostname } = args;
        console.info("Starting express on port '" + port + "'.");
        if (hostname) {
            console.info("Allowed host is '" + hostname + "'.");
        }
        require(serverPath)(port, hostname);
    }
};
