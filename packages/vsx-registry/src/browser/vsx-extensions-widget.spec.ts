// *****************************************************************************
// Copyright (C) 2026 EclipseSource GmbH.
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

import { FrontendApplicationConfigProvider } from '@theia/core/lib/browser/frontend-application-config-provider';
import { enableJSDOM } from '@theia/core/lib/browser/test/jsdom';
const disableJSDOM = enableJSDOM();
// xterm.js (pulled in transitively via plugin-ext from VSXExtensionsModel) calls
// HTMLCanvasElement.prototype.getContext at module-load time. JSDOM's default impl
// throws 'Not implemented' without the optional `canvas` package; replace it with a
// no-op so the module graph evaluates. The tests below never render xterm itself.
const canvasProto = (globalThis as { HTMLCanvasElement?: { prototype: { getContext?: unknown } } }).HTMLCanvasElement?.prototype;
if (canvasProto) {
    canvasProto.getContext = () => undefined;
}
try { FrontendApplicationConfigProvider.set({}); } catch { /* already set by a sibling spec */ }

import { expect } from 'chai';
import { Container } from '@theia/core/shared/inversify';
import { Disposable, Event, ILogger, SelectionService } from '@theia/core';
import { MockLogger } from '@theia/core/lib/common/test/mock-logger';
import { ContextMenuRenderer, LabelProvider } from '@theia/core/lib/browser';
import { CorePreferences } from '@theia/core/lib/common/core-preferences';
import { PreferenceService } from '@theia/core/lib/common/preferences/preference-service';
import { SourceTreeWidget, TreeElement, TreeSource } from '@theia/core/lib/browser/source-tree';
import { VSXExtensionsSource, VSXExtensionsSourceOptions } from './vsx-extensions-source';
import { VSXExtensionsWidget, VSXExtensionsWidgetOptions } from './vsx-extensions-widget';

after(() => disableJSDOM());

/**
 * Stands in for `VSXExtensionsSource`: yields a controllable set of elements and never fires a
 * change event of its own unless a test asks for one.
 */
class StubSource extends TreeSource {
    elements: TreeElement[] = [];
    override async getElements(): Promise<IterableIterator<TreeElement>> {
        return this.elements.values();
    }
    change(): void {
        this.fireDidChange();
    }
}

function makeElement(id: string): TreeElement {
    return { id, render: () => undefined };
}

function createWidget(source: TreeSource, id: string): VSXExtensionsWidget {
    const parent = new Container();
    parent.bind(ILogger).to(MockLogger).inSingletonScope();
    parent.bind(SelectionService).toSelf().inSingletonScope();
    parent.bind(PreferenceService).toConstantValue({
        get: <T>(_preferenceName: string, defaultValue?: T) => defaultValue,
        onPreferenceChanged: () => Disposable.NULL
    } as unknown as PreferenceService);
    parent.bind(CorePreferences).toConstantValue({
        onPreferenceChanged: () => Disposable.NULL
    } as unknown as CorePreferences);
    parent.bind(LabelProvider).toConstantValue({ onDidChange: Event.None } as unknown as LabelProvider);
    parent.bind(ContextMenuRenderer).toConstantValue({} as ContextMenuRenderer);

    // Mirrors `VSXExtensionsWidget.createWidget`, with the source replaced by the stub.
    const child = SourceTreeWidget.createContainer(parent, {
        virtualized: false,
        scrollIfActive: true
    });
    const options = { id };
    child.bind(VSXExtensionsSourceOptions).toConstantValue(options);
    child.bind(VSXExtensionsSource).toConstantValue(source as VSXExtensionsSource);
    child.unbind(SourceTreeWidget);
    child.bind(VSXExtensionsWidgetOptions).toConstantValue(options);
    child.bind(VSXExtensionsWidget).toSelf();
    return child.get(VSXExtensionsWidget);
}

/** Waits for the tree to resolve, i.e. until `condition` holds or the attempts run out. */
async function waitFor(condition: () => boolean, attempts = 100): Promise<void> {
    for (let i = 0; i < attempts && !condition(); i++) {
        await new Promise<void>(resolve => setTimeout(resolve, 1));
    }
}

describe('VSXExtensionsWidget badge', () => {

    it('counts the entries without waiting for a source change event', async () => {
        // Regression test: the source fires its initial change while the widget is still being
        // constructed, so a badge that is only assigned from that event stays unset for sections
        // whose contributions never change again - which is what happens when the application
        // starts offline and the registry-backed contributions fail without firing.
        const source = new StubSource();
        source.elements = [makeElement('a'), makeElement('b')];

        const widget = createWidget(source, VSXExtensionsSourceOptions.INSTALLED);
        await waitFor(() => widget.badge === 2);

        expect(widget.badge).to.equal(2);
        widget.dispose();
    });

    it('updates the count when the source changes', async () => {
        const source = new StubSource();
        source.elements = [makeElement('a')];
        const widget = createWidget(source, VSXExtensionsSourceOptions.BUILT_IN);
        await waitFor(() => widget.badge === 1);

        source.elements = [makeElement('a'), makeElement('b'), makeElement('c')];
        source.change();
        await waitFor(() => widget.badge === 3);

        expect(widget.badge).to.equal(3);
        widget.dispose();
    });

    it('leaves the badge unset for the search result section', async () => {
        const source = new StubSource();
        source.elements = [makeElement('a'), makeElement('b')];

        const widget = createWidget(source, VSXExtensionsSourceOptions.SEARCH_RESULT);
        await waitFor(() => false, 10);

        expect(widget.badge).to.equal(undefined);
        widget.dispose();
    });
});
