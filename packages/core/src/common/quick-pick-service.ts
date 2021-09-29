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
import { Event } from './event';
// eslint-disable-next-line @theia/runtime-import-check
import { QuickInputButtonHandle, QuickPick, QuickPickItem, QuickPickOptions } from '../browser/quick-input/quick-input-service';

export const quickPickServicePath = '/services/quickPick';
export const QuickPickService = Symbol('QuickPickService');
export interface QuickPickService {

    show<T extends QuickPickItem>(items: Array<T>, options?: QuickPickOptions<T>): Promise<T | undefined>;
    setItems<T extends QuickPickItem>(items: Array<T>): void;
    hide(): void

    readonly onDidHide: Event<void>;
    readonly onDidAccept: Event<void>;
    readonly onDidChangeValue: Event<{ quickPick: QuickPick<QuickPickItem>, filter: string }>;
    readonly onDidChangeActive: Event<{ quickPick: QuickPick<QuickPickItem>, activeItems: Array<QuickPickItem> }>;
    readonly onDidChangeSelection: Event<{ quickPick: QuickPick<QuickPickItem>, selectedItems: Array<QuickPickItem> }>;
    readonly onDidTriggerButton: Event<QuickInputButtonHandle>;
}
