/********************************************************************************
 * Copyright (C) 2019 Red Hat, Inc. and others.
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

import * as theia from '@theia/plugin';
import { Plugin as InternalPlugin, PLUGIN_RPC_CONTEXT, ScmExt, ScmMain, ScmCommandArg } from '../common/plugin-api-rpc';
import { RPCProtocol } from '../common/rpc-protocol';
import { CancellationToken } from '@theia/core/lib/common/cancellation';
import { DisposableCollection, Disposable } from '@theia/core/lib/common/disposable';
import { UriComponents } from '../common/uri-components';
import URI from '@theia/core/lib/common/uri';
import { CommandRegistryImpl } from './command-registry';
import { Emitter } from '@theia/core/lib/common/event';
import { Command } from '../common/plugin-api-rpc-model';

export class ScmExtImpl implements ScmExt {
    private handle: number = 0;
    private readonly proxy: ScmMain;
    private readonly sourceControlMap = new Map<number, SourceControlImpl>();
    private readonly sourceControlsByPluginMap: Map<string, theia.SourceControl[]> = new Map();

    constructor(readonly rpc: RPCProtocol, private readonly commands: CommandRegistryImpl) {
        this.proxy = rpc.getProxy(PLUGIN_RPC_CONTEXT.SCM_MAIN);
        commands.registerArgumentProcessor({
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            processArgument: (arg: any) => {
                if (!ScmCommandArg.is(arg)) {
                    return arg;
                }
                const sourceControl = this.sourceControlMap.get(arg.sourceControlHandle);
                if (!sourceControl) {
                    return undefined;
                }
                if (typeof arg.resourceGroupHandle !== 'number') {
                    return sourceControl;
                }
                const resourceGroup = sourceControl.getResourceGroup(arg.resourceGroupHandle);
                if (typeof arg.resourceStateHandle !== 'number') {
                    return resourceGroup;
                }
                return resourceGroup && resourceGroup.getResourceState(arg.resourceStateHandle);
            }
        });
    }

    createSourceControl(plugin: InternalPlugin, id: string, label: string, rootUri?: theia.Uri): theia.SourceControl {
        const sourceControl = new SourceControlImpl(this.proxy, this.commands, id, label, rootUri);
        this.sourceControlMap.set(this.handle++, sourceControl);
        const sourceControls = this.sourceControlsByPluginMap.get(plugin.model.id) || [];
        sourceControls.push(sourceControl);
        this.sourceControlsByPluginMap.set(plugin.model.id, sourceControls);
        return sourceControl;
    }

    getLastInputBox(plugin: InternalPlugin): theia.SourceControlInputBox | undefined {
        const sourceControls = this.sourceControlsByPluginMap.get(plugin.model.id);
        const sourceControl = sourceControls && sourceControls[sourceControls.length - 1];
        const inputBox = sourceControl && sourceControl.inputBox;
        return inputBox;
    }

    async $executeResourceCommand(sourceControlHandle: number, groupHandle: number, resourceHandle: number): Promise<void> {
        const sourceControl = this.sourceControlMap.get(sourceControlHandle);
        if (sourceControl) {
            const group = (sourceControl as SourceControlImpl).getResourceGroup(groupHandle);
            if (group) {
                (group as SourceControlResourceGroupImpl).executeResourceCommand(resourceHandle);
            }
        }
    }

    async $provideOriginalResource(sourceControlHandle: number, uri: string, token: CancellationToken): Promise<UriComponents | undefined> {
        const sourceControl = this.sourceControlMap.get(sourceControlHandle);
        console.log(sourceControl);
        if (sourceControl && sourceControl.quickDiffProvider && sourceControl.quickDiffProvider.provideOriginalResource) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const newUri: any = new URI(uri);
            newUri.fsPath = uri;
            return sourceControl.quickDiffProvider.provideOriginalResource(newUri, token);
        }
    }

    async $updateInputBox(sourceControlHandle: number, value: string): Promise<void> {
        const sourceControl = this.sourceControlMap.get(sourceControlHandle);
        if (sourceControl) {
            sourceControl.inputBox.$updateValue(value);
        }
    }

    async $setSourceControlSelection(sourceControlHandle: number, selected: boolean): Promise<void> {
        const sourceControl = this.sourceControlMap.get(sourceControlHandle);
        if (sourceControl) {
            sourceControl.selected = selected;
        }
    }
}

class InputBoxImpl implements theia.SourceControlInputBox {
    private _placeholder: string;
    private _value: string;

    constructor(private proxy: ScmMain, private sourceControlHandle: number) {
    }

    get value(): string {
        return this._value;
    }

    set value(value: string) {
        this.$updateValue(value);
        this.proxy.$setInputBoxValue(this.sourceControlHandle, value);
    }

    $updateValue(value: string): void {
        this._value = value;
    }

    get placeholder(): string {
        return this._placeholder;
    }

    set placeholder(placeholder: string) {
        this._placeholder = placeholder;
        this.proxy.$setInputBoxPlaceholder(this.sourceControlHandle, placeholder);
    }
}

class SourceControlImpl implements theia.SourceControl {
    private static handle: number = 0;
    private static resourceGroupHandle: number = 0;
    private handle = SourceControlImpl.handle++;

    private readonly resourceGroupsMap = new Map<number, SourceControlResourceGroupImpl>();

    private readonly _inputBox: InputBoxImpl;
    private _count: number | undefined;
    private _quickDiffProvider: theia.QuickDiffProvider | undefined;
    private _commitTemplate: string | undefined;
    private _acceptInputCommand: theia.Command | undefined;
    private _statusBarCommands: theia.Command[] | undefined;
    private _selected: boolean = false;

    private readonly toDispose = new DisposableCollection();

    private readonly onDidChangeSelectionEmitter = new Emitter<boolean>();
    readonly onDidChangeSelection: theia.Event<boolean> = this.onDidChangeSelectionEmitter.event;

    constructor(
        private proxy: ScmMain,
        private commands: CommandRegistryImpl,
        private _id: string,
        private _label: string,
        private _rootUri?: theia.Uri
    ) {
        this._inputBox = new InputBoxImpl(proxy, this.handle);
        this.proxy.$registerSourceControl(this.handle, _id, _label, _rootUri ? _rootUri.path : undefined);
        this.toDispose.push(Disposable.create(() => this.proxy.$unregisterSourceControl(this.handle)));
    }

    get id(): string {
        return this._id;
    }

    get label(): string {
        return this._label;
    }

    get rootUri(): theia.Uri | undefined {
        return this._rootUri;
    }

    createResourceGroup(id: string, label: string): theia.SourceControlResourceGroup {
        const sourceControlResourceGroup = new SourceControlResourceGroupImpl(this.proxy, this.commands, this.handle, id, label);
        this.resourceGroupsMap.set(SourceControlImpl.resourceGroupHandle++, sourceControlResourceGroup);
        this.toDispose.push(sourceControlResourceGroup);
        return sourceControlResourceGroup;
    }

    get inputBox(): InputBoxImpl {
        return this._inputBox;
    }

    get count(): number | undefined {
        return this._count;
    }

    set count(count: number | undefined) {
        if (this._count !== count) {
            this._count = count;
            this.proxy.$updateSourceControl(this.handle, { count });
        }
    }

    get quickDiffProvider(): theia.QuickDiffProvider | undefined {
        return this._quickDiffProvider;
    }

    set quickDiffProvider(quickDiffProvider: theia.QuickDiffProvider | undefined) {
        this._quickDiffProvider = quickDiffProvider;
        this.proxy.$updateSourceControl(this.handle, { hasQuickDiffProvider: !!quickDiffProvider });
    }

    get commitTemplate(): string | undefined {
        return this._commitTemplate;
    }

    set commitTemplate(commitTemplate: string | undefined) {
        this._commitTemplate = commitTemplate;
        this.proxy.$updateSourceControl(this.handle, { commitTemplate });
    }

    dispose(): void {
        this.toDispose.dispose();
    }

    protected toDisposeOnAcceptInputCommand = new DisposableCollection();

    get acceptInputCommand(): theia.Command | undefined {
        return this._acceptInputCommand;
    }

    set acceptInputCommand(acceptInputCommand: theia.Command | undefined) {
        this.toDisposeOnAcceptInputCommand.dispose();
        this.toDispose.push(this.toDisposeOnAcceptInputCommand);

        this._acceptInputCommand = acceptInputCommand;

        this.proxy.$updateSourceControl(this.handle, {
            acceptInputCommand: this.commands.converter.toSafeCommand(acceptInputCommand, this.toDisposeOnAcceptInputCommand)
        });
    }

    protected toDisposeOnStatusBarCommands = new DisposableCollection();

    get statusBarCommands(): theia.Command[] | undefined {
        return this._statusBarCommands;
    }

    set statusBarCommands(statusBarCommands: theia.Command[] | undefined) {
        this.toDisposeOnStatusBarCommands.dispose();
        this.toDispose.push(this.toDisposeOnStatusBarCommands);

        this._statusBarCommands = statusBarCommands;

        let safeStatusBarCommands: Command[] | undefined;
        if (statusBarCommands) {
            safeStatusBarCommands = statusBarCommands.map(statusBarCommand => this.commands.converter.toSafeCommand(statusBarCommand, this.toDisposeOnStatusBarCommands));
        }
        this.proxy.$updateSourceControl(this.handle, {
            statusBarCommands: safeStatusBarCommands
        });
    }

    getResourceGroup(handle: number): SourceControlResourceGroupImpl | undefined {
        return this.resourceGroupsMap.get(handle);
    }

    get selected(): boolean {
        return this._selected;
    }

    set selected(selected: boolean) {
        this._selected = selected;
        this.onDidChangeSelectionEmitter.fire(selected);
    }
}

class SourceControlResourceGroupImpl implements theia.SourceControlResourceGroup {

    private static handle: number = 0;
    private static resourceHandle: number = 0;
    private handle = SourceControlResourceGroupImpl.handle++;
    private _hideWhenEmpty: boolean | undefined = undefined;
    private _resourceStates: theia.SourceControlResourceState[] = [];
    private resourceStatesMap: Map<number, theia.SourceControlResourceState> = new Map();

    constructor(
        private proxy: ScmMain,
        private commands: CommandRegistryImpl,
        private sourceControlHandle: number,
        private _id: string,
        private _label: string,
    ) {
        this.proxy.$registerGroup(sourceControlHandle, this.handle, _id, _label);
    }

    get id(): string {
        return this._id;
    }

    get label(): string {
        return this._label;
    }

    set label(label: string) {
        this._label = label;
        this.proxy.$updateGroupLabel(this.sourceControlHandle, this.handle, label);
    }

    get hideWhenEmpty(): boolean | undefined {
        return this._hideWhenEmpty;
    }

    set hideWhenEmpty(hideWhenEmpty: boolean | undefined) {
        this._hideWhenEmpty = hideWhenEmpty;
        this.proxy.$updateGroup(this.sourceControlHandle, this.handle, { hideWhenEmpty });
    }

    get resourceStates(): theia.SourceControlResourceState[] {
        return this._resourceStates;
    }

    set resourceStates(resources: theia.SourceControlResourceState[]) {
        this._resourceStates = resources;
        this.resourceStatesMap.clear();
        this.proxy.$updateResourceState(this.sourceControlHandle, this.handle, resources.map(resourceState => {
            const handle = SourceControlResourceGroupImpl.resourceHandle++;
            let resourceCommand;
            let decorations;
            if (resourceState.command) {
                const { command, title, tooltip } = resourceState.command;
                resourceCommand = { id: command ? command : '', title: title ? title : '', tooltip };
            }
            if (resourceState.decorations) {
                const { strikeThrough, faded, tooltip, light, dark } = resourceState.decorations;
                const theme = light || dark;
                let iconPath;
                if (theme && theme.iconPath) {
                    iconPath = typeof theme.iconPath === 'string' ? theme.iconPath : theme.iconPath.path;
                }
                decorations = { strikeThrough, faded, tooltip, iconPath };
            }
            this.resourceStatesMap.set(handle, resourceState);
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const resource: any = resourceState;
            return { handle, resourceUri: resourceState.resourceUri.path, command: resourceCommand, decorations, letter: resource.letter, colorId: resource.color.id };
        }));
    }

    async executeResourceCommand(stateHandle: number): Promise<void> {
        const state = this.resourceStatesMap.get(stateHandle);
        if (state && state.command) {
            const command = state.command;
            if (command.command) {
                await this.commands.$executeCommand(command.command, ...command.arguments);
            }
        }
    }

    getResourceState(handle: number): theia.SourceControlResourceState | undefined {
        return this.resourceStatesMap.get(handle);
    }

    dispose(): void {
        this.proxy.$unregisterGroup(this.sourceControlHandle, this.handle);
    }
}
