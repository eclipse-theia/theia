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
import { Path } from '@theia/core/lib/common/path';
import URI from '@theia/core/lib/common/uri';
import { ScmService } from './scm-service';
import { ScmRepository } from './scm-repository';
import { ScmCommand } from './scm-provider';
import { ScmContextKeyService } from './scm-context-key-service';

/** Menu path matching the VS Code 'scm/title' contribution point (git actions: Pull, Push, etc.). */
export const SCM_TITLE_MENU: MenuPath = ['plugin_scm/title'];
/** Menu path matching the VS Code 'scm/sourceControl' contribution point (inline toolbar actions on repo entries). */
export const SCM_SOURCE_CONTROL_MENU: MenuPath = ['plugin_scm/sourceControl'];
/** Menu path matching the VS Code 'scm/sourceControl/context' contribution point (context menu on repo entries). */
export const SCM_SOURCE_CONTROL_CONTEXT_MENU: MenuPath = ['plugin_scm/sourceControl/context'];
/** Menu path matching the VS Code 'scm/sourceControl/title' contribution point (REPOSITORIES section header toolbar). */
export const SCM_SOURCE_CONTROL_TITLE_MENU: MenuPath = ['plugin_scm/sourceControl/title'];

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
            if (repo.provider.onDidChange) {
                this.toDisposeOnRepositoriesChange.push(
                    repo.provider.onDidChange(() => this.update())
                );
            }
        }

        // Only programmatically show — never programmatically hide.
        // The user can manually hide the widget via the Views menu.
        // On first launch, `initiallyHidden: true` keeps it hidden until repos >= 2.
        if (this.scmService.repositories.length >= 2) {
            const partOrSelf = this.parent ?? this;
            partOrSelf.setHidden(false);
        }
        this.update();
    }

    protected groupRepositories(): RepoGroup[] {
        const repos = this.scmService.repositories;
        if (repos.length === 0) {
            return [];
        }
        const repoByRootUri = new Map<string, ScmRepository>();
        for (const repo of repos) {
            repoByRootUri.set(repo.provider.rootUri, repo);
        }
        const groups = new Map<string, RepoGroup>();
        const childRepos = new Set<ScmRepository>();

        // First pass: identify repos that have a parent (worktrees/submodules)
        for (const repo of repos) {
            const parentUri = repo.parentRootUri;
            if (parentUri && repoByRootUri.has(parentUri)) {
                childRepos.add(repo);
            }
        }

        // Second pass: create groups for root repos and assign children
        for (const repo of repos) {
            if (childRepos.has(repo)) {
                continue;
            }
            const rootUri = repo.provider.rootUri;
            groups.set(rootUri, {
                root: repo,
                children: [],
                collapsed: this.collapsedRoots.has(rootUri)
            });
        }

        // Third pass: assign children to their parent groups
        for (const repo of repos) {
            const parentUri = repo.parentRootUri;
            if (parentUri && childRepos.has(repo)) {
                const parentGroup = groups.get(parentUri);
                if (parentGroup) {
                    parentGroup.children.push(repo);
                }
            }
        }

        return [...groups.values()];
    }

    protected getRepoDescriptions(): Map<ScmRepository, string> {
        const repos = this.scmService.repositories;
        const descriptions = new Map<ScmRepository, string>();
        const byName = new Map<string, ScmRepository[]>();
        for (const repo of repos) {
            const name = this.labelProvider.getName(new URI(repo.provider.rootUri));
            const list = byName.get(name) ?? [];
            list.push(repo);
            byName.set(name, list);
        }
        for (const group of byName.values()) {
            if (group.length < 2) {
                continue;
            }
            const parentPaths = group.map(r => new URI(r.provider.rootUri).path.dir);
            const basePath = this.commonParentPath(parentPaths);
            for (let i = 0; i < group.length; i++) {
                const relative = basePath.relative(parentPaths[i]);
                const desc = relative?.toString() || '/';
                descriptions.set(group[i], desc);
            }
        }
        return descriptions;
    }

    protected commonParentPath(paths: Path[]): Path {
        if (paths.length === 0) {
            return new Path('');
        }
        let common = paths[0];
        for (let i = 1; i < paths.length; i++) {
            while (!common.isEqualOrParent(paths[i])) {
                common = common.dir;
            }
        }
        return common;
    }

    protected render(): React.ReactNode {
        const groups = this.groupRepositories();
        const descriptions = this.getRepoDescriptions();
        return (
            <div className='theia-scm-repositories-container'>
                {groups.map(group => this.renderGroup(group, descriptions))}
            </div>
        );
    }

    protected renderGroup(group: RepoGroup, descriptions: Map<ScmRepository, string>): React.ReactNode {
        const { root, children, collapsed } = group;
        const hasChildren = children.length > 0;
        return (
            <React.Fragment key={`${root.provider.id}:${root.provider.rootUri}`}>
                {this.renderRepository(root, hasChildren, collapsed, false, descriptions)}
                {hasChildren && !collapsed && children.map(child => this.renderRepository(child, false, false, true, descriptions))}
            </React.Fragment>
        );
    }

    protected renderRepository(
        repo: ScmRepository,
        hasChildren: boolean,
        collapsed: boolean,
        isChild = false,
        descriptions = new Map<ScmRepository, string>()
    ): React.ReactNode {
        const isSelected = repo === this.scmService.selectedRepository;
        const rootUri = repo.provider.rootUri;
        const itemKey = `${repo.provider.id}:${rootUri}`;
        const uri = new URI(rootUri);
        const name = this.labelProvider.getName(uri);
        const description = descriptions.get(repo);
        const statusCommands = repo.provider.statusBarCommands ?? [];
        const repoIcon = this.getRepoIcon(repo, isChild);

        return (
            <div
                key={itemKey}
                className={`theia-scm-repository-item${isSelected ? ' selected' : ''}${isChild ? ' child' : ''}`}
                onClick={() => this.selectRepository(repo)}
                onContextMenu={e => { e.preventDefault(); e.stopPropagation(); this.showSourceControlContextMenu(e, repo); }}
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
                <div className='theia-scm-repository-label'>
                    <span className='theia-scm-repository-name'>{name}</span>
                    {description && <span className='theia-scm-repository-description'>{description}</span>}
                </div>
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

    protected showSourceControlContextMenu(e: React.MouseEvent, repo: ScmRepository): void {
        this.scmService.selectedRepository = repo;
        this.scmContextKeys.scmProvider.set(repo.provider.id);
        const anchor = e.nativeEvent;
        setTimeout(() => {
            this.contextMenuRenderer.render({
                menuPath: SCM_SOURCE_CONTROL_CONTEXT_MENU,
                anchor,
                args: [repo],
                context: this.node
            });
        }, 0);
    }

    protected getRepoIcon(repo: ScmRepository, isChild: boolean): string {
        const ctx = repo.provider.providerContextValue;
        if (ctx === 'worktree') {
            return codicon('worktree');
        }
        if (ctx === 'submodule') {
            return codicon('file-submodule');
        }
        if (isChild) {
            return codicon('repo-forked');
        }
        return codicon('repo');
    }

    protected selectRepository(repo: ScmRepository): void {
        this.scmService.selectedRepository = repo;
    }
}
