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
let disableJSDOM = enableJSDOM();

import { expect } from 'chai';
import { StandaloneServices } from '@theia/monaco-editor-core/esm/vs/editor/standalone/browser/standaloneServices';
import { IInstantiationService } from '@theia/monaco-editor-core/esm/vs/platform/instantiation/common/instantiation';
import { InstantiationService } from '@theia/monaco-editor-core/esm/vs/platform/instantiation/common/instantiationService';
import { ServiceCollection } from '@theia/monaco-editor-core/esm/vs/platform/instantiation/common/serviceCollection';

disableJSDOM();

/**
 * @monaco-uplift
 *
 * These tests guard internal assumptions that the `patchServices` function in
 * `monaco-init.ts` makes about the object returned by
 * `StandaloneServices.get(IInstantiationService)`.  Specifically, it expects:
 *
 * 1. The returned object is an instance of the concrete {@link InstantiationService} class.
 * 2. That class exposes a private `_services` field of type {@link ServiceCollection}.
 *
 * Because `_services` is a private implementation detail of Monaco, it may be
 * renamed or removed in a future release.  If any of these tests fail after a
 * Monaco version bump, `patchServices` must be updated to match the new internals.
 */
describe('Monaco InstantiationService internals', () => {

    before(() => disableJSDOM = enableJSDOM());
    after(() => disableJSDOM());

    it('StandaloneServices.get(IInstantiationService) should be an instance of InstantiationService', () => {
        const instantiationService = StandaloneServices.get(IInstantiationService);
        expect(instantiationService).to.be.an.instanceOf(InstantiationService);
    });

    it('StandaloneServices.get(IInstantiationService) should have a _services property that is a ServiceCollection', () => {
        const instantiationService = StandaloneServices.get(IInstantiationService);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const services = (instantiationService as any)['_services'];
        expect(services).to.not.be.undefined;
        expect(services).to.be.an.instanceOf(ServiceCollection);
    });
});
