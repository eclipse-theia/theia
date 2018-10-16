/********************************************************************************
 * Copyright (C) 2017 TypeFox and others.
 *
 * This program and the accompanying materials are made available under the
 * terms of the Eclipse Public License v. 2.0 which is available at
 * http://www.eclipse.org/legal/epl-2.0.
 *
 * This Source Code may also be made available under the following Secondary
 * Licenses when the conditions for such availability set forth in the Eclipse
 * Public License v. 2.0 are satisfied: GNU General Public License, version 2
 * with the GNU Classpath Exception which is available at
 * https://www.gnu.org/software/classpath/license.html.
 *
 * SPDX-License-Identifier: EPL-2.0 OR GPL-2.0 WITH Classpath-exception-2.0
 ********************************************************************************/

import URI from '../common/uri';

/**
 * An endpoint provides URLs for http and ws, based on configuration and defaults.
 */
export class Endpoint {
    static readonly PROTO_HTTPS: string = 'https:';
    static readonly PROTO_HTTP: string = 'http:';
    static readonly PROTO_WS: string = 'ws:';
    static readonly PROTO_WSS: string = 'wss:';
    static readonly PROTO_FILE: string = 'file:';

    constructor(
        protected readonly options: Endpoint.Options = {},
        protected readonly location: Endpoint.Location = window.location
    ) { }

    getWebSocketUrl(): URI {
        return new URI(`${this.wsScheme}//${this.host}${this.pathname}${this.path}`);
    }

    getRestUrl(): URI {
        return new URI(`${this.httpScheme}//${this.host}${this.pathname}${this.path}`);
    }

    protected get pathname() {
        if (this.location.protocol === Endpoint.PROTO_FILE) {
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
        return this.httpScheme === Endpoint.PROTO_HTTPS ? Endpoint.PROTO_WSS : Endpoint.PROTO_WS;
    }

    /**
     * The HTTP/HTTPS scheme of the endpoint, or the user defined one.
     * See: `Endpoint.Options.httpScheme`.
     */
    get httpScheme() {
        if (this.options.httpScheme) {
            return this.options.httpScheme;
        }
        if (this.location.protocol === Endpoint.PROTO_HTTP ||
            this.location.protocol === Endpoint.PROTO_HTTPS) {
            return this.location.protocol;
        }
        return Endpoint.PROTO_HTTP;
    }

    protected get path() {
        if (this.options.path) {
            if (this.options.path.startsWith('/')) {
                return this.options.path;
            } else {
                return '/' + this.options.path;
            }
        }
        return this.options.path || '';
    }
}

export namespace Endpoint {
    export class Options {
        host?: string;
        wsScheme?: string;
        httpScheme?: string;
        path?: string;
    }

    // Necessary for running tests with dependency on TS lib on node
    // FIXME figure out how to mock with ts-node
    export class Location {
        host: string;
        pathname: string;
        search: string;
        protocol: string;
    }
}
