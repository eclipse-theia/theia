// *****************************************************************************
// Copyright (C) 2018 TypeFox and others.
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

import { injectable, inject, optional } from 'inversify';
import { Emitter } from '../../common/event';
import { QuickPickSeparator, QuickPickService } from '../../common/quick-pick-service';
import { QuickInputService, QuickPickItem, QuickInputButtonHandle, QuickPick, QuickPickOptions } from './quick-input-service';

@injectable()
export class QuickPickServiceImpl implements QuickPickService {

    @inject(QuickInputService) @optional()
    protected readonly quickInputService: QuickInputService;

    private readonly onDidHideEmitter = new Emitter<void>();
    readonly onDidHide = this.onDidHideEmitter.event;

    private readonly onDidChangeValueEmitter = new Emitter<{ quickPick: QuickPick<QuickPickItem>, filter: string }>();
    readonly onDidChangeValue = this.onDidChangeValueEmitter.event;

    private readonly onDidAcceptEmitter = new Emitter<void>();
    readonly onDidAccept = this.onDidAcceptEmitter.event;

    private readonly onDidChangeActiveEmitter = new Emitter<{ quickPick: QuickPick<QuickPickItem>, activeItems: Array<QuickPickItem> }>();
    readonly onDidChangeActive = this.onDidChangeActiveEmitter.event;

    private readonly onDidChangeSelectionEmitter = new Emitter<{ quickPick: QuickPick<QuickPickItem>, selectedItems: Array<QuickPickItem> }>();
    readonly onDidChangeSelection = this.onDidChangeSelectionEmitter.event;

    private readonly onDidTriggerButtonEmitter = new Emitter<QuickInputButtonHandle>();
    readonly onDidTriggerButton = this.onDidTriggerButtonEmitter.event;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    private items: Array<any> = [];

    async show<T extends QuickPickItem>(items: Array<T | QuickPickSeparator>, options?: QuickPickOptions<T>): Promise<T | undefined> {
        this.items = items;
        const opts = Object.assign({}, options, {
            onDidAccept: () => this.onDidAcceptEmitter.fire(),
            onDidChangeActive: (quickPick: QuickPick<T>, activeItems: Array<QuickPickItem>) => this.onDidChangeActiveEmitter.fire({ quickPick, activeItems }),
            onDidChangeSelection: (quickPick: QuickPick<T>, selectedItems: Array<QuickPickItem>) => this.onDidChangeSelectionEmitter.fire({ quickPick, selectedItems }),
            onDidChangeValue: (quickPick: QuickPick<T>, filter: string) => this.onDidChangeValueEmitter.fire({ quickPick, filter }),
            onDidHide: () => this.onDidHideEmitter.fire(),
            onDidTriggerButton: (btn: QuickInputButtonHandle) => this.onDidTriggerButtonEmitter.fire(btn),
        });
        return this.quickInputService?.showQuickPick<T>(this.items, opts);
    }

    hide(): void {
        this.quickInputService?.hide();
    }

    setItems<T>(items: Array<QuickPickItem>): void {
        this.items = items;
    }
}
