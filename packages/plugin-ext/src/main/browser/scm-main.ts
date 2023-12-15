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
// code copied and modified from https://github.com/microsoft/vscode/blob/1.52.1/src/vs/workbench/api/browser/mainThreadSCM.ts

import {
    MAIN_RPC_CONTEXT,
    ScmExt,
    SourceControlGroupFeatures,
    ScmMain,
    SourceControlProviderFeatures,
    ScmRawResourceSplices, ScmRawResourceGroup
} from '../../common/plugin-api-rpc';
import { ScmProvider, ScmResource, ScmResourceDecorations, ScmResourceGroup, ScmCommand } from '@theia/scm/lib/browser/scm-provider';
import { ScmRepository } from '@theia/scm/lib/browser/scm-repository';
import { ScmService } from '@theia/scm/lib/browser/scm-service';
import { RPCProtocol } from '../../common/rpc-protocol';
import { interfaces } from '@theia/core/shared/inversify';
import { Emitter, Event } from '@theia/core/lib/common/event';
import { DisposableCollection } from '@theia/core/lib/common/disposable';
import URI from '@theia/core/lib/common/uri';
import { URI as vscodeURI } from '@theia/core/shared/vscode-uri';
import { Splice } from '../../common/arrays';
import { UriComponents } from '../../common/uri-components';
import { ColorRegistry } from '@theia/core/lib/browser/color-registry';
import { PluginSharedStyle } from './plugin-shared-style';
import { IconUrl } from '../../common';
import { ThemeIcon } from '@theia/monaco-editor-core/esm/vs/base/common/themables';

export class PluginScmResourceGroup implements ScmResourceGroup {

    readonly resources: ScmResource[] = [];

    private readonly onDidSpliceEmitter = new Emitter<Splice<ScmResource>>();
    readonly onDidSplice = this.onDidSpliceEmitter.event;

    get hideWhenEmpty(): boolean { return !!this.features.hideWhenEmpty; }

    private readonly onDidChangeEmitter = new Emitter<void>();
    readonly onDidChange: Event<void> = this.onDidChangeEmitter.event;

    constructor(
        readonly handle: number,
        public provider: PluginScmProvider,
        public features: SourceControlGroupFeatures,
        public label: string,
        public id: string
    ) { }

    splice(start: number, deleteCount: number, toInsert: ScmResource[]): void {
        this.resources.splice(start, deleteCount, ...toInsert);
        this.onDidSpliceEmitter.fire({ start, deleteCount, toInsert });
    }

    updateGroup(features: SourceControlGroupFeatures): void {
        this.features = { ...this.features, ...features };
        this.onDidChangeEmitter.fire();
    }

    updateGroupLabel(label: string): void {
        this.label = label;
        this.onDidChangeEmitter.fire();
    }

    dispose(): void { }
}

export class PluginScmResource implements ScmResource {

    constructor(
        private readonly proxy: ScmExt,
        private readonly sourceControlHandle: number,
        private readonly groupHandle: number,
        readonly handle: number,
        readonly sourceUri: URI,
        readonly group: PluginScmResourceGroup,
        readonly decorations: ScmResourceDecorations,
        readonly contextValue: string | undefined,
        readonly command: ScmCommand | undefined
    ) { }

    open(): Promise<void> {
        return this.proxy.$executeResourceCommand(this.sourceControlHandle, this.groupHandle, this.handle);
    }
}

export class PluginScmProvider implements ScmProvider {

    private _id = this.contextValue;
    get id(): string { return this._id; }

    readonly groups: PluginScmResourceGroup[] = [];
    private readonly groupsByHandle: { [handle: number]: PluginScmResourceGroup; } = Object.create(null);

    private readonly onDidChangeResourcesEmitter = new Emitter<void>();
    readonly onDidChangeResources: Event<void> = this.onDidChangeResourcesEmitter.event;

    private features: SourceControlProviderFeatures = {};

    get handle(): number { return this._handle; }
    get label(): string { return this._label; }
    get rootUri(): string { return this._rootUri ? this._rootUri.toString() : ''; }
    get contextValue(): string { return this._contextValue; }

    get commitTemplate(): string { return this.features.commitTemplate || ''; }
    get acceptInputCommand(): ScmCommand | undefined {
        const command = this.features.acceptInputCommand;
        if (command) {
            const scmCommand: ScmCommand = command;
            scmCommand.command = command.id;
            return scmCommand;
        }
    }
    get statusBarCommands(): ScmCommand[] | undefined {
        const commands = this.features.statusBarCommands;
        return commands?.map(command => {
            const scmCommand: ScmCommand = command;
            scmCommand.command = command.id;
            return scmCommand;
        });
    }
    get count(): number | undefined { return this.features.count; }

    private readonly onDidChangeCommitTemplateEmitter = new Emitter<string>();
    readonly onDidChangeCommitTemplate: Event<string> = this.onDidChangeCommitTemplateEmitter.event;

    private readonly onDidChangeStatusBarCommandsEmitter = new Emitter<ScmCommand[]>();
    get onDidChangeStatusBarCommands(): Event<ScmCommand[]> { return this.onDidChangeStatusBarCommandsEmitter.event; }

    private readonly onDidChangeEmitter = new Emitter<void>();
    readonly onDidChange: Event<void> = this.onDidChangeEmitter.event;

    constructor(
        private readonly proxy: ScmExt,
        private readonly colors: ColorRegistry,
        private readonly sharedStyle: PluginSharedStyle,
        private readonly _handle: number,
        private readonly _contextValue: string,
        private readonly _label: string,
        private readonly _rootUri: vscodeURI | undefined,
        private disposables: DisposableCollection
    ) { }

    updateSourceControl(features: SourceControlProviderFeatures): void {
        this.features = { ...this.features, ...features };
        this.onDidChangeEmitter.fire();

        if (typeof features.commitTemplate !== 'undefined') {
            this.onDidChangeCommitTemplateEmitter.fire(this.commitTemplate!);
        }

        if (typeof features.statusBarCommands !== 'undefined') {
            this.onDidChangeStatusBarCommandsEmitter.fire(this.statusBarCommands!);
        }
    }

    registerGroups(resourceGroups: ScmRawResourceGroup[]): void {
        const groups = resourceGroups.map(resourceGroup => {
            const { handle, id, label, features } = resourceGroup;
            const group = new PluginScmResourceGroup(
                handle,
                this,
                features,
                label,
                id
            );

            this.groupsByHandle[handle] = group;
            return group;
        });

        this.groups.splice(this.groups.length, 0, ...groups);
    }

    updateGroup(handle: number, features: SourceControlGroupFeatures): void {
        const group = this.groupsByHandle[handle];

        if (!group) {
            return;
        }

        group.updateGroup(features);
    }

    updateGroupLabel(handle: number, label: string): void {
        const group = this.groupsByHandle[handle];

        if (!group) {
            return;
        }

        group.updateGroupLabel(label);
    }

    spliceGroupResourceStates(splices: ScmRawResourceSplices[]): void {
        for (const splice of splices) {
            const groupHandle = splice.handle;
            const groupSlices = splice.splices;
            const group = this.groupsByHandle[groupHandle];

            if (!group) {
                console.warn(`SCM group ${groupHandle} not found in provider ${this.label}`);
                continue;
            }

            // reverse the splices sequence in order to apply them correctly
            groupSlices.reverse();

            for (const groupSlice of groupSlices) {
                const { start, deleteCount, rawResources } = groupSlice;
                const resources = rawResources.map(rawResource => {
                    const { handle, sourceUri, icons, tooltip, strikeThrough, faded, contextValue, command } = rawResource;
                    const icon = this.toIconClass(icons[0]);
                    const iconDark = this.toIconClass(icons[1]) || icon;
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    const colorVariable = (rawResource as any).colorId && this.colors.toCssVariableName((rawResource as any).colorId);
                    const decorations = {
                        icon,
                        iconDark,
                        tooltip,
                        strikeThrough,
                        // TODO remove the letter and colorId fields when the FileDecorationProvider is applied, see https://github.com/eclipse-theia/theia/pull/8911
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        letter: (rawResource as any).letter || '',
                        color: colorVariable && `var(${colorVariable})`,
                        faded
                    } as ScmResourceDecorations;

                    return new PluginScmResource(
                        this.proxy,
                        this.handle,
                        groupHandle,
                        handle,
                        new URI(vscodeURI.revive(sourceUri)),
                        group,
                        decorations,
                        contextValue || undefined,
                        command
                    );
                });

                group.splice(start, deleteCount, resources);
            }
        }

        this.onDidChangeResourcesEmitter.fire();
    }

    private toIconClass(icon: IconUrl | ThemeIcon | undefined): string | undefined {
        if (!icon) {
            return undefined;
        }
        if (ThemeIcon.isThemeIcon(icon)) {
            return ThemeIcon.asClassName(icon);
        }
        const reference = this.sharedStyle.toIconClass(icon);
        this.disposables.push(reference);
        return reference.object.iconClass;
    }

    unregisterGroup(handle: number): void {
        const group = this.groupsByHandle[handle];

        if (!group) {
            return;
        }

        delete this.groupsByHandle[handle];
        this.groups.splice(this.groups.indexOf(group), 1);
    }

    dispose(): void { }
}

export class ScmMainImpl implements ScmMain {

    private readonly proxy: ScmExt;
    private readonly scmService: ScmService;
    private repositories = new Map<number, ScmRepository>();
    private repositoryDisposables = new Map<number, DisposableCollection>();
    private readonly disposables = new DisposableCollection();
    private readonly colors: ColorRegistry;
    private readonly sharedStyle: PluginSharedStyle;

    constructor(rpc: RPCProtocol, container: interfaces.Container) {
        this.proxy = rpc.getProxy(MAIN_RPC_CONTEXT.SCM_EXT);
        this.scmService = container.get(ScmService);
        this.colors = container.get(ColorRegistry);
        this.sharedStyle = container.get(PluginSharedStyle);
    }

    dispose(): void {
        this.repositories.forEach(r => r.dispose());
        this.repositories.clear();

        this.repositoryDisposables.forEach(d => d.dispose());
        this.repositoryDisposables.clear();

        this.disposables.dispose();
    }

    async $registerSourceControl(handle: number, id: string, label: string, rootUri: UriComponents | undefined): Promise<void> {
        const provider = new PluginScmProvider(this.proxy, this.colors, this.sharedStyle, handle, id, label, rootUri ? vscodeURI.revive(rootUri) : undefined, this.disposables);
        const repository = this.scmService.registerScmProvider(provider, {
            input: {
                validator: async value => {
                    const result = await this.proxy.$validateInput(handle, value, value.length);
                    return result && { message: result[0], type: result[1] };
                }
            }
        }
        );
        this.repositories.set(handle, repository);

        const disposables = new DisposableCollection(
            this.scmService.onDidChangeSelectedRepository(r => {
                if (r === repository) {
                    this.proxy.$setSelectedSourceControl(handle);
                }
            }),
            repository.input.onDidChange(() => this.proxy.$onInputBoxValueChange(handle, repository.input.value))
        );

        if (this.scmService.selectedRepository === repository) {
            setTimeout(() => this.proxy.$setSelectedSourceControl(handle), 0);
        }

        if (repository.input.value) {
            setTimeout(() => this.proxy.$onInputBoxValueChange(handle, repository.input.value), 0);
        }

        this.repositoryDisposables.set(handle, disposables);
    }

    async $updateSourceControl(handle: number, features: SourceControlProviderFeatures): Promise<void> {
        const repository = this.repositories.get(handle);

        if (!repository) {
            return;
        }

        const provider = repository.provider as PluginScmProvider;
        provider.updateSourceControl(features);
    }

    async $unregisterSourceControl(handle: number): Promise<void> {
        const repository = this.repositories.get(handle);

        if (!repository) {
            return;
        }

        this.repositoryDisposables.get(handle)!.dispose();
        this.repositoryDisposables.delete(handle);

        repository.dispose();
        this.repositories.delete(handle);
    }

    $registerGroups(sourceControlHandle: number, groups: ScmRawResourceGroup[], splices: ScmRawResourceSplices[]): void {
        const repository = this.repositories.get(sourceControlHandle);

        if (!repository) {
            return;
        }

        const provider = repository.provider as PluginScmProvider;
        provider.registerGroups(groups);
        provider.spliceGroupResourceStates(splices);
    }

    $updateGroup(sourceControlHandle: number, groupHandle: number, features: SourceControlGroupFeatures): void {
        const repository = this.repositories.get(sourceControlHandle);

        if (!repository) {
            return;
        }

        const provider = repository.provider as PluginScmProvider;
        provider.updateGroup(groupHandle, features);
    }

    $updateGroupLabel(sourceControlHandle: number, groupHandle: number, label: string): void {
        const repository = this.repositories.get(sourceControlHandle);

        if (!repository) {
            return;
        }

        const provider = repository.provider as PluginScmProvider;
        provider.updateGroupLabel(groupHandle, label);
    }

    $spliceResourceStates(sourceControlHandle: number, splices: ScmRawResourceSplices[]): void {
        const repository = this.repositories.get(sourceControlHandle);

        if (!repository) {
            return;
        }

        const provider = repository.provider as PluginScmProvider;
        provider.spliceGroupResourceStates(splices);
    }

    $unregisterGroup(sourceControlHandle: number, handle: number): void {
        const repository = this.repositories.get(sourceControlHandle);

        if (!repository) {
            return;
        }

        const provider = repository.provider as PluginScmProvider;
        provider.unregisterGroup(handle);
    }

    $setInputBoxValue(sourceControlHandle: number, value: string): void {
        const repository = this.repositories.get(sourceControlHandle);

        if (!repository) {
            return;
        }

        repository.input.value = value;
    }

    $setInputBoxPlaceholder(sourceControlHandle: number, placeholder: string): void {
        const repository = this.repositories.get(sourceControlHandle);

        if (!repository) {
            return;
        }

        repository.input.placeholder = placeholder;
    }

    $setInputBoxVisible(sourceControlHandle: number, visible: boolean): void {
        const repository = this.repositories.get(sourceControlHandle);

        if (!repository) {
            return;
        }

        repository.input.visible = visible;
    }

    $setInputBoxEnabled(sourceControlHandle: number, enabled: boolean): void {
        const repository = this.repositories.get(sourceControlHandle);

        if (!repository) {
            return;
        }

        repository.input.enabled = enabled;
    }
}
