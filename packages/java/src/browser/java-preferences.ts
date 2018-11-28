/********************************************************************************
 * Copyright (C) 2018 TypeFox and others.
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

// Copyright (c) Red Hat.
// Licensed under EPL-1.0 license
// some preferences copied from https://github.com/redhat-developer/vscode-java/blob/68d4bede335b194e8d8f44add1d868e3250cda22/package.json#L56-L264

// tslint:disable:max-line-length
// tslint:disable:no-null-keyword

import { interfaces } from 'inversify';
import {
    createPreferenceProxy,
    PreferenceProxy,
    PreferenceService,
    PreferenceContribution,
    PreferenceSchema,
    PreferenceChangeEvent
    // tslint:disable-next-line:no-implicit-dependencies
} from '@theia/core/lib/browser/preferences';

export const javaDebugPreferenceSchema: PreferenceSchema = {
    'type': 'object',
    'properties': {
        'java.home': {
            'type': [
                'string',
                'null'
            ],
            'default': null,
            'description': 'Specifies the folder path to the JDK (8 or more recent) used to launch the Java Language Server.\nOn Windows, backslashes must be escaped, i.e.\n"java.home":"C:\\\\Program Files\\\\Java\\\\jdk1.8.0_161"',
            'scope': 'window'
        },
        'java.jdt.ls.vmargs': {
            'type': [
                'string',
                'null'
            ],
            'default': '-noverify -Xmx1G -XX:+UseG1GC -XX:+UseStringDeduplication',
            'description': 'Specifies extra VM arguments used to launch the Java Language Server. Eg. use `-noverify -Xmx1G  -XX:+UseG1GC -XX:+UseStringDeduplication` to bypass class verification, increase the heap size to 1GB and enable String deduplication with the G1 Garbage collector',
            'scope': 'window'
        },
        'java.errors.incompleteClasspath.severity': {
            'type': [
                'string'
            ],
            'enum': [
                'ignore',
                'info',
                'warning',
                'error'
            ],
            'default': 'warning',
            'description': 'Specifies the severity of the message when the classpath is incomplete for a Java file',
            'scope': 'window'
        },
        'java.configuration.updateBuildConfiguration': {
            'type': [
                'string'
            ],
            'enum': [
                'disabled',
                'interactive',
                'automatic'
            ],
            'default': 'interactive',
            'description': 'Specifies how modifications on build files update the Java classpath/configuration',
            'scope': 'window'
        },
        'java.import.gradle.enabled': {
            'type': 'boolean',
            'default': true,
            'description': 'Enable/disable the Gradle importer.',
            'scope': 'window'
        },
        'java.import.maven.enabled': {
            'type': 'boolean',
            'default': true,
            'description': 'Enable/disable the Maven importer.',
            'scope': 'window'
        },
        'java.referencesCodeLens.enabled': {
            'type': 'boolean',
            'default': false,
            'description': 'Enable/disable the references code lens.',
            'scope': 'window'
        },
        'java.signatureHelp.enabled': {
            'type': 'boolean',
            'default': false,
            'description': 'Enable/disable the signature help.',
            'scope': 'window'
        },
        'java.implementationsCodeLens.enabled': {
            'type': 'boolean',
            'default': false,
            'description': 'Enable/disable the implementations code lens.',
            'scope': 'window'
        },
        'java.configuration.maven.userSettings': {
            'type': 'string',
            'default': null,
            'description': "Path to Maven's settings.xml",
            'scope': 'window'
        },
        'java.format.enabled': {
            'type': 'boolean',
            'default': true,
            'description': 'Enable/disable default Java formatter',
            'scope': 'window'
        },
        'java.saveActions.organizeImports': {
            'type': 'boolean',
            'default': false,
            'description': 'Enable/disable auto organize imports on save action',
            'scope': 'window'
        },
        'java.import.exclusions': {
            'type': 'array',
            'description': 'Configure glob patterns for excluding folders',
            'default': [
                '**/node_modules/**',
                '**/.metadata/**',
                '**/archetype-resources/**',
                '**/META-INF/maven/**'
            ],
            'scope': 'window'
        },
        'java.contentProvider.preferred': {
            'type': 'string',
            'description': 'Preferred content provider (a 3rd party decompiler id, usually)',
            'default': null,
            'scope': 'window'
        },
        'java.autobuild.enabled': {
            'type': 'boolean',
            'default': true,
            'description': "Enable/disable the 'auto build'",
            'scope': 'window'
        },
        'java.completion.enabled': {
            'type': 'boolean',
            'default': true,
            'description': 'Enable/disable code completion support',
            'scope': 'window'
        },
        'java.completion.overwrite': {
            'type': 'boolean',
            'default': true,
            'description': 'When set to true, code completion overwrites the current text. When set to false, code is simply added instead.',
            'scope': 'window'
        },
        'java.completion.guessMethodArguments': {
            'type': 'boolean',
            'default': false,
            'description': 'When set to true, method arguments are guessed when a method is selected from as list of code assist proposals.',
            'scope': 'window'
        },
        'java.completion.favoriteStaticMembers': {
            'type': 'array',
            'description': 'Defines a list of static members or types with static members. Content assist will propose those static members even if the import is missing.',
            'default': [
                'org.junit.Assert.*',
                'org.junit.Assume.*',
                'org.junit.jupiter.api.Assertions.*',
                'org.junit.jupiter.api.Assumptions.*',
                'org.junit.jupiter.api.DynamicContainer.*',
                'org.junit.jupiter.api.DynamicTest.*',
                'org.mockito.Mockito.*',
                'org.mockito.ArgumentMatchers.*',
                'org.mockito.Answers.*'
            ],
            'scope': 'window'
        },
        'java.completion.importOrder': {
            'type': 'array',
            'description': "Defines the sorting order of import statements. A package or type name prefix (e.g. 'org.eclipse') is a valid entry. An import is always added to the most specific group.",
            'default': [
                'java',
                'javax',
                'com',
                'org'
            ],
            'scope': 'window'
        },
        'java.progressReports.enabled': {
            'type': 'boolean',
            'description': '[Experimental] Enable/disable progress reports from background processes on the server.',
            'default': true,
            'scope': 'window'
        },
        'java.format.settings.url': {
            'type': 'string',
            'description': 'Specifies the url or file path to the [Eclipse formatter xml settings](https://github.com/redhat-developer/vscode-java/wiki/Formatter-settings).',
            'default': null,
            'scope': 'window'
        },
        'java.format.settings.profile': {
            'type': 'string',
            'description': 'Optional formatter profile name from the Eclipse formatter settings.',
            'default': null,
            'scope': 'window'
        },
        'java.format.comments.enabled': {
            'type': 'boolean',
            'description': 'Includes the comments during code formatting.',
            'default': true,
            'scope': 'window'
        },
        'java.format.onType.enabled': {
            'type': 'boolean',
            'description': 'Enable/disable automatic block formatting when typing `;`, `<enter>` or `}`',
            'default': true,
            'scope': 'window'
        }
    }
};

export interface JavaConfiguration {
}
export type JavaPreferenceChange = PreferenceChangeEvent<JavaConfiguration>;

export const JavaPreferences = Symbol('JavaPreferences');
export type JavaPreferences = PreferenceProxy<JavaConfiguration>;

export function createJavaPreferences(preferences: PreferenceService): JavaPreferences {
    return createPreferenceProxy(preferences, javaDebugPreferenceSchema);
}

export function bindJavaPreferences(bind: interfaces.Bind): void {
    bind(JavaPreferences).toDynamicValue(ctx => {
        const preferences = ctx.container.get<PreferenceService>(PreferenceService);
        return createJavaPreferences(preferences);
    }).inSingletonScope();

    bind(PreferenceContribution).toConstantValue({ schema: javaDebugPreferenceSchema });
}
