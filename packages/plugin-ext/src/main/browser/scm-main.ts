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

import {
    MAIN_RPC_CONTEXT,
    ScmExt,
    SourceControlGroupFeatures,
    ScmMain,
    SourceControlProviderFeatures,
    SourceControlResourceState
} from '../../api/plugin-api';
import {
    ScmProvider,
    ScmRepository,
    ScmResource,
    ScmResourceDecorations,
    ScmResourceGroup,
    ScmService,
    ScmCommand
} from '@theia/scm/lib/browser';
import { RPCProtocol } from '../../api/rpc-protocol';
import { interfaces } from 'inversify';
import { CancellationToken, DisposableCollection, Emitter, Event } from '@theia/core';
import URI from '@theia/core/lib/common/uri';
import { LabelProvider } from '@theia/core/lib/browser';
import { ScmNavigatorDecorator } from '@theia/scm/lib/browser/decorations/scm-navigator-decorator';

export class ScmMainImpl implements ScmMain {
    private readonly proxy: ScmExt;
    private readonly scmService: ScmService;
    private readonly scmRepositoryMap: Map<number, ScmRepository>;
    private readonly labelProvider: LabelProvider;

    constructor(rpc: RPCProtocol, container: interfaces.Container) {
        this.proxy = rpc.getProxy(MAIN_RPC_CONTEXT.SCM_EXT);
        this.scmService = container.get(ScmService);
        this.scmRepositoryMap = new Map();
        this.labelProvider = container.get(LabelProvider);
    }

    async $registerSourceControl(sourceControlHandle: number, id: string, label: string, rootUri: string): Promise<void> {
        const provider: ScmProvider = new ScmProviderImpl(this.proxy, sourceControlHandle, id, label, rootUri, this.labelProvider);
        const repository = this.scmService.registerScmProvider(provider);
        repository.input.onDidChange(message => {
            this.proxy.$updateInputBox(sourceControlHandle, message);
        });
        this.scmRepositoryMap.set(sourceControlHandle, repository);
    }

    async $updateSourceControl(sourceControlHandle: number, features: SourceControlProviderFeatures): Promise<void> {
        const repository = this.scmRepositoryMap.get(sourceControlHandle);
        if (repository) {
            const provider = repository.provider as ScmProviderImpl;
            provider.updateSourceControl(features);
        }
    }

    async $unregisterSourceControl(sourceControlHandle: number): Promise<void> {
        const repository = this.scmRepositoryMap.get(sourceControlHandle);
        if (repository) {
            repository.dispose();
            this.scmRepositoryMap.delete(sourceControlHandle);
        }
    }

    async $setInputBoxPlaceholder(sourceControlHandle: number, placeholder: string): Promise<void> {
        const repository = this.scmRepositoryMap.get(sourceControlHandle);
        if (repository) {
            repository.input.placeholder = placeholder;
        }
    }

    async $setInputBoxValue(sourceControlHandle: number, value: string): Promise<void> {
        const repository = this.scmRepositoryMap.get(sourceControlHandle);
        if (repository) {
            repository.input.value = value;
        }
    }

    async $registerGroup(sourceControlHandle: number, groupHandle: number, id: string, label: string): Promise<void> {
        const repository = this.scmRepositoryMap.get(sourceControlHandle);
        if (repository) {
            const provider = repository.provider as ScmProviderImpl;
            provider.registerGroup(groupHandle, id, label);
        }
    }

    async $unregisterGroup(sourceControlHandle: number, groupHandle: number): Promise<void> {
        const repository = this.scmRepositoryMap.get(sourceControlHandle);
        if (repository) {
            const provider = repository.provider as ScmProviderImpl;
            provider.unregisterGroup(groupHandle);
        }
    }

    async $updateGroup(sourceControlHandle: number, groupHandle: number, features: SourceControlGroupFeatures): Promise<void> {
        const repository = this.scmRepositoryMap.get(sourceControlHandle);
        if (repository) {
            const provider = repository.provider as ScmProviderImpl;
            provider.updateGroup(groupHandle, features);
        }
    }

    async $updateGroupLabel(sourceControlHandle: number, groupHandle: number, label: string): Promise<void> {
        const repository = this.scmRepositoryMap.get(sourceControlHandle);
        if (repository) {
            const provider = repository.provider as ScmProviderImpl;
            provider.updateGroupLabel(groupHandle, label);
        }
    }

    async $updateResourceState(sourceControlHandle: number, groupHandle: number, resources: SourceControlResourceState[]): Promise<void> {
        const repository = this.scmRepositoryMap.get(sourceControlHandle);
        if (repository) {
            const provider = repository.provider as ScmProviderImpl;
            provider.updateGroupResourceStates(sourceControlHandle, groupHandle, resources);
        }
    }
}
class ScmProviderImpl implements ScmProvider {
    private static ID_HANDLE = 0;

    private onDidChangeEmitter = new Emitter<void>();
    private onDidChangeResourcesEmitter = new Emitter<void>();
    private onDidChangeCommitTemplateEmitter = new Emitter<string>();
    private onDidChangeStatusBarCommandsEmitter = new Emitter<ScmCommand[]>();
    private features: SourceControlProviderFeatures = {};
    private groupsMap: Map<number, ScmResourceGroup> = new Map();
    private disposableCollection: DisposableCollection = new DisposableCollection();

    constructor(
        private proxy: ScmExt,
        readonly handle: number,
        private _contextValue: string,
        private _label: string,
        private _rootUri: string,
        readonly labelProvider: LabelProvider
    ) {
        this.disposableCollection.push(this.onDidChangeEmitter);
        this.disposableCollection.push(this.onDidChangeResourcesEmitter);
        this.disposableCollection.push(this.onDidChangeCommitTemplateEmitter);
        this.disposableCollection.push(this.onDidChangeStatusBarCommandsEmitter);
    }

    private _id = `scm${ScmProviderImpl.ID_HANDLE++}`;

    get id(): string {
        return this._id;
    }
    get groups(): ScmResourceGroup[] {
        return Array.from(this.groupsMap.values());
    }

    get label(): string {
        return this._label;
    }

    get rootUri(): string {
        return this._rootUri;
    }

    get contextValue(): string {
        return this._contextValue;
    }

    get onDidChangeResources(): Event<void> {
        return this.onDidChangeResourcesEmitter.event;
    }

    get commitTemplate(): string | undefined {
        return this.features.commitTemplate;
    }

    get acceptInputCommand(): ScmCommand | undefined {
        return this.features.acceptInputCommand;
    }

    get statusBarCommands(): ScmCommand[] | undefined {
        return this.features.statusBarCommands;
    }

    get count(): number | undefined {
        return this.features.count;
    }

    get onDidChangeCommitTemplate(): Event<string> {
        return this.onDidChangeCommitTemplateEmitter.event;
    }

    get onDidChangeStatusBarCommands(): Event<ScmCommand[]> {
        return this.onDidChangeStatusBarCommandsEmitter.event;
    }

    get onDidChange(): Event<void> {
        return this.onDidChangeEmitter.event;
    }

    dispose(): void {
        this.disposableCollection.dispose();
    }

    updateSourceControl(features: SourceControlProviderFeatures): void {
        if (features.acceptInputCommand) {
            this.features.acceptInputCommand = features.acceptInputCommand;
        }
        if (features.commitTemplate) {
            this.features.commitTemplate = features.commitTemplate;
        }
        if (features.count) {
            this.features.count = features.count;
        }
        if (features.hasQuickDiffProvider !== undefined) {
            this.features.hasQuickDiffProvider = features.hasQuickDiffProvider;
        }
        if (features.statusBarCommands) {
            this.features.statusBarCommands = features.statusBarCommands;
        }
        this.onDidChangeEmitter.fire(undefined);

        if (features.commitTemplate) {
            this.onDidChangeCommitTemplateEmitter.fire(features.commitTemplate);
        }

        if (features.statusBarCommands) {
            this.onDidChangeStatusBarCommandsEmitter.fire(features.statusBarCommands);
        }
    }

    async getOriginalResource(uri: URI): Promise<URI | undefined> {
        if (this.features.hasQuickDiffProvider) {
            const result = await this.proxy.$provideOriginalResource(this.handle, uri.toString(), CancellationToken.None);
            if (result) {
                return new URI(result.path);
            }
        }
    }

    registerGroup(groupHandle: number, id: string, label: string): void {
        const group = new ResourceGroup(
            groupHandle,
            this.handle,
            this,
            { hideWhenEmpty: undefined },
            label,
            id
        );

        this.groupsMap.set(groupHandle, group);
    }

    unregisterGroup(groupHandle: number): void {
        const group = this.groupsMap.get(groupHandle);
        if (group) {
            group.dispose();
            this.groupsMap.delete(groupHandle);
        }
    }

    updateGroup(groupHandle: number, features: SourceControlGroupFeatures): void {
        const group = this.groupsMap.get(groupHandle);
        if (group) {
            (group as ResourceGroup).updateGroup(features);
        }
    }

    updateGroupLabel(groupHandle: number, label: string): void {
        const group = this.groupsMap.get(groupHandle);
        if (group) {
            (group as ResourceGroup).updateGroupLabel(label);
        }
    }

    async updateGroupResourceStates(sourceControlHandle: number, groupHandle: number, resources: SourceControlResourceState[]): Promise<void> {
        const group = this.groupsMap.get(groupHandle);
        if (group) {
            (group as ResourceGroup).updateResources(await Promise.all(resources.map(async resource => {
                let scmDecorations;
                const decorations = resource.decorations;
                if (decorations) {
                    const icon = decorations.iconPath ? decorations.iconPath : await this.labelProvider.getIcon(new URI(resource.resourceUri));
                    scmDecorations = {
                        icon,
                        tooltip: decorations.tooltip,
                        letter: resource.letter,
                        color: ScmNavigatorDecorator.getDecorationColor(resource.colorId)
                    };
                }
                return new ScmResourceImpl(
                    this.proxy,
                    resource.handle,
                    sourceControlHandle,
                    groupHandle,
                    group,
                    new URI(resource.resourceUri),
                    group,
                    scmDecorations);
            })));
        }
    }

    fireChangeStatusBarCommands(commands: ScmCommand[]): void {
        this.onDidChangeStatusBarCommandsEmitter.fire(commands);
    }
}

class ResourceGroup implements ScmResourceGroup {

    private _resources: ScmResource[] = [];
    private onDidChangeEmitter = new Emitter<void>();

    constructor(
        readonly handle: number,
        readonly sourceControlHandle: number,
        public provider: ScmProvider,
        public features: SourceControlGroupFeatures,
        public label: string,
        public id: string
    ) {
    }

    get resources() {
        return this._resources;
    }
    get onDidChange(): Event<void> {
        return this.onDidChangeEmitter.event;
    }

    get hideWhenEmpty(): boolean | undefined {
        return this.features.hideWhenEmpty;
    }

    updateGroup(features: SourceControlGroupFeatures): void {
        this.features = features;
        this.onDidChangeEmitter.fire(undefined);
    }

    updateGroupLabel(label: string): void {
        this.label = label;
        this.onDidChangeEmitter.fire(undefined);
    }

    updateResources(resources: ScmResource[]) {
        this._resources = resources;
        this.onDidChangeEmitter.fire(undefined);
    }

    dispose(): void {
        this.onDidChangeEmitter.dispose();
    }
}

class ScmResourceImpl implements ScmResource {
    constructor(
        private proxy: ScmExt,
        readonly handle: number,
        readonly sourceControlHandle: number,
        readonly groupHandle: number,
        readonly group: ScmResourceGroup,
        public sourceUri: URI,
        public resourceGroup: ScmResourceGroup,
        public decorations?: ScmResourceDecorations
    ) { }

    open(): Promise<void> {
        return this.proxy.$executeResourceCommand(this.sourceControlHandle, this.groupHandle, this.handle);
    }
}
