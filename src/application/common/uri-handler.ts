/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { injectable, multiInject } from "inversify";
import URI from "../common/uri";
import Uri from "vscode-uri/lib";

export interface UriHandler {
    readonly uri: URI;
    resolve(): Promise<string>;
    save?(content: string): Promise<void>;
}

export const UriHandlerProvider = Symbol('UriHandlerProvider');
export interface UriHandlerProvider {
    get(uri: URI): Promise<UriHandler | undefined>;
}

@injectable()
export class UriHandlerRegistry {

    constructor(
        @multiInject(UriHandlerProvider) protected readonly providers: UriHandlerProvider[]
    ) { }

    get(raw: string | Uri | URI): Promise<UriHandler | undefined> {
        if (this.providers.length === 0) {
            return Promise.resolve(undefined);
        }
        const uri = URI.toURI(raw);
        const initial = this.providers[0].get(uri);
        return this.providers.slice(1).reduce((current, provider) =>
            current.catch(() => provider.get(uri)),
            initial
        );
    }

}
