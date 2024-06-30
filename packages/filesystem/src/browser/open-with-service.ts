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

import { inject, injectable } from '@theia/core/shared/inversify';
import { Disposable } from '@theia/core/lib/common/disposable';
import { nls } from '@theia/core/lib/common/nls';
import { MaybePromise } from '@theia/core/lib/common/types';
import { QuickInputService } from '@theia/core/lib/browser/quick-input';
import { FileStat } from '../common/files';

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
     * Test whether this handler can open the given FileStat for given options.
     * Return a nonzero number if this handler can open; otherwise it cannot.
     * Never reject.
     *
     * A returned value indicating a priority of this handler.
     */
    canHandle(uri: FileStat): number;
    /**
     * Open a widget for the given FileStat.
     * Resolve to an opened widget or undefined, e.g. if a page is opened.
     * Never reject if `canHandle` return a positive number; otherwise should reject.
     */
    open(uri: FileStat): MaybePromise<object | undefined>;
}

@injectable()
export class OpenWithService {

    @inject(QuickInputService)
    protected readonly quickInputService: QuickInputService;

    protected readonly handlers: OpenWithHandler[] = [];

    registerHandler(handler: OpenWithHandler): Disposable {
        this.handlers.push(handler);
        return Disposable.create(() => {
            const index = this.handlers.indexOf(handler);
            if (index !== -1) {
                this.handlers.splice(index, 1);
            }
        });
    }

    async openWith(fileStat: FileStat): Promise<object | undefined> {
        const uri = fileStat.resource;
        const handlers = this.getHandlers(fileStat);
        const result = await this.quickInputService.pick(handlers.map(handler => ({
            handler: handler,
            label: handler.label ?? handler.id,
            detail: handler.providerName
        })), {
            placeHolder: nls.localizeByDefault("Select editor for '{0}'", uri.path.base)
        });
        if (result) {
            return result.handler.open(fileStat);
        }
    }

    getHandlers(fileStat: FileStat): OpenWithHandler[] {
        const map = new Map<OpenWithHandler, number>(this.handlers.map(handler => [handler, handler.canHandle(fileStat)]));
        return this.handlers.filter(handler => map.get(handler)! > 0).sort((a, b) => map.get(b)! - map.get(a)!);
    }
}
