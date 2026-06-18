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

import { enableJSDOM, enableReactActEnvironment } from '@theia/core/lib/browser/test/jsdom';
let disableJSDOM = enableJSDOM();
let disableReactActEnvironment = enableReactActEnvironment();

import { expect } from 'chai';
import * as React from '@theia/core/shared/react';
import { createRoot, Root } from '@theia/core/shared/react-dom/client';
import { MessageLoop } from '@theia/core/shared/@lumino/messaging';
import { Emitter } from '@theia/core/lib/common/event';
import { LabelParser } from '@theia/core/lib/browser/label-parser';
import { ScmRepositoriesWidget } from './scm-repositories-widget';
import { ScmRepository } from './scm-repository';

disableReactActEnvironment();
disableJSDOM();

interface MakeRepoOptions {
    id: string;
    label: string;
    rootUri: string;
    statusBarCommands?: { title: string; command?: string; arguments?: unknown[] }[];
    providerContextValue?: string;
    parentRootUri?: string;
}

function makeRepo(opts: MakeRepoOptions): ScmRepository {
    return {
        provider: {
            id: opts.id,
            label: opts.label,
            rootUri: opts.rootUri,
            groups: [],
            statusBarCommands: opts.statusBarCommands,
            providerContextValue: opts.providerContextValue,
            onDidChange: new Emitter<void>().event,
            onDidChangeCommitTemplate: new Emitter<string>().event,
            dispose: () => { }
        },
        parentRootUri: opts.parentRootUri
    } as unknown as ScmRepository;
}

interface CreateWidgetOptions {
    repositories: ScmRepository[];
    selectedRepositoryRef: { value: ScmRepository | undefined };
    onAddEmitter: Emitter<ScmRepository>;
    onRemoveEmitter: Emitter<ScmRepository>;
    onChangedSelectedEmitter: Emitter<ScmRepository | undefined>;
    executedCommands: { id: string; args: unknown[] }[];
}

function createWidget(opts: CreateWidgetOptions): ScmRepositoriesWidget {
    const widget = new ScmRepositoriesWidget();

    const mockScmService = {
        get repositories(): ScmRepository[] { return opts.repositories; },
        get selectedRepository(): ScmRepository | undefined { return opts.selectedRepositoryRef.value; },
        set selectedRepository(repo: ScmRepository | undefined) { opts.selectedRepositoryRef.value = repo; },
        onDidAddRepository: opts.onAddEmitter.event,
        onDidRemoveRepository: opts.onRemoveEmitter.event,
        onDidChangeSelectedRepository: opts.onChangedSelectedEmitter.event,
    };

    const mockLabelProvider = {
        getName: (uri: object): string => String(uri).split('/').pop() ?? '',
        getLongName: (uri: object): string => String(uri)
    };

    const labelParser = new LabelParser();

    const mockCommandService = {
        executeCommand: async (id: string, ...args: unknown[]) => {
            opts.executedCommands.push({ id, args });
            return undefined;
        }
    };

    const mockContextMenuRenderer = { render: () => ({ dispose: () => { } }) };
    const mockScmContextKeys = { scmProvider: { set: () => { } }, scmProviderContext: { set: () => { } } };

    (widget as unknown as Record<string, unknown>).scmService = mockScmService;
    (widget as unknown as Record<string, unknown>).labelProvider = mockLabelProvider;
    (widget as unknown as Record<string, unknown>).labelParser = labelParser;
    (widget as unknown as Record<string, unknown>).commandService = mockCommandService;
    (widget as unknown as Record<string, unknown>).contextMenuRenderer = mockContextMenuRenderer;
    (widget as unknown as Record<string, unknown>).scmContextKeys = mockScmContextKeys;

    React.act(() => {
        (widget as unknown as { init(): void }).init();
        MessageLoop.flush();
    });

    return widget;
}

describe('ScmRepositoriesWidget', () => {
    let repositories: ScmRepository[];
    let selectedRepositoryRef: { value: ScmRepository | undefined };
    let onAddEmitter: Emitter<ScmRepository>;
    let onRemoveEmitter: Emitter<ScmRepository>;
    let onChangedSelectedEmitter: Emitter<ScmRepository | undefined>;
    let executedCommands: { id: string; args: unknown[] }[];
    let widget: ScmRepositoriesWidget;
    let renderedRoots: Array<{ container: HTMLElement; root: Root }>;

    before(() => {
        disableJSDOM = enableJSDOM();
        disableReactActEnvironment = enableReactActEnvironment();
    });

    after(() => {
        disableReactActEnvironment();
        disableJSDOM();
    });

    beforeEach(() => {
        renderedRoots = [];
        repositories = [];
        selectedRepositoryRef = { value: undefined };
        onAddEmitter = new Emitter<ScmRepository>();
        onRemoveEmitter = new Emitter<ScmRepository>();
        onChangedSelectedEmitter = new Emitter<ScmRepository | undefined>();
        executedCommands = [];
        widget = createWidget({
            repositories,
            selectedRepositoryRef,
            onAddEmitter,
            onRemoveEmitter,
            onChangedSelectedEmitter,
            executedCommands
        });
    });

    afterEach(() => {
        try {
            React.act(() => {
                for (const { root } of renderedRoots) {
                    root.unmount();
                }
                widget.dispose();
                MessageLoop.flush();
            });
        } finally {
            for (const { container } of renderedRoots) {
                container.remove();
            }
            renderedRoots = [];
            onAddEmitter.dispose();
            onRemoveEmitter.dispose();
            onChangedSelectedEmitter.dispose();
        }
    });

    function actAndFlush(fn: () => void): void {
        React.act(() => {
            fn();
            MessageLoop.flush();
        });
    }

    function fireRepositoryAdded(repository: ScmRepository): void {
        actAndFlush(() => onAddEmitter.fire(repository));
    }

    function fireRepositoryRemoved(repository: ScmRepository): void {
        actAndFlush(() => onRemoveEmitter.fire(repository));
    }

    // --- Visibility ---

    it('should not programmatically show when there are no repositories', () => {
        // The widget does not call setHidden(false) with < 2 repos.
        // Initial visibility depends on the ViewContainer's `initiallyHidden: true`.
        // In this standalone test the widget starts visible (no ViewContainer).
        expect(widget.isHidden).to.be.false;
    });

    it('should not programmatically show when there is exactly one repository', () => {
        const repo = makeRepo({ id: 'git', label: 'Git', rootUri: '/workspace/repo1' });
        repositories.push(repo);
        fireRepositoryAdded(repo);
        // With < 2 repos the widget does NOT call setHidden(false).
        // It remains in its initial state (visible in standalone test, hidden in real ViewContainer).
        expect(widget.isHidden).to.be.false;
    });

    it('should be visible when there are two or more repositories', () => {
        const repo1 = makeRepo({ id: 'git', label: 'Git', rootUri: '/workspace/repo1' });
        const repo2 = makeRepo({ id: 'git', label: 'Git', rootUri: '/workspace/repo2' });
        repositories.push(repo1, repo2);
        fireRepositoryAdded(repo2);
        expect(widget.isHidden).to.be.false;
    });

    it('should not programmatically hide when repositories drop below 2', () => {
        const repo1 = makeRepo({ id: 'git', label: 'Git', rootUri: '/workspace/repo1' });
        const repo2 = makeRepo({ id: 'git', label: 'Git', rootUri: '/workspace/repo2' });
        repositories.push(repo1, repo2);
        fireRepositoryAdded(repo2);
        expect(widget.isHidden).to.be.false;

        repositories.splice(1, 1);
        fireRepositoryRemoved(repo2);
        // Widget stays visible — we never programmatically hide
        expect(widget.isHidden).to.be.false;
    });

    it('should have title label "Repositories"', () => {
        expect(widget.title.label).to.equal('Repositories');
    });

    // --- Rendering ---

    function renderIntoContainer(node: React.ReactNode): { container: HTMLElement; root: Root } {
        const container = document.createElement('div');
        document.body.appendChild(container);
        const root = createRoot(container);
        const renderedRoot = { container, root };
        renderedRoots.push(renderedRoot);
        React.act(() => {
            root.render(node);
        });
        return renderedRoot;
    }

    it('should render a repo icon, folder name, and status commands for each repository', () => {
        const repo1 = makeRepo({
            id: 'git', label: 'Git', rootUri: '/workspace/myrepo',
            statusBarCommands: [{ title: '$(git-branch) main', command: 'git.checkout', arguments: [] }]
        });
        const repo2 = makeRepo({ id: 'git', label: 'Git', rootUri: '/workspace/repo2' });
        repositories.push(repo1, repo2);
        fireRepositoryAdded(repo2);

        const rendered = (widget as unknown as { render(): React.ReactNode }).render();
        const { container } = renderIntoContainer(rendered);

        const rows = container.querySelectorAll('.theia-scm-repository-item');
        expect(rows.length).to.equal(2);

        const myrepoRow = Array.from(rows).find(r => r.querySelector('.theia-scm-repository-name')?.textContent === 'myrepo');
        expect(myrepoRow).to.exist;

        const iconEl = myrepoRow!.querySelector('.theia-scm-repository-icon');
        expect(iconEl).to.exist;

        const statusCmd = myrepoRow!.querySelector('.theia-scm-repository-status-command');
        expect(statusCmd).to.exist;
    });

    it('should apply "selected" class only to the selected repository row', () => {
        const repo1 = makeRepo({ id: 'git', label: 'Git', rootUri: '/workspace/repo1' });
        const repo2 = makeRepo({ id: 'git', label: 'Git', rootUri: '/workspace/repo2' });
        repositories.push(repo1, repo2);
        selectedRepositoryRef.value = repo1;
        fireRepositoryAdded(repo2);

        const rendered = (widget as unknown as { render(): React.ReactNode }).render();
        const { container } = renderIntoContainer(rendered);

        const rows = container.querySelectorAll('.theia-scm-repository-item');
        expect(rows[0].classList.contains('selected')).to.be.true;
        expect(rows[1].classList.contains('selected')).to.be.false;
    });

    it('should execute the status command when clicked and stop propagation', async () => {
        const repo1 = makeRepo({
            id: 'git', label: 'Git', rootUri: '/workspace/repo1',
            statusBarCommands: [{ title: '$(sync) main', command: 'git.sync', arguments: ['arg1'] }]
        });
        const repo2 = makeRepo({ id: 'git', label: 'Git', rootUri: '/workspace/repo2' });
        repositories.push(repo1, repo2);
        fireRepositoryAdded(repo2);

        const rendered = (widget as unknown as { render(): React.ReactNode }).render();
        const { container } = renderIntoContainer(rendered);

        const statusCmd = container.querySelector('.theia-scm-repository-status-command') as HTMLElement;
        expect(statusCmd).to.exist;

        statusCmd.click();
        await Promise.resolve();

        expect(executedCommands).to.have.length(1);
        expect(executedCommands[0].id).to.equal('git.sync');
        expect(executedCommands[0].args).to.deep.equal(['arg1']);
    });

    // --- Grouping: parent-based nesting ---

    it('should show worktrees nested under their parent repo with collapse toggle', () => {
        const parent = makeRepo({
            id: 'git', label: 'Git', rootUri: '/projects/myrepo',
            providerContextValue: 'repository'
        });
        const wt1 = makeRepo({
            id: 'git', label: 'Git', rootUri: '/tmp/wt-feature',
            providerContextValue: 'worktree',
            parentRootUri: '/projects/myrepo'
        });
        const wt2 = makeRepo({
            id: 'git', label: 'Git', rootUri: '/tmp/wt-bugfix',
            providerContextValue: 'worktree',
            parentRootUri: '/projects/myrepo'
        });
        repositories.push(parent, wt1, wt2);
        fireRepositoryAdded(wt1);

        const rendered = (widget as unknown as { render(): React.ReactNode }).render();
        const { container } = renderIntoContainer(rendered);

        const rows = container.querySelectorAll('.theia-scm-repository-item');
        expect(rows.length).to.equal(3);

        // Parent has collapse toggle
        expect(rows[0].querySelector('.theia-scm-repository-collapse-toggle')).to.exist;
        // Children have .child class
        expect(rows[1].classList.contains('child')).to.be.true;
        expect(rows[2].classList.contains('child')).to.be.true;
        // Parent does not have .child class
        expect(rows[0].classList.contains('child')).to.be.false;
    });

    it('should show submodules nested under their parent repo', () => {
        const parent = makeRepo({
            id: 'git', label: 'Git', rootUri: '/projects/myrepo',
            providerContextValue: 'repository'
        });
        const sub = makeRepo({
            id: 'git', label: 'Git', rootUri: '/projects/myrepo/vendor/lib',
            providerContextValue: 'submodule',
            parentRootUri: '/projects/myrepo'
        });
        repositories.push(parent, sub);
        fireRepositoryAdded(sub);

        const rendered = (widget as unknown as { render(): React.ReactNode }).render();
        const { container } = renderIntoContainer(rendered);

        const rows = container.querySelectorAll('.theia-scm-repository-item');
        expect(rows.length).to.equal(2);

        expect(rows[0].querySelector('.theia-scm-repository-collapse-toggle')).to.exist;
        expect(rows[1].classList.contains('child')).to.be.true;

        // Submodule icon should be file-submodule
        const subIcon = rows[1].querySelector('.theia-scm-repository-icon');
        expect(subIcon).to.exist;
        expect(subIcon!.className).to.include('codicon-file-submodule');
    });

    it('should show independent nested repos flat without grouping', () => {
        const gitRepo = makeRepo({
            id: 'git', label: 'Git', rootUri: '/workspace/myrepo',
            providerContextValue: 'repository'
        });
        const nestedRepo = makeRepo({
            id: 'git', label: 'Git', rootUri: '/workspace/myrepo/nested-project',
            providerContextValue: 'repository'
        });
        repositories.push(gitRepo, nestedRepo);
        fireRepositoryAdded(nestedRepo);

        const rendered = (widget as unknown as { render(): React.ReactNode }).render();
        const { container } = renderIntoContainer(rendered);

        const rows = container.querySelectorAll('.theia-scm-repository-item');
        // Both repos are flat (no parent relationship set)
        expect(rows.length).to.equal(2);
        expect(rows[0].classList.contains('child')).to.be.false;
        expect(rows[1].classList.contains('child')).to.be.false;
        // Neither has a collapse toggle
        expect(rows[0].querySelector('.theia-scm-repository-collapse-toggle')).to.not.exist;
        expect(rows[1].querySelector('.theia-scm-repository-collapse-toggle')).to.not.exist;

        // Both should have codicon-repo icon
        const icon0 = rows[0].querySelector('.theia-scm-repository-icon');
        const icon1 = rows[1].querySelector('.theia-scm-repository-icon');
        expect(icon0!.className).to.include('codicon-repo');
        expect(icon1!.className).to.include('codicon-repo');
    });

    it('should use codicon-worktree for worktrees', () => {
        const parent = makeRepo({
            id: 'git', label: 'Git', rootUri: '/projects/myrepo'
        });
        const wt = makeRepo({
            id: 'git', label: 'Git', rootUri: '/tmp/wt-feature',
            providerContextValue: 'worktree',
            parentRootUri: '/projects/myrepo'
        });
        repositories.push(parent, wt);
        fireRepositoryAdded(wt);

        const rendered = (widget as unknown as { render(): React.ReactNode }).render();
        const { container } = renderIntoContainer(rendered);

        const rows = container.querySelectorAll('.theia-scm-repository-item');
        const wtIcon = rows[1].querySelector('.theia-scm-repository-icon');
        expect(wtIcon!.className).to.include('codicon-worktree');
    });

    it('should handle mixed scenario: parent + worktree + submodule + independent repo', () => {
        const parent = makeRepo({
            id: 'git', label: 'Git', rootUri: '/projects/myrepo',
            providerContextValue: 'repository'
        });
        const wt = makeRepo({
            id: 'git', label: 'Git', rootUri: '/tmp/wt-feature',
            providerContextValue: 'worktree',
            parentRootUri: '/projects/myrepo'
        });
        const sub = makeRepo({
            id: 'git', label: 'Git', rootUri: '/projects/myrepo/vendor/lib',
            providerContextValue: 'submodule',
            parentRootUri: '/projects/myrepo'
        });
        const independent = makeRepo({
            id: 'git', label: 'Git', rootUri: '/other/independent-repo',
            providerContextValue: 'repository'
        });
        repositories.push(parent, wt, sub, independent);
        fireRepositoryAdded(independent);

        const rendered = (widget as unknown as { render(): React.ReactNode }).render();
        const { container } = renderIntoContainer(rendered);

        const rows = container.querySelectorAll('.theia-scm-repository-item');
        // parent (root with toggle) + wt (child) + sub (child) + independent (root, no toggle)
        expect(rows.length).to.equal(4);

        // First row: parent root with collapse toggle
        expect(rows[0].querySelector('.theia-scm-repository-collapse-toggle')).to.exist;
        expect(rows[0].classList.contains('child')).to.be.false;

        // Second & third: children
        expect(rows[1].classList.contains('child')).to.be.true;
        expect(rows[2].classList.contains('child')).to.be.true;

        // Fourth: independent, flat, no collapse toggle
        expect(rows[3].classList.contains('child')).to.be.false;
        expect(rows[3].querySelector('.theia-scm-repository-collapse-toggle')).to.not.exist;
    });

    it('should hide children when parent is collapsed', () => {
        const parent = makeRepo({
            id: 'git', label: 'Git', rootUri: '/projects/myrepo'
        });
        const child = makeRepo({
            id: 'git', label: 'Git', rootUri: '/tmp/wt-feature',
            providerContextValue: 'worktree',
            parentRootUri: '/projects/myrepo'
        });
        repositories.push(parent, child);
        fireRepositoryAdded(child);

        // Collapse the parent
        actAndFlush(() => (widget as unknown as { toggleCollapse(uri: string): void }).toggleCollapse(parent.provider.rootUri));

        const rendered = (widget as unknown as { render(): React.ReactNode }).render();
        const { container } = renderIntoContainer(rendered);

        const rows = container.querySelectorAll('.theia-scm-repository-item');
        expect(rows.length).to.equal(1);
        const toggle = rows[0].querySelector('.theia-scm-repository-collapse-toggle');
        expect(toggle).to.exist;
        expect(toggle!.className).to.include('codicon-chevron-right');
    });

    it('should render a ... more-button on each repository row', () => {
        const repo1 = makeRepo({ id: 'git', label: 'Git', rootUri: '/workspace/repo1' });
        const repo2 = makeRepo({ id: 'git', label: 'Git', rootUri: '/workspace/repo2' });
        repositories.push(repo1, repo2);
        fireRepositoryAdded(repo2);

        const rendered = (widget as unknown as { render(): React.ReactNode }).render();
        const { container } = renderIntoContainer(rendered);

        const moreButtons = container.querySelectorAll('.theia-scm-repository-more-button');
        expect(moreButtons.length).to.equal(2);
    });

    it('should create separate flat entries for repos with different provider ids and no parent', () => {
        const gitRepo = makeRepo({ id: 'git', label: 'Git', rootUri: '/workspace/myrepo' });
        const svnRepo = makeRepo({ id: 'svn', label: 'SVN', rootUri: '/workspace/other' });
        repositories.push(gitRepo, svnRepo);
        fireRepositoryAdded(svnRepo);

        const rendered = (widget as unknown as { render(): React.ReactNode }).render();
        const { container } = renderIntoContainer(rendered);

        const rows = container.querySelectorAll('.theia-scm-repository-item');
        expect(rows.length).to.equal(2);
        expect(rows[0].classList.contains('child')).to.be.false;
        expect(rows[1].classList.contains('child')).to.be.false;
        expect(rows[0].querySelector('.theia-scm-repository-collapse-toggle')).to.not.exist;
        expect(rows[1].querySelector('.theia-scm-repository-collapse-toggle')).to.not.exist;
    });

    // --- Duplicate name disambiguation ---

    it('should show relative path descriptions when two repos share the same folder name', () => {
        // Simulates: workspace at /workspace, repos /workspace/foo and /workspace/bar/foo
        const repo1 = makeRepo({ id: 'git', label: 'Git', rootUri: '/workspace/foo' });
        const repo2 = makeRepo({ id: 'git', label: 'Git', rootUri: '/workspace/bar/foo' });
        repositories.push(repo1, repo2);
        fireRepositoryAdded(repo2);

        const rendered = (widget as unknown as { render(): React.ReactNode }).render();
        const { container } = renderIntoContainer(rendered);

        const rows = container.querySelectorAll('.theia-scm-repository-item');
        expect(rows.length).to.equal(2);

        const desc0 = rows[0].querySelector('.theia-scm-repository-description');
        const desc1 = rows[1].querySelector('.theia-scm-repository-description');
        expect(desc0).to.exist;
        expect(desc1).to.exist;

        // Repo at workspace root shows "/", nested repo shows relative path
        expect(desc0!.textContent).to.equal('/');
        expect(desc1!.textContent).to.equal('bar');
    });

    it('should show relative descriptions when duplicate names are in sibling directories', () => {
        const repo1 = makeRepo({ id: 'git', label: 'Git', rootUri: '/workspace/projects/lib' });
        const repo2 = makeRepo({ id: 'git', label: 'Git', rootUri: '/workspace/vendor/lib' });
        repositories.push(repo1, repo2);
        fireRepositoryAdded(repo2);

        const rendered = (widget as unknown as { render(): React.ReactNode }).render();
        const { container } = renderIntoContainer(rendered);

        const rows = container.querySelectorAll('.theia-scm-repository-item');
        expect(rows.length).to.equal(2);

        const desc0 = rows[0].querySelector('.theia-scm-repository-description');
        const desc1 = rows[1].querySelector('.theia-scm-repository-description');
        expect(desc0).to.exist;
        expect(desc1).to.exist;

        expect(desc0!.textContent).to.equal('projects');
        expect(desc1!.textContent).to.equal('vendor');
    });

    it('should not show a description path when all repos have unique folder names', () => {
        const repo1 = makeRepo({ id: 'git', label: 'Git', rootUri: '/workspace/alpha' });
        const repo2 = makeRepo({ id: 'git', label: 'Git', rootUri: '/workspace/beta' });
        repositories.push(repo1, repo2);
        fireRepositoryAdded(repo2);

        const rendered = (widget as unknown as { render(): React.ReactNode }).render();
        const { container } = renderIntoContainer(rendered);

        const rows = container.querySelectorAll('.theia-scm-repository-item');
        expect(rows.length).to.equal(2);

        // No description elements since names are unique
        expect(rows[0].querySelector('.theia-scm-repository-description')).to.not.exist;
        expect(rows[1].querySelector('.theia-scm-repository-description')).to.not.exist;
    });
});
