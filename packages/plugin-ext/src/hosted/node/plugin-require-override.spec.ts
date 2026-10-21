// *****************************************************************************
// Copyright (C) 2026 EclipseSource GmbH and others.
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

import { expect } from 'chai';
import { overridePluginDependencies } from './plugin-require-override';

describe('overridePluginDependencies', () => {

    const nodeModule = require('module');
    let originalLoad: unknown;

    beforeEach(() => {
        originalLoad = nodeModule._load;
    });

    afterEach(() => {
        nodeModule._load = originalLoad;
    });

    it('should provide the real node-pty module for an unresolvable node-pty request', () => {
        overridePluginDependencies();
        const nodePty = require('/nonexistent/vscode/node_modules/node-pty');
        expect(nodePty).to.equal(require('node-pty'));
        expect(nodePty.spawn).to.be.a('function');
    });

    it('should rethrow for unresolvable requests without an override', () => {
        overridePluginDependencies();
        expect(() => require('/nonexistent/vscode/node_modules/unknown-package')).to.throw();
    });
});
