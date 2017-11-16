/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import * as chai from 'chai';
import * as chaiAsPromised from 'chai-as-promised'
import { testContainer } from '../node/test/inversify.spec-config';
import { ISearchWorkSpaceServer } from './search-workspace-service';
import URI from "@theia/core/lib/common/uri";

chai.use(chaiAsPromised);

/**
 * Globals
 */

const expect = chai.expect;

describe('SearchWorkSpaceServer', function () {
    this.timeout(10000);
    let searchServer: ISearchWorkSpaceServer;

    before(async function () {
        searchServer = testContainer.get<ISearchWorkSpaceServer>(ISearchWorkSpaceServer);
    });

    it('test query', function () {
        const result = searchServer.search("Welcome", new URI("/home/lmcgupe/Desktop/Theia/theia").toString());

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
