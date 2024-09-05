// *****************************************************************************
// Copyright (C) 2017 TypeFox and others.
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

import { named, injectable, inject } from 'inversify';
import URI from '../common/uri';
import { ContributionProvider, Prioritizeable, MaybePromise, Emitter, Event, Disposable } from '../common';
import { PreferenceService } from './preferences';
import { match } from '../common/glob';

export interface OpenerOptions {
}

export const OpenHandler = Symbol('OpenHandler');
/**
 * `OpenHandler` should be implemented to provide a new opener.
 */
export interface OpenHandler {
    /**
     * A unique id of this handler.
     */
    readonly id: string;
    /**
     * A human-readable name of this handler.
     */
    readonly label?: string;
    /**
     * A css icon class of this handler.
     */
    readonly iconClass?: string;
    /**
     * Test whether this handler can open the given URI for given options.
     * Return a nonzero number if this handler can open; otherwise it cannot.
     * Never reject.
     *
     * A returned value indicating a priority of this handler.
     */
    canHandle(uri: URI, options?: OpenerOptions): MaybePromise<number>;
    /**
     * Open a widget for the given URI and options.
     * Resolve to an opened widget or undefined, e.g. if a page is opened.
     * Never reject if `canHandle` return a positive number; otherwise should reject.
     */
    open(uri: URI, options?: OpenerOptions): MaybePromise<object | undefined>;
}

export const OpenerService = Symbol('OpenerService');
/**
 * `OpenerService` provide an access to existing openers.
 */
export interface OpenerService {
    /**
     * Return all registered openers.
     * Never reject.
     */
    getOpeners(): Promise<OpenHandler[]>;
    /**
     * Return all openers able to open the given URI for given options
     * ordered according their priority.
     * Never reject.
     */
    getOpeners(uri: URI, options?: OpenerOptions): Promise<OpenHandler[]>;
    /**
     * Return an opener with the higher priority for the given URI.
     * Reject if such does not exist.
     */
    getOpener(uri: URI, options?: OpenerOptions): Promise<OpenHandler>;
    /**
     * Add open handler i.e. for custom editors
     */
    addHandler?(openHandler: OpenHandler): Disposable;

    /**
     * Remove open handler
     */
    removeHandler?(openHandler: OpenHandler): void;

    /**
     * Event that fires when a new opener is added or removed.
     */
    onDidChangeOpeners?: Event<void>;
}

export async function open(openerService: OpenerService, uri: URI, options?: OpenerOptions): Promise<object | undefined> {
    const opener = await openerService.getOpener(uri, options);
    return opener.open(uri, options);
}

export function getDefaultHandler(uri: URI, preferenceService: PreferenceService): string | undefined {
    const associations = preferenceService.get('workbench.editorAssociations', {});
    const defaultHandler = Object.entries(associations).find(([key]) => match(key, uri.path.base))?.[1];
    if (typeof defaultHandler === 'string') {
        return defaultHandler;
    }
    return undefined;
}

export const defaultHandlerPriority = 100_000;

@injectable()
export class DefaultOpenerService implements OpenerService {
    // Collection of open-handlers for custom-editor contributions.
    protected readonly customEditorOpenHandlers: OpenHandler[] = [];

    protected readonly onDidChangeOpenersEmitter = new Emitter<void>();
    readonly onDidChangeOpeners = this.onDidChangeOpenersEmitter.event;

    constructor(
        @inject(ContributionProvider) @named(OpenHandler)
        protected readonly handlersProvider: ContributionProvider<OpenHandler>
    ) { }

    addHandler(openHandler: OpenHandler): Disposable {
        this.customEditorOpenHandlers.push(openHandler);
        this.onDidChangeOpenersEmitter.fire();

        return Disposable.create(() => {
            this.removeHandler(openHandler);
        });
    }

    removeHandler(openHandler: OpenHandler): void {
        this.customEditorOpenHandlers.splice(this.customEditorOpenHandlers.indexOf(openHandler), 1);
        this.onDidChangeOpenersEmitter.fire();
    }

    async getOpener(uri: URI, options?: OpenerOptions): Promise<OpenHandler> {
        const handlers = await this.prioritize(uri, options);
        if (handlers.length >= 1) {
            return handlers[0];
        }
        return Promise.reject(new Error(`There is no opener for ${uri}.`));
    }

    async getOpeners(uri?: URI, options?: OpenerOptions): Promise<OpenHandler[]> {
        return uri ? this.prioritize(uri, options) : this.getHandlers();
    }

    protected async prioritize(uri: URI, options?: OpenerOptions): Promise<OpenHandler[]> {
        const prioritized = await Prioritizeable.prioritizeAll(this.getHandlers(), async handler => {
            try {
                return await handler.canHandle(uri, options);
            } catch {
                return 0;
            }
        });
        return prioritized.map(p => p.value);
    }

    protected getHandlers(): OpenHandler[] {
        return [
            ...this.handlersProvider.getContributions(),
            ...this.customEditorOpenHandlers
        ];
    }

}
