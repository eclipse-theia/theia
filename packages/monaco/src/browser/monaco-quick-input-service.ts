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
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0 WITH Classpath-exception-2.0
// *****************************************************************************

import {
    ApplicationShell,
    InputBox, InputOptions, KeybindingRegistry, NormalizedQuickInputButton, PickOptions,
    QuickInputButton, QuickInputHideReason, QuickInputService, QuickPick, QuickPickItem,
    QuickPickItemButtonEvent, QuickPickItemHighlights, QuickPickOptions, QuickPickSeparator
} from '@theia/core/lib/browser';
import { injectable, inject, postConstruct } from '@theia/core/shared/inversify';
import {
    IInputBox, IInputOptions, IKeyMods, IPickOptions, IQuickInput, IQuickInputButton,
    IQuickInputService, IQuickNavigateConfiguration, IQuickPick, IQuickPickItem, IQuickPickItemButtonEvent, IQuickPickSeparator, QuickPickInput
} from '@theia/monaco-editor-core/esm/vs/platform/quickinput/common/quickInput';
import { IQuickInputOptions, IQuickInputStyles, QuickInputController } from '@theia/monaco-editor-core/esm/vs/base/parts/quickinput/browser/quickInput';
import { MonacoResolvedKeybinding } from './monaco-resolved-keybinding';
import { IQuickAccessController } from '@theia/monaco-editor-core/esm/vs/platform/quickinput/common/quickAccess';
import { QuickAccessController } from '@theia/monaco-editor-core/esm/vs/platform/quickinput/browser/quickAccess';
import { ContextKeyService as VSCodeContextKeyService } from '@theia/monaco-editor-core/esm/vs/platform/contextkey/browser/contextKeyService';
import { IListOptions, List } from '@theia/monaco-editor-core/esm/vs/base/browser/ui/list/listWidget';
import * as monaco from '@theia/monaco-editor-core';
import { ResolvedKeybinding } from '@theia/monaco-editor-core/esm/vs/base/common/keybindings';
import { IInstantiationService } from '@theia/monaco-editor-core/esm/vs/platform/instantiation/common/instantiation';
import { StandaloneServices } from '@theia/monaco-editor-core/esm/vs/editor/standalone/browser/standaloneServices';
import { IMatch } from '@theia/monaco-editor-core/esm/vs/base/common/filters';
import { IListRenderer, IListVirtualDelegate } from '@theia/monaco-editor-core/esm/vs/base/browser/ui/list/list';
import { Event } from '@theia/core';
import { MonacoColorRegistry } from './monaco-color-registry';
import { ThemeService } from '@theia/core/lib/browser/theming';
import { IStandaloneThemeService } from '@theia/monaco-editor-core/esm/vs/editor/standalone/common/standaloneTheme';

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

    @inject(VSCodeContextKeyService)
    protected readonly contextKeyService: VSCodeContextKeyService;

    protected container: HTMLElement;
    private quickInputList: List<unknown>;

    get backButton(): IQuickInputButton { return this.controller.backButton; }
    get onShow(): monaco.IEvent<void> { return this.controller.onShow; }
    get onHide(): monaco.IEvent<void> { return this.controller.onHide; }

    @postConstruct()
    protected init(): void {
        this.initContainer();
        this.initController();
        this.quickAccess = new QuickAccessController(this, StandaloneServices.get(IInstantiationService));
        this.controller.onShow(() => {
            this.container.style.top = this.shell.mainPanel.node.getBoundingClientRect().top + 'px';
        });
        this.themeService.initialized.then(() => this.controller.applyStyles(this.getStyles()));
        // Hook into the theming service of Monaco to ensure that the updates are ready.
        StandaloneServices.get(IStandaloneThemeService).onDidColorThemeChange(() => this.controller.applyStyles(this.getStyles()));
        window.addEventListener('resize', () => this.updateLayout());
    }

    setContextKey(key: string | undefined): void {
        if (key) {
            this.contextKeyService.createKey<string>(key, undefined);
        }
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
        this.controller = new QuickInputController(this.getOptions());
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
            styles: { widget: {}, list: {}, inputBox: {}, countBadge: {}, button: {}, progressBar: {}, keybindingLabel: {}, },
            ignoreFocusOut: () => false,
            isScreenReaderOptimized: () => false, // TODO change to true once support is added.
            backKeybindingLabel: () => undefined,
            setContextKey: (id?: string) => this.setContextKey(id),
            returnFocus: () => this.container.focus(),
            createList: <T>(
                user: string, container: HTMLElement, delegate: IListVirtualDelegate<T>, renderers: IListRenderer<T, unknown>[], listOptions: IListOptions<T>
            ): List<T> => this.quickInputList = new List(user, container, delegate, renderers, listOptions),
        };
        return options;
    }

    // @monaco-uplift
    // Keep the styles up to date with https://github.com/microsoft/vscode/blob/7888ff3a6b104e9e2e3d0f7890ca92dd0828215f/src/vs/platform/quickinput/browser/quickInput.ts#L171.
    private getStyles(): IQuickInputStyles {
        return {
            widget: {
                quickInputBackground: this.colorRegistry.getColor('quickInput.background'),
                quickInputForeground: this.colorRegistry.getColor('quickInput.foreground'),
                quickInputTitleBackground: this.colorRegistry.getColor('quickInputTitle.background')
            },
            list: {
                listBackground: this.colorRegistry.getColor('quickInput.background'),
                listInactiveFocusForeground: this.colorRegistry.getColor('quickInputList.focusForeground'),
                listInactiveSelectionIconForeground: this.colorRegistry.getColor('quickInputList.focusIconForeground'),
                listInactiveFocusBackground: this.colorRegistry.getColor('quickInputList.focusBackground'),
                listFocusOutline: this.colorRegistry.getColor('activeContrastBorder'),
                listInactiveFocusOutline: this.colorRegistry.getColor('activeContrastBorder'),
                pickerGroupBorder: this.colorRegistry.getColor('pickerGroup.border'),
                pickerGroupForeground: this.colorRegistry.getColor('pickerGroup.foreground')
            },
            inputBox: {
                inputForeground: this.colorRegistry.getColor('inputForeground'),
                inputBackground: this.colorRegistry.getColor('inputBackground'),
                inputBorder: this.colorRegistry.getColor('inputBorder'),
                inputValidationInfoBackground: this.colorRegistry.getColor('inputValidation.infoBackground'),
                inputValidationInfoForeground: this.colorRegistry.getColor('inputValidation.infoForeground'),
                inputValidationInfoBorder: this.colorRegistry.getColor('inputValidation.infoBorder'),
                inputValidationWarningBackground: this.colorRegistry.getColor('inputValidation.warningBackground'),
                inputValidationWarningForeground: this.colorRegistry.getColor('inputValidation.warningForeground'),
                inputValidationWarningBorder: this.colorRegistry.getColor('inputValidation.warningBorder'),
                inputValidationErrorBackground: this.colorRegistry.getColor('inputValidation.errorBackground'),
                inputValidationErrorForeground: this.colorRegistry.getColor('inputValidation.errorForeground'),
                inputValidationErrorBorder: this.colorRegistry.getColor('inputValidation.errorBorder'),
            },
            countBadge: {
                badgeBackground: this.colorRegistry.getColor('badge.background'),
                badgeForeground: this.colorRegistry.getColor('badge.foreground'),
                badgeBorder: this.colorRegistry.getColor('contrastBorder')
            },
            button: {
                buttonForeground: this.colorRegistry.getColor('button.foreground'),
                buttonBackground: this.colorRegistry.getColor('button.background'),
                buttonHoverBackground: this.colorRegistry.getColor('button.hoverBackground'),
                buttonBorder: this.colorRegistry.getColor('contrastBorder')
            },
            progressBar: {
                progressBarBackground: this.colorRegistry.getColor('progressBar.background')
            },
            keybindingLabel: {
                keybindingLabelBackground: this.colorRegistry.getColor('keybindingLabe.background'),
                keybindingLabelForeground: this.colorRegistry.getColor('keybindingLabel.foreground'),
                keybindingLabelBorder: this.colorRegistry.getColor('keybindingLabel.border'),
                keybindingLabelBottomBorder: this.colorRegistry.getColor('keybindingLabel.bottomBorder'),
                keybindingLabelShadow: this.colorRegistry.getColor('widget.shadow')
            },
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
        return this.monacoService.backButton;
    }

    get onShow(): Event<void> { return this.monacoService.onShow; }
    get onHide(): Event<void> { return this.monacoService.onHide; }

    open(filter: string): void {
        this.monacoService.open(filter);
    }

    createInputBox(): InputBox {
        return this.monacoService.createInputBox();
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
        picks: Promise<QuickPickInput<T>[]> | QuickPickInput<T>[], options?: O, token?: monaco.CancellationToken
    ): Promise<(O extends { canPickMany: true; } ? T[] : T) | undefined> {
        type M = T & { buttons?: NormalizedQuickInputButton[] };
        type R = (O extends { canPickMany: true; } ? T[] : T);
        const monacoPicks = (await picks).map(pick => {
            if (pick.type !== 'separator') {
                pick.buttons &&= pick.buttons.map(QuickInputButton.normalize);
            }
            return pick as M;
        });
        const monacoOptions = options as IPickOptions<M>;
        const picked = await this.monacoService.pick(monacoPicks, monacoOptions, token);
        if (!picked) { return picked; }
        if (options?.canPickMany) {
            return (Array.isArray(picked) ? picked : [picked]) as R;
        }
        return Array.isArray(picked) ? picked[0] : picked;
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
                        options.onDidTriggerButton(button);
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
        return this.wrapped.items.map(item => QuickPickSeparator.is(item) ? item : item.item);
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
    readonly onDidTriggerButton: Event<QuickInputButton> = this.wrapped.onDidTriggerButton;
    readonly onDidTriggerItemButton: Event<QuickPickItemButtonEvent<T>> =
        Event.map(this.wrapped.onDidTriggerItemButton, (evt: IQuickPickItemButtonEvent<MonacoQuickPickItem<T>>) => ({
            item: evt.item.item,
            button: evt.button
        }));
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
                if (!QuickPickSeparator.is(wrappedItem) && wrappedItem.item === item) {
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
        this.buttons = item.buttons?.map(QuickInputButton.normalize);
        this.alwaysShow = item.alwaysShow;
        this.highlights = item.highlights;
    }

    accept(): void {
        if (this.item.execute) {
            this.item.execute();
        }
    }
}
