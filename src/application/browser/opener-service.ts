/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { multiInject, injectable } from "inversify";
import { Widget } from "@phosphor/widgets";
import URI from "../common/uri";

export const WidgetOpener = Symbol("WidgetOpener");

export interface WidgetInput {
}

export interface WidgetOpener {
    /**
     * Open a widget for the given input.
     *
     * Resolve to an opened widget or undefined, e.g. if a browser page is opened.
     * Reject if the given input is not a resource input.
     */
    open<I extends WidgetInput = WidgetInput, O extends Widget = Widget>(uri: URI, input?: I): Promise<O | undefined>;
}

@injectable()
export class OpenerService {

    constructor(
        @multiInject(WidgetOpener) protected readonly openers: WidgetOpener[]
    ) { }

    /**
     * Open a widget for the given input.
     *
     * Resolve to an opened widget or undefined, e.g. if a browser page is opened.
     * Reject if the given input is not a resource input.
     */
    open<I extends WidgetInput = WidgetInput, O extends Widget = Widget>(uri: URI, input?: I): Promise<O | undefined> {
        if (this.openers.length === 0) {
            return Promise.resolve(undefined);
        }
        const initial = this.openers[0].open(uri, input);
        return this.openers.slice(1).reduce((current, opener) =>
            current.catch(() => opener.open(uri, input)),
            initial
        );
    }

}
