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

import { enableJSDOM } from '../test/jsdom';
let disableJSDOM = enableJSDOM();

import { expect } from 'chai';
import * as React from 'react';
import * as sinon from 'sinon';
import * as browser from '../browser';
import { SelectComponent, SelectOption } from './select-component';

disableJSDOM();

class TestSelectComponent extends SelectComponent {
    dropdown(): React.ReactElement<{ style: React.CSSProperties }> {
        this.state = { ...this.state, dimensions: new DOMRect(20, 20, 90, 23) };
        return this.renderDropdown() as React.ReactElement<{ style: React.CSSProperties }>;
    }
}

describe('SelectComponent dropdown width', () => {
    let component: TestSelectComponent;
    let textWidth: sinon.SinonStub;

    before(() => disableJSDOM = enableJSDOM());
    after(() => disableJSDOM());

    beforeEach(() => {
        textWidth = sinon.stub(browser, 'measureTextWidth').returns(84);
        sinon.stub(document.documentElement, 'getBoundingClientRect').returns(new DOMRect(0, 0, 800, 600));
    });

    afterEach(() => {
        component.componentWillUnmount();
        sinon.restore();
    });

    function dropdown(options: SelectOption[], alignment?: 'left' | 'right'): React.ReactElement<{ style: React.CSSProperties }> {
        component = new TestSelectComponent({ options, alignment });
        return component.dropdown();
    }

    it('keeps label-based sizing when no option has a description', () => {
        expect(dropdown([{ label: 'Off' }, { label: 'None', description: '' }]).props.style.width).to.equal(100);
    });

    it('reserves readable space even when only an unselected option has a description', () => {
        expect(dropdown([{ label: 'Auto' }, { label: 'Off', description: 'Uses provider defaults.' }]).props.style.width).to.equal(300);
    });

    it('keeps enough space for labels wider than the description minimum', () => {
        textWidth.returns(384);
        expect(dropdown([{ label: 'A long label', description: 'Description' }]).props.style.width).to.equal(400);
    });

    it('caps the description width at the available space for either alignment', () => {
        (document.documentElement.getBoundingClientRect as sinon.SinonStub).returns(new DOMRect(0, 0, 200, 600));
        const options = [{ label: 'Off', description: 'Uses provider defaults.' }];
        expect(dropdown(options).props.style.width).to.equal(180);
        component.componentWillUnmount();
        expect(dropdown(options, 'right').props.style.width).to.equal(110);
    });
});
