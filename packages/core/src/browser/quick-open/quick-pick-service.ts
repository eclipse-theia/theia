/********************************************************************************
 * Copyright (C) 2018 TypeFox and others.
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

import { injectable, inject } from 'inversify';
import { QuickOpenItem, QuickOpenMode } from './quick-open-model';
import { QuickOpenService } from './quick-open-service';

export interface QuickPickItem<T> {
    label: string,
    value: T
}

export interface QuickPickOptions {
    placeholder?: string;
}

@injectable()
export class QuickPickService {

    @inject(QuickOpenService)
    protected readonly quickOpenService: QuickOpenService;

    show(elements: string[], options?: QuickPickOptions): Promise<string | undefined>;
    show<T>(elements: QuickPickItem<T>[], options?: QuickPickOptions): Promise<T | undefined>;
    async show(elements: (string | QuickPickItem<Object>)[], options?: QuickPickOptions): Promise<Object | undefined> {
        if (elements.length === 0) {
            return undefined;
        }
        if (elements.length === 1) {
            return elements[0];
        }
        return new Promise<Object | undefined>(resolve => {
            const items = elements.map(element => {
                const label = typeof element === 'string' ? element : element.label;
                const value = typeof element === 'string' ? element : element.value;
                return new QuickOpenItem({
                    label,
                    run: mode => {
                        if (mode !== QuickOpenMode.OPEN) {
                            return false;
                        }
                        resolve(value);
                        return true;
                    }
                });
            });
            this.quickOpenService.open({
                onType: (lookFor, acceptor) => acceptor(items)
            }, Object.assign({
                onClose: () => resolve(undefined)
            }, options));
        });
    }

}
