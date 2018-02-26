/*
 * Copyright (C) 2018 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { inject, injectable } from 'inversify';
import URI from '@theia/core/lib/common/uri';
import { ILogger } from '@theia/core/lib/common/logger';
import { Event, Emitter } from '@theia/core/lib/common/event';
import { ITree, ITreeNode } from '@theia/core/lib/browser/tree/tree';
import { TreeNodeIterator } from '@theia/core/lib/browser/tree/tree-iterator';
import { DisposableCollection } from '@theia/core/lib/common/disposable';
import { PreferenceChangeEvent } from '@theia/core/lib/browser/preferences/preference-proxy';
import { TreeDecorator, TreeDecoration } from '@theia/core/lib/browser/tree/tree-decorator';
import { Git } from '../common/git';
import { GitWatcher } from '../common/git-watcher';
import { WorkingDirectoryStatus } from '../common/git-model';
import { GitRepositoryProvider } from './git-repository-provider';
import { GitFileChange, GitFileStatus } from '../common/git-model';
import { GitPreferences, GitConfiguration } from './git-preferences';

@injectable()
export class GitDecorator implements TreeDecorator {

    readonly id = 'theia-git-decorator';

    protected readonly toDispose: DisposableCollection;
    protected readonly emitter: Emitter<(tree: ITree) => Map<string, TreeDecoration.Data>>;

    protected enabled: boolean;
    protected showColors: boolean;

    constructor(
        @inject(Git) protected readonly git: Git,
        @inject(GitRepositoryProvider) protected readonly repositoryProvider: GitRepositoryProvider,
        @inject(GitWatcher) protected readonly watcher: GitWatcher,
        @inject(GitPreferences) protected readonly preferences: GitPreferences,
        @inject(ILogger) protected readonly logger: ILogger) {
        this.emitter = new Emitter();
        this.toDispose = new DisposableCollection();
        repositoryProvider.onDidChangeRepository(async repository => {
            this.toDispose.dispose();
            if (repository) {
                this.toDispose.pushAll([
                    await this.watcher.watchGitChanges(repository),
                    this.watcher.onGitEvent(event => this.fireDidChangeDecorations((tree: ITree) => this.collectDecorators(tree, event.status)))
                ]);
            }
        });
        this.preferences.onPreferenceChanged(event => this.handlePreferenceChange(event));
        this.enabled = this.preferences['git.decorations.enabled'];
        this.showColors = this.preferences['git.decorations.colors'];
    }

    get onDidChangeDecorations(): Event<(tree: ITree) => Map<string, TreeDecoration.Data>> {
        return this.emitter.event;
    }

    protected fireDidChangeDecorations(event: (tree: ITree) => Map<string, TreeDecoration.Data>): void {
        this.emitter.fire(event);
    }

    protected collectDecorators(tree: ITree, status: WorkingDirectoryStatus): Map<string, TreeDecoration.Data> {
        const result = new Map();
        if (tree.root === undefined || !this.enabled) {
            return result;
        }
        const processNode = (treeNode: ITreeNode | undefined) => {
            if (treeNode) {
                const { id } = treeNode;
                const marker = markers.get(id);
                if (marker) {
                    result.set(id, marker);
                }
            }
        };
        const markers = this.appendContainerChanges(tree, status.changes);
        processNode(tree.root);
        const itr = new TreeNodeIterator(tree.root);
        let node = itr.next();
        while (!node.done) {
            processNode(node.value);
            node = itr.next();
        }
        return new Map(Array.from(result.values()).map(m => [m.uri, this.toDecorator(m)] as [string, TreeDecoration.Data]));
    }

    protected appendContainerChanges(tree: ITree, changes: GitFileChange[]): Map<string, GitFileChange> {
        const result: Map<string, GitFileChange> = new Map();
        // We traverse up and assign the highest Git file change status the container directory.
        // Note, instead of stopping at the WS root, we traverse up the driver root.
        // We will filter them later based on the expansion state of the tree.
        for (const [uri, change] of new Map(changes.map(m => [new URI(m.uri), m] as [URI, GitFileChange])).entries()) {
            const uriString = uri.toString();
            result.set(uriString, change);
            let parentUri: URI | undefined = uri.parent;
            while (parentUri && !parentUri.path.isRoot) {
                const parentUriString = parentUri.toString();
                const existing = result.get(parentUriString);
                if (existing === undefined || this.compare(existing, change) < 0) {
                    result.set(parentUriString, {
                        uri: parentUriString,
                        status: change.status,
                        staged: !!change.staged
                    });
                    parentUri = parentUri.parent;
                } else {
                    parentUri = undefined;
                }
            }
        }
        return result;
    }

    protected toDecorator(change: GitFileChange): TreeDecoration.Data {
        const data = GitFileStatus.toAbbreviation(change.status, change.staged);
        const color = this.getDecorationColor(change.status, change.staged);
        const tooltip = GitFileStatus.toString(change.status, change.staged);
        let decorationData: TreeDecoration.Data = {
            tailDecorations: [
                {
                    data,
                    fontData: {
                        color
                    },
                    tooltip
                }
            ]
        };
        if (this.showColors) {
            decorationData = {
                ...decorationData,
                fontData: {
                    color
                }
            };
        }
        return decorationData;
    }

    protected compare(left: GitFileChange, right: GitFileChange): number {
        return GitFileStatus.statusCompare(left.status, right.status);
    }

    protected getDecorationColor(status: GitFileStatus, staged?: boolean): string {
        switch (status) {
            case GitFileStatus.New: return !!staged ? 'var(--theia-success-color0)' : 'var(--theia-disabled-color0)';
            case GitFileStatus.Renamed: // Fall through.
            case GitFileStatus.Copied: return ' var(--theia-disabled-color0)';
            case GitFileStatus.Modified: return 'var(--theia-brand-color0)';
            case GitFileStatus.Deleted: return 'var(--theia-warn-color0)';
            case GitFileStatus.Conflicted: return 'var(--theia-error-color0)';
        }
    }

    protected async handlePreferenceChange(event: PreferenceChangeEvent<GitConfiguration>): Promise<void> {
        let refresh = false;
        const { preferenceName, newValue } = event;
        if (preferenceName === 'git.decorations.enabled') {
            const enabled = !!newValue;
            if (this.enabled !== enabled) {
                this.enabled = enabled;
                refresh = true;
            }
        }
        if (preferenceName === 'git.decorations.colors') {
            const showColors = !!newValue;
            if (this.showColors !== showColors) {
                this.showColors = showColors;
                refresh = true;
            }
        }
        const repository = this.repositoryProvider.selectedRepository;
        if (refresh && repository) {
            const status = await this.git.status(repository);
            this.fireDidChangeDecorations((tree: ITree) => this.collectDecorators(tree, status));
        }
    }

}
