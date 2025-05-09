// *****************************************************************************
// Copyright (C) 2024 TypeFox and others.
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

import { inject, injectable } from 'inversify';
import { Disposable } from '../common/disposable';
import { nls } from '../common/nls';
import { MaybePromise } from '../common/types';
import { URI } from '../common/uri';
import { QuickInputService, QuickPickItem, QuickPickItemOrSeparator } from './quick-input';
import { PreferenceScope, PreferenceService } from './preferences';
import { getDefaultHandler } from './opener-service';

export interface OpenWithHandler {
    /**
     * A unique id of this handler.
     */
    readonly id: string;
    /**
     * A human-readable name of this handler.
     */
    readonly label?: string;
    /**
     * A human-readable provider name of this handler.
     */
    readonly providerName?: string;
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
    canHandle(uri: URI): number;
    /**
     * Test whether this handler can open the given URI
     * and return the order of this handler in the list.
     */
    getOrder?(uri: URI): number;
    /**
     * Open a widget for the given URI and options.
     * Resolve to an opened widget or undefined, e.g. if a page is opened.
     * Never reject if `canHandle` return a positive number; otherwise should reject.
     */
    open(uri: URI): MaybePromise<object | undefined>;
}

export interface OpenWithQuickPickItem extends QuickPickItem {
    handler: OpenWithHandler;
}

@injectable()
export class OpenWithService {

    @inject(QuickInputService)
    protected readonly quickInputService: QuickInputService;

    @inject(PreferenceService)
    protected readonly preferenceService: PreferenceService;

    protected readonly handlers: OpenWithHandler[] = [];

    registerHandler(handler: OpenWithHandler): Disposable {
        if (this.handlers.some(h => h.id === handler.id)) {
            console.warn('Duplicate OpenWithHandler registration: ' + handler.id);
            return Disposable.NULL;
        }
        this.handlers.push(handler);
        return Disposable.create(() => {
            const index = this.handlers.indexOf(handler);
            if (index !== -1) {
                this.handlers.splice(index, 1);
            }
        });
    }

    async openWith(uri: URI): Promise<object | undefined> {
        // Clone the object, because all objects returned by the preferences service are frozen.
        const associations: Record<string, unknown> = { ...this.preferenceService.get('workbench.editorAssociations') };
        const ext = `*${uri.path.ext}`;
        const handlers = this.getHandlers(uri);
        const ordered = handlers.slice().sort((a, b) => this.getOrder(b, uri) - this.getOrder(a, uri));
        const defaultHandler = getDefaultHandler(uri, this.preferenceService) ?? handlers[0]?.id;
        const items = this.getQuickPickItems(ordered, defaultHandler);
        // Only offer to select a default editor when the file has a file extension
        const extraItems: QuickPickItemOrSeparator[] = uri.path.ext ? [{
            type: 'separator'
        }, {
            label: nls.localizeByDefault("Configure default editor for '{0}'...", ext)
        }] : [];
        const result = await this.quickInputService.pick<OpenWithQuickPickItem | { label: string }>([...items, ...extraItems], {
            placeHolder: nls.localizeByDefault("Select editor for '{0}'", uri.path.base)
        });
        if (result) {
            if ('handler' in result) {
                return result.handler.open(uri);
            } else if (result.label) {
                const configureResult = await this.quickInputService.pick(items, {
                    placeHolder: nls.localizeByDefault("Select new default editor for '{0}'", ext)
                });
                if (configureResult) {
                    associations[ext] = configureResult.handler.id;
                    this.preferenceService.set('workbench.editorAssociations', associations, PreferenceScope.User);
                    return configureResult.handler.open(uri);
                }
            }
        }
        return undefined;
    }

    protected getQuickPickItems(handlers: OpenWithHandler[], defaultHandler?: string): OpenWithQuickPickItem[] {
        return handlers.map(handler => ({
            handler,
            label: handler.label ?? handler.id,
            detail: handler.providerName ?? '',
            description: handler.id === defaultHandler ? nls.localizeByDefault('Default') : undefined
        }));
    }

    protected getOrder(handler: OpenWithHandler, uri: URI): number {
        return handler.getOrder ? handler.getOrder(uri) : handler.canHandle(uri);
    }

    getHandlers(uri: URI): OpenWithHandler[] {
        const map = new Map<OpenWithHandler, number>(this.handlers.map(handler => [handler, handler.canHandle(uri)]));
        return this.handlers.filter(handler => map.get(handler)! > 0).sort((a, b) => map.get(b)! - map.get(a)!);
    }
}
