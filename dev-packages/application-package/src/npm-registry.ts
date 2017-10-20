/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

// tslint:disable:no-any
import * as request from 'request';

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

export function sortByKey(object: { [key: string]: any }) {
    return Object.keys(object).sort().reduce((sorted, key) => {
        sorted[key] = object[key];
        return sorted;
    }, {} as { [key: string]: any });
}

export class NpmRegistryOptions {
    /**
     * Default: 'false'
     */
    readonly next: boolean;
    /**
     * Default: https://registry.npmjs.org/.
     */
    readonly registry: string;
}

export class NpmRegistry {

    static defaultOptions: NpmRegistryOptions = {
        next: false,
        registry: 'https://registry.npmjs.org/'
    };

    readonly options: NpmRegistryOptions = { ...NpmRegistry.defaultOptions };
    // TODO: invalidate index with NPM registry web hooks, see: https://github.com/npm/registry-follower-tutorial
    protected readonly index = new Map<string, Promise<ViewResult>>();

    constructor(options?: Partial<NpmRegistryOptions>) {
        this.updateOptions(options);
    }

    updateOptions(options?: Partial<NpmRegistryOptions>) {
        Object.assign(this.options, options);
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
        let url = this.options.registry;
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
