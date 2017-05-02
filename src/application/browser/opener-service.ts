/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { multiInject, injectable } from "inversify";
import URI from "../common/uri";

export const OpenHandler = Symbol("OpenHandler");

export interface OpenerOptions {
}

export interface OpenHandler {
    /**
     * Open a widget for the given input.
     *
     * Resolve to an opened widget or undefined, e.g. if a browser page is opened.
     * Reject if the given input cannot be opened.
     */
    open(uri: URI, input?: OpenerOptions): Promise<any>;
}

@injectable()
export class OpenerService {

    constructor(
        @multiInject(OpenHandler) protected readonly openHandlers: OpenHandler[]
    ) { }

    /**
     * Open a widget for the given input.
     *
     * Resolve to an opened widget or undefined, e.g. if a browser page is opened.
     * Reject if the given input cannot be opened.
     */
    open(uri: URI, input?: OpenerOptions): Promise<any> {
        if (this.openHandlers.length === 0) {
            return Promise.resolve(undefined);
        }
        const initial = this.openHandlers[0].open(uri, input);
        return this.openHandlers.slice(1).reduce(
            (current, opener) => current.catch(() => opener.open(uri, input)),
            initial
        );
    }

}
