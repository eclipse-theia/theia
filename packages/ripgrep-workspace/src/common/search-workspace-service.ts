/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

// import URI from "@theia/core/lib/common/uri";
// import { IParsedEntry } from "../../../output-parser/lib/node/output-parser";
import * as events from "events";
import { JsonRpcServer } from '@theia/core/lib/common/messaging/proxy-factory';

export const searchPath = '/services/search';

/**
 * The JSON-RPC file search service interface.
 */
// export interface ISearchWorkSpaceService extends events.EventEmitter {

//     /**
//      * finds files by a given search pattern
//      */
//     query(regExp: string, searchPath: URI): Promise<IParsedEntry[]>;

// }

export interface ISearchWorkSpaceClient {
    onDidChangeParseEntry(event: ParseEntryChangedEvent): void
}

export interface ParseEntryChangedEvent {
    entries: ParseEntryChange[]
}

export interface ParseEntryChange {
    readonly file: string;
    readonly match: string;
}

export const ISearchWorkSpaceService = Symbol('ISearchWorkSpaceService');

export const ISearchWorkSpaceServer = Symbol('ISearchWorkSpaceServer');

export interface ISearchWorkSpaceServer extends JsonRpcServer<ISearchWorkSpaceClient>, events.EventEmitter {
    search(regExp: string, searchPath: string): void;
}

// export interface ISearchWorkSpaceClient {
//     //            this.client = client;
// }