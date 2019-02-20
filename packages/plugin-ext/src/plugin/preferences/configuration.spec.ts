/********************************************************************************
 * Copyright (C) 2019 Red Hat, Inc. and others.
 *
 * This program and the accompanying materials are made available under the
 * terms of the Eclipse Public License v. 2.0 which is available at
 * http://www.eclipse.org/legal/epl-2.0.
 *
 * This Source Code may also be made available under the following Secondary
 * Licenses when the conditions for such availability set forth in the Eclipse
 * Public License v. 2.0 are satisfied: GNU General Public License, version 2
 * with the GNU Classpath Exception which is available at
 * https://www.gnu.org/software/classpath/license.html.
 *
 * SPDX-License-Identifier: EPL-2.0 OR GPL-2.0 WITH Classpath-exception-2.0
 ********************************************************************************/

import * as chai from 'chai';
import { Configuration, ConfigurationModel } from './configuration';
import { PreferenceData } from '../../common';
import { PreferenceScope } from '@theia/preferences/lib/browser';
import { WorkspaceExtImpl } from '../workspace';
import URI from 'vscode-uri';

const expect = chai.expect;

interface Inspect<C> {
    default: C;
    user: C;
    workspace?: C;
    workspaceFolder?: C;
    value: C;
}
let inspect: Inspect<number>;

const projects = ['/projects/workspace/project1', '/projects/workspace/project2'];

const propertyName = 'tabSize';
const preferences: PreferenceData = {
    [PreferenceScope.Default]: {
        [propertyName]: 6,
    },
    [PreferenceScope.User]: {
        [propertyName]: 5
    },
    [PreferenceScope.Workspace]: {
        [propertyName]: 4
    },
    [PreferenceScope.Folder]: {
        [projects[0]]: {
            [propertyName]: 3
        },
        [projects[1]]: {
            [propertyName]: 2
        }
    }
};

const workspace: WorkspaceExtImpl = {} as WorkspaceExtImpl;
let configuration: Configuration;
let defaultConfiguration: ConfigurationModel;
let userConfiguration: ConfigurationModel;
let workspaceConfiguration: ConfigurationModel;
let folderConfigurations: { [key: string]: ConfigurationModel };
before(() => {
    workspace.getWorkspaceFolder = (uri => {
        const name = uri.toString().replace(/[^\/]+$/, '$1');
        const index = projects.indexOf(uri.toString());
        return { uri, name, index };
    });

    defaultConfiguration = new ConfigurationModel(
        preferences[PreferenceScope.Default],
        Object.keys(preferences[PreferenceScope.Default])
    );
    userConfiguration = new ConfigurationModel(
        preferences[PreferenceScope.User],
        Object.keys(preferences[PreferenceScope.User])
    );
    workspaceConfiguration = new ConfigurationModel(
        preferences[PreferenceScope.Workspace],
        Object.keys(preferences[PreferenceScope.Workspace])
    );
    folderConfigurations = projects.reduce((configurations: { [key: string]: ConfigurationModel }, project: string) => {
        const folderPrefs = preferences[PreferenceScope.Folder][project];
        configurations[project] = new ConfigurationModel(folderPrefs, Object.keys(folderPrefs));
        return configurations;
    }, {});
});

describe('Configuration:', () => {

    describe('Default scope preferences:', () => {

        beforeEach(() => {
            configuration = new Configuration(
                defaultConfiguration, new ConfigurationModel({}, []), undefined, undefined
            );
            inspect = configuration.inspect(propertyName, workspace, undefined);
        });

        it('should have correct value of \'default\' property', () => {
            expect(inspect).to.have.property(
                'default',
                preferences[PreferenceScope.Default][propertyName]
            );
            expect(inspect.default).to.equal(preferences[PreferenceScope.Default][propertyName]);
        });

        it('should have correct value of \'value\' property', () => {
            expect(inspect).to.have.property(
                'value',
                preferences[PreferenceScope.Default][propertyName]
            );
            expect(inspect.value).to.equal(preferences[PreferenceScope.Default][propertyName]);
        });

    });

    describe('User scope preferences:', () => {

        beforeEach(() => {
            configuration = new Configuration(
                defaultConfiguration, userConfiguration, undefined, undefined
            );
            inspect = configuration.inspect(propertyName, workspace, undefined);
        });

        it('should have correct value of \'default\' property', () => {
            expect(inspect).to.have.property(
                'default',
                preferences[PreferenceScope.Default][propertyName]
            );
            expect(inspect.default).to.equal(preferences[PreferenceScope.Default][propertyName]);
        });

        it('should have correct value of \'user\' property', () => {
            expect(inspect).to.have.property(
                'user',
                preferences[PreferenceScope.User][propertyName]
            );
            expect(inspect.user).to.equal(preferences[PreferenceScope.User][propertyName]);
        });

        it('should have correct value of \'value\' property', () => {
            expect(inspect).to.have.property(
                'value',
                preferences[PreferenceScope.User][propertyName]
            );
            expect(inspect.value).to.equal(preferences[PreferenceScope.User][propertyName]);
        });

    });

    describe('Workspace scope preferences:', () => {

        beforeEach(() => {
            configuration = new Configuration(
                defaultConfiguration, userConfiguration, workspaceConfiguration, undefined
            );
            inspect = configuration.inspect(propertyName, workspace, undefined);
        });

        it('should have correct value of \'default\' property', () => {
            expect(inspect).to.have.property(
                'default',
                preferences[PreferenceScope.Default][propertyName]
            );
            expect(inspect.default).to.equal(preferences[PreferenceScope.Default][propertyName]);
        });

        it('should have correct value of \'user\' property', () => {
            expect(inspect).to.have.property(
                'user',
                preferences[PreferenceScope.User][propertyName]
            );
            expect(inspect.user).to.equal(preferences[PreferenceScope.User][propertyName]);
        });

        it('should have correct value of \'workspace\' property', () => {
            expect(inspect).to.have.property(
                'workspace',
                preferences[PreferenceScope.Workspace][propertyName]
            );
            expect(inspect.workspace).to.equal(preferences[PreferenceScope.Workspace][propertyName]);
        });

        it('should have correct value of \'value\' property', () => {
            expect(inspect).to.have.property(
                'value',
                preferences[PreferenceScope.Workspace][propertyName]
            );
            expect(inspect.value).to.equal(preferences[PreferenceScope.Workspace][propertyName]);
        });

    });

    describe('Folder scope preferences:', () => {
        const project = projects[0];

        beforeEach(() => {
            configuration = new Configuration(
                defaultConfiguration, userConfiguration, workspaceConfiguration, folderConfigurations
            );
            const resource = URI.revive({ path: project });
            inspect = configuration.inspect(propertyName, workspace, resource);
        });

        it('should have correct value of \'default\' property', () => {
            expect(inspect).to.have.property(
                'default',
                preferences[PreferenceScope.Default][propertyName]
            );
            expect(inspect.default).to.equal(preferences[PreferenceScope.Default][propertyName]);
        });

        it('should have correct value of \'user\' property', () => {
            expect(inspect).to.have.property(
                'user',
                preferences[PreferenceScope.User][propertyName]
            );
            expect(inspect.user).to.equal(preferences[PreferenceScope.User][propertyName]);
        });

        it('should have correct value of \'workspace\' property', () => {
            expect(inspect).to.have.property(
                'workspace',
                preferences[PreferenceScope.Workspace][propertyName]
            );
            expect(inspect.workspace).to.equal(preferences[PreferenceScope.Workspace][propertyName]);
        });

        it('should have correct value of \'workspaceFolder\' property', () => {
            expect(inspect).to.have.property(
                'workspaceFolder',
                preferences[PreferenceScope.Folder][project][propertyName]
            );
            expect(inspect.workspaceFolder).to.equal(preferences[PreferenceScope.Folder][project][propertyName]);
        });

        it('should have correct value of \'value\' property', () => {
            expect(inspect).to.have.property(
                'value',
                preferences[PreferenceScope.Folder][project][propertyName]
            );
            expect(inspect.value).to.equal(preferences[PreferenceScope.Folder][project][propertyName]);
        });

    });

});
