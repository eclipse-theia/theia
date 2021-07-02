/********************************************************************************
 * Copyright (c) 2021 SAP SE or an SAP affiliate company and others.
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
import { CancellationToken, Event } from '../../common';
import URI from '../../common/uri';

export interface QuickPickItem {
    type?: 'item' | 'separator';
    id?: string;
    label: string;
    meta?: string;
    ariaLabel?: string;
    description?: string;
    detail?: string;
    resource?: URI;
    iconClasses?: string[];
    execute?: (item: QuickPickItem, lookFor: string) => void;
}

export interface QuickPickSeparator {
    type: 'separator';
    label?: string;
}

export interface QuickPickValue<V> extends QuickPickItem {
    value: V
}

export interface QuickInputButton {
    iconPath?: URI | { light: URI; dark: URI } | { id: string };
    iconClass?: string;
    tooltip?: string;
}

export interface QuickInputButtonHandle extends QuickInputButton {
    index: number; // index of where they are in buttons array if QuickInputButton or -1 if QuickInputButtons.Back
}

export interface QuickInput {
    readonly onDidHide: Event<void>;
    readonly onDispose: Event<void>;
    title: string | undefined;
    description: string | undefined;
    step: number | undefined;
    totalSteps: number | undefined;
    enabled: boolean;
    contextKey: string | undefined;
    busy: boolean;
    ignoreFocusOut: boolean;
    show(): void;
    hide(): void;
    dispose(): void;
}

export interface IInputBox extends QuickInput {
    value: string | undefined;
    valueSelection: Readonly<[number, number]> | undefined;
    placeholder: string | undefined;
    password: boolean;
    readonly onDidChangeValue: Event<string>;
    readonly onDidAccept: Event<void>;
    buttons: ReadonlyArray<QuickInputButton>;
    readonly onDidTriggerButton: Event<QuickInputButton>;
    prompt: string | undefined;
    validationMessage: string | undefined;
}

export interface QuickPick<T extends QuickPickItem> extends QuickInput {
    value: string;
    placeholder: string | undefined;
    readonly onDidChangeValue: Event<string>;
    readonly onDidAccept: Event<void>;
    buttons: ReadonlyArray<QuickInputButton>;
    readonly onDidTriggerButton: Event<QuickInputButton>;
    items: ReadonlyArray<T | QuickPickSeparator>;
    canSelectMany: boolean;
    matchOnDescription: boolean;
    matchOnDetail: boolean;
    activeItems: ReadonlyArray<T>;
    readonly onDidChangeActive: Event<T[]>;
    selectedItems: ReadonlyArray<T>;
    readonly onDidChangeSelection: Event<T[]>;
}

export interface IPickOptions<T extends QuickPickItem> {
    placeHolder?: string;
    matchOnDescription?: boolean;
    matchOnDetail?: boolean;
    matchOnLabel?: boolean;
    autoFocusOnList?: boolean;
    ignoreFocusLost?: boolean;
    canPickMany?: boolean;
    contextKey?: string;
    activeItem?: Promise<T> | T;
    onDidFocus?: (entry: T) => void;
}

export interface IInputOptions {
    value?: string;
    valueSelection?: [number, number];
    prompt?: string;
    placeHolder?: string;
    password?: boolean;
    ignoreFocusLost?: boolean;
    validateInput?(input: string): Promise<string | null | undefined> | undefined;
}

export interface QuickPickItemButtonEvent<T extends QuickPickItem> {
    button: QuickInputButton;
    item: T;
}

export interface QuickPickOptions<T extends QuickPickItem> {
    busy?: boolean;
    enabled?: boolean;
    title?: string;
    description?: string;
    value?: string;
    filterValue?: (value: string) => string;
    ariaLabel?: string;
    buttons?: Array<QuickInputButton>;
    placeholder?: string;
    canAcceptInBackground?: boolean;
    customButton?: boolean;
    customLabel?: string;
    customHover?: string;
    canSelectMany?: boolean;
    matchOnDescription?: boolean;
    matchOnDetail?: boolean;
    matchOnLabel?: boolean;
    sortByLabel?: boolean;
    autoFocusOnList?: boolean;
    ignoreFocusOut?: boolean;
    valueSelection?: Readonly<[number, number]>;
    validationMessage?: string;
    hideInput?: boolean;
    hideCheckAll?: boolean;
    runIfSingle?: boolean
    contextKey?: string;
    activeItem?: T,
    step?: number;
    totalSteps?: number;

    onDidAccept?: () => void,
    onDidChangeActive?: (quickPick: QuickPick<T>, activeItems: Array<T>) => void,
    onDidChangeSelection?: (quickPick: QuickPick<T>, selectedItems: Array<T>) => void,
    onDidChangeValue?: (quickPick: QuickPick<T>, filter: string) => void,
    onDidCustom?: () => void,
    onDidHide?: () => void;
    onDidTriggerButton?: (button: QuickInputButton) => void,
    onDidTriggerItemButton?: (ItemButtonEvent: QuickPickItemButtonEvent<T>) => void
}

export interface IQuickInputService {
    readonly backButton: QuickInputButton;
    readonly onShow: Event<void>;
    readonly onHide: Event<void>;
    open(filter: string): void;
    reset(): void;
    createInputBox(): IInputBox;
    createQuickPick<T extends QuickPickItem>(): QuickPick<T>;
    input(options?: IInputOptions, token?: CancellationToken): Promise<string | undefined>;
    pick<T extends QuickPickItem, O extends IPickOptions<T>>(picks: Promise<T[]> | T[], options?: O, token?: CancellationToken):
        Promise<(O extends { canPickMany: true } ? T[] : T) | undefined>;
    showQuickPick<T extends QuickPickItem>(items: Array<T>, options?: QuickPickOptions<T>): Promise<T>;
    hide(): void;
}

export function filterItems(items: Array<QuickPickItem>, filter: string): Array<QuickPickItem> {
    return filter.trim().length === 0 ? items : items
        .filter(item => item.label.toLowerCase().indexOf(filter.toLowerCase()) > -1)
        .map(item => Object.assign(item, { highlights: { label: findMatches(item.label.toLowerCase(), filter.toLowerCase()) } }));
}

export function findMatches(label: string, lookFor: string): Array<{ start: number, end: number }> | undefined {
    const _label = label.toLocaleLowerCase(); const _lookFor = lookFor.toLocaleLowerCase();
    return _label.indexOf(_lookFor) > -1 ? [{ start: _label.indexOf(_lookFor), end: _label.indexOf(_lookFor) + _lookFor.length }] : undefined;
}

@injectable()
export class QuickInputService implements IQuickInputService {
    createInputBox(): IInputBox { return {} as IInputBox; }

    createQuickPick<T extends QuickPickItem>(): QuickPick<T> { return {} as QuickPick<T>; }

    input(options?: IInputOptions, token?: CancellationToken): Promise<string | undefined> { return Promise.resolve(undefined); }

    pick<T extends QuickPickItem, O extends IPickOptions<T>>(picks: Promise<T[]> | T[], options: O = <O>{}, token?: CancellationToken):
        Promise<(O extends { canPickMany: true } ? T[] : T) | undefined> {
        return Promise.resolve(undefined);
    }

    showQuickPick<T extends QuickPickItem>(items: Array<T>, options?: QuickPickOptions<T>): Promise<T> { return Promise.resolve({} as T); }

    get backButton(): QuickInputButton { return {} as QuickInputButton; }
    get onShow(): Event<void> { return {} as Event<void>; }
    get onHide(): Event<void> { return {} as Event<void>; }

    open(filter: string): void { }

    reset(): void { }

    hide(): void { }
}
