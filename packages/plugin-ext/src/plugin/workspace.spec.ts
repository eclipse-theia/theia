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

import * as chai from 'chai';
import { Emitter, Event } from '@theia/core/lib/common/event';

const expect = chai.expect;

/**
 * Tests the workspace trust event logic extracted from WorkspaceExtImpl.
 * This tests the core logic independently of the full WorkspaceExtImpl class
 * to avoid heavy dependency requirements.
 */
describe('WorkspaceExtImpl trust change logic', () => {
    // Extracted trust change logic for isolated testing
    class TrustChangeHandler {
        private _trusted?: boolean = undefined;
        private didGrantWorkspaceTrustEmitter = new Emitter<void>();
        readonly onDidGrantWorkspaceTrust: Event<void> = this.didGrantWorkspaceTrustEmitter.event;
        private didChangeWorkspaceTrustEmitter = new Emitter<boolean>();
        readonly onDidChangeWorkspaceTrust: Event<boolean> = this.didChangeWorkspaceTrustEmitter.event;

        get trusted(): boolean {
            return !!this._trusted;
        }

        $onWorkspaceTrustChanged(trust: boolean | undefined): void {
            const wasTrusted = this._trusted;
            this._trusted = trust;

            // Fire onDidChangeWorkspaceTrust if value actually changed
            if (wasTrusted !== trust && trust !== undefined) {
                this.didChangeWorkspaceTrustEmitter.fire(trust);
            }

            // Fire onDidGrantWorkspaceTrust when transitioning from untrusted to trusted
            if (!wasTrusted && trust) {
                this.didGrantWorkspaceTrustEmitter.fire();
            }
        }
    }

    let handler: TrustChangeHandler;
    let grantEvents: number;
    let changeEvents: boolean[];

    beforeEach(() => {
        handler = new TrustChangeHandler();
        grantEvents = 0;
        changeEvents = [];

        handler.onDidGrantWorkspaceTrust(() => {
            grantEvents++;
        });
        handler.onDidChangeWorkspaceTrust(trust => {
            changeEvents.push(trust);
        });
    });

    it('fires onDidChangeWorkspaceTrust when transitioning from undefined to true', () => {
        handler.$onWorkspaceTrustChanged(true);

        expect(changeEvents).to.deep.equal([true]);
        expect(grantEvents).to.equal(1);
    });

    it('fires onDidChangeWorkspaceTrust when transitioning from undefined to false', () => {
        handler.$onWorkspaceTrustChanged(false);

        expect(changeEvents).to.deep.equal([false]);
        expect(grantEvents).to.equal(0);
    });

    it('fires onDidGrantWorkspaceTrust when transitioning from false to true', () => {
        handler.$onWorkspaceTrustChanged(false);
        changeEvents = [];

        handler.$onWorkspaceTrustChanged(true);

        expect(changeEvents).to.deep.equal([true]);
        expect(grantEvents).to.equal(1);
    });

    it('fires onDidChangeWorkspaceTrust when transitioning from true to false', () => {
        handler.$onWorkspaceTrustChanged(true);
        changeEvents = [];
        grantEvents = 0;

        handler.$onWorkspaceTrustChanged(false);

        expect(changeEvents).to.deep.equal([false]);
        expect(grantEvents).to.equal(0);
    });

    it('does not fire events when value does not change', () => {
        handler.$onWorkspaceTrustChanged(true);
        changeEvents = [];
        grantEvents = 0;

        handler.$onWorkspaceTrustChanged(true);

        expect(changeEvents).to.deep.equal([]);
        expect(grantEvents).to.equal(0);
    });

    it('does not fire onDidChangeWorkspaceTrust when transitioning to undefined', () => {
        handler.$onWorkspaceTrustChanged(true);
        changeEvents = [];
        grantEvents = 0;

        handler.$onWorkspaceTrustChanged(undefined);

        expect(changeEvents).to.deep.equal([]);
        expect(grantEvents).to.equal(0);
    });

    it('always updates _trusted regardless of event firing', () => {
        expect(handler.trusted).to.equal(false); // undefined coerced to false

        handler.$onWorkspaceTrustChanged(true);
        expect(handler.trusted).to.equal(true);

        handler.$onWorkspaceTrustChanged(false);
        expect(handler.trusted).to.equal(false);

        handler.$onWorkspaceTrustChanged(undefined);
        expect(handler.trusted).to.equal(false); // undefined coerced to false
    });
});
