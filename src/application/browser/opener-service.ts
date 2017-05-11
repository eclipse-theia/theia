import { ExtensionProvider } from '../common/extension-provider';
/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { named, injectable, inject } from "inversify";
import URI from "../common/uri";


export interface OpenerOptions {
}

export const OpenHandler = Symbol("OpenHandler");
export interface OpenHandler {
    /**
     * Open a widget for the given input.
     *
     * Resolve to an opened widget or undefined, e.g. if a browser page is opened.
     * Reject if the given input cannot be opened.
     */
    open(uri: URI, input?: OpenerOptions): Promise<object | undefined>;
}

@injectable()
export class OpenerService {

    constructor(@inject(ExtensionProvider) @named(OpenHandler) protected readonly openHandlers: ExtensionProvider<OpenHandler>) { }

    /**
     * Open a widget for the given input.
     *
     * Resolve to an opened widget or undefined, e.g. if a browser page is opened.
     * Reject if the given input cannot be opened.
     */
    open(uri: URI, input?: OpenerOptions): Promise<object | undefined> {
        if (this.openHandlers.getExtensions().length === 0) {
            return Promise.resolve(undefined);
        }
        const initial = this.openHandlers.getExtensions()[0].open(uri, input);
        return this.openHandlers.getExtensions().slice(1).reduce(
            (current, opener) => current.catch(() => opener.open(uri, input)),
            initial
        );
    }

}
