// *****************************************************************************
// Copyright (C) 2018 Ericsson and others.
//
// This program and the accompanying materials are made available under the
// terms of the Eclipse Public License v. 2.0 which is available at
// http://www.eclipse.org/legal/epl-2.0.
//
// This Source Code may also be made available under the following Secondary
// Licenses when the conditions for such availability set forth in the Eclipse
// Public License v. 2.0 are satisfied: GNU General Public License, version 2
// with the GNU Classpath Exception which is available at
// https://www.gnu.org/software/classpath/license.html.
//
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

/* eslint-disable @typescript-eslint/no-explicit-any */

import { SelectionService } from '../common/selection-service';
import { UriSelection } from '../common/selection';
import { CommandHandler } from './command';
import URI from './uri';
import { isArray, MaybeArray } from './types';

export interface UriCommandHandler<T extends MaybeArray<URI>> extends CommandHandler {

    execute(uri: T, ...args: any[]): any;

    isEnabled?(uri: T, ...args: any[]): boolean;

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

export class UriAwareCommandHandler<T extends MaybeArray<URI>> implements UriCommandHandler<T> {
    /**
     * @deprecated since 1.6.0. Please use `UriAwareCommandHandler.MonoSelect` or `UriAwareCommandHandler.MultiSelect`.
     */
    constructor(
        protected readonly selectionService: SelectionService,
        protected readonly handler: UriCommandHandler<T>,
        protected readonly options?: UriAwareCommandHandler.Options
    ) { }

    protected getUri(...args: any[]): T | undefined {
        const [maybeUriArray] = args;
        const firstArgIsOK = this.isMulti()
            ? isArray(maybeUriArray, uri => uri instanceof URI)
            : maybeUriArray instanceof URI;

        if (firstArgIsOK) {
            return maybeUriArray;
        }

        const { selection } = this.selectionService;

        const uriOrUris = this.isMulti()
            ? UriSelection.getUris(selection)
            : UriSelection.getUri(selection);

        return uriOrUris as T;
    }

    protected getArgsWithUri(...args: any[]): [T | undefined, ...any[]] {
        const uri = this.getUri(...args);
        const [maybeUri, ...others] = args;
        if (uri === maybeUri) {
            return [maybeUri, ...others];
        }
        return [uri, ...args];
    }

    execute(...args: any[]): object | undefined {
        const [uri, ...others] = this.getArgsWithUri(...args);
        return uri ? this.handler.execute(uri, ...others) : undefined;
    }

    isVisible(...args: any[]): boolean {
        const [uri, ...others] = this.getArgsWithUri(...args);
        if (uri) {
            if (this.handler.isVisible) {
                return this.handler.isVisible(uri, ...others);
            }
            return true;
        }
        return false;
    }

    isEnabled(...args: any[]): boolean {
        const [uri, ...others] = this.getArgsWithUri(...args);
        if (uri) {
            if (this.handler.isEnabled) {
                return this.handler.isEnabled(uri, ...others);
            }
            return true;
        }
        return false;
    }

    protected isMulti(): boolean | undefined {
        return this.options && !!this.options.multi;
    }
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

    }

    /**
     * @returns a command handler for mono-select contexts that expects a `URI` as the first parameter of its methods.
     */
    export function MonoSelect(selectionService: SelectionService, handler: UriCommandHandler<URI>): UriAwareCommandHandler<URI> {
        /* eslint-disable-next-line deprecation/deprecation*/ // Safe to use when the generic and the options agree.
        return new UriAwareCommandHandler<URI>(selectionService, handler, { multi: false });
    }

    /**
     * @returns a command handler for multi-select contexts that expects a `URI[]` as the first parameter of its methods.
     */
    export function MultiSelect(selectionService: SelectionService, handler: UriCommandHandler<URI[]>): UriAwareCommandHandler<URI[]> {
        /* eslint-disable-next-line deprecation/deprecation*/ // Safe to use when the generic and the options agree.
        return new UriAwareCommandHandler<URI[]>(selectionService, handler, { multi: true });
    }
}

