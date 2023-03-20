// *****************************************************************************
// Copyright (C) 2022 Ericsson and others.
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

import { CommandRegistry, Disposable, MenuCommandAdapter, MenuPath, SelectionService, UriSelection } from '@theia/core';
import { ResourceContextKey } from '@theia/core/lib/browser/resource-context-key';
import { inject, injectable, postConstruct } from '@theia/core/shared/inversify';
import { URI as CodeUri } from '@theia/core/shared/vscode-uri';
import { TreeWidgetSelection } from '@theia/core/lib/browser/tree/tree-widget-selection';
import { ScmRepository } from '@theia/scm/lib/browser/scm-repository';
import { ScmService } from '@theia/scm/lib/browser/scm-service';
import { TimelineItem } from '@theia/timeline/lib/common/timeline-model';
import { ScmCommandArg, TimelineCommandArg, TreeViewItemReference } from '../../../common';
import { PluginScmProvider, PluginScmResource, PluginScmResourceGroup } from '../scm-main';
import { TreeViewWidget } from '../view/tree-view-widget';
import { CodeEditorWidgetUtil, codeToTheiaMappings, ContributionPoint } from './vscode-theia-menu-mappings';
import { TAB_BAR_TOOLBAR_CONTEXT_MENU } from '@theia/core/lib/browser/shell/tab-bar-toolbar';

export type ArgumentAdapter = (...args: unknown[]) => unknown[];

export class ReferenceCountingSet<T> {
    protected readonly references: Map<T, number>;
    constructor(initialMembers?: Iterable<T>) {
        this.references = new Map();
        if (initialMembers) {
            for (const member of initialMembers) {
                this.add(member);
            }
        }
    }

    add(newMember: T): ReferenceCountingSet<T> {
        const value = this.references.get(newMember) ?? 0;
        this.references.set(newMember, value + 1);
        return this;
    }

    /** @returns true if the deletion results in the removal of the element from the set */
    delete(member: T): boolean {
        const value = this.references.get(member);
        if (value === undefined) { } else if (value <= 1) {
            this.references.delete(member);
            return true;
        } else {
            this.references.set(member, value - 1);
        }
        return false;
    }

    has(maybeMember: T): boolean {
        return this.references.has(maybeMember);
    }
}

@injectable()
export class PluginMenuCommandAdapter implements MenuCommandAdapter {
    @inject(CommandRegistry) protected readonly commandRegistry: CommandRegistry;
    @inject(CodeEditorWidgetUtil) protected readonly codeEditorUtil: CodeEditorWidgetUtil;
    @inject(ScmService) protected readonly scmService: ScmService;
    @inject(SelectionService) protected readonly selectionService: SelectionService;
    @inject(ResourceContextKey) protected readonly resourceContextKey: ResourceContextKey;

    protected readonly commands = new ReferenceCountingSet<string>();
    protected readonly argumentAdapters = new Map<string, ArgumentAdapter>();
    protected readonly separator = ':)(:';

    @postConstruct()
    protected init(): void {
        const toCommentArgs: ArgumentAdapter = (...args) => this.toCommentArgs(...args);
        const firstArgOnly: ArgumentAdapter = (...args) => [args[0]];
        const noArgs: ArgumentAdapter = () => [];
        const toScmArgs: ArgumentAdapter = (...args) => this.toScmArgs(...args);
        const selectedResource = () => this.getSelectedResources();
        const widgetURI: ArgumentAdapter = widget => this.codeEditorUtil.is(widget) ? [this.codeEditorUtil.getResourceUri(widget)] : [];
        (<Array<[ContributionPoint, ArgumentAdapter | undefined]>>[
            ['comments/comment/context', toCommentArgs],
            ['comments/comment/title', toCommentArgs],
            ['comments/commentThread/context', toCommentArgs],
            ['debug/callstack/context', firstArgOnly],
            ['debug/variables/context', firstArgOnly],
            ['debug/toolBar', noArgs],
            ['editor/context', selectedResource],
            ['editor/title', widgetURI],
            ['editor/title/context', selectedResource],
            ['explorer/context', selectedResource],
            ['scm/resourceFolder/context', toScmArgs],
            ['scm/resourceGroup/context', toScmArgs],
            ['scm/resourceState/context', toScmArgs],
            ['scm/title', () => [this.toScmArg(this.scmService.selectedRepository)]],
            ['timeline/item/context', (...args) => this.toTimelineArgs(...args)],
            ['view/item/context', (...args) => this.toTreeArgs(...args)],
            ['view/title', noArgs],
        ]).forEach(([contributionPoint, adapter]) => {
            if (adapter) {
                const paths = codeToTheiaMappings.get(contributionPoint);
                if (paths) {
                    paths.forEach(path => this.addArgumentAdapter(path, adapter));
                }
            }
        });
        this.addArgumentAdapter(TAB_BAR_TOOLBAR_CONTEXT_MENU, widgetURI);
    }

    canHandle(menuPath: MenuPath, command: string, ...commandArgs: unknown[]): number {
        if (this.commands.has(command) && this.getArgumentAdapterForMenu(menuPath)) {
            return 500;
        }
        return -1;
    }

    executeCommand(menuPath: MenuPath, command: string, ...commandArgs: unknown[]): Promise<unknown> {
        const argumentAdapter = this.getAdapterOrThrow(menuPath);
        return this.commandRegistry.executeCommand(command, ...argumentAdapter(...commandArgs));
    }

    isVisible(menuPath: MenuPath, command: string, ...commandArgs: unknown[]): boolean {
        const argumentAdapter = this.getAdapterOrThrow(menuPath);
        return this.commandRegistry.isVisible(command, ...argumentAdapter(...commandArgs));
    }

    isEnabled(menuPath: MenuPath, command: string, ...commandArgs: unknown[]): boolean {
        const argumentAdapter = this.getAdapterOrThrow(menuPath);
        return this.commandRegistry.isEnabled(command, ...argumentAdapter(...commandArgs));
    }

    isToggled(menuPath: MenuPath, command: string, ...commandArgs: unknown[]): boolean {
        const argumentAdapter = this.getAdapterOrThrow(menuPath);
        return this.commandRegistry.isToggled(command, ...argumentAdapter(...commandArgs));
    }

    protected getAdapterOrThrow(menuPath: MenuPath): ArgumentAdapter {
        const argumentAdapter = this.getArgumentAdapterForMenu(menuPath);
        if (!argumentAdapter) {
            throw new Error('PluginMenuCommandAdapter attempted to execute command for unregistered menu: ' + JSON.stringify(menuPath));
        }
        return argumentAdapter;
    }

    addCommand(commandId: string): Disposable {
        this.commands.add(commandId);
        return Disposable.create(() => this.commands.delete(commandId));
    }

    protected getArgumentAdapterForMenu(menuPath: MenuPath): ArgumentAdapter | undefined {
        return this.argumentAdapters.get(menuPath.join(this.separator));
    }

    protected addArgumentAdapter(menuPath: MenuPath, adapter: ArgumentAdapter): void {
        this.argumentAdapters.set(menuPath.join(this.separator), adapter);
    }

    /* eslint-disable @typescript-eslint/no-explicit-any */

    protected toCommentArgs(...args: any[]): any[] {
        const arg = args[0];
        if ('text' in arg) {
            if ('commentUniqueId' in arg) {
                return [{
                    commentControlHandle: arg.thread.controllerHandle,
                    commentThreadHandle: arg.thread.commentThreadHandle,
                    text: arg.text,
                    commentUniqueId: arg.commentUniqueId
                }];
            }
            return [{
                commentControlHandle: arg.thread.controllerHandle,
                commentThreadHandle: arg.thread.commentThreadHandle,
                text: arg.text
            }];
        }
        return [{
            commentControlHandle: arg.thread.controllerHandle,
            commentThreadHandle: arg.thread.commentThreadHandle,
            commentUniqueId: arg.commentUniqueId
        }];
    }

    protected toScmArgs(...args: any[]): any[] {
        const scmArgs: any[] = [];
        for (const arg of args) {
            const scmArg = this.toScmArg(arg);
            if (scmArg) {
                scmArgs.push(scmArg);
            }
        }
        return scmArgs;
    }

    protected toScmArg(arg: any): ScmCommandArg | undefined {
        if (arg instanceof ScmRepository && arg.provider instanceof PluginScmProvider) {
            return {
                sourceControlHandle: arg.provider.handle
            };
        }
        if (arg instanceof PluginScmResourceGroup) {
            return {
                sourceControlHandle: arg.provider.handle,
                resourceGroupHandle: arg.handle
            };
        }
        if (arg instanceof PluginScmResource) {
            return {
                sourceControlHandle: arg.group.provider.handle,
                resourceGroupHandle: arg.group.handle,
                resourceStateHandle: arg.handle
            };
        }
    }

    protected toTimelineArgs(...args: any[]): any[] {
        const timelineArgs: any[] = [];
        const arg = args[0];
        timelineArgs.push(this.toTimelineArg(arg));
        timelineArgs.push(CodeUri.parse(arg.uri));
        timelineArgs.push(arg.source ?? '');
        return timelineArgs;
    }

    protected toTimelineArg(arg: TimelineItem): TimelineCommandArg {
        return {
            timelineHandle: arg.handle,
            source: arg.source,
            uri: arg.uri
        };
    }

    protected toTreeArgs(...args: any[]): any[] {
        const treeArgs: any[] = [];
        for (const arg of args) {
            if (TreeViewItemReference.is(arg)) {
                treeArgs.push(arg);
            } else if (Array.isArray(arg)) {
                treeArgs.push(arg.filter(TreeViewItemReference.is));
            }
        }
        return treeArgs;
    }

    protected getSelectedResources(): [CodeUri | TreeViewItemReference | undefined, CodeUri[] | undefined] {
        const selection = this.selectionService.selection;
        const resourceKey = this.resourceContextKey.get();
        const resourceUri = resourceKey ? CodeUri.parse(resourceKey) : undefined;
        const firstMember = TreeWidgetSelection.is(selection) && selection.source instanceof TreeViewWidget && selection[0]
            ? selection.source.toTreeViewItemReference(selection[0])
            : UriSelection.getUri(selection)?.['codeUri'] ?? resourceUri;
        const secondMember = TreeWidgetSelection.is(selection)
            ? UriSelection.getUris(selection).map(uri => uri['codeUri'])
            : undefined;
        return [firstMember, secondMember];
    }
    /* eslint-enable @typescript-eslint/no-explicit-any */
}
