/*
 * Copyright (C) 2017 Ericsson and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */
import { injectable, inject } from "inversify";
import { ISearchWorkSpaceServer, ISearchWorkSpaceClient } from './search-workspace-service';
import { RipGrepProcessFactory, RipGrepWorkSpace } from '../node/ripgrep-workspace';
// import * as stream from 'stream';
import { ProcessManager } from '@theia/process/lib/node';
// import URI from "@theia/core/lib/common/uri";
import { IPattern, OutputParser, IMatcher, FileLocationKind, IParsedEntry } from "../../../output-parser/lib/node/output-parser";
import * as events from "events";

export const SearchWorkSpaceProcessOptions = Symbol("SearchWorkSpaceProcessOptions");
export interface SearchWorkSpaceProcessOptions {
    args?: string[],
}

export const SearchWorkSpaceProcessFactory = Symbol("SearchWorkSpaceProcessFactory");
export type SearchWorkSpaceProcessFactory = (options: SearchWorkSpaceProcessOptions) => SearchWorkSpaceServer;

const ripgrepPattern: IPattern = {
    "patternName": "file name",
    "regexp": '([^:]+\):\(.*\)',
    //    "regexp": '\(^\(.*:\)\):\(.*\)',
    //    "regexp": '(.*)',
    "file": 1,
    "location": 2,
    "severity": 3,
    "message": 4
};
const TSC_BASE_PATH: string = "/this/is/the/base/path";

const gccErrorMatcher: IMatcher = {
    "name": "gnu-c-cpp compiler",
    "label": "gcc/g++ errors",
    "owner": "gnu-c-cpp",
    "fileLocation": FileLocationKind.RELATIVE,
    "filePrefix": TSC_BASE_PATH,

    "pattern": ripgrepPattern
};

@injectable()
export class SearchWorkSpaceServer extends events.EventEmitter implements ISearchWorkSpaceServer {
    constructor( @inject(RipGrepProcessFactory) protected readonly factory: RipGrepProcessFactory,
        @inject(ProcessManager) protected readonly processManager: ProcessManager,
        @inject(OutputParser) protected readonly parser: OutputParser,
    ) {
        super();
    }
    protected client: ISearchWorkSpaceClient | undefined;

    search(regExp: string, searchPath: string): Promise<IParsedEntry[]> {
        let ripgrepWorkSpace: RipGrepWorkSpace;
        console.log("rg args are " + regExp + ' ' + searchPath.toString())

        //       ripgrepWorkSpace = this.factory({ args: ['--no-heading', regExp, searchPath.toString()] });
        ripgrepWorkSpace = this.factory({ args: ['--no-heading', regExp, "/home/lmcgupe/Desktop/Theia/theia"] });
        const promise = this.parser.parse(gccErrorMatcher, ripgrepWorkSpace.output);

        this.parser.on('search-entry-found', data => {
            console.log('search-entry-found');
            this.emit('search-entry-found', data);
        });

        this.parser.on('done', () => {
            this.emit('search-finished');
        });

        return promise;

    }

    dispose(): void {
    }
    setClient(client: ISearchWorkSpaceClient | undefined): void {
        this.client = client;
    }
}
