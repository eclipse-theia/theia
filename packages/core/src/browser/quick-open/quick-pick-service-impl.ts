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
import { QuickOpenItem, QuickOpenMode, QuickOpenGroupItem, QuickOpenItemOptions } from './quick-open-model';
import { QuickOpenService } from './quick-open-service';
import { QuickPickService, QuickPickOptions, QuickPickItem, QuickPickSeparator, QuickPickValue } from '../../common/quick-pick-service';

@injectable()
export class QuickPickServiceImpl implements QuickPickService {

    @inject(QuickOpenService)
    protected readonly quickOpenService: QuickOpenService;

    show(elements: string[], options?: QuickPickOptions): Promise<string | undefined>;
    show<T>(elements: QuickPickItem<T>[], options?: QuickPickOptions): Promise<T | undefined>;
    async show(elements: (string | QuickPickItem<Object>)[], options?: QuickPickOptions): Promise<Object | undefined> {
        return new Promise<Object | undefined>(resolve => {
            const items = this.toItems(elements, resolve);
            if (items.length === 0) {
                resolve(undefined);
                return;
            }
            if (items.length === 1) {
                items[0].run(QuickOpenMode.OPEN);
                return;
            }
            this.quickOpenService.open({ onType: (_, acceptor) => acceptor(items) }, Object.assign({
                onClose: () => resolve(undefined),
                fuzzyMatchLabel: true,
                fuzzyMatchDescription: true
            }, options));
        });
    }
    protected toItems(elements: (string | QuickPickItem<Object>)[], resolve: (element: Object) => void): QuickOpenItem[] {
        const items: QuickOpenItem[] = [];
        let groupLabel: string | undefined;
        for (const element of elements) {
            if (QuickPickSeparator.is(element)) {
                groupLabel = element.label;
            } else {
                const options = this.toItemOptions(element, resolve);
                if (groupLabel) {
                    items.push(new QuickOpenGroupItem(Object.assign(options, { groupLabel, showBorder: true })));
                    groupLabel = undefined;
                } else {
                    items.push(new QuickOpenItem(options));
                }
            }
        }
        return items;
    }
    protected toItemOptions(element: string | QuickPickValue<Object>, resolve: (element: Object) => void): QuickOpenItemOptions {
        const label = typeof element === 'string' ? element : element.label;
        const value = typeof element === 'string' ? element : element.value;
        const description = typeof element === 'string' ? undefined : element.description;
        const detail = typeof element === 'string' ? undefined : element.detail;
        const iconClass = typeof element === 'string' ? undefined : element.iconClass;
        return {
            label,
            description,
            detail,
            iconClass,
            run: mode => {
                if (mode !== QuickOpenMode.OPEN) {
                    return false;
                }
                resolve(value);
                return true;
            }
        };
    }

}
