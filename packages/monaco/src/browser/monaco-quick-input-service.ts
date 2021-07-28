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
/* eslint-disable @typescript-eslint/no-explicit-any */

import { QuickInputService } from '@theia/core/lib/browser';
import { CancellationToken, Event } from '@theia/core/lib/common';
import { injectable, inject, postConstruct } from '@theia/core/shared/inversify';

@injectable()
export class MonacoQuickInputService extends QuickInputService implements monaco.quickInput.IQuickInputService {

    @inject(monaco.contextKeyService.ContextKeyService)
    protected readonly contextKeyService: monaco.contextKeyService.ContextKeyService;

    controller: monaco.quickInput.QuickInputController;
    quickAccess: monaco.quickInput.IQuickAccessController;

    protected container: HTMLElement;
    private quickInputList: monaco.list.List<monaco.list.IListElement>;

    get backButton(): monaco.quickInput.IQuickInputButton { return this.controller.backButton; }
    get onShow(): Event<void> { return this.controller.onShow; }
    get onHide(): Event<void> { return this.controller.onHide; }

    constructor() {
        super();
        this.initContainer();
        this.initController();
    }

    @postConstruct()
    protected async init(): Promise<void> {
        this.quickAccess = new monaco.quickInput.QuickAccessController(this, monaco.services.StaticServices.instantiationService.get());
    }

    setContextKey(key: string | undefined): void {
        if (key) {
            this.contextKeyService.createKey<string>(key, undefined);
        }
    }

    createQuickPick<T extends monaco.quickInput.IQuickPickItem>(): monaco.quickInput.IQuickPick<T> {
        return this.controller.createQuickPick<T>();
    }

    createInputBox(): monaco.quickInput.IInputBox {
        return this.controller.createInputBox();
    }

    open(filter: string): void {
        this.quickAccess.show(filter);
        setTimeout(() => {
            this.quickInputList.focusNth(0);
        }, 300);
    }

    showQuickPick<T extends monaco.quickInput.IQuickPickItem>(items: Array<T>, options?: monaco.quickInput.IQuickPickOptions<T>): Promise<T> {
        return new Promise<T>((resolve, reject) => {
            const quickPick = this.createQuickPick<T>();

            if (options) {
                quickPick.ariaLabel = options.ariaLabel;
                quickPick.canAcceptInBackground = !!options.canAcceptInBackground;
                quickPick.canSelectMany = !!options.canSelectMany;
                quickPick.contextKey = options.contextKey;
                quickPick.customButton = !!options.customButton;
                quickPick.customHover = options.customHover;
                quickPick.customLabel = options.customLabel;
                quickPick.description = options.description;
                quickPick.enabled = options.enabled ?? true;
                quickPick.hideCheckAll = !!options.hideCheckAll;
                quickPick.hideInput = !!options.hideInput;
                quickPick.ignoreFocusOut = !!options.ignoreFocusOut;
                quickPick.autoFocusOnList = options.autoFocusOnList ?? true;
                quickPick.matchOnDescription = options.matchOnDescription ?? true;
                quickPick.matchOnDetail = options.matchOnDetail ?? true;
                quickPick.matchOnLabel = options.matchOnLabel ?? true;
                quickPick.placeholder = options.placeholder;
                quickPick.sortByLabel = options.sortByLabel ?? true;
                quickPick.step = options.step;
                quickPick.title = options.title;
                quickPick.totalSteps = options.totalSteps;
                quickPick.validationMessage = options.validationMessage;

                if (options.activeItem) {
                    quickPick.activeItems = [options.activeItem];
                }

                quickPick.onDidAccept((event: Event<monaco.quickInput.IQuickPickAcceptEvent>) => {
                    if (options?.onDidAccept) {
                        options.onDidAccept();
                    }
                });

                quickPick.onDidHide(() => {
                    if (options.onDidHide) {
                        options.onDidHide();
                    };
                    quickPick.dispose();
                });
                quickPick.onDidChangeValue((filter: string) => {
                    if (options.onDidChangeValue) {
                        options.onDidChangeValue(quickPick, filter);
                    }
                });
                quickPick.onDidChangeActive((activeItems: Array<T>) => {
                    if (options.onDidChangeActive) {
                        options.onDidChangeActive(quickPick, activeItems);
                    }
                });
                quickPick.onDidTriggerButton((button: monaco.quickInput.IQuickInputButton) => {
                    if (options.onDidTriggerButton) {
                        options.onDidTriggerButton(button);
                    }
                });
                quickPick.onDidTriggerItemButton((itemButtonEvent: monaco.quickInput.IQuickPickItemButtonEvent<T>) => {
                    if (options.onDidTriggerItemButton) {
                        options.onDidTriggerItemButton(itemButtonEvent);
                    }
                });
                quickPick.onDidChangeSelection((selectedItems: Array<T>) => {
                    if (options.onDidChangeSelection) {
                        options.onDidChangeSelection(quickPick, selectedItems);
                    }
                    if (selectedItems[0].execute) {
                        selectedItems[0].execute(selectedItems[0], quickPick.value);
                    }
                    quickPick.hide();
                    resolve(selectedItems[0]);
                });
            }

            quickPick.items = items;
            quickPick.show();
        });
    }

    input(options?: monaco.quickInput.IInputOptions, token?: CancellationToken): Promise<string | undefined> {
        return this.controller.input(options, token);
    }

    pick<T extends monaco.quickInput.IQuickPickItem, O extends monaco.quickInput.IPickOptions<T>>(
        picks: Promise<T[]> | T[], options: O = <O>{}, token?: CancellationToken): Promise<(O extends { canPickMany: true } ? T[] : T) | undefined> {
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

    applyStyles(styles: monaco.quickInput.IQuickInputStyles): void {
        this.controller.applyStyles(styles);
    }

    layout(dimension: monaco.editor.IDimension, titleBarOffset: number): void {
        this.controller.layout(dimension, titleBarOffset);
    }

    navigate?(next: boolean, quickNavigate?: monaco.quickInput.IQuickNavigateConfiguration): void {
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

    async accept?(keyMods?: monaco.quickInput.IKeyMods): Promise<void> {
        this.controller.accept(keyMods);
    }

    private initContainer(): void {
        const overlayWidgets = document.createElement('div');
        overlayWidgets.classList.add('quick-input-overlay');
        document.body.appendChild(overlayWidgets);
        const container = this.container = document.createElement('quick-input-container');
        container.style.position = 'absolute';
        container.style.top = '0px';
        container.style.right = '50%';
        container.style.zIndex = '1000000';
        overlayWidgets.appendChild(container);
    }

    private initController(): void {
        this.controller = new monaco.quickInput.QuickInputController(this.getOptions());
        this.controller.layout({ width: 600, height: 1200 }, 0);
    }

    private getOptions(): monaco.quickInput.IQuickInputOptions {
        return {
            idPrefix: 'quickInput_',
            container: this.container,
            ignoreFocusOut: () => false,
            isScreenReaderOptimized: () => true,
            backKeybindingLabel: () => undefined,
            setContextKey: (id?: string) => this.setContextKey(id),
            returnFocus: () => this.container.focus(),
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            createList: (user: string, container: HTMLElement, delegate: any, renderers: any, options: any) => {
                this.quickInputList = new monaco.list.List(user, container, delegate, renderers, options);
                return this.quickInputList;
            },
            styles: {
                widget: {},
                list: {},
                inputBox: {},
                countBadge: {},
                button: {},
                progressBar: {}
            }
        };
    }
}

