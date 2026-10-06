// *****************************************************************************
// Copyright (C) 2026 EclipseSource and others.
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

const disableJSDOM = enableJSDOM();
// xterm.js is loaded transitively by the command contribution and probes canvas
// support at module-load time. These tests do not render a terminal.
const canvasProto = (globalThis as { HTMLCanvasElement?: { prototype: { getContext?: unknown } } }).HTMLCanvasElement?.prototype;
if (canvasProto) {
    canvasProto.getContext = () => undefined;
}

import { FrontendApplicationConfigProvider } from '@theia/core/lib/browser/frontend-application-config-provider';
FrontendApplicationConfigProvider.set({});

import { expect } from 'chai';
import * as sinon from 'sinon';
import { CommandRegistry, InMemoryTextResource, URI } from '@theia/core';
import { MultiDiffEditorUri } from '@theia/scm/lib/browser/multi-diff-editor/multi-diff-editor-uri';
import { EditorGroupNavigationRect, PluginVscodeCommandsContribution } from './plugin-vscode-commands-contribution';

after(() => disableJSDOM());

function rect(left: number, top: number, width: number, height: number): EditorGroupNavigationRect {
    return { left, top, right: left + width, bottom: top + height, width, height };
}

describe('PluginVscodeCommandsContribution', () => {
    const contribution = new PluginVscodeCommandsContribution();

    describe('_workbench.openMultiDiffEditor', () => {
        it('should keep modified, added and deleted resources and supply empty missing sides', async () => {
            const open = sinon.stub().resolves();
            Object.assign(contribution, { openerService: { getOpener: async () => ({ open }) } });
            const commands = new CommandRegistry({ getContributions: () => [] });
            contribution.registerCommands(commands);
            const originalUri = new URI('git:///workspace/file.ts?HEAD~1').toComponents();
            const modifiedUri = new URI('file:///workspace/file.ts').toComponents();
            await commands.executeCommand('_workbench.openMultiDiffEditor', {
                title: 'Commit Changes',
                resources: [{ originalUri, modifiedUri }, { modifiedUri }, { originalUri }, {}],
                reveal: { modifiedUri }
            });
            expect(open.calledOnce).to.be.true;
            const data = MultiDiffEditorUri.decode(open.firstCall.args[0]);
            expect(data.title).to.equal('Commit Changes');
            expect(data.resources).to.have.length(3);
            expect(data.resources[0].originalUri.toString()).to.equal(URI.fromComponents(originalUri).toString());
            expect(data.resources[0].modifiedUri.toString()).to.equal(URI.fromComponents(modifiedUri).toString());
            for (const emptyUri of [data.resources[1].originalUri, data.resources[2].modifiedUri]) {
                const resource = new InMemoryTextResource(emptyUri);
                expect(resource.readOnly).to.be.true;
                expect(await resource.readContents()).to.equal('');
                expect(emptyUri.path.toString()).to.equal('/workspace/file.ts');
            }
            expect(data.resources[1].modifiedUri.toString()).to.equal(URI.fromComponents(modifiedUri).toString());
            expect(data.resources[2].originalUri.toString()).to.equal(URI.fromComponents(originalUri).toString());
            expect(open.firstCall.args[1].reveal.toString()).to.equal(URI.fromComponents(modifiedUri).toString());
        });
    });

    describe('findClosestEditorGroup', () => {
        it('prefers the orthogonally-overlapping group when navigating up out of a split column', () => {
            const left = rect(0, 0, 50, 100);
            const upperRight = rect(50, 0, 50, 50);
            const lowerRight = rect(50, 50, 50, 50);
            expect(contribution['findClosestEditorGroup'](lowerRight, [left, upperRight], 'up')).to.equal(1);
        });

        it('navigates between columns in a 2x2 grid without skipping', () => {
            const topLeft = rect(0, 0, 50, 50);
            const topRight = rect(50, 0, 50, 50);
            const bottomLeft = rect(0, 50, 50, 50);
            const bottomRight = rect(50, 50, 50, 50);
            const candidates = [topRight, bottomLeft, bottomRight];
            expect(contribution['findClosestEditorGroup'](topLeft, candidates, 'right')).to.equal(0);
            expect(contribution['findClosestEditorGroup'](topLeft, candidates, 'down')).to.equal(1);
        });

        it('returns -1 when no candidate lies in the requested direction', () => {
            const left = rect(0, 0, 50, 100);
            const right = rect(50, 0, 50, 100);
            expect(contribution['findClosestEditorGroup'](left, [right], 'left')).to.equal(-1);
            expect(contribution['findClosestEditorGroup'](left, [right], 'up')).to.equal(-1);
            expect(contribution['findClosestEditorGroup'](left, [], 'right')).to.equal(-1);
        });
    });
});
