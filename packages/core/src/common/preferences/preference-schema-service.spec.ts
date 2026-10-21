// *****************************************************************************
// Copyright (C) 2026 CodeSignal and others.
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
import { bindContributionProvider } from '../contribution-provider.js';
import { ILogger } from '../logger.js';
import { MockLogger } from '../test/mock-logger.js';
import { DefaultValueChangedEvent, PreferenceContribution } from './preference-schema.js';
import { PreferenceSchemaServiceImpl } from './preference-schema-service.js';
import { PreferenceScope, ValidPreferenceScopes } from './preference-scope.js';

const KEY = 'test.value';

describe('PreferenceSchemaServiceImpl', () => {

    let service: PreferenceSchemaServiceImpl;

    beforeEach(() => {
        const container = new Container();
        container.bind(ValidPreferenceScopes).toConstantValue([PreferenceScope.Default, PreferenceScope.User]);
        bindContributionProvider(container, PreferenceContribution);
        container.bind(ILogger).to(MockLogger).inSingletonScope();
        container.bind(PreferenceSchemaServiceImpl).toSelf().inSingletonScope();
        service = container.get(PreferenceSchemaServiceImpl);
        service.addSchema({ properties: { [KEY]: { type: 'string', default: 'schema', overridable: true } } });
    });

    afterEach(() => service.dispose());

    it('should restore the previous default when the newest override is removed', () => {
        service.registerOverride(KEY, undefined, 'first');
        const newest = service.registerOverride(KEY, undefined, 'second');
        const events: DefaultValueChangedEvent[] = [];
        service.onDidChangeDefaultValue(event => events.push(event));

        newest.dispose();

        expect(service.getDefaultValue(KEY, undefined)).to.equal('first');
        expect(events.map(({ oldValue, newValue }) => [oldValue, newValue])).to.deep.equal([['second', 'first']]);
    });

    it('should restore the previous default when the newest language override is removed', () => {
        service.registerOverrideIdentifier('typescript');
        service.registerOverride(KEY, 'typescript', 'first');
        const newest = service.registerOverride(KEY, 'typescript', 'second');

        newest.dispose();

        expect(service.getDefaultValue(KEY, 'typescript')).to.equal('first');
    });

    it('should remove only the override that is disposed', () => {
        const oldest = service.registerOverride(KEY, undefined, 'first');
        const newest = service.registerOverride(KEY, undefined, 'second');

        const events: DefaultValueChangedEvent[] = [];
        service.onDidChangeDefaultValue(event => events.push(event));

        oldest.dispose();
        expect(service.getDefaultValue(KEY, undefined)).to.equal('second');

        newest.dispose();
        expect(service.getDefaultValue(KEY, undefined)).to.equal('schema');
        expect(events.map(({ oldValue, newValue }) => [oldValue, newValue])).to.deep.equal([['second', 'schema']]);
    });

    it('should show the restored default in the JSON schema', () => {
        const override = service.registerOverride(KEY, undefined, 'first');
        expect(service.getJSONSchema(PreferenceScope.User).properties![KEY]).to.have.property('default', 'first');

        override.dispose();

        expect(service.getJSONSchema(PreferenceScope.User).properties![KEY]).to.have.property('default', 'schema');
    });

    it('should keep the other overrides when one is disposed twice', () => {
        const oldest = service.registerOverride(KEY, undefined, 'first');
        service.registerOverride(KEY, undefined, 'second');

        oldest.dispose();
        oldest.dispose();

        expect(service.getDefaultValue(KEY, undefined)).to.equal('second');
    });
});
