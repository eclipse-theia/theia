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

    constructor(
        protected readonly options: Endpoint.Options = {},
        protected readonly location: Endpoint.Location = window.location
    ) { }

    getWebSocketUrl(): URI {
        return new URI(`${this.wsScheme}://${this.host}${this.pathname}${this.path}`);
    }

    getRestUrl(): URI {
        return new URI(`${this.httpScheme}://${this.host}${this.pathname}${this.path}`);
    }

    protected get pathname() {
        if (this.location.protocol === 'file:') {
            return '';
        }
        if (this.location.pathname === '/') {
            return '';
        }
        if (this.location.pathname.endsWith('/')) {
            return this.location.pathname.substr(0, this.location.pathname.length - 1);
        }
        return this.location.pathname;
    }

    protected get host() {
        if (this.location.host) {
            return this.location.host;
        }
        return 'localhost:' + this.port;
    }

    protected get port(): string {
        return this.getSearchParam('port', '3000');
    }

    protected getSearchParam(name: string, defaultValue: string): string {
        const search = this.location.search;
        if (!search) {
            return defaultValue;
        }
        return search.substr(1).split('&')
            .filter(value => value.startsWith(name + '='))
            .map(value => {
                const encoded = value.substr(name.length + 1);
                return decodeURIComponent(encoded);
            })[0] || defaultValue;
    }

    protected get wsScheme() {
        return this.httpScheme === 'https:' ? 'wss' : 'ws';
    }

    protected get httpScheme() {
        if (this.options.httpScheme) {
            return this.options.httpScheme;
        }
        if (this.location.protocol === 'http' || this.location.protocol === 'https') {
            return this.location.protocol;
        }
        return 'http'
    }

    protected get path() {
        if (this.options.path) {
            if (this.options.path.startsWith("/")) {
                return this.options.path;
            } else {
                return '/' + this.options.path;
            }
        }
        return this.options.path || "";
    }
}

export namespace Endpoint {
    export class Options {
        host?: string;
        wsScheme?: string;
        httpScheme?: string;
        path?: string;
    }

    // Necessary for running tests with dependecy on TS lib on node
    // FIXME figure out how to mock with ts-node
    export class Location {
        host: string;
        pathname: string;
        search: string;
        protocol: string;
    }
}