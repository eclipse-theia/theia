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

/* eslint-disable @typescript-eslint/no-explicit-any */
import * as request from 'request';
const ChangesStream = require('changes-stream');
import { NpmRegistryProps } from './application-props';

export interface IChangeStream {
    on(event: 'data', cb: (change: { id: string }) => void): void;
    destroy(): void;
}

export interface Author {
    name: string;
    email: string;
}

export interface Maintainer {
    username: string;
    email: string;
}

export interface Dependencies {
    [name: string]: string | undefined;
}

export interface NodePackage {
    name?: string;
    version?: string;
    description?: string;
    publisher?: Maintainer;
    author?: string | Author;
    maintainers?: Maintainer[];
    keywords?: string[];
    dependencies?: Dependencies;
    [property: string]: any;
}

export interface PublishedNodePackage extends NodePackage {
    name: string;
    version: string;
}
export namespace PublishedNodePackage {
    export function is(pck: NodePackage | undefined): pck is PublishedNodePackage {
        return !!pck && !!pck.name && !!pck.version;
    }
}

export interface ViewResult {
    'dist-tags': {
        [tag: string]: string
    }
    'versions': {
        [version: string]: NodePackage
    },
    'readme': string;
    [key: string]: any
}

export function sortByKey(object: { [key: string]: any }): {
    [key: string]: any;
} {
    return Object.keys(object).sort().reduce((sorted, key) => {
        sorted[key] = object[key];
        return sorted;
    }, {} as { [key: string]: any });
}

export class NpmRegistryOptions {
    /**
     * Default: false.
     */
    readonly watchChanges: boolean;
}

export class NpmRegistry {

    readonly props: NpmRegistryProps = { ...NpmRegistryProps.DEFAULT };
    protected readonly options: NpmRegistryOptions;

    protected changes: undefined | IChangeStream;
    protected readonly index = new Map<string, Promise<ViewResult>>();

    constructor(options?: Partial<NpmRegistryOptions>) {
        this.options = {
            watchChanges: false,
            ...options
        };
        this.resetIndex();
    }

    updateProps(props?: Partial<NpmRegistryProps>): void {
        const oldRegistry = this.props.registry;
        Object.assign(this.props, props);
        const newRegistry = this.props.registry;
        if (oldRegistry !== newRegistry) {
            this.resetIndex();
        }
    }
    protected resetIndex(): void {
        this.index.clear();
        if (this.options.watchChanges && this.props.registry === NpmRegistryProps.DEFAULT.registry) {
            if (this.changes) {
                this.changes.destroy();
            }
            // invalidate index with NPM registry web hooks
            // see: https://github.com/npm/registry-follower-tutorial
            const db = 'https://replicate.npmjs.com';
            this.changes = new ChangesStream({ db }) as IChangeStream;
            this.changes.on('data', change => this.invalidate(change.id));
        }
    }
    protected invalidate(name: string): void {
        if (this.index.delete(name)) {
            this.view(name);
        }
    }

    view(name: string): Promise<ViewResult> {
        const indexed = this.index.get(name);
        if (indexed) {
            return indexed;
        }
        const result = this.doView(name);
        this.index.set(name, result);
        result.catch(() => this.index.delete(name));
        return result;
    }

    protected doView(name: string): Promise<ViewResult> {
        let url = this.props.registry;
        if (name[0] === '@') {
            url += '@' + encodeURIComponent(name.substr(1));
        } else {
            url += encodeURIComponent(name);
        }
        const headers: {
            [header: string]: string
        } = {};
        return new Promise((resolve, reject) => {
            request({
                url, headers
            }, (err, response, body) => {
                if (err) {
                    reject(err);
                } else if (response.statusCode !== 200) {
                    reject(new Error(`${response.statusCode}: ${response.statusMessage} for ${url}`));
                } else {
                    const data = JSON.parse(body);
                    resolve(data);
                }
            });
        });
    }

}
