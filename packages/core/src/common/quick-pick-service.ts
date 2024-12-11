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

import * as fuzzy from 'fuzzy';
import { Event } from './event';
import { KeySequence } from './keys';
import { CancellationToken } from './cancellation';

export const quickPickServicePath = '/services/quickPick';
export const QuickPickService = Symbol('QuickPickService');
export interface QuickPickService {
    show<T extends QuickPickItem>(items: Array<T | QuickPickSeparator>, options?: QuickPickOptions<T>): Promise<T | undefined>;
    setItems<T extends QuickPickItem>(items: Array<T>): void;
    hide(): void
    readonly onDidHide: Event<void>;
    readonly onDidAccept: Event<void>;
    readonly onDidChangeValue: Event<{ quickPick: QuickPick<QuickPickItem>, filter: string }>;
    readonly onDidChangeActive: Event<{ quickPick: QuickPick<QuickPickItem>, activeItems: Array<QuickPickItem> }>;
    readonly onDidChangeSelection: Event<{ quickPick: QuickPick<QuickPickItem>, selectedItems: Array<QuickPickItem> }>;
    readonly onDidTriggerButton: Event<QuickInputButtonHandle>;
}

export interface Match {
    start: number;
    end: number;
}
export interface QuickPickItemHighlights {
    label?: Match[];
    description?: Match[];
    detail?: Match[];
}

export interface QuickPickItem {
    type?: 'item';
    id?: string;
    label: string;
    meta?: string;
    ariaLabel?: string;
    description?: string;
    detail?: string;
    keySequence?: KeySequence;
    iconClasses?: string[];
    alwaysShow?: boolean;
    highlights?: QuickPickItemHighlights;
    buttons?: QuickInputButton[];
    execute?: () => void;
}

export interface QuickPickSeparator {
    type: 'separator';
    label?: string;
}

export type QuickPickItemOrSeparator = QuickPickItem | QuickPickSeparator;
export type QuickPickInput<T = QuickPickItem> = T | QuickPickSeparator;

export namespace QuickPickItem {
    export function is(item: QuickPickSeparator | QuickPickItem): item is QuickPickItem {
        // if it's not a separator, it's an item
        return item.type !== 'separator';
    }
}

export interface QuickPickSeparator {
    type: 'separator';
    label?: string;
}

export namespace QuickPickSeparator {
    export function is(item: QuickPickItemOrSeparator): item is QuickPickSeparator {
        return item.type === 'separator';
    }
}

export type QuickPicks = (QuickPickSeparator | QuickPickItem)[];

export interface QuickPickValue<V> extends QuickPickItem {
    value: V
}

export interface QuickInputButton {
    iconClass?: string;
    tooltip?: string;
    /**
     * Whether the button should be visible even when the user is not hovering.
     */
    alwaysVisible?: boolean;
}

export interface QuickInputButtonHandle extends QuickInputButton {
    handle: number; // index of where the button is in buttons array if QuickInputButton or -1 if QuickInputButtons.Back
}

export enum QuickInputHideReason {
    /**
     * Focus was moved away from the input, but the user may not have explicitly closed it.
     */
    Blur = 1,
    /**
     * An explicit close gesture, like striking the Escape key
     */
    Gesture = 2,
    /**
     * Any other reason
     */
    Other = 3,
}

export interface QuickInput {
    readonly onDidHide: Event<{ reason: QuickInputHideReason }>;
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

export interface InputBox extends QuickInput {
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

export interface QuickPick<T extends QuickPickItemOrSeparator> extends QuickInput {
    value: string;
    placeholder: string | undefined;
    items: ReadonlyArray<T | QuickPickSeparator>;
    activeItems: ReadonlyArray<T>;
    selectedItems: ReadonlyArray<T>;
    canSelectMany: boolean;
    matchOnDescription: boolean;
    matchOnDetail: boolean;
    keepScrollPosition: boolean;
    buttons: ReadonlyArray<QuickInputButton>;
    readonly onDidAccept: Event<{ inBackground: boolean } | undefined>;
    readonly onDidChangeValue: Event<string>;
    readonly onDidTriggerButton: Event<QuickInputButton>;
    readonly onDidTriggerItemButton: Event<QuickPickItemButtonEvent<QuickPickItem>>;
    readonly onDidChangeActive: Event<T[]>;
    readonly onDidChangeSelection: Event<T[]>;
}

export interface PickOptions<T extends QuickPickItem> {
    title?: string;
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

export interface InputOptions {
    title?: string;
    value?: string;
    valueSelection?: [number, number];
    prompt?: string;
    placeHolder?: string;
    password?: boolean;
    ignoreFocusLost?: boolean;
    validateInput?(input: string): Promise<string | { content: string; severity: number; } | null | undefined> | undefined;
}

export interface QuickPickItemButtonEvent<T extends QuickPickItemOrSeparator> {
    button: QuickInputButton;
    item: T;
}

export interface QuickPickItemButtonContext<T extends QuickPickItemOrSeparator> extends QuickPickItemButtonEvent<T> {
    removeItem(): void;
}

export interface QuickPickOptions<T extends QuickPickItemOrSeparator> {
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
    keepScrollPosition?: boolean;
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
    onDidTriggerItemButton?: (ItemButtonEvent: QuickPickItemButtonContext<T>) => void
}

export const quickInputServicePath = '/services/quickInput';
export const QuickInputService = Symbol('QuickInputService');
export interface QuickInputService {
    readonly backButton: QuickInputButton;
    readonly onShow: Event<void>;
    readonly onHide: Event<void>;
    open(filter: string): void;
    createInputBox(): InputBox;
    input(options?: InputOptions, token?: CancellationToken): Promise<string | undefined>;
    pick<T extends QuickPickItem>(picks: Promise<QuickPickInput<T>[]> | QuickPickInput<T>[],
        options?: PickOptions<T> & { canPickMany: true }, token?: CancellationToken): Promise<T[] | undefined>;
    pick<T extends QuickPickItem>(picks: Promise<QuickPickInput<T>[]> | QuickPickInput<T>[],
        options?: PickOptions<T> & { canPickMany: false }, token?: CancellationToken): Promise<T | undefined>;
    pick<T extends QuickPickItem>(picks: Promise<QuickPickInput<T>[]> | QuickPickInput<T>[],
        options?: Omit<PickOptions<T>, 'canPickMany'>, token?: CancellationToken): Promise<T | undefined>;

    showQuickPick<T extends QuickPickItem>(items: Array<T | QuickPickSeparator>, options?: QuickPickOptions<T>): Promise<T | undefined>;
    hide(): void;
    /**
     * Provides raw access to the quick pick controller.
     */
    createQuickPick<T extends QuickPickItem>(): QuickPick<T>;
}

/**
 * Filter the list of quick pick items based on the provided filter.
 * Items are filtered based on if:
 * - their `label` satisfies the filter using `fuzzy`.
 * - their `description` satisfies the filter using `fuzzy`.
 * - their `detail` satisfies the filter using `fuzzy`.
 * Filtered items are also updated to display proper highlights based on how they were filtered.
 * @param items the list of quick pick items.
 * @param filter the filter to search for.
 * @returns the list of quick pick items that satisfy the filter.
 */
export function filterItems(items: QuickPickItemOrSeparator[], filter: string): QuickPickItemOrSeparator[] {
    filter = filter.trim().toLowerCase();

    if (filter.length === 0) {
        for (const item of items) {
            if (item.type !== 'separator') {
                item.highlights = undefined; // reset highlights from previous filtering.
            }
        }
        return items;
    }

    const filteredItems: QuickPickItemOrSeparator[] = [];
    for (const item of items) {
        if (item.type === 'separator') {
            filteredItems.push(item);
        } else if (
            fuzzy.test(filter, item.label) ||
            (item.description && fuzzy.test(filter, item.description)) ||
            (item.detail && fuzzy.test(filter, item.detail))
        ) {
            item.highlights = {
                label: findMatches(item.label, filter),
                description: item.description ? findMatches(item.description, filter) : undefined,
                detail: item.detail ? findMatches(item.detail, filter) : undefined
            };
            filteredItems.push(item);
        }
    }
    return filteredItems;
}

/**
 * Find match highlights when testing a word against a pattern.
 * @param word the word to test.
 * @param pattern the word to match against.
 * @returns the list of highlights if present.
 */
export function findMatches(word: string, pattern: string): Array<{ start: number, end: number }> | undefined {
    word = word.toLocaleLowerCase();
    pattern = pattern.toLocaleLowerCase();

    if (pattern.trim().length === 0) {
        return undefined;
    }

    const delimiter = '\u0000'; // null byte that shouldn't appear in the input and is used to denote matches.
    const matchResult = fuzzy.match(pattern.replace(/\u0000/gu, ''), word, { pre: delimiter, post: delimiter });
    if (!matchResult) {
        return undefined;
    }

    const match = matchResult.rendered;
    const highlights: { start: number, end: number }[] = [];

    let lastIndex = 0;
    /** We need to account for the extra markers by removing them from the range */
    let offset = 0;

    while (true) {
        const start = match.indexOf(delimiter, lastIndex);
        if (start === -1) { break; }
        const end = match.indexOf(delimiter, start + 1);
        if (end === -1) { break; }
        highlights.push({
            start: start - offset++,
            end: end - offset++
        });
        lastIndex = end + 1;
    }

    return highlights.length > 0 ? highlights : undefined;
}
