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
import { QuickOpenHideReason } from '../../common/quick-open-service';
import { QuickTitleBar } from './quick-title-bar';
import { Emitter, Event } from '../../common/event';

@injectable()
export class QuickPickServiceImpl implements QuickPickService {

    @inject(QuickTitleBar)
    protected readonly quickTitleBar: QuickTitleBar;

    @inject(QuickOpenService)
    protected readonly quickOpenService: QuickOpenService;

    private items: QuickOpenItem[] = [];

    show(elements: string[], options?: QuickPickOptions): Promise<string | undefined>;
    show<T>(elements: QuickPickItem<T>[], options?: QuickPickOptions): Promise<T | undefined>;
    async show(elements: (string | QuickPickItem<Object>)[], options?: QuickPickOptions): Promise<Object | undefined> {
        return new Promise<Object | undefined>(resolve => {
            this.items = this.toItems(elements, resolve);
            if (this.items.length === 0) {
                resolve(undefined);
                return;
            }
            // Set `runIfSingle` to the value passed through options, else defaults to true.
            const runIfSingle: boolean = (options && options.runIfSingle !== undefined) ? options.runIfSingle : true;
            if (runIfSingle && this.items.length === 1) {
                this.items[0].run(QuickOpenMode.OPEN);
                return;
            }
            const prefix = options && options.value ? options.value : '';
            let savedValue: string;
            this.quickOpenService.open({
                onType: (value, acceptor) => {
                    acceptor(this.items);
                    if (savedValue !== value) {
                        this.onDidChangeValueEmitter.fire(value);
                        this.onDidChangeActiveItemsEmitter.fire(this.items);
                        savedValue = value;
                    }
                }
            }, Object.assign({
                onClose: () => {
                    resolve(undefined);
                    this.quickTitleBar.hide();
                },
                fuzzyMatchLabel: true,
                fuzzyMatchDescription: true,
                prefix
            }, options));
            if (options && this.quickTitleBar.shouldShowTitleBar(options.title, options.step)) {
                this.quickTitleBar.attachTitleBar(this.quickOpenService.widgetNode, options.title, options.step, options.totalSteps, options.buttons);
            }
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
                this.onDidAcceptEmitter.fire(undefined);
                return true;
            }
        };
    }

    hide(reason?: QuickOpenHideReason): void {
        this.quickOpenService.hide(reason);
    }

    private readonly onDidAcceptEmitter: Emitter<void> = new Emitter();
    readonly onDidAccept: Event<void> = this.onDidAcceptEmitter.event;

    private readonly onDidChangeActiveItemsEmitter: Emitter<QuickOpenItem<QuickOpenItemOptions>[]> = new Emitter<QuickOpenItem<QuickOpenItemOptions>[]>();
    readonly onDidChangeActiveItems: Event<QuickOpenItem<QuickOpenItemOptions>[]> = this.onDidChangeActiveItemsEmitter.event;

    private readonly onDidChangeValueEmitter: Emitter<string> = new Emitter();
    readonly onDidChangeValue: Event<string> = this.onDidChangeValueEmitter.event;

    setItems(items: QuickOpenItem[]): void {
        this.items = items;
        this.quickOpenService.refresh();
    }
}
