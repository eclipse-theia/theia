/********************************************************************************
 * Copyright (C) 2018 Red Hat, Inc. and others.
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

import { InputBoxOptions, QuickPickItem as QuickPickItemExt } from '@theia/plugin';
import { interfaces } from '@theia/core/shared/inversify';
import {
    QuickOpenModel,
    QuickOpenItem,
    QuickOpenMode
} from '@theia/core/lib/browser/quick-open/quick-open-model';
import { RPCProtocol } from '../../common/rpc-protocol';
import {
    QuickOpenExt,
    QuickOpenMain,
    MAIN_RPC_CONTEXT,
    PickOptions,
    PickOpenItem,
    TransferInputBox,
    QuickInputTitleButtonHandle,
    TransferQuickPick
} from '../../common/plugin-api-rpc';
import { MonacoQuickOpenService } from '@theia/monaco/lib/browser/monaco-quick-open-service';
import { QuickInputService, LabelProvider } from '@theia/core/lib/browser';
import { PluginSharedStyle } from './plugin-shared-style';
import { URI } from '@theia/core/shared/vscode-uri';
import { ThemeIcon, QuickInputButton } from '../../plugin/types-impl';
import { QuickPickService, QuickPickItem, QuickPickValue } from '@theia/core/lib/common/quick-pick-service';
import { QuickTitleBar } from '@theia/core/lib/browser/quick-open/quick-title-bar';
import { DisposableCollection, Disposable } from '@theia/core/lib/common/disposable';
import { QuickTitleButtonSide, QuickOpenGroupItem } from '@theia/core/lib/common/quick-open-model';
import { CancellationToken } from '@theia/core/lib/common/cancellation';

export class QuickOpenMainImpl implements QuickOpenMain, QuickOpenModel, Disposable {

    private quickInput: QuickInputService;
    private quickPick: QuickPickService;
    private quickTitleBar: QuickTitleBar;
    private doResolve: (value?: number | number[] | PromiseLike<number | number[]> | undefined) => void;
    private proxy: QuickOpenExt;
    private delegate: MonacoQuickOpenService;
    private acceptor: ((items: QuickOpenItem[]) => void) | undefined;
    private items: QuickOpenItem[] | undefined;

    private readonly sharedStyle: PluginSharedStyle;
    private readonly labelProvider: LabelProvider;

    private activeElement: HTMLElement | undefined;

    protected readonly toDispose = new DisposableCollection();

    constructor(rpc: RPCProtocol, container: interfaces.Container) {
        this.proxy = rpc.getProxy(MAIN_RPC_CONTEXT.QUICK_OPEN_EXT);
        this.delegate = container.get(MonacoQuickOpenService);
        this.quickInput = container.get(QuickInputService);
        this.quickTitleBar = container.get(QuickTitleBar);
        this.quickPick = container.get(QuickPickService);
        this.sharedStyle = container.get(PluginSharedStyle);
        this.labelProvider = container.get(LabelProvider);
    }

    dispose(): void {
        this.toDispose.dispose();
    }

    private cleanUp(): void {
        this.items = undefined;
        this.acceptor = undefined;
        if (this.activeElement) {
            this.activeElement.focus({ preventScroll: true });
        }
        this.activeElement = undefined;
    }

    $show(options: PickOptions, token: CancellationToken): Promise<number | number[]> {
        return new Promise((resolve, reject) => {
            if (token.isCancellationRequested) {
                resolve(undefined);
                return;
            }
            this.doResolve = resolve;
            this.activeElement = window.document.activeElement as HTMLElement;
            const toDispose = token.onCancellationRequested(() =>
                this.delegate.hide()
            );
            this.delegate.open(this, {
                fuzzyMatchDescription: options.matchOnDescription,
                fuzzyMatchLabel: true,
                fuzzyMatchDetail: options.matchOnDetail,
                placeholder: options.placeHolder,
                ignoreFocusOut: options.ignoreFocusLost,
                onClose: () => {
                    this.doResolve(undefined);
                    toDispose.dispose();
                    this.cleanUp();
                }
            });
        });
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    $setItems(items: PickOpenItem[]): Promise<any> {
        this.items = [];
        for (const i of items) {
            let item: QuickOpenItem | QuickOpenGroupItem;
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const options: any = {
                label: i.label,
                description: i.description,
                detail: i.detail,
                run: (mode: QuickOpenMode) => {
                    if (mode === QuickOpenMode.OPEN) {
                        this.proxy.$onItemSelected(i.handle);
                        this.doResolve(i.handle);
                        this.cleanUp();
                        return true;
                    }
                    return false;
                }
            };

            if (i.groupLabel !== undefined || i.showBorder !== undefined) {
                options.groupLabel = i.groupLabel;
                options.showBorder = i.showBorder;
                item = new QuickOpenGroupItem(options);
            } else {
                item = new QuickOpenItem(options);
            }

            this.items.push(item);
        }
        if (this.acceptor) {
            this.acceptor(this.items);
        }
        return Promise.resolve();
    }

    private convertPickOpenItemToQuickOpenItem(items: PickOpenItem[]): QuickPickItem<number>[] {
        const convertedItems: QuickPickValue<number>[] = [];
        for (const i of items) {
            convertedItems.push({
                label: i.label,
                description: i.description,
                detail: i.detail,
                value: i.handle
            });
        }
        return convertedItems;
    }

    $input(options: InputBoxOptions, validateInput: boolean, token: CancellationToken): Promise<string | undefined> {
        if (validateInput) {
            options.validateInput = val => this.proxy.$validateInput(val);
        }

        return this.quickInput.open(options, token);
    }

    protected convertQuickInputButton(quickInputButton: QuickInputButton, index: number, toDispose: DisposableCollection): QuickInputTitleButtonHandle {
        const currentIconPath = quickInputButton.iconPath;
        let newIcon = '';
        let newIconClass: string | undefined;
        if ('id' in currentIconPath || currentIconPath instanceof ThemeIcon) {
            newIconClass = this.resolveIconClassFromThemeIcon(currentIconPath);
        } else if (currentIconPath instanceof URI) {
            newIcon = currentIconPath.toString();
        } else {
            const { light, dark } = currentIconPath as { light: string | URI, dark: string | URI };
            const themedIconClasses = {
                light: light.toString(),
                dark: dark.toString()
            };
            const reference = this.sharedStyle.toIconClass(themedIconClasses);
            toDispose.push(reference);
            newIconClass = reference.object.iconClass;
        }

        const isDefaultQuickInputButton = 'id' in quickInputButton.iconPath && quickInputButton.iconPath.id === 'Back' ? true : false;
        return {
            icon: newIcon,
            iconClass: newIconClass,
            tooltip: quickInputButton.tooltip,
            side: isDefaultQuickInputButton ? QuickTitleButtonSide.LEFT : QuickTitleButtonSide.RIGHT,
            index: isDefaultQuickInputButton ? -1 : index
        };
    }

    private resolveIconClassFromThemeIcon(themeIcon: ThemeIcon): string | undefined {
        switch (themeIcon.id) {
            case 'folder': {
                return this.labelProvider.folderIcon;
            }
            case 'file': {
                return this.labelProvider.fileIcon;
            }
            case 'Back': {
                return 'fa fa-arrow-left';
            }
            default: {
                return monaco.theme.ThemeIcon.asClassName(themeIcon);
            }
        }
    }

    async $showInputBox(inputBox: TransferInputBox, validateInput: boolean): Promise<void> {
        if (validateInput) {
            inputBox.validateInput = val => this.proxy.$validateInput(val);
        }

        const toDispose = new DisposableCollection();
        const quickInput = this.quickInput.open({
            busy: inputBox.busy,
            enabled: inputBox.enabled,
            ignoreFocusOut: inputBox.ignoreFocusOut,
            password: inputBox.password,
            step: inputBox.step,
            title: inputBox.title,
            totalSteps: inputBox.totalSteps,
            buttons: inputBox.buttons.map((btn, i) => this.convertQuickInputButton(btn, i, toDispose)),
            validationMessage: inputBox.validationMessage,
            placeHolder: inputBox.placeholder,
            value: inputBox.value,
            prompt: inputBox.prompt,
            validateInput: inputBox.validateInput
        });

        toDispose.push(this.quickInput.onDidAccept(() => this.proxy.$acceptOnDidAccept(inputBox.id)));
        toDispose.push(this.quickInput.onDidChangeValue(changedText => this.proxy.$acceptDidChangeValue(inputBox.id, changedText)));
        toDispose.push(this.quickTitleBar.onDidTriggerButton(button => {
            this.proxy.$acceptOnDidTriggerButton(inputBox.id, button);
        }));
        this.toDispose.push(toDispose);
        quickInput.then(() => {
            if (toDispose.disposed) {
                return;
            }
            this.proxy.$acceptOnDidHide(inputBox.id);
            toDispose.dispose();
        });
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    private findChangedKey(key: string, value: any): void {
        switch (key) {
            case 'title': {
                this.quickTitleBar.title = value;
                break;
            }
            case 'step': {
                this.quickTitleBar.step = value;
                break;
            }
            case 'totalSteps': {
                this.quickTitleBar.totalSteps = value;
                break;
            }
            case 'buttons': {
                this.quickTitleBar.buttons = value;
                break;
            }
            case 'value': {
                this.delegate.setValue(value);
                break;
            }
            case 'enabled': {
                this.delegate.setEnabled(value);
                break;
            }
            case 'password': {
                this.delegate.setPassword(value);
                break;
            }
            case 'placeholder': {
                this.delegate.setPlaceHolder(value);
                break;
            }
            case 'items': {
                this.quickPick.setItems(this.convertPickOpenItemToQuickOpenItem(value));
                break;
            }
            // TODO selectedItems, activeItems and other properties
            // TODO we need better type checking here
        }
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    $setQuickInputChanged(changed: any): void {
        for (const key in changed) {
            if (changed.hasOwnProperty(key)) {
                const value = changed[key];
                this.findChangedKey(key, value);
            }
        }
    }
    $refreshQuickInput(): void {
        this.quickInput.refresh();
    }

    async $showCustomQuickPick<T extends QuickPickItemExt>(options: TransferQuickPick<T>): Promise<void> {
        const toDispose = new DisposableCollection();
        const quickPick = this.quickPick.show(this.convertPickOpenItemToQuickOpenItem(options.items), {
            buttons: options.buttons.map((btn, i) => this.convertQuickInputButton(btn, i, toDispose)),
            placeholder: options.placeholder,
            fuzzyMatchDescription: options.matchOnDescription,
            fuzzyMatchLabel: true,
            step: options.step,
            title: options.title,
            totalSteps: options.totalSteps,
            ignoreFocusOut: options.ignoreFocusOut,
            value: options.value,
            runIfSingle: false,
        });

        toDispose.push(this.quickPick.onDidAccept(() => this.proxy.$acceptOnDidAccept(options.id)));
        toDispose.push(this.quickPick.onDidChangeActive((elements: QuickPickValue<number>[]) => {
            this.proxy.$onDidChangeActive(options.id, elements.map(e => e.value));
        }));
        toDispose.push(this.quickPick.onDidChangeSelection((elements: QuickPickValue<number>[]) => {
            this.proxy.$onDidChangeSelection(options.id, elements.map(e => e.value));
        }));
        toDispose.push(this.quickPick.onDidChangeValue(value => this.proxy.$acceptDidChangeValue(options.id, value)));
        toDispose.push(this.quickTitleBar.onDidTriggerButton(button => {
            this.proxy.$acceptOnDidTriggerButton(options.id, button);
        }));
        this.toDispose.push(toDispose);
        quickPick.then(() => {
            if (toDispose.disposed) {
                return;
            }
            this.proxy.$acceptOnDidHide(options.id);
            toDispose.dispose();
        });
    }

    onType(lookFor: string, acceptor: (items: QuickOpenItem[]) => void): void {
        this.acceptor = acceptor;
        if (this.items) {
            acceptor(this.items);
        }
    }

    $hide(): void {
        this.delegate.hide();
    }

}
