/********************************************************************************
 * Copyright (C) 2019 TypeFox and others.
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

import { injectable } from 'inversify';
import { QuickOpenModel, QuickOpenHandler, QuickOpenOptions, QuickOpenItem, QuickOpenMode, QuickOpenContribution, QuickOpenHandlerRegistry } from './quick-open';
import { Disposable } from '../common/disposable';

export interface QuickViewItem {
    readonly label: string;
    // tslint:disable-next-line:no-any
    readonly open: () => any;
}

@injectable()
export class QuickViewService implements QuickOpenModel, QuickOpenHandler, QuickOpenContribution {

    readonly prefix: string = 'view ';

    readonly description: string = 'Open View';

    protected readonly items: QuickOpenItem[] = [];

    registerItem(item: QuickViewItem): Disposable {
        const quickOpenItem = new QuickOpenItem({
            label: item.label,
            run: mode => {
                if (mode !== QuickOpenMode.OPEN) {
                    return false;
                }
                item.open();
                return true;
            }
        });
        this.items.push(quickOpenItem);
        this.items.sort((a, b) => a.getLabel()!.localeCompare(b.getLabel()!));
        return Disposable.create(() => {
            const index = this.items.indexOf(quickOpenItem);
            if (index !== -1) {
                this.items.splice(index, 1);
            }
        });
    }

    getModel(): QuickOpenModel {
        return this;
    }

    getOptions(): QuickOpenOptions {
        return {
            skipPrefix: this.prefix.length,
            fuzzyMatchLabel: true
        };
    }

    onType(_: string, acceptor: (items: QuickOpenItem[]) => void): void {
        acceptor(this.items);
    }

    registerQuickOpenHandlers(handlers: QuickOpenHandlerRegistry): void {
        handlers.registerHandler(this);
    }

}
