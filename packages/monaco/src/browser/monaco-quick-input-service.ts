// *****************************************************************************
// Copyright (C) 2021 SAP SE or an SAP affiliate company and others.
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

import {
    ApplicationShell,
    InputBox, InputOptions, KeybindingRegistry, PickOptions,
    QuickInputButton, QuickInputHideReason, QuickInputService, QuickPick, QuickPickItem,
    QuickPickItemButtonEvent, QuickPickItemHighlights, QuickPickOptions, QuickPickSeparator
} from '@theia/core/lib/browser';
import { injectable, inject, postConstruct } from '@theia/core/shared/inversify';
import {
    IInputBox, IInputOptions, IKeyMods, IPickOptions, IQuickInput, IQuickInputButton,
    IQuickInputService, IQuickNavigateConfiguration, IQuickPick, IQuickPickItem, IQuickPickItemButtonEvent, IQuickPickSeparator, IQuickWidget, QuickPickInput
} from '@theia/monaco-editor-core/esm/vs/platform/quickinput/common/quickInput';
import { IQuickInputOptions, IQuickInputStyles } from '@theia/monaco-editor-core/esm/vs/platform/quickinput/browser/quickInput';
import { QuickInputController } from '@theia/monaco-editor-core/esm/vs/platform/quickinput/browser/quickInputController';
import { MonacoResolvedKeybinding } from './monaco-resolved-keybinding';
import { IQuickAccessController } from '@theia/monaco-editor-core/esm/vs/platform/quickinput/common/quickAccess';
import { QuickAccessController } from '@theia/monaco-editor-core/esm/vs/platform/quickinput/browser/quickAccess';
import { IContextKey, IContextKeyService } from '@theia/monaco-editor-core/esm/vs/platform/contextkey/common/contextkey';
import { IListOptions, List } from '@theia/monaco-editor-core/esm/vs/base/browser/ui/list/listWidget';
import * as monaco from '@theia/monaco-editor-core';
import { ResolvedKeybinding } from '@theia/monaco-editor-core/esm/vs/base/common/keybindings';
import { IInstantiationService } from '@theia/monaco-editor-core/esm/vs/platform/instantiation/common/instantiation';
import { StandaloneServices } from '@theia/monaco-editor-core/esm/vs/editor/standalone/browser/standaloneServices';
import { IMatch } from '@theia/monaco-editor-core/esm/vs/base/common/filters';
import { IListRenderer, IListVirtualDelegate } from '@theia/monaco-editor-core/esm/vs/base/browser/ui/list/list';
import { CancellationToken, Event } from '@theia/core';
import { MonacoColorRegistry } from './monaco-color-registry';
import { ThemeService } from '@theia/core/lib/browser/theming';
import { IStandaloneThemeService } from '@theia/monaco-editor-core/esm/vs/editor/standalone/common/standaloneTheme';
import {
    activeContrastBorder, asCssVariable, pickerGroupBorder, pickerGroupForeground, quickInputBackground, quickInputForeground, quickInputListFocusBackground,
    quickInputListFocusForeground, quickInputListFocusIconForeground, quickInputTitleBackground, widgetBorder, widgetShadow
} from '@theia/monaco-editor-core/esm/vs/platform/theme/common/colorRegistry';

import {
    defaultButtonStyles, defaultCountBadgeStyles, defaultInputBoxStyles, defaultKeybindingLabelStyles, defaultProgressBarStyles, defaultToggleStyles, getListStyles
} from '@theia/monaco-editor-core/esm/vs/platform/theme/browser/defaultStyles';

// Copied from @vscode/src/vs/base/parts/quickInput/browser/quickInputList.ts
export interface IListElement {
    readonly index: number;
    readonly item: IQuickPickItem;
    readonly saneLabel: string;
    readonly saneAriaLabel: string;
    readonly saneDescription?: string;
    readonly saneDetail?: string;
    readonly labelHighlights?: IMatch[];
    readonly descriptionHighlights?: IMatch[];
    readonly detailHighlights?: IMatch[];
    readonly checked: boolean;
    readonly separator?: IQuickPickSeparator;
    readonly fireButtonTriggered: (event: IQuickPickItemButtonEvent<IQuickPickItem>) => void;
}

@injectable()
export class MonacoQuickInputImplementation implements IQuickInputService {

    declare readonly _serviceBrand: undefined;

    controller: QuickInputController;
    quickAccess: IQuickAccessController;

    @inject(ApplicationShell)
    protected readonly shell: ApplicationShell;

    @inject(MonacoColorRegistry)
    protected readonly colorRegistry: MonacoColorRegistry;

    @inject(ThemeService)
    protected readonly themeService: ThemeService;

    protected container: HTMLElement;
    private quickInputList: List<unknown>;

    protected inQuickOpen: IContextKey<boolean>;

    get backButton(): IQuickInputButton { return this.controller.backButton; }
    get onShow(): monaco.IEvent<void> { return this.controller.onShow; }
    get onHide(): monaco.IEvent<void> { return this.controller.onHide; }

    @postConstruct()
    protected init(): void {
        this.initContainer();
        this.initController();
        this.quickAccess = new QuickAccessController(this, StandaloneServices.get(IInstantiationService));
        this.inQuickOpen = StandaloneServices.get(IContextKeyService).createKey<boolean>('inQuickOpen', false);
        this.controller.onShow(() => {
            this.container.style.top = this.shell.mainPanel.node.getBoundingClientRect().top + 'px';
            this.inQuickOpen.set(true);
        });
        this.controller.onHide(() => this.inQuickOpen.set(false));

        this.themeService.initialized.then(() => this.controller.applyStyles(this.computeStyles()));
        // Hook into the theming service of Monaco to ensure that the updates are ready.
        StandaloneServices.get(IStandaloneThemeService).onDidColorThemeChange(() => this.controller.applyStyles(this.computeStyles()));
        window.addEventListener('resize', () => this.updateLayout());
    }

    setContextKey(key: string | undefined): void {
        if (key) {
            StandaloneServices.get(IContextKeyService).createKey<string>(key, undefined);
        }
    }

    createQuickWidget(): IQuickWidget {
        return this.controller.createQuickWidget();
    }

    createQuickPick<T extends IQuickPickItem>(): IQuickPick<T> {
        return this.controller.createQuickPick<T>();
    }

    createInputBox(): IInputBox {
        return this.controller.createInputBox();
    }

    open(filter: string): void {
        this.quickAccess.show(filter);
        setTimeout(() => {
            this.quickInputList.focusNth(0);
        }, 300);
    }

    input(options?: IInputOptions, token?: monaco.CancellationToken): Promise<string | undefined> {
        return this.controller.input(options, token);
    }

    pick<T extends IQuickPickItem, O extends IPickOptions<T>>(
        picks: Promise<QuickPickInput<T>[]> | QuickPickInput<T>[], options?: O, token?: monaco.CancellationToken
    ): Promise<(O extends { canPickMany: true; } ? T[] : T) | undefined> {
        return this.controller.pick(picks, options, token);
    }

    hide(): void {
        this.controller.hide();
    }

    focus(): void {
        this.controller.focus();
    }

    toggle(): void {
        this.controller.toggle();
    }

    applyStyles(styles: IQuickInputStyles): void {
        this.controller.applyStyles(styles);
    }

    layout(dimension: monaco.editor.IDimension, titleBarOffset: number): void {
        this.controller.layout(dimension, titleBarOffset);
    }

    navigate(next: boolean, quickNavigate?: IQuickNavigateConfiguration): void {
        this.controller.navigate(next, quickNavigate);
    }

    dispose(): void {
        this.controller.dispose();
    }

    async cancel(): Promise<void> {
        this.controller.cancel();
    }

    async back(): Promise<void> {
        this.controller.back();
    }

    async accept(keyMods?: IKeyMods): Promise<void> {
        this.controller.accept(keyMods);
    }

    private initContainer(): void {
        const container = this.container = document.createElement('div');
        container.id = 'quick-input-container';
        document.body.appendChild(this.container);
    }

    private initController(): void {
        this.controller = new QuickInputController(this.getOptions(), StandaloneServices.get(IStandaloneThemeService));
        this.updateLayout();
    }

    private updateLayout(): void {
        // Initialize the layout using screen dimensions as monaco computes the actual sizing.
        // https://github.com/microsoft/vscode/blob/6261075646f055b99068d3688932416f2346dd3b/src/vs/base/parts/quickinput/browser/quickInput.ts#L1799
        this.controller.layout(this.getClientDimension(), 0);
    }

    private getClientDimension(): monaco.editor.IDimension {
        return { width: window.innerWidth, height: window.innerHeight };
    }

    private getOptions(): IQuickInputOptions {
        const options: IQuickInputOptions = {
            idPrefix: 'quickInput_',
            container: this.container,
            styles: this.computeStyles(),
            ignoreFocusOut: () => false,
            backKeybindingLabel: () => undefined,
            setContextKey: (id?: string) => this.setContextKey(id),
            returnFocus: () => this.container.focus(),
            createList: <T>(
                user: string, container: HTMLElement, delegate: IListVirtualDelegate<T>, renderers: IListRenderer<T, unknown>[], listOptions: IListOptions<T>
            ): List<T> => this.quickInputList = new List(user, container, delegate, renderers, listOptions),
            linkOpenerDelegate: () => {
                // @monaco-uplift: not sure what to do here
            }
        };
        return options;
    }

    // @monaco-uplift
    // Keep the styles up to date with https://github.com/microsoft/vscode/blob/7888ff3a6b104e9e2e3d0f7890ca92dd0828215f/src/vs/platform/quickinput/browser/quickInput.ts#L171.
    private computeStyles(): IQuickInputStyles {
        return {
            widget: {
                quickInputBackground: asCssVariable(quickInputBackground),
                quickInputForeground: asCssVariable(quickInputForeground),
                quickInputTitleBackground: asCssVariable(quickInputTitleBackground),
                widgetBorder: asCssVariable(widgetBorder),
                widgetShadow: asCssVariable(widgetShadow),
            },
            inputBox: defaultInputBoxStyles,
            toggle: defaultToggleStyles,
            countBadge: defaultCountBadgeStyles,
            button: defaultButtonStyles,
            progressBar: defaultProgressBarStyles,
            keybindingLabel: defaultKeybindingLabelStyles,
            list: getListStyles({
                listBackground: quickInputBackground,
                listFocusBackground: quickInputListFocusBackground,
                listFocusForeground: quickInputListFocusForeground,
                // Look like focused when inactive.
                listInactiveFocusForeground: quickInputListFocusForeground,
                listInactiveSelectionIconForeground: quickInputListFocusIconForeground,
                listInactiveFocusBackground: quickInputListFocusBackground,
                listFocusOutline: activeContrastBorder,
                listInactiveFocusOutline: activeContrastBorder,
            }),
            pickerGroup: {
                pickerGroupBorder: asCssVariable(pickerGroupBorder),
                pickerGroupForeground: asCssVariable(pickerGroupForeground),
            }
        };
    }
}

@injectable()
export class MonacoQuickInputService implements QuickInputService {
    @inject(MonacoQuickInputImplementation)
    private monacoService: MonacoQuickInputImplementation;

    @inject(KeybindingRegistry)
    protected readonly keybindingRegistry: KeybindingRegistry;

    get backButton(): QuickInputButton {
        // need to cast because of vscode issue https://github.com/microsoft/vscode/issues/190584
        return this.monacoService.backButton as QuickInputButton;
    }

    get onShow(): Event<void> { return this.monacoService.onShow; }
    get onHide(): Event<void> { return this.monacoService.onHide; }

    open(filter: string): void {
        this.monacoService.open(filter);
    }

    createInputBox(): InputBox {
        // need to cast because of vscode issue https://github.com/microsoft/vscode/issues/190584
        return this.monacoService.createInputBox() as InputBox;
    }

    input(options?: InputOptions, token?: monaco.CancellationToken): Promise<string | undefined> {
        let inputOptions: IInputOptions | undefined;
        if (options) {
            const { validateInput, ...props } = options;
            inputOptions = { ...props };
            if (validateInput) {
                inputOptions.validateInput = async input => validateInput(input);
            }
        }
        return this.monacoService.input(inputOptions, token);
    }

    async pick<T extends QuickPickItem, O extends PickOptions<T> = PickOptions<T>>(
        picks: Promise<QuickPickInput<T>[]> | QuickPickInput<T>[], options?: O, token?: CancellationToken
    ): Promise<T[] | T | undefined> {
        return this.monacoService.pick(picks, options, token);
    }

    showQuickPick<T extends QuickPickItem>(items: Array<T | QuickPickSeparator>, options?: QuickPickOptions<T>): Promise<T | undefined> {
        return new Promise<T | undefined>((resolve, reject) => {
            const wrapped = this.createQuickPick<T>();
            wrapped.items = items;

            if (options) {
                wrapped.canSelectMany = !!options.canSelectMany;
                wrapped.contextKey = options.contextKey;
                wrapped.description = options.description;
                wrapped.enabled = options.enabled ?? true;
                wrapped.ignoreFocusOut = !!options.ignoreFocusOut;
                wrapped.matchOnDescription = options.matchOnDescription ?? true;
                wrapped.matchOnDetail = options.matchOnDetail ?? true;
                wrapped.keepScrollPosition = options.keepScrollPosition ?? false;
                wrapped.placeholder = options.placeholder;
                wrapped.step = options.step;
                wrapped.title = options.title;
                wrapped.totalSteps = options.totalSteps;

                if (options.activeItem) {
                    wrapped.activeItems = [options.activeItem];
                }

                wrapped.onDidAccept(() => {
                    if (options?.onDidAccept) {
                        options.onDidAccept();
                    }
                    wrapped.hide();
                    resolve(wrapped.selectedItems[0]);
                });

                wrapped.onDidHide(() => {
                    if (options.onDidHide) {
                        options.onDidHide();
                    };
                    wrapped.dispose();
                    setTimeout(() => resolve(undefined));
                });
                wrapped.onDidChangeValue((filter: string) => {
                    if (options.onDidChangeValue) {
                        options.onDidChangeValue(wrapped, filter);
                    }
                });
                wrapped.onDidChangeActive((activeItems: Array<T>) => {
                    if (options.onDidChangeActive) {
                        options.onDidChangeActive(wrapped, activeItems);
                    }
                });
                wrapped.onDidTriggerButton((button: IQuickInputButton) => {
                    if (options.onDidTriggerButton) {
                        // need to cast because of vscode issue https://github.com/microsoft/vscode/issues/190584
                        options.onDidTriggerButton(button as QuickInputButton);
                    }
                });
                wrapped.onDidTriggerItemButton((event: QuickPickItemButtonEvent<T>) => {
                    if (options.onDidTriggerItemButton) {
                        // https://github.com/theia-ide/vscode/blob/standalone/0.23.x/src/vs/base/parts/quickinput/browser/quickInput.ts#L1387
                        options.onDidTriggerItemButton(
                            {
                                ...event,
                                removeItem: () => {
                                    wrapped.items = wrapped.items.filter(item => item !== event.item);
                                    wrapped.activeItems = wrapped.activeItems.filter(item => item !== event.item);
                                }
                            });
                    }
                });
                wrapped.onDidChangeSelection((selectedItems: Array<T>) => {
                    if (options.onDidChangeSelection) {
                        options.onDidChangeSelection(wrapped, selectedItems);
                    }
                });
            }
            wrapped.show();
        }).then(item => {
            if (item?.execute) {
                item.execute();
            }
            return item;
        });
    }

    createQuickPick<T extends QuickPickItem>(): QuickPick<T> {
        const quickPick = this.monacoService.createQuickPick<MonacoQuickPickItem<T>>();
        return this.wrapQuickPick(quickPick);
    }

    wrapQuickPick<T extends QuickPickItem>(wrapped: IQuickPick<MonacoQuickPickItem<T>>): QuickPick<T> {
        return new MonacoQuickPick(wrapped, this.keybindingRegistry);
    }

    protected convertItems<T extends QuickPickItem>(item: T): MonacoQuickPickItem<T> {
        return new MonacoQuickPickItem(item, this.keybindingRegistry);
    }

    hide(): void {
        return this.monacoService.hide();
    }
}

class MonacoQuickInput {
    constructor(protected readonly wrapped: IQuickInput) {
    }

    get onDidHide(): Event<{ reason: QuickInputHideReason }> { return this.wrapped.onDidHide; }
    get onDispose(): Event<void> { return this.wrapped.onDispose; }

    get title(): string | undefined {
        return this.wrapped.title;
    }

    set title(v: string | undefined) {
        this.wrapped.title = v;
    }

    get description(): string | undefined {
        return this.wrapped.description;
    }

    set description(v: string | undefined) {
        this.wrapped.description = v;
    }
    get step(): number | undefined {
        return this.wrapped.step;
    }

    set step(v: number | undefined) {
        this.wrapped.step = v;
    }

    get enabled(): boolean {
        return this.wrapped.enabled;
    }

    set enabled(v: boolean) {
        this.wrapped.enabled = v;
    }
    get totalSteps(): number | undefined {
        return this.wrapped.totalSteps;
    }

    set totalSteps(v: number | undefined) {
        this.wrapped.totalSteps = v;
    }
    get contextKey(): string | undefined {
        return this.wrapped.contextKey;
    }

    set contextKey(v: string | undefined) {
        this.wrapped.contextKey = v;
    }

    get busy(): boolean {
        return this.wrapped.busy;
    }

    set busy(v: boolean) {
        this.wrapped.busy = v;
    }

    get ignoreFocusOut(): boolean {
        return this.wrapped.ignoreFocusOut;
    }

    set ignoreFocusOut(v: boolean) {
        this.wrapped.ignoreFocusOut = v;
    }

    show(): void {
        this.wrapped.show();
    }
    hide(): void {
        this.wrapped.hide();
    }
    dispose(): void {
        this.wrapped.dispose();
    }

}

class MonacoQuickPick<T extends QuickPickItem> extends MonacoQuickInput implements QuickPick<T> {
    constructor(protected override readonly wrapped: IQuickPick<MonacoQuickPickItem<T>>, protected readonly keybindingRegistry: KeybindingRegistry) {
        super(wrapped);
    }

    get value(): string {
        return this.wrapped.value;
    };

    set value(v: string) {
        this.wrapped.value = v;
    }

    get placeholder(): string | undefined {
        return this.wrapped.placeholder;
    }

    set placeholder(v: string | undefined) {
        this.wrapped.placeholder = v;
    }

    get canSelectMany(): boolean {
        return this.wrapped.canSelectMany;
    }

    set canSelectMany(v: boolean) {
        this.wrapped.canSelectMany = v;
    }

    get matchOnDescription(): boolean {
        return this.wrapped.matchOnDescription;
    }

    set matchOnDescription(v: boolean) {
        this.wrapped.matchOnDescription = v;
    }

    get matchOnDetail(): boolean {
        return this.wrapped.matchOnDetail;
    }

    set matchOnDetail(v: boolean) {
        this.wrapped.matchOnDetail = v;
    }

    get keepScrollPosition(): boolean {
        return this.wrapped.keepScrollPosition;
    }

    set keepScrollPosition(v: boolean) {
        this.wrapped.keepScrollPosition = v;
    }

    get items(): readonly (T | QuickPickSeparator)[] {
        // need to cast because of vscode issue https://github.com/microsoft/vscode/issues/190584
        return this.wrapped.items.map(item => {
            if (item instanceof MonacoQuickPickItem) {
                return item.item;
            } else {
                return item;
            }
        });
    }

    set items(itemList: readonly (T | QuickPickSeparator)[]) {
        // We need to store and apply the currently selected active items.
        // Since monaco compares these items by reference equality, creating new wrapped items will unmark any active items.
        // Assigning the `activeItems` again will restore all active items even after the items array has changed.
        // See also the `findMonacoItemReferences` method.
        const active = this.activeItems;
        this.wrapped.items = itemList.map(item => QuickPickSeparator.is(item) ? item : new MonacoQuickPickItem<T>(item, this.keybindingRegistry));
        if (active.length !== 0) {
            this.activeItems = active; // If this is done with an empty activeItems array, then it will undo first item focus on quick menus.
        }
    }

    set activeItems(itemList: readonly T[]) {
        this.wrapped.activeItems = this.findMonacoItemReferences(this.wrapped.items, itemList);
    }

    get activeItems(): readonly (T)[] {
        return this.wrapped.activeItems.map(item => item.item);
    }

    set selectedItems(itemList: readonly T[]) {
        this.wrapped.selectedItems = this.findMonacoItemReferences(this.wrapped.items, itemList);
    }

    get selectedItems(): readonly (T)[] {
        return this.wrapped.selectedItems.map(item => item.item);
    }

    readonly onDidAccept: Event<{ inBackground: boolean }> = this.wrapped.onDidAccept;
    readonly onDidChangeValue: Event<string> = this.wrapped.onDidChangeValue;

    // need to cast because of vscode issue https://github.com/microsoft/vscode/issues/190584
    readonly onDidTriggerButton: Event<QuickInputButton> = this.wrapped.onDidTriggerButton as Event<QuickInputButton>;
    readonly onDidTriggerItemButton: Event<QuickPickItemButtonEvent<T>> =
        Event.map(this.wrapped.onDidTriggerItemButton, (evt: IQuickPickItemButtonEvent<MonacoQuickPickItem<T>>) => ({
            item: evt.item.item,
            button: evt.button
        })) as Event<QuickPickItemButtonEvent<T>>;
    readonly onDidChangeActive: Event<T[]> = Event.map(
        this.wrapped.onDidChangeActive,
        (items: MonacoQuickPickItem<T>[]) => items.map(item => item.item));
    readonly onDidChangeSelection: Event<T[]> = Event.map(
        this.wrapped.onDidChangeSelection, (items: MonacoQuickPickItem<T>[]) => items.map(item => item.item));

    /**
     * Monaco doesn't check for deep equality when setting the `activeItems` or `selectedItems`.
     * Instead we have to find the references of the monaco wrappers that contain the selected/active items
     */
    protected findMonacoItemReferences(source: readonly (MonacoQuickPickItem<T> | IQuickPickSeparator)[], items: readonly QuickPickItem[]): MonacoQuickPickItem<T>[] {
        const monacoReferences: MonacoQuickPickItem<T>[] = [];
        for (const item of items) {
            for (const wrappedItem of source) {
                if (wrappedItem instanceof MonacoQuickPickItem && wrappedItem.item === item) {
                    monacoReferences.push(wrappedItem);
                }
            }
        }
        return monacoReferences;
    }
}

export class MonacoQuickPickItem<T extends QuickPickItem> implements IQuickPickItem {
    readonly type?: 'item';
    readonly id?: string;
    readonly label: string;
    readonly meta?: string;
    readonly ariaLabel?: string;
    readonly description?: string;
    readonly detail?: string;
    readonly keybinding?: ResolvedKeybinding;
    readonly iconClasses?: string[];
    buttons?: IQuickInputButton[];
    readonly alwaysShow?: boolean;
    readonly highlights?: QuickPickItemHighlights;

    constructor(readonly item: T, kbRegistry: KeybindingRegistry) {
        this.type = item.type;
        this.id = item.id;
        this.label = item.label;
        this.meta = item.meta;
        this.ariaLabel = item.ariaLabel;
        this.description = item.description;
        this.detail = item.detail;
        this.keybinding = item.keySequence ? new MonacoResolvedKeybinding(item.keySequence, kbRegistry) : undefined;
        this.iconClasses = item.iconClasses;
        this.buttons = item.buttons;
        this.alwaysShow = item.alwaysShow;
        this.highlights = item.highlights;
    }

    accept(): void {
        if (this.item.execute) {
            this.item.execute();
        }
    }
}
