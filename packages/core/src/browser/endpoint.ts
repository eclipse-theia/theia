/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import URI from "../common/uri";

/**
 * An endpoint provides URLs for http and ws, based on configuration ansd defaults.
 */
export class Endpoint {

    constructor(protected options: Endpoint.Options = {}) {
    }

    getWebSocketUrl(): URI {
        return new URI(`${this.wsScheme}://${this.host}${this.path}`)
    }

    getRestUrl(): URI {
        return new URI(`${this.httpScheme}://${this.host}${this.path}`)
    }

    protected get host() {
        if (location.host) {
            return location.host;
        }
        return 'localhost:' + this.port;
    }

    protected get port(): string {
        return this.getSearchParam('port', '3000');
    }

    protected getSearchParam(name: string, defaultValue: string): string {
        const search = location.search;
        if (!search) {
            return defaultValue;
        }
        return search.substr(1).split('&')
            .filter(value => value.startsWith(name + '='))
            .map(value => {
                const encoded = value.substr(name.length + 1);
                return decodeURIComponent(encoded)
            })[0] || defaultValue;
    }

    protected get wsScheme() {
        return this.httpScheme === 'https:' ? 'wss' : 'ws';
    }

    protected get httpScheme() {
        if (this.options.httpScheme) {
            return this.options.httpScheme
        }
        if (location.protocol === 'http' || location.protocol === 'https') {
            return location.protocol
        }
        return 'http'
    }

    protected get path() {
        if (this.options.path) {
            if (this.options.path.startsWith("/")) {
                return this.options.path
            } else {
                return '/' + this.options.path
            }
        }
        return this.options.path || ""
    }
}

export namespace Endpoint {
    export class Options {
        host?: string
        wsScheme?: string
        httpScheme?: string
        path?: string
    }
}