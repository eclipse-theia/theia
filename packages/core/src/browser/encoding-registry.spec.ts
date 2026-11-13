// *****************************************************************************
// Copyright (C) 2026 Raphael Fakhri and others.
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
import { Container } from 'inversify';
import { EncodingRegistry } from './encoding-registry.js';
import { CorePreferences } from '../common/core-preferences.js';
import { EncodingService } from '../common/encoding-service.js';
import { UTF8 } from '../common/encodings.js';
import URI from '../common/uri.js';

describe('EncodingRegistry', () => {

    const configDir = new URI('file:///home/user/.theia');
    let registry: EncodingRegistry;

    beforeEach(() => {
        const container = new Container();
        container.bind(EncodingService).toSelf().inSingletonScope();
        container.bind(CorePreferences).toConstantValue({ get: () => 'windows1252' } as unknown as CorePreferences);
        container.bind(EncodingRegistry).toSelf().inSingletonScope();
        registry = container.get(EncodingRegistry);
        registry.registerOverride({ encoding: UTF8, parent: configDir });
    });

    it('should apply a parent override to resources inside the parent', () => {
        expect(registry.getEncodingForResource(configDir.resolve('settings.json'))).to.equal(UTF8);
        expect(registry.getEncodingForResource(configDir.resolve('nested/tasks.json'))).to.equal(UTF8);
    });

    it('should not apply a parent override to resources outside the parent', () => {
        expect(registry.getEncodingForResource(new URI('file:///home/user/notes.txt'))).to.equal('windows1252');
        expect(registry.getEncodingForResource(new URI('file:///home/user'))).to.equal('windows1252');
    });
});
