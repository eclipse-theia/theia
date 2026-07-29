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

import { expect } from 'chai';
import { HttpPluginDeployerResolver } from './plugin-http-resolver';
import { PluginDeployerResolverContext } from '../../common';

describe('HttpPluginDeployerResolver', () => {

    function createContext(originId: string): PluginDeployerResolverContext {
        return {
            getOriginId: () => originId
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } as any as PluginDeployerResolverContext;
    }

    it('should reject a malformed link URI', async () => {
        const resolver = new HttpPluginDeployerResolver();
        let error: Error | undefined;
        try {
            await resolver.resolve(createContext(':::not a url'));
        } catch (e) {
            error = e as Error;
        }
        expect(error).to.be.an.instanceOf(Error);
        expect(error!.message).to.contain('invalid link URI');
    });
});
