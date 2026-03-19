// *****************************************************************************
// Copyright (C) 2024 EclipseSource GmbH and others.
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

import { injectable, inject, postConstruct } from '@theia/core/shared/inversify';
import * as React from '@theia/core/shared/react';
import { ReactWidget, LabelProvider, codicon, ContextMenuRenderer } from '@theia/core/lib/browser';
import { LabelParser, LabelIcon } from '@theia/core/lib/browser/label-parser';
import { CommandService, MenuPath } from '@theia/core/lib/common';
import { DisposableCollection } from '@theia/core/lib/common/disposable';
import { nls } from '@theia/core/lib/common/nls';
import URI from '@theia/core/lib/common/uri';
import { ScmService } from './scm-service';
import { ScmRepository } from './scm-repository';
import { ScmCommand } from './scm-provider';
import { ScmContextKeyService } from './scm-context-key-service';

/** Menu path matching the VS Code 'scm/sourceControl/context' contribution point. */
export const SCM_SOURCE_CONTROL_CONTEXT_MENU: MenuPath = ['plugin_scm/sourceControl/context'];
/** Menu path matching the VS Code 'scm/title' contribution point (git actions: Pull, Push, etc.). */
export const SCM_TITLE_MENU: MenuPath = ['plugin_scm/title'];

interface RepoGroup {
    root: ScmRepository;
    children: ScmRepository[];
    collapsed: boolean;
}

@injectable()
export class ScmRepositoriesWidget extends ReactWidget {

    static ID = 'scm-repositories-widget';

    @inject(ScmService) protected readonly scmService: ScmService;
    @inject(LabelProvider) protected readonly labelProvider: LabelProvider;
    @inject(LabelParser) protected readonly labelParser: LabelParser;
    @inject(CommandService) protected readonly commandService: CommandService;
    @inject(ContextMenuRenderer) protected readonly contextMenuRenderer: ContextMenuRenderer;
    @inject(ScmContextKeyService) protected readonly scmContextKeys: ScmContextKeyService;

    protected readonly toDisposeOnRepositoriesChange = new DisposableCollection();
    protected readonly collapsedRoots = new Set<string>();

    @postConstruct()
    protected init(): void {
        this.id = ScmRepositoriesWidget.ID;
        this.title.label = nls.localizeByDefault('Repositories');
        this.title.caption = this.title.label;

        this.toDispose.push(this.toDisposeOnRepositoriesChange);
        this.toDispose.push(this.scmService.onDidAddRepository(() => this.onRepositoriesChanged()));
        this.toDispose.push(this.scmService.onDidRemoveRepository(() => this.onRepositoriesChanged()));
        this.toDispose.push(this.scmService.onDidChangeSelectedRepository(() => this.update()));

        this.onRepositoriesChanged();
    }

    protected onRepositoriesChanged(): void {
        // Re-subscribe to each repo's status bar command changes so non-selected
        // repos also trigger a re-render when their branch/status changes.
        this.toDisposeOnRepositoriesChange.dispose();
        for (const repo of this.scmService.repositories) {
            if (repo.provider.onDidChangeStatusBarCommands) {
                this.toDisposeOnRepositoriesChange.push(
                    repo.provider.onDidChangeStatusBarCommands(() => this.update())
                );
            }
        }

        const hidden = this.scmService.repositories.length < 2;
        // Hide the ViewContainerPart (parent) so the section header is also hidden.
        // Fall back to hiding this widget directly if it has no parent yet.
        const partOrSelf = this.parent ?? this;
        partOrSelf.setHidden(hidden);
        this.update();
    }

    protected groupRepositories(): RepoGroup[] {
        const repos = this.scmService.repositories;
        if (repos.length === 0) {
            return [];
        }
        const groups = new Map<string, RepoGroup>();
        for (const repo of repos) {
            const key = repo.provider.id;
            const existing = groups.get(key);
            if (existing) {
                existing.children.push(repo);
            } else {
                groups.set(key, {
                    root: repo,
                    children: [],
                    collapsed: this.collapsedRoots.has(repo.provider.rootUri)
                });
            }
        }
        return [...groups.values()];
    }

    protected render(): React.ReactNode {
        const groups = this.groupRepositories();
        return (
            <div className='theia-scm-repositories-container'>
                {groups.map(group => this.renderGroup(group))}
            </div>
        );
    }

    protected renderGroup(group: RepoGroup): React.ReactNode {
        const { root, children, collapsed } = group;
        const hasChildren = children.length > 0;
        return (
            <React.Fragment key={`${root.provider.id}:${root.provider.rootUri}`}>
                {this.renderRepository(root, hasChildren, collapsed)}
                {hasChildren && !collapsed && children.map(child => this.renderRepository(child, false, false, true))}
            </React.Fragment>
        );
    }

    protected renderRepository(
        repo: ScmRepository,
        hasChildren: boolean,
        collapsed: boolean,
        isChild = false
    ): React.ReactNode {
        const isSelected = repo === this.scmService.selectedRepository;
        const rootUri = repo.provider.rootUri;
        const itemKey = `${repo.provider.id}:${rootUri}`;
        const name = this.labelProvider.getName(new URI(rootUri));
        const statusCommands = repo.provider.statusBarCommands ?? [];
        const repoIcon = isChild ? codicon('worktree') : codicon('repo');

        return (
            <div
                key={itemKey}
                className={`theia-scm-repository-item${isSelected ? ' selected' : ''}${isChild ? ' child' : ''}`}
                onClick={() => this.selectRepository(repo)}
                title={rootUri}
            >
                {hasChildren ? (
                    <span
                        className={`theia-scm-repository-collapse-toggle ${codicon(collapsed ? 'chevron-right' : 'chevron-down')}`}
                        onClick={e => { e.stopPropagation(); this.toggleCollapse(repo.provider.rootUri); }}
                    />
                ) : (
                    isChild && <span className='theia-scm-repository-child-indent' />
                )}
                <span className={`theia-scm-repository-icon ${repoIcon}`} />
                <span className='theia-scm-repository-name'>{name}</span>
                <div className='theia-scm-repository-actions'>
                    {statusCommands.length > 0 && (
                        <div className='theia-scm-repository-status-commands'>
                            {statusCommands.map((cmd, i) => this.renderStatusCommand(cmd, i, isSelected))}
                        </div>
                    )}
                    <a
                        className={`theia-scm-repository-more-button ${codicon('ellipsis')}${isSelected ? ' selected' : ''}`}
                        title={nls.localizeByDefault('More Actions...')}
                        onClick={e => { e.stopPropagation(); this.showContextMenu(e, repo); }}
                    />
                </div>
            </div>
        );
    }

    protected renderStatusCommand(cmd: ScmCommand, index: number, isSelected: boolean): React.ReactNode {
        const parts = this.labelParser.parse(cmd.title);
        const content = parts.map((part, i) => {
            if (LabelIcon.is(part)) {
                return <span key={i} className={codicon(part.name)} />;
            }
            return <span key={i}>{part}</span>;
        });
        const tooltip = cmd.tooltip ?? this.labelParser.stripIcons(cmd.title);
        return (
            <a
                key={index}
                className={`theia-scm-repository-status-command${isSelected ? ' selected' : ''}`}
                title={tooltip}
                onClick={e => {
                    e.stopPropagation();
                    if (cmd.command) {
                        this.commandService.executeCommand(cmd.command, ...(cmd.arguments ?? []));
                    }
                }}
            >
                {content}
            </a>
        );
    }

    protected toggleCollapse(rootUri: string): void {
        if (this.collapsedRoots.has(rootUri)) {
            this.collapsedRoots.delete(rootUri);
        } else {
            this.collapsedRoots.add(rootUri);
        }
        this.update();
    }

    protected showContextMenu(e: React.MouseEvent, repo: ScmRepository): void {
        // Select the repo and set the context key so command when-clauses resolve correctly.
        this.scmService.selectedRepository = repo;
        this.scmContextKeys.scmProvider.set(repo.provider.id);
        const anchor = e.nativeEvent;
        // Defer one tick so the selectedRepository change propagates through context keys.
        setTimeout(() => {
            this.contextMenuRenderer.render({
                menuPath: SCM_TITLE_MENU,
                anchor,
                args: [repo],
                context: this.node
            });
        }, 0);
    }

    protected selectRepository(repo: ScmRepository): void {
        this.scmService.selectedRepository = repo;
    }
}
