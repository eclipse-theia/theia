/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import * as chai from 'chai';
import * as chaiAsPromised from 'chai-as-promised'
import { testContainer } from '../node/test/inversify.spec-config';
import { ISearchWorkSpaceServer } from './search-workspace-protocol';
import URI from "@theia/core/lib/common/uri";
// import * as cp from 'child_process';
// import * as http from 'http';
// import { BackendApplication } from '@theia/core/lib/node/backend-application';
// import * as ws from 'ws';
// import * as stream from 'stream';
// import { IPattern, IMatcher, FileLocationKind } from "@theia/output-parser/lib/node/output-parser";

// const ripgrepPattern: IPattern = {
//     "patternName": "file name",
//     "regexp": '([^:]+\):\(.*\)',
//     //    "regexp": '\(^\(.*:\)\):\(.*\)',
//     //    "regexp": '(.*)',
//     "file": 1,
//     "location": 2,
//     "severity": 3,
//     "message": 4
// };
// const TSC_BASE_PATH: string = "/this/is/the/base/path";

// const gccErrorMatcher: IMatcher = {
//     "name": "gnu-c-cpp compiler",
//     "label": "gcc/g++ errors",
//     "owner": "gnu-c-cpp",
//     "fileLocation": FileLocationKind.RELATIVE,
//     "filePrefix": TSC_BASE_PATH,

//     "pattern": ripgrepPattern
// };

chai.use(chaiAsPromised);

/**
 * Globals
 */

const expect = chai.expect;

describe('SearchWorkSpaceServer', function () {
    this.timeout(10000);
    //    let server: http.Server;
    let searchServer: ISearchWorkSpaceServer;

    before(async function () {
        //        const application = testContainer.get(BackendApplication);
        searchServer = testContainer.get<ISearchWorkSpaceServer>(ISearchWorkSpaceServer);
        //        server = await application.start();
    });

    it('test query', function () {
        const result = searchServer.query("Welcome", new URI("/home/lmcgupe/Desktop/Theia/theia"));

        searchServer.on('search-entry-found', data => {
            console.log("search-workspace-spec entry-found - PARSE data is :" + data.file);
            console.log("search-workspace-spec entry-found - PARSE data is :" + data.location);
        });

        searchServer.on('search-finished', () => {
            console.log("search-workspace-spec FINISHED - search is over :");
        });

        expect(result).to.be.eventually.fulfilled;
    });

});
