/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

// tslint:disable:no-console
if (process.env.NODE_ENV === "development") {
    // https://github.com/Microsoft/vscode/issues/3201
    process.execArgv[0] = process.execArgv[0].replace('-brk', '');
}

import { MasterProcess } from './master-process';
import * as cluster from 'cluster';

export default (serverPath: string) => {
    if (cluster.isMaster) {
        const process = new MasterProcess();
        process.start();
    } else {
        const { port, hostname } = require('yargs').argv;
        console.info("Starting express on port '" + port + "'.")
        if (hostname) {
            console.info("Allowed host is '" + hostname + "'.")
        }
        require(serverPath)(port, hostname);
    }
}
