// *****************************************************************************
// Copyright (C) 2026 Vinay Kaushal and others.
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

import { enableJSDOM } from './test/jsdom';
let disableJSDOM = enableJSDOM();

import { expect } from 'chai';
import { ContributionProvider } from '../common';
import { StatusBar } from './status-bar';
import { Widget } from './widgets';
import { WidgetStatusBarContribution, WidgetStatusBarService } from './widget-status-bar-service';

disableJSDOM();

class HandledWidget extends Widget { }

class TestWidgetStatusBarContribution implements WidgetStatusBarContribution<HandledWidget> {
    active: HandledWidget | undefined;
    canHandle(widget: Widget): widget is HandledWidget {
        return widget instanceof HandledWidget;
    }
    activate(statusBar: StatusBar, widget: HandledWidget): void {
        this.active = widget;
    }
    deactivate(statusBar: StatusBar): void {
        this.active = undefined;
    }
}

class TestWidgetStatusBarService extends WidgetStatusBarService {
    override show(widget: Widget): void {
        super.show(widget);
    }
}

describe('WidgetStatusBarService', () => {

    let contribution: TestWidgetStatusBarContribution;
    let service: TestWidgetStatusBarService;

    before(() => disableJSDOM = enableJSDOM());
    after(() => disableJSDOM());

    beforeEach(() => {
        contribution = new TestWidgetStatusBarContribution();
        service = new TestWidgetStatusBarService();
        const contributionProvider: ContributionProvider<WidgetStatusBarContribution<Widget>> = {
            getContributions: () => [contribution]
        };
        Object.assign(service, { contributionProvider, statusBar: {} });
    });

    it('activates the contributions that handle the current widget', () => {
        const widget = new HandledWidget();
        service.show(widget);
        expect(contribution.active).to.equal(widget);
    });

    it('keeps the status bar as is for a widget no contribution handles', () => {
        const widget = new HandledWidget();
        service.show(widget);
        service.show(new Widget());
        expect(contribution.active).to.equal(widget);
    });

    it('deactivates the contributions when the shown widget is disposed', () => {
        const widget = new HandledWidget();
        service.show(widget);
        service.show(new Widget());
        widget.dispose();
        expect(contribution.active).to.be.undefined;
    });

    it('ignores the disposal of a widget that is no longer shown', () => {
        const first = new HandledWidget();
        const second = new HandledWidget();
        service.show(first);
        service.show(second);
        first.dispose();
        expect(contribution.active).to.equal(second);
    });
});
