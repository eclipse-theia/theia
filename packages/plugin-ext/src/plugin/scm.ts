// *****************************************************************************
// Copyright (C) 2019-2021 Red Hat, Inc. and others.
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

/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
// code copied and modified from https://github.com/microsoft/vscode/blob/1.52.1/src/vs/workbench/api/common/extHostSCM.ts

import * as theia from '@theia/plugin';
import { Emitter, Event } from '@theia/core/lib/common/event';
import {
    Plugin, PLUGIN_RPC_CONTEXT,
    ScmExt,
    ScmMain, ScmRawResource, ScmRawResourceGroup,
    ScmRawResourceSplice, ScmRawResourceSplices,
    SourceControlGroupFeatures
} from '../common';
import { Disposable, DisposableCollection } from '@theia/core/lib/common/disposable';
import { CommandRegistryImpl } from '../plugin/command-registry';
import { Splice } from '../common/arrays';
import { UriComponents } from '../common/uri-components';
import { Command } from '../common/plugin-api-rpc-model';
import { RPCProtocol } from '../common/rpc-protocol';
import { URI, ThemeIcon } from './types-impl';
import { ScmCommandArg } from '../common/plugin-api-rpc';
import { sep } from '@theia/core/lib/common/paths';
import { PluginIconPath } from './plugin-icon-path';
import { createAPIObject } from './plugin-context';
type ProviderHandle = number;
type GroupHandle = number;
type ResourceStateHandle = number;

function getIconResource(decorations?: theia.SourceControlResourceThemableDecorations): UriComponents | ThemeIcon | undefined {
    if (!decorations || !decorations.iconPath) {
        return undefined;
    } else if (typeof decorations.iconPath === 'string') {
        return URI.file(decorations.iconPath);
    } else if (URI.isUri(decorations.iconPath)) {
        return decorations.iconPath;
    } else if (ThemeIcon.is(decorations.iconPath)) {
        return decorations.iconPath;
    } else {
        console.warn(`Unexpected Value ${decorations.iconPath} in Source Control Resource Themable Decoration. URI, ThemeIcon or string expected.`);
        return undefined;
    }
}

function comparePaths(one: string, other: string, caseSensitive = false): number {
    const oneParts = one.split(sep);
    const otherParts = other.split(sep);

    const lastOne = oneParts.length - 1;
    const lastOther = otherParts.length - 1;
    let endOne: boolean;
    let endOther: boolean;

    for (let i = 0; ; i++) {
        endOne = lastOne === i;
        endOther = lastOther === i;

        if (endOne && endOther) {
            const onePart = caseSensitive ? oneParts[i].toLocaleLowerCase() : oneParts[i];
            const otherPart = caseSensitive ? otherParts[i].toLocaleLowerCase() : otherParts[i];
            return onePart > otherPart ? -1 : 1;
        } else if (endOne) {
            return -1;
        } else if (endOther) {
            return 1;
        }

        if (endOne) {
            return -1;
        } else if (endOther) {
            return 1;
        }

        const result = comparePathComponents(oneParts[i], otherParts[i], caseSensitive);

        if (result !== 0) {
            return result;
        }
    }
}

function comparePathComponents(one: string, other: string, caseSensitive = false): number {
    if (!caseSensitive) {
        one = one && one.toLowerCase();
        other = other && other.toLowerCase();
    }

    if (one === other) {
        return 0;
    }

    return one < other ? -1 : 1;
}

function compareResourceThemableDecorations(a: theia.SourceControlResourceThemableDecorations, b: theia.SourceControlResourceThemableDecorations): number {
    if (!a.iconPath && !b.iconPath) {
        return 0;
    } else if (!a.iconPath) {
        return -1;
    } else if (!b.iconPath) {
        return 1;
    }

    const aPath = typeof a.iconPath === 'string' ? a.iconPath : URI.isUri(a.iconPath) ? a.iconPath.fsPath : (a.iconPath as ThemeIcon).id;
    const bPath = typeof b.iconPath === 'string' ? b.iconPath : URI.isUri(b.iconPath) ? b.iconPath.fsPath : (b.iconPath as ThemeIcon).id;
    return comparePaths(aPath, bPath);
}

function compareResourceStatesDecorations(a: theia.SourceControlResourceDecorations, b: theia.SourceControlResourceDecorations): number {
    let result = 0;

    if (a.strikeThrough !== b.strikeThrough) {
        return a.strikeThrough ? 1 : -1;
    }

    if (a.faded !== b.faded) {
        return a.faded ? 1 : -1;
    }

    if (a.tooltip !== b.tooltip) {
        return (a.tooltip || '').localeCompare(b.tooltip || '');
    }

    result = compareResourceThemableDecorations(a, b);

    if (result !== 0) {
        return result;
    }

    if (a.light && b.light) {
        result = compareResourceThemableDecorations(a.light, b.light);
    } else if (a.light) {
        return 1;
    } else if (b.light) {
        return -1;
    }

    if (result !== 0) {
        return result;
    }

    if (a.dark && b.dark) {
        result = compareResourceThemableDecorations(a.dark, b.dark);
    } else if (a.dark) {
        return 1;
    } else if (b.dark) {
        return -1;
    }

    return result;
}

function compareCommands(a: theia.Command, b: theia.Command): number {
    if (a.command !== b.command) {
        return a.command! < b.command! ? -1 : 1;
    }

    if (a.title !== b.title) {
        return a.title! < b.title! ? -1 : 1;
    }

    if (a.tooltip !== b.tooltip) {
        if (a.tooltip !== undefined && b.tooltip !== undefined) {
            return a.tooltip < b.tooltip ? -1 : 1;
        } else if (a.tooltip !== undefined) {
            return 1;
        } else if (b.tooltip !== undefined) {
            return -1;
        }
    }

    if (a.arguments === b.arguments) {
        return 0;
    } else if (!a.arguments) {
        return -1;
    } else if (!b.arguments) {
        return 1;
    } else if (a.arguments.length !== b.arguments.length) {
        return a.arguments.length - b.arguments.length;
    }

    for (let i = 0; i < a.arguments.length; i++) {
        const aArg = a.arguments[i];
        const bArg = b.arguments[i];

        if (aArg === bArg) {
            continue;
        }

        return aArg < bArg ? -1 : 1;
    }

    return 0;
}

function compareResourceStates(a: theia.SourceControlResourceState, b: theia.SourceControlResourceState): number {
    let result = comparePaths(a.resourceUri.fsPath, b.resourceUri.fsPath, true);

    if (result !== 0) {
        return result;
    }

    if (a.command && b.command) {
        result = compareCommands(a.command, b.command);
    } else if (a.command) {
        return 1;
    } else if (b.command) {
        return -1;
    }

    if (result !== 0) {
        return result;
    }

    if (a.decorations && b.decorations) {
        result = compareResourceStatesDecorations(a.decorations, b.decorations);
    } else if (a.decorations) {
        return 1;
    } else if (b.decorations) {
        return -1;
    }

    return result;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function compareArgs(a: any[], b: any[]): boolean {
    for (let i = 0; i < a.length; i++) {
        if (a[i] !== b[i]) {
            return false;
        }
    }

    return true;
}

function commandEquals(a: theia.Command, b: theia.Command): boolean {
    return a.command === b.command
        && a.title === b.title
        && a.tooltip === b.tooltip
        && (a.arguments && b.arguments ? compareArgs(a.arguments, b.arguments) : a.arguments === b.arguments);
}

function commandListEquals(a: readonly theia.Command[], b: readonly theia.Command[]): boolean {
    return equals(a, b, commandEquals);
}

function equals<T>(one: ReadonlyArray<T> | undefined, other: ReadonlyArray<T> | undefined, itemEquals: (a: T, b: T) => boolean = (a, b) => a === b): boolean {
    if (one === other) {
        return true;
    }

    if (!one || !other) {
        return false;
    }

    if (one.length !== other.length) {
        return false;
    }

    for (let i = 0, len = one.length; i < len; i++) {
        if (!itemEquals(one[i], other[i])) {
            return false;
        }
    }

    return true;
}

interface ValidateInput {
    (value: string, cursorPosition: number): theia.ProviderResult<theia.SourceControlInputBoxValidation | undefined | null>;
}

export class ScmInputBoxImpl implements theia.SourceControlInputBox {

    private _value: string = '';
    apiObject: theia.SourceControlInputBox;

    get value(): string {
        return this._value;
    }

    set value(value: string) {
        this.proxy.$setInputBoxValue(this.sourceControlHandle, value);
        this.updateValue(value);
    }

    private readonly onDidChangeEmitter = new Emitter<string>();

    get onDidChange(): Event<string> {
        return this.onDidChangeEmitter.event;
    }

    private _placeholder: string = '';

    get placeholder(): string {
        return this._placeholder;
    }

    set placeholder(placeholder: string) {
        this.proxy.$setInputBoxPlaceholder(this.sourceControlHandle, placeholder);
        this._placeholder = placeholder;
    }

    private _visible: boolean = true;

    get visible(): boolean {
        return this._visible;
    }

    set visible(visible: boolean) {
        this.proxy.$setInputBoxVisible(this.sourceControlHandle, visible);
        this._visible = visible;
    }

    private _enabled: boolean;

    get enabled(): boolean {
        return this._enabled;
    }

    set enabled(enabled: boolean) {
        this.proxy.$setInputBoxEnabled(this.sourceControlHandle, enabled);
        this._enabled = enabled;
    }

    private _validateInput: ValidateInput | undefined;

    get validateInput(): ValidateInput | undefined {
        return this._validateInput;
    }

    set validateInput(fn: ValidateInput | undefined) {
        if (fn && typeof fn !== 'function') {
            throw new Error(`[${this.plugin.model.id}]: Invalid SCM input box validation function`);
        }

        this._validateInput = fn;
    }

    constructor(private plugin: Plugin, private proxy: ScmMain, private sourceControlHandle: number) {
        this.apiObject = createAPIObject(this);
    }

    onInputBoxValueChange(value: string): void {
        this.updateValue(value);
    }

    private updateValue(value: string): void {
        this._value = value;
        this.onDidChangeEmitter.fire(value);
    }
}

class ScmResourceGroupImpl implements theia.SourceControlResourceGroup {

    private static handlePool: number = 0;
    private resourceHandlePool: number = 0;
    private _resourceStates: theia.SourceControlResourceState[] = [];

    private resourceStatesMap = new Map<ResourceStateHandle, theia.SourceControlResourceState>();
    private resourceStatesCommandsMap = new Map<ResourceStateHandle, theia.Command>();
    private resourceStatesDisposablesMap = new Map<ResourceStateHandle, Disposable>();

    private readonly onDidUpdateResourceStatesEmitter = new Emitter<void>();
    readonly onDidUpdateResourceStates = this.onDidUpdateResourceStatesEmitter.event;

    private _disposed = false;
    get disposed(): boolean { return this._disposed; }
    private readonly onDidDisposeEmitter = new Emitter<void>();
    readonly onDidDispose = this.onDidDisposeEmitter.event;

    private handlesSnapshot: number[] = [];
    private resourceSnapshot: theia.SourceControlResourceState[] = [];

    get id(): string { return this._id; }

    get label(): string { return this._label; }
    set label(label: string) {
        this._label = label;
        this.proxy.$updateGroupLabel(this.sourceControlHandle, this.handle, label);
    }

    private _hideWhenEmpty: boolean | undefined = undefined;
    get hideWhenEmpty(): boolean | undefined { return this._hideWhenEmpty; }
    set hideWhenEmpty(hideWhenEmpty: boolean | undefined) {
        this._hideWhenEmpty = hideWhenEmpty;
        this.proxy.$updateGroup(this.sourceControlHandle, this.handle, this.features);
    }

    get features(): SourceControlGroupFeatures {
        return {
            hideWhenEmpty: this.hideWhenEmpty
        };
    }

    get resourceStates(): theia.SourceControlResourceState[] { return [...this._resourceStates]; }
    set resourceStates(resources: theia.SourceControlResourceState[]) {
        this._resourceStates = [...resources];
        this.onDidUpdateResourceStatesEmitter.fire();
    }

    readonly handle = ScmResourceGroupImpl.handlePool++;

    constructor(
        private proxy: ScmMain,
        private commands: CommandRegistryImpl,
        private sourceControlHandle: number,
        private plugin: Plugin,
        private _id: string,
        private _label: string,
    ) { }

    getResourceState(handle: number): theia.SourceControlResourceState | undefined {
        return this.resourceStatesMap.get(handle);
    }

    executeResourceCommand(handle: number): Promise<void> {
        const command = this.resourceStatesCommandsMap.get(handle);

        if (!command) {
            return Promise.resolve(undefined);
        }

        return new Promise(() => this.commands.executeCommand(command.command!, ...(command.arguments || [])));
    }

    takeResourceStateSnapshot(): ScmRawResourceSplice[] {
        const snapshot = [...this._resourceStates];
        const diffs = sortedDiff(this.resourceSnapshot, snapshot, compareResourceStates);

        const splices = diffs.map<Splice<{ rawResource: ScmRawResource, handle: number }>>(diff => {
            const toInsert = diff.toInsert.map(r => {
                const handle = this.resourceHandlePool++;
                this.resourceStatesMap.set(handle, r);

                const sourceUri = r.resourceUri;

                const icon = getIconResource(r.decorations);
                const lightIcon = r.decorations && getIconResource(r.decorations.light) || icon;
                const darkIcon = r.decorations && getIconResource(r.decorations.dark) || icon;
                const icons = [this.getThemableIcon(lightIcon), this.getThemableIcon(darkIcon)];
                let command: Command | undefined;

                if (r.command) {
                    if (r.command.command === 'theia.open' || r.command.command === 'theia.diff') {
                        const disposables = new DisposableCollection();
                        command = this.commands.converter.toSafeCommand(r.command, disposables);
                        this.resourceStatesDisposablesMap.set(handle, disposables);
                    } else {
                        this.resourceStatesCommandsMap.set(handle, r.command);
                    }
                }

                const tooltip = (r.decorations && r.decorations.tooltip) || '';
                const strikeThrough = r.decorations && !!r.decorations.strikeThrough;
                const faded = r.decorations && !!r.decorations.faded;
                const contextValue = r.contextValue || '';

                // TODO remove the letter and colorId fields when the FileDecorationProvider is applied, see https://github.com/eclipse-theia/theia/pull/8911
                const rawResource = {
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    handle, sourceUri, letter: (r as any).letter, colorId: (r as any).color.id, icons,
                    tooltip, strikeThrough, faded, contextValue, command
                } as ScmRawResource;

                return { rawResource, handle };
            });

            const { start, deleteCount } = diff;
            return { start, deleteCount, toInsert };
        });

        const rawResourceSplices = splices
            .map(({ start, deleteCount, toInsert }) => ({
                start: start,
                deleteCount: deleteCount,
                rawResources: toInsert.map(i => i.rawResource)
            } as ScmRawResourceSplice));

        const reverseSplices = splices.reverse();

        for (const { start, deleteCount, toInsert } of reverseSplices) {
            const handles = toInsert.map(i => i.handle);
            const handlesToDelete = this.handlesSnapshot.splice(start, deleteCount, ...handles);

            for (const handle of handlesToDelete) {
                this.resourceStatesMap.delete(handle);
                this.resourceStatesCommandsMap.delete(handle);
                this.resourceStatesDisposablesMap.get(handle)?.dispose();
                this.resourceStatesDisposablesMap.delete(handle);
            }
        }

        this.resourceSnapshot = snapshot;
        return rawResourceSplices;
    }

    private getThemableIcon(icon: UriComponents | ThemeIcon | undefined): string | ThemeIcon | undefined {
        if (!icon) {
            return undefined;
        } else if (ThemeIcon.is(icon)) {
            return icon;
        }
        return PluginIconPath.asString(URI.revive(icon), this.plugin);
    }

    dispose(): void {
        this._disposed = true;
        this.onDidDisposeEmitter.fire();
    }
}

class SourceControlImpl implements theia.SourceControl {

    private static handlePool: number = 0;
    private groups: Map<GroupHandle, ScmResourceGroupImpl> = new Map<GroupHandle, ScmResourceGroupImpl>();

    get id(): string {
        return this._id;
    }

    get label(): string {
        return this._label;
    }

    get rootUri(): theia.Uri | undefined {
        return this._rootUri;
    }

    readonly inputBox: ScmInputBoxImpl;

    private _count: number | undefined = undefined;

    get count(): number | undefined {
        return this._count;
    }

    set count(count: number | undefined) {
        if (this._count === count) {
            return;
        }

        this._count = count;
        this.proxy.$updateSourceControl(this.handle, { count });
    }

    private _quickDiffProvider: theia.QuickDiffProvider | undefined = undefined;

    get quickDiffProvider(): theia.QuickDiffProvider | undefined {
        return this._quickDiffProvider;
    }

    set quickDiffProvider(quickDiffProvider: theia.QuickDiffProvider | undefined) {
        this._quickDiffProvider = quickDiffProvider;
        this.proxy.$updateSourceControl(this.handle, { hasQuickDiffProvider: !!quickDiffProvider });
    }

    private _commitTemplate: string | undefined = undefined;

    get commitTemplate(): string | undefined {
        return this._commitTemplate;
    }

    set commitTemplate(commitTemplate: string | undefined) {
        if (commitTemplate === this._commitTemplate) {
            return;
        }

        this._commitTemplate = commitTemplate;
        this.proxy.$updateSourceControl(this.handle, { commitTemplate });
    }

    private acceptInputDisposables = new DisposableCollection();
    private _acceptInputCommand: theia.Command | undefined = undefined;

    get acceptInputCommand(): theia.Command | undefined {
        return this._acceptInputCommand;
    }

    set acceptInputCommand(acceptInputCommand: theia.Command | undefined) {
        this.acceptInputDisposables = new DisposableCollection();

        this._acceptInputCommand = acceptInputCommand;

        const internal = this.commands.converter.toSafeCommand(acceptInputCommand, this.acceptInputDisposables);
        this.proxy.$updateSourceControl(this.handle, { acceptInputCommand: internal });
    }

    private _statusBarDisposables = new DisposableCollection();
    private _statusBarCommands: theia.Command[] | undefined = undefined;

    get statusBarCommands(): theia.Command[] | undefined {
        return this._statusBarCommands;
    }

    set statusBarCommands(statusBarCommands: theia.Command[] | undefined) {
        if (this._statusBarCommands && statusBarCommands && commandListEquals(this._statusBarCommands, statusBarCommands)) {
            return;
        }

        this._statusBarDisposables = new DisposableCollection();

        this._statusBarCommands = statusBarCommands;

        const internal = (statusBarCommands || []).map(c => this.commands.converter.toSafeCommand(c, this._statusBarDisposables)) as Command[];
        this.proxy.$updateSourceControl(this.handle, { statusBarCommands: internal });
    }

    private _selected: boolean = false;

    get selected(): boolean {
        return this._selected;
    }

    private readonly onDidChangeSelectionEmitter = new Emitter<boolean>();
    readonly onDidChangeSelection = this.onDidChangeSelectionEmitter.event;

    private handle: number = SourceControlImpl.handlePool++;

    constructor(
        private plugin: Plugin,
        private proxy: ScmMain,
        private commands: CommandRegistryImpl,
        private _id: string,
        private _label: string,
        private _rootUri?: theia.Uri
    ) {
        this.inputBox = new ScmInputBoxImpl(plugin, this.proxy, this.handle);
        this.proxy.$registerSourceControl(this.handle, _id, _label, _rootUri);
    }

    private createdResourceGroups = new Map<ScmResourceGroupImpl, Disposable>();
    private updatedResourceGroups = new Set<ScmResourceGroupImpl>();

    createResourceGroup(id: string, label: string): ScmResourceGroupImpl {
        const group = new ScmResourceGroupImpl(this.proxy, this.commands, this.handle, this.plugin, id, label);
        const disposable = group.onDidDispose(() => this.createdResourceGroups.delete(group));
        this.createdResourceGroups.set(group, disposable);
        this.eventuallyAddResourceGroups();
        return group;
    }

    eventuallyAddResourceGroups(): void {
        const groups: ScmRawResourceGroup[] = [];
        const splices: ScmRawResourceSplices[] = [];

        for (const [group, disposable] of this.createdResourceGroups) {
            disposable.dispose();

            const updateListener = group.onDidUpdateResourceStates(() => {
                this.updatedResourceGroups.add(group);
                this.eventuallyUpdateResourceStates();
            });

            group.onDidDispose(() => {
                this.updatedResourceGroups.delete(group);
                updateListener.dispose();
                this.groups.delete(group.handle);
                this.proxy.$unregisterGroup(this.handle, group.handle);
            });

            const { handle, id, label, features } = group;
            groups.push({ handle, id, label, features });

            const snapshot = group.takeResourceStateSnapshot();

            if (snapshot.length > 0) {
                splices.push({ handle: group.handle, splices: snapshot });
            }

            this.groups.set(group.handle, group);
        }

        this.proxy.$registerGroups(this.handle, groups, splices);
        this.createdResourceGroups.clear();
    }

    eventuallyUpdateResourceStates(): void {
        const splices: ScmRawResourceSplices[] = [];

        this.updatedResourceGroups.forEach(group => {
            const snapshot = group.takeResourceStateSnapshot();

            if (snapshot.length === 0) {
                return;
            }

            splices.push({ handle: group.handle, splices: snapshot });
        });

        if (splices.length > 0) {
            this.proxy.$spliceResourceStates(this.handle, splices);
        }

        this.updatedResourceGroups.clear();
    }

    getResourceGroup(handle: GroupHandle): ScmResourceGroupImpl | undefined {
        return this.groups.get(handle);
    }

    setSelectionState(selected: boolean): void {
        this._selected = selected;
        this.onDidChangeSelectionEmitter.fire(selected);
    }

    dispose(): void {
        this.acceptInputDisposables.dispose();
        this._statusBarDisposables.dispose();

        this.groups.forEach(group => group.dispose());
        this.proxy.$unregisterSourceControl(this.handle);
    }
}

export class ScmExtImpl implements ScmExt {

    private static handlePool: number = 0;

    private proxy: ScmMain;
    private sourceControls: Map<ProviderHandle, SourceControlImpl> = new Map<ProviderHandle, SourceControlImpl>();
    private sourceControlsByExtension: Map<string, SourceControlImpl[]> = new Map<string, SourceControlImpl[]>();

    private readonly onDidChangeActiveProviderEmitter = new Emitter<theia.SourceControl>();
    get onDidChangeActiveProvider(): Event<theia.SourceControl> { return this.onDidChangeActiveProviderEmitter.event; }

    private selectedSourceControlHandle: number | undefined;

    constructor(rpc: RPCProtocol, private commands: CommandRegistryImpl) {
        this.proxy = rpc.getProxy(PLUGIN_RPC_CONTEXT.SCM_MAIN);

        commands.registerArgumentProcessor({
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            processArgument: (arg: any) => {
                if (!ScmCommandArg.is(arg)) {
                    return arg;
                }
                const sourceControl = this.sourceControls.get(arg.sourceControlHandle);
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

    createSourceControl(extension: Plugin, id: string, label: string, rootUri: theia.Uri | undefined): theia.SourceControl {
        const handle = ScmExtImpl.handlePool++;
        const sourceControl = new SourceControlImpl(extension, this.proxy, this.commands, id, label, rootUri);
        this.sourceControls.set(handle, sourceControl);

        const sourceControls = this.sourceControlsByExtension.get(extension.model.id) || [];
        sourceControls.push(sourceControl);
        this.sourceControlsByExtension.set(extension.model.id, sourceControls);

        return sourceControl;
    }

    getLastInputBox(extension: Plugin): ScmInputBoxImpl | undefined {
        const sourceControls = this.sourceControlsByExtension.get(extension.model.id);
        const sourceControl = sourceControls && sourceControls[sourceControls.length - 1];
        return sourceControl && sourceControl.inputBox;
    }

    $provideOriginalResource(sourceControlHandle: number, uriComponents: string, token: theia.CancellationToken): Promise<UriComponents | undefined> {
        const sourceControl = this.sourceControls.get(sourceControlHandle);

        if (!sourceControl || !sourceControl.quickDiffProvider || !sourceControl.quickDiffProvider.provideOriginalResource) {
            return Promise.resolve(undefined);
        }

        return new Promise<UriComponents | undefined>(() => sourceControl.quickDiffProvider!.provideOriginalResource!(URI.file(uriComponents), token))
            .then<UriComponents | undefined>(r => r || undefined);
    }

    $onInputBoxValueChange(sourceControlHandle: number, value: string): Promise<void> {
        const sourceControl = this.sourceControls.get(sourceControlHandle);

        if (!sourceControl) {
            return Promise.resolve(undefined);
        }

        sourceControl.inputBox.onInputBoxValueChange(value);
        return Promise.resolve(undefined);
    }

    $executeResourceCommand(sourceControlHandle: number, groupHandle: number, handle: number): Promise<void> {
        const sourceControl = this.sourceControls.get(sourceControlHandle);

        if (!sourceControl) {
            return Promise.resolve(undefined);
        }

        const group = sourceControl.getResourceGroup(groupHandle);

        if (!group) {
            return Promise.resolve(undefined);
        }

        return group.executeResourceCommand(handle);
    }

    async $validateInput(sourceControlHandle: number, value: string, cursorPosition: number): Promise<[string, number] | undefined> {
        const sourceControl = this.sourceControls.get(sourceControlHandle);

        if (!sourceControl) {
            return Promise.resolve(undefined);
        }

        if (!sourceControl.inputBox.validateInput) {
            return Promise.resolve(undefined);
        }

        const result = await sourceControl.inputBox.validateInput!(value, cursorPosition);
        if (!result) {
            return Promise.resolve(undefined);
        }
        return [result.message, result.type];
    }

    $setSelectedSourceControl(selectedSourceControlHandle: number | undefined): Promise<void> {
        if (selectedSourceControlHandle !== undefined) {
            this.sourceControls.get(selectedSourceControlHandle)?.setSelectionState(true);
        }

        if (this.selectedSourceControlHandle !== undefined) {
            this.sourceControls.get(this.selectedSourceControlHandle)?.setSelectionState(false);
        }

        this.selectedSourceControlHandle = selectedSourceControlHandle;
        return Promise.resolve(undefined);
    }
}

/**
 * Diffs two *sorted* arrays and computes the splices which apply the diff.
 */
function sortedDiff(before: ReadonlyArray<theia.SourceControlResourceState>,
    after: ReadonlyArray<theia.SourceControlResourceState>,
    compare: (a: theia.SourceControlResourceState,
        b: theia.SourceControlResourceState) => number): Splice<theia.SourceControlResourceState>[] {
    const result: MutableSplice<theia.SourceControlResourceState>[] = [];

    function pushSplice(start: number, deleteCount: number, toInsert: theia.SourceControlResourceState[]): void {
        if (deleteCount === 0 && toInsert.length === 0) {
            return;
        }

        const latest = result[result.length - 1];

        if (latest && latest.start + latest.deleteCount === start) {
            latest.deleteCount += deleteCount;
            latest.toInsert.push(...toInsert);
        } else {
            result.push({ start, deleteCount, toInsert });
        }
    }

    let beforeIdx = 0;
    let afterIdx = 0;

    while (true) {
        if (beforeIdx === before.length) {
            pushSplice(beforeIdx, 0, after.slice(afterIdx));
            break;
        }
        if (afterIdx === after.length) {
            pushSplice(beforeIdx, before.length - beforeIdx, []);
            break;
        }

        const beforeElement = before[beforeIdx];
        const afterElement = after[afterIdx];
        const n = compare(beforeElement, afterElement);
        if (n === 0) {
            // equal
            beforeIdx += 1;
            afterIdx += 1;
        } else if (n < 0) {
            // beforeElement is smaller -> before element removed
            pushSplice(beforeIdx, 1, []);
            beforeIdx += 1;
        } else if (n > 0) {
            // beforeElement is greater -> after element added
            pushSplice(beforeIdx, 0, [afterElement]);
            afterIdx += 1;
        }
    }

    return result;
}

interface MutableSplice<T> extends Splice<T> {
    deleteCount: number;
}
