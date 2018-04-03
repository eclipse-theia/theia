/*
 * Copyright (C) 2018 Ericsson and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { SelectionService } from "../common/selection-service";
import { UriSelection } from '../common/selection';
import { CommandHandler } from './command';
import { MaybeArray } from '.';
import URI from './uri';

export interface UriCommandHandler<T extends MaybeArray<URI>> {

    // tslint:disable-next-line:no-any
    execute(uri: T, ...args: any[]): any;

    // tslint:disable-next-line:no-any
    isEnabled?(uri: T, ...args: any[]): boolean;

    // tslint:disable-next-line:no-any
    isVisible?(uri: T, ...args: any[]): boolean;

}

/**
 * Handler for a single URI-based selection.
 */
export interface SingleUriCommandHandler extends UriCommandHandler<URI> {

}

/**
 * Handler for multiple URIs.
 */
export interface MultiUriCommandHandler extends UriCommandHandler<URI[]> {

}

export namespace UriAwareCommandHandler {

    /**
     * Further options for the URI aware command handler instantiation.
     */
    export interface Options {

        /**
         * `true` if the handler supports multiple selection. Otherwise, `false`. Defaults to `false`.
         */
        readonly multi?: boolean,

        /**
         * Additional validation callback on the URIs.
         */
        readonly isValid?: (uris: URI[]) => boolean;

    }

}
export class UriAwareCommandHandler<T extends MaybeArray<URI>> implements CommandHandler {

    constructor(
        protected readonly selectionService: SelectionService,
        protected readonly handler: UriCommandHandler<T>,
        protected readonly options?: UriAwareCommandHandler.Options
    ) { }

    // tslint:disable-next-line:no-any
    protected getUri(...args: any[]): T | undefined {
        if (args && args[0] instanceof URI) {
            return this.isMulti() ? [args[0]] : args[0];
        }
        const { selection } = this.selectionService;
        if (UriSelection.is(selection)) {
            return (this.isMulti() ? [selection.uri] : selection.uri) as T;
        }
        if (Array.isArray(selection)) {
            if (this.isMulti()) {
                const uris: URI[] = [];
                for (const item of selection) {
                    if (UriSelection.is(item)) {
                        uris.push(item.uri);
                    }
                }
                if (this.options && this.options.isValid) {
                    return (this.options.isValid(uris) ? uris : undefined) as T;
                }
                return uris as T;
            } else if (selection.length === 1) {
                const firstItem = selection[0];
                if (UriSelection.is(firstItem)) {
                    return firstItem.uri as T;
                }
            }
        }
        return undefined;
    }

    // tslint:disable-next-line:no-any
    execute(...args: any[]): object | undefined {
        const uri = this.getUri(...args);
        return uri ? this.handler.execute(uri, ...args) : undefined;
    }

    // tslint:disable-next-line:no-any
    isVisible(...args: any[]): boolean {
        const uri = this.getUri(...args);
        if (uri) {
            if (this.handler.isVisible) {
                if (this.isMulti() && Array.isArray(uri)) {
                    return uri.every(u => this.handler.isVisible!(u, ...args));
                }
                return this.handler.isVisible(uri as T, ...args);
            }
            return true;
        }
        return false;
    }

    // tslint:disable-next-line:no-any
    isEnabled(...args: any[]): boolean {
        const uri = this.getUri(...args);
        if (uri) {
            if (this.handler.isEnabled) {
                if (this.isMulti() && Array.isArray(uri)) {
                    return uri.every(u => this.handler.isEnabled!(u, ...args));
                }
                return this.handler.isEnabled(uri as T, ...args);
            }
            return true;
        }
        return false;
    }

    protected isMulti() {
        return this.options && !!this.options.multi;
    }

}
