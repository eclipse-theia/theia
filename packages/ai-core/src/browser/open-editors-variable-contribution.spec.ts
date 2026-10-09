// *****************************************************************************
// Copyright (C) 2026 Safi Seid-Ahmad, K2view and others.
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

import { FrontendApplicationConfigProvider } from '@theia/core/lib/browser/frontend-application-config-provider';
FrontendApplicationConfigProvider.set({});

import 'reflect-metadata';

import { expect } from 'chai';
import { Container } from '@theia/core/shared/inversify';
import { Event } from '@theia/core';
import { ApplicationShell, BaseWidget, lock, Widget } from '@theia/core/lib/browser';
import { TabBar } from '@theia/core/shared/@lumino/widgets';
import URI from '@theia/core/lib/common/uri';
import { EditorManager } from '@theia/editor/lib/browser';
import { WorkspaceService } from '@theia/workspace/lib/browser';
import { OpenEditorsVariableContribution, OPEN_EDITORS_VARIABLE } from './open-editors-variable-contribution';

disableJSDOM();

interface TestEditorOptions {
    dirty?: boolean;
    readOnly?: boolean;
    preview?: boolean;
    notebookType?: string;
    viewType?: string;
}

class TestEditor extends BaseWidget {
    readonly saveable: { dirty: boolean, onDirtyChanged: Event<void> };
    readonly isPreview?: boolean;
    readonly notebookType?: string;
    readonly viewType?: string;

    constructor(protected readonly uri: string, options: TestEditorOptions = {}) {
        super();
        this.saveable = { dirty: !!options.dirty, onDirtyChanged: Event.None };
        this.isPreview = options.preview;
        this.notebookType = options.notebookType;
        this.viewType = options.viewType;
        if (options.readOnly) {
            lock(this.title);
        }
    }

    getResourceUri(): URI {
        return new URI(this.uri);
    }

    createMoveToUri(resourceUri: URI): URI {
        return resourceUri;
    }
}

const workspaceRoots = [new URI('file:///project'), new URI('memfs:///project')];

function tabBar(widgets: Widget[], current?: Widget): TabBar<Widget> {
    const titles = widgets.map(widget => widget.title);
    return { titles, currentTitle: current?.title ?? titles[0] } as unknown as TabBar<Widget>;
}

describe('OpenEditorsVariableContribution', () => {
    before(() => {
        disableJSDOM = enableJSDOM();
    });
    after(() => disableJSDOM());

    let mainAreaTabBars: TabBar<Widget>[];
    let bottomAreaTabBars: TabBar<Widget>[];
    let currentWidget: Widget | undefined;
    let textEditors: Widget[];

    const resolve = async (): Promise<string | undefined> => {
        const container = new Container();
        container.bind(ApplicationShell).toConstantValue({
            get mainAreaTabBars(): TabBar<Widget>[] { return mainAreaTabBars; },
            get bottomAreaTabBars(): TabBar<Widget>[] { return bottomAreaTabBars; },
            getCurrentWidget: (area: string) => area === 'main' ? currentWidget : undefined
        } as unknown as ApplicationShell);
        container.bind(EditorManager).toConstantValue({ get all(): Widget[] { return textEditors; } } as unknown as EditorManager);
        container.bind(WorkspaceService).toConstantValue({
            getWorkspaceRootUri: (uri: URI) => workspaceRoots.find(root => root.isEqualOrParent(uri)),
            getRootPrefixedPath: (uri: URI) => uri.path.toString().replace(/^\//, '')
        } as unknown as WorkspaceService);
        container.bind(OpenEditorsVariableContribution).toSelf();
        const result = await container.get(OpenEditorsVariableContribution).resolve({ variable: OPEN_EDITORS_VARIABLE }, {});
        return result?.value;
    };

    beforeEach(() => {
        mainAreaTabBars = [];
        bottomAreaTabBars = [];
        currentWidget = undefined;
        textEditors = [];
    });

    it('lists editors in tab order with their state', async () => {
        const index = new TestEditor('file:///project/index.ts', { dirty: true });
        const readme = new TestEditor('file:///project/README.md', { preview: true });
        const settings = new TestEditor('file:///project/settings.json', { readOnly: true });
        mainAreaTabBars = [tabBar([index, readme], index), tabBar([settings], settings)];
        currentWidget = index;

        expect(await resolve()).to.equal(
            "'project/index.ts' (active, unsaved changes), 'project/README.md' (preview), 'project/settings.json' (visible, read-only)"
        );
    });

    it('lists notebooks and custom editors with their kind', async () => {
        const notebook = new TestEditor('file:///project/analysis.ipynb', { notebookType: 'jupyter-notebook' });
        const diagram = new TestEditor('file:///project/diagram.drawio', { viewType: 'hediet.vscode-drawio' });
        mainAreaTabBars = [tabBar([notebook, diagram], diagram)];
        currentWidget = diagram;

        expect(await resolve()).to.equal("'project/analysis.ipynb' (notebook), 'project/diagram.drawio' (custom editor: hediet.vscode-drawio, active)");
    });

    it('lists an editor that is open more than once a single time', async () => {
        const left = new TestEditor('file:///project/index.ts');
        const right = new TestEditor('file:///project/index.ts', { dirty: true });
        const other = new TestEditor('file:///project/other.ts');
        mainAreaTabBars = [tabBar([left, other], other), tabBar([right], right)];
        currentWidget = other;

        expect(await resolve()).to.equal("'project/index.ts' (visible, unsaved changes), 'project/other.ts' (active)");
    });

    it('includes editors of the bottom area and editors outside of the tab bars', async () => {
        const main = new TestEditor('file:///project/main.ts');
        const bottom = new TestEditor('file:///project/bottom.ts');
        const secondaryWindow = new TestEditor('file:///project/secondary.ts');
        mainAreaTabBars = [tabBar([main])];
        bottomAreaTabBars = [tabBar([bottom])];
        textEditors = [main, secondaryWindow];

        expect(await resolve()).to.equal("'project/main.ts' (visible), 'project/bottom.ts' (visible), 'project/secondary.ts'");
    });

    it('skips widgets that are not editors of a file', async () => {
        const view = new BaseWidget();
        const diff = new TestEditor('diff:///project/a.ts');
        const revision = new TestEditor('git:///project/a.ts');
        const untitled = new TestEditor('untitled:/Untitled-1');
        const otherFileSystem = new TestEditor('memfs:///project/b.ts');
        mainAreaTabBars = [tabBar([view, diff, revision, untitled, otherFileSystem], untitled)];

        expect(await resolve()).to.equal("'Untitled-1' (visible), 'project/b.ts'");
    });

    it('resolves to an empty value when no editor is open', async () => {
        expect(await resolve()).to.equal('');
    });
});
