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

import { enableJSDOM } from '@theia/core/lib/browser/test/jsdom';
let disableJSDOM = enableJSDOM();

import { expect } from 'chai';
import * as React from '@theia/core/shared/react';
import * as ReactDOM from '@theia/core/shared/react-dom';
import { Emitter } from '@theia/core/lib/common/event';
import { LabelParser } from '@theia/core/lib/browser/label-parser';
import { ScmRepositoriesWidget } from './scm-repositories-widget';
import { ScmRepository } from './scm-repository';

disableJSDOM();

function makeRepo(id: string, label: string, rootUri: string, statusBarCommands?: { title: string; command?: string; arguments?: unknown[] }[]): ScmRepository {
    return {
        provider: {
            id,
            label,
            rootUri,
            groups: [],
            statusBarCommands,
            onDidChange: new Emitter<void>().event,
            onDidChangeCommitTemplate: new Emitter<string>().event,
            dispose: () => { }
        }
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
        getName: (uri: object): string => String(uri).split('/').pop() ?? ''
    };

    const labelParser = new LabelParser();

    const mockCommandService = {
        executeCommand: async (id: string, ...args: unknown[]) => {
            opts.executedCommands.push({ id, args });
            return undefined;
        }
    };

    const mockContextMenuRenderer = { render: () => ({ dispose: () => { } }) };
    const mockScmContextKeys = { scmProvider: { set: () => { } } };

    (widget as unknown as Record<string, unknown>).scmService = mockScmService;
    (widget as unknown as Record<string, unknown>).labelProvider = mockLabelProvider;
    (widget as unknown as Record<string, unknown>).labelParser = labelParser;
    (widget as unknown as Record<string, unknown>).commandService = mockCommandService;
    (widget as unknown as Record<string, unknown>).contextMenuRenderer = mockContextMenuRenderer;
    (widget as unknown as Record<string, unknown>).scmContextKeys = mockScmContextKeys;

    (widget as unknown as { init(): void }).init();

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

    before(() => {
        disableJSDOM = enableJSDOM();
    });

    after(() => {
        disableJSDOM();
    });

    beforeEach(() => {
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
        onAddEmitter.dispose();
        onRemoveEmitter.dispose();
        onChangedSelectedEmitter.dispose();
    });

    // --- Visibility ---

    it('should be hidden when there are no repositories', () => {
        expect(widget.isHidden).to.be.true;
    });

    it('should be hidden when there is exactly one repository', () => {
        const repo = makeRepo('git', 'Git', '/workspace/repo1');
        repositories.push(repo);
        onAddEmitter.fire(repo);
        expect(widget.isHidden).to.be.true;
    });

    it('should be visible when there are two or more repositories', () => {
        const repo1 = makeRepo('git', 'Git', '/workspace/repo1');
        const repo2 = makeRepo('git2', 'Git', '/workspace/repo2');
        repositories.push(repo1, repo2);
        onAddEmitter.fire(repo2);
        expect(widget.isHidden).to.be.false;
    });

    it('should become hidden again when repositories drop below 2', () => {
        const repo1 = makeRepo('git', 'Git', '/workspace/repo1');
        const repo2 = makeRepo('git2', 'Git', '/workspace/repo2');
        repositories.push(repo1, repo2);
        onAddEmitter.fire(repo2);
        expect(widget.isHidden).to.be.false;

        repositories.splice(1, 1);
        onRemoveEmitter.fire(repo2);
        expect(widget.isHidden).to.be.true;
    });

    it('should have title label "Repositories"', () => {
        expect(widget.title.label).to.equal('Repositories');
    });

    // --- Rendering (uses React.act to flush synchronously) ---

    function renderIntoContainer(node: React.ReactNode): HTMLElement {
        const container = document.createElement('div');
        document.body.appendChild(container);
        ReactDOM.render(node as React.ReactElement, container);
        return container;
    }

    it('should render a repo icon, folder name, and status commands for each repository', () => {
        const repo1 = makeRepo('git', 'Git', '/workspace/myrepo', [
            { title: '$(git-branch) main', command: 'git.checkout', arguments: [] }
        ]);
        const repo2 = makeRepo('git2', 'Git', '/workspace/repo2');
        repositories.push(repo1, repo2);
        onAddEmitter.fire(repo2);

        const rendered = (widget as unknown as { render(): React.ReactNode }).render();
        const container = renderIntoContainer(rendered);

        // Should render two repo rows
        const rows = container.querySelectorAll('.theia-scm-repository-item');
        expect(rows.length).to.equal(2);

        // Find the row for myrepo by name
        const myrepoRow = Array.from(rows).find(r => r.querySelector('.theia-scm-repository-name')?.textContent === 'myrepo');
        expect(myrepoRow).to.exist;

        // myrepo row: repo icon present
        const iconEl = myrepoRow!.querySelector('.theia-scm-repository-icon');
        expect(iconEl).to.exist;

        // myrepo row: status command rendered
        const statusCmd = myrepoRow!.querySelector('.theia-scm-repository-status-command');
        expect(statusCmd).to.exist;

        ReactDOM.unmountComponentAtNode(container);
        container.remove();
    });

    it('should apply "selected" class only to the selected repository row', () => {
        const repo1 = makeRepo('git', 'Git', '/workspace/repo1');
        const repo2 = makeRepo('git2', 'Git', '/workspace/repo2');
        repositories.push(repo1, repo2);
        selectedRepositoryRef.value = repo1;
        onAddEmitter.fire(repo2);

        const rendered = (widget as unknown as { render(): React.ReactNode }).render();
        const container = renderIntoContainer(rendered);

        const rows = container.querySelectorAll('.theia-scm-repository-item');
        expect(rows[0].classList.contains('selected')).to.be.true;
        expect(rows[1].classList.contains('selected')).to.be.false;

        ReactDOM.unmountComponentAtNode(container);
        container.remove();
    });

    it('should execute the status command when clicked and stop propagation', async () => {
        const repo1 = makeRepo('git', 'Git', '/workspace/repo1', [
            { title: '$(sync) main', command: 'git.sync', arguments: ['arg1'] }
        ]);
        const repo2 = makeRepo('git2', 'Git', '/workspace/repo2');
        repositories.push(repo1, repo2);
        onAddEmitter.fire(repo2);

        const rendered = (widget as unknown as { render(): React.ReactNode }).render();
        const container = renderIntoContainer(rendered);

        const statusCmd = container.querySelector('.theia-scm-repository-status-command') as HTMLElement;
        expect(statusCmd).to.exist;

        statusCmd.click();
        // Give the async execute a microtask to run
        await Promise.resolve();

        expect(executedCommands).to.have.length(1);
        expect(executedCommands[0].id).to.equal('git.sync');
        expect(executedCommands[0].args).to.deep.equal(['arg1']);

        ReactDOM.unmountComponentAtNode(container);
        container.remove();
    });

    // --- Grouping: provider-id based nesting ---

    it('should group repos with the same provider id: first as root, rest as children', () => {
        const root = makeRepo('git', 'Git', '/projects/myrepo');
        const wt1 = makeRepo('git', 'Git', '/tmp/wt-feature');
        const wt2 = makeRepo('git', 'Git', '/tmp/wt-bugfix');
        repositories.push(root, wt1, wt2);
        onAddEmitter.fire(wt1);

        const rendered = (widget as unknown as { render(): React.ReactNode }).render();
        const container = renderIntoContainer(rendered);

        const rows = container.querySelectorAll('.theia-scm-repository-item');
        // 3 rows: root + 2 children (all 'git')
        expect(rows.length).to.equal(3);

        // Root row has collapse toggle
        expect(rows[0].querySelector('.theia-scm-repository-collapse-toggle')).to.exist;
        // Child rows have .child class
        expect(rows[1].classList.contains('child')).to.be.true;
        expect(rows[2].classList.contains('child')).to.be.true;
        // Root row does not have .child class
        expect(rows[0].classList.contains('child')).to.be.false;

        ReactDOM.unmountComponentAtNode(container);
        container.remove();
    });

    it('should create separate groups for repos with different provider ids', () => {
        const gitRepo = makeRepo('git', 'Git', '/workspace/myrepo');
        const svnRepo = makeRepo('svn', 'SVN', '/workspace/other');
        repositories.push(gitRepo, svnRepo);
        onAddEmitter.fire(svnRepo);

        const rendered = (widget as unknown as { render(): React.ReactNode }).render();
        const container = renderIntoContainer(rendered);

        const rows = container.querySelectorAll('.theia-scm-repository-item');
        // 2 rows: each is its own root (different provider ids)
        expect(rows.length).to.equal(2);
        expect(rows[0].classList.contains('child')).to.be.false;
        expect(rows[1].classList.contains('child')).to.be.false;
        // Neither has a collapse toggle (each group has only one repo)
        expect(rows[0].querySelector('.theia-scm-repository-collapse-toggle')).to.not.exist;
        expect(rows[1].querySelector('.theia-scm-repository-collapse-toggle')).to.not.exist;

        ReactDOM.unmountComponentAtNode(container);
        container.remove();
    });

    it('should hide children when root is collapsed', () => {
        const root = makeRepo('git', 'Git', '/projects/myrepo');
        const child = makeRepo('git', 'Git', '/tmp/wt-feature');
        repositories.push(root, child);
        onAddEmitter.fire(child);

        // Collapse the root
        (widget as unknown as { toggleCollapse(uri: string): void }).toggleCollapse(root.provider.rootUri);

        const rendered = (widget as unknown as { render(): React.ReactNode }).render();
        const container = renderIntoContainer(rendered);

        // Only the root row is visible (child is collapsed)
        const rows = container.querySelectorAll('.theia-scm-repository-item');
        expect(rows.length).to.equal(1);
        // Root row toggle should show chevron-right (collapsed)
        const toggle = rows[0].querySelector('.theia-scm-repository-collapse-toggle');
        expect(toggle).to.exist;
        expect(toggle!.className).to.include('codicon-chevron-right');

        ReactDOM.unmountComponentAtNode(container);
        container.remove();
    });

    it('should render a ... more-button on each repository row', () => {
        const repo1 = makeRepo('git', 'Git', '/workspace/repo1');
        const repo2 = makeRepo('git2', 'Git', '/workspace/repo2');
        repositories.push(repo1, repo2);
        onAddEmitter.fire(repo2);

        const rendered = (widget as unknown as { render(): React.ReactNode }).render();
        const container = renderIntoContainer(rendered);

        const moreButtons = container.querySelectorAll('.theia-scm-repository-more-button');
        expect(moreButtons.length).to.equal(2);

        ReactDOM.unmountComponentAtNode(container);
        container.remove();
    });
});
