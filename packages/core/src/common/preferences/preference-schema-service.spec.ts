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

    it('should set the owner and the title of the schema on its properties', () => {
        const owner = { id: 'acme.sample', label: 'Sample' };
        service.addSchema({ owner, title: 'General', properties: { 'sample.value': { type: 'string' } } });

        expect(service.getSchemaProperty('sample.value')?.owner).to.equal(owner);
        expect(service.getSchemaProperty('sample.value')?.category).to.equal('General');
    });

    it('should not write the owner and the category into the JSON schema', () => {
        service.addSchema({ owner: { id: 'acme.sample', label: 'Sample' }, title: 'General', properties: { 'sample.value': { type: 'string' } } });

        const property = service.getJSONSchema(PreferenceScope.User).properties?.['sample.value'] as Record<string, unknown>;
        expect(property).to.not.have.any.keys('owner', 'category');
    });

    it('should replace an owner and a category that a property declares itself', () => {
        const owner = { id: 'acme.sample', label: 'Sample' };
        const forged = { id: 'wasnt.me', label: 'Not Shaggy' };
        service.addSchema({ owner, title: 'General', properties: { 'sample.value': { type: 'string', owner: forged, category: 'Advanced' } } });
        service.addSchema({ properties: { 'sample.unowned': { type: 'string', owner: forged, category: 'Advanced' } } });

        expect(service.getSchemaProperty('sample.value')?.owner).to.equal(owner);
        expect(service.getSchemaProperty('sample.value')?.category).to.equal('General');
        expect(service.getSchemaProperty('sample.unowned')?.owner).to.be.undefined;
        expect(service.getSchemaProperty('sample.unowned')?.category).to.be.undefined;
    });

    it('should keep the property that was registered first', () => {
        service.addSchema({ owner: { id: 'acme.sample', label: 'Sample' }, properties: { [KEY]: { type: 'number' } } });

        expect(service.getSchemaProperty(KEY)?.type).to.equal('string');
        expect(service.getSchemaProperty(KEY)?.owner).to.be.undefined;
    });

    it('should keep a property when a schema that also declared it is removed', () => {
        const duplicate = service.addSchema({ properties: { [KEY]: { type: 'number' } } });

        duplicate.dispose();

        expect(service.getSchemaProperty(KEY)?.type).to.equal('string');
        expect(service.getJSONSchema(PreferenceScope.User).properties?.[KEY]).to.not.be.undefined;
    });

    it('should hand a property over to the next schema that declares it when its schema is removed', () => {
        const secondOwner = { id: 'acme.second', label: 'Second' };
        const firstRegistration = service.addSchema({
            owner: { id: 'acme.first', label: 'First' }, properties: { 'sample.value': { type: 'string', default: 'first' } }
        });
        service.addSchema({ owner: secondOwner, properties: { 'sample.value': { type: 'string', default: 'second' } } });
        const events: DefaultValueChangedEvent[] = [];
        service.onDidChangeDefaultValue(event => events.push(event));

        firstRegistration.dispose();

        expect(service.getSchemaProperty('sample.value')?.owner).to.equal(secondOwner);
        expect(service.getDefaultValue('sample.value', undefined)).to.equal('second');
        expect(service.getJSONSchema(PreferenceScope.User).properties?.['sample.value']).to.not.be.undefined;
        expect(events).to.deep.equal([{ key: 'sample.value', overrideIdentifier: undefined, oldValue: 'first', newValue: 'second' }]);
    });

    it('should remove a property when the only schema that declares it is removed', () => {
        const registration = service.addSchema({ properties: { 'sample.value': { type: 'string' } } });

        registration.dispose();

        expect(service.getSchemaProperty('sample.value')).to.be.undefined;
    });

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

    it('should mark the properties of a schema as restricted by default, unless a property opts out', () => {
        service.addSchema({
            defaultRestricted: true,
            properties: {
                'test.restrictedByDefault': { type: 'string' },
                'test.optedOut': { type: 'string', restricted: false }
            }
        });

        expect(service.getSchemaProperty('test.restrictedByDefault')?.restricted).to.be.true;
        expect(service.getSchemaProperty('test.optedOut')?.restricted).to.be.false;
        expect(service.getJSONSchema(PreferenceScope.User).properties?.['test.restrictedByDefault']).to.deep.equal({ type: 'string', default: undefined });
    });

    it('should not restrict a property unless its schema or the property says so', () => {
        service.addSchema({
            properties: {
                'test.restricted': { type: 'string', restricted: true }
            }
        });

        expect(service.getSchemaProperty(KEY)).to.not.have.property('restricted');
        expect(service.getSchemaProperty('test.restricted')?.restricted).to.be.true;
    });
});
