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

import { enableJSDOM } from '../test/jsdom';

// The widget module transitively imports `@lumino/widgets`, which touches `document` at load time.
const disableJSDOM = enableJSDOM();

import { Container } from 'inversify';
import { expect } from 'chai';
import { ReactElement, ReactNode } from 'react';
import { CommandService } from '../../common';
import { LabelParser } from '../label-parser';
import { codicon } from '../widgets';
import { TreeViewWelcomeWidget } from './tree-view-welcome-widget';

disableJSDOM();

let labelParser: LabelParser;

before(() => {
    const container = new Container();
    container.bind(LabelParser).toSelf().inSingletonScope();
    container.bind(CommandService).toDynamicValue(() => ({
        executeCommand<T>(): Promise<T | undefined> {
            return Promise.resolve(undefined);
        }
    })).inSingletonScope();
    labelParser = container.get(LabelParser);
});

describe('TreeViewWelcomeWidget#renderLabelWithIcons', () => {

    type SpanElement = ReactElement<{ className?: string; children?: ReactNode }>;

    // Exercise the protected helper without standing up the full TreeWidget DI graph.
    function render(label: string): SpanElement[] {
        const widget = Object.create(TreeViewWelcomeWidget.prototype) as {
            labelParser: LabelParser;
            renderLabelWithIcons(label: string): SpanElement[];
        };
        widget.labelParser = labelParser;
        return widget.renderLabelWithIcons(label);
    }

    it('renders a leading $(codicon) as a codicon span and keeps the trailing text', () => {
        const nodes = render('$(robot) Launch AI Agent');
        expect(nodes).to.have.lengthOf(2);
        expect(nodes[0].props.className).to.equal(codicon('robot'));
        expect(nodes[0].props.children).to.be.undefined;
        expect(nodes[1].props.className).to.be.undefined;
        expect(nodes[1].props.children).to.equal(' Launch AI Agent');
    });

    it('renders a plain label as a single text span with no codicon', () => {
        const nodes = render('Open Documentation');
        expect(nodes).to.have.lengthOf(1);
        expect(nodes[0].props.className).to.be.undefined;
        expect(nodes[0].props.children).to.equal('Open Documentation');
    });

    it('renders multiple codicons interleaved with text', () => {
        const nodes = render('$(package) Import $(gear) Library');
        const iconNodes = nodes.filter(n => typeof n.props.className === 'string' && n.props.className.includes('codicon-'));
        expect(iconNodes).to.have.lengthOf(2);
        expect(iconNodes[0].props.className).to.equal(codicon('package'));
        expect(iconNodes[1].props.className).to.equal(codicon('gear'));
    });
});
