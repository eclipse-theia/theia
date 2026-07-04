// *****************************************************************************
// Copyright (C) 2026 Maksim Kachurin and others.
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
import { CustomEditorPriority } from '../contribution-types';
import { PreferenceScope } from '../protocol-shims';
import {
    deriveDefaultForType,
    extractPluginViewsIds,
    getScope,
    normalizeContributions,
    readColors,
    readCommand,
    readConfiguration,
    readCustomEditors,
    readDebuggers,
    readIconThemes,
    readIcons,
    readKeybinding,
    readLanguages,
    readLocalizations,
    readMenus,
    readSnippets,
    readSubmenus,
    readTaskDefinition,
    readTerminals,
    readThemes,
    readViews,
    readViewsContainers,
    readViewContainer,
    readViewWelcome,
    readViewsWelcome,
    toSchema,
    transformIconUrl
} from '../normalize-contributions';
import { createNormalizeCtx, manifest } from './test-helpers';
import type { PluginManifest } from '../manifest-types';

describe('normalize-contributions', () => {

    describe('deriveDefaultForType', () => {
        it('mirrors VS Code defaults for each json type', () => {
            expect(deriveDefaultForType('boolean')).to.equal(false);
            expect(deriveDefaultForType('integer')).to.equal(0);
            expect(deriveDefaultForType('number')).to.equal(0);
            expect(deriveDefaultForType('string')).to.equal('');
            expect(deriveDefaultForType('array')).to.deep.equal([]);
            expect(deriveDefaultForType('object')).to.deep.equal({});
            // eslint-disable-next-line no-null/no-null
            expect(deriveDefaultForType(undefined)).to.equal(null);
        });

        it('uses the first type when an array is provided', () => {
            expect(deriveDefaultForType(['string', 'number'])).to.equal('');
        });
    });

    describe('getScope', () => {
        it('maps monaco scopes to preference scope and overridable flag', () => {
            expect(getScope('machine-overridable')).to.deep.equal({ scope: PreferenceScope.Folder, overridable: false });
            expect(getScope('language-overridable')).to.deep.equal({ scope: PreferenceScope.Folder, overridable: true });
            expect(getScope('application')).to.deep.equal({ scope: PreferenceScope.User, overridable: false });
            expect(getScope(undefined)).to.deep.equal({ scope: undefined, overridable: false });
        });
    });

    describe('readConfiguration', () => {
        it('derives defaults and property scopes', () => {
            const schema = readConfiguration({
                title: 'Sample',
                scope: 'application',
                properties: {
                    'sample.enabled': { type: 'boolean', scope: 'language-overridable' },
                    'sample.path': { type: 'string', default: '/tmp' }
                }
            }, '/tmp/plugin');

            expect(schema?.scope).to.equal(PreferenceScope.User);
            expect(schema?.properties['sample.enabled'].default).to.equal(false);
            expect(schema?.properties['sample.enabled'].overridable).to.equal(true);
            expect(schema?.properties['sample.path'].default).to.equal('/tmp');
        });
    });

    describe('transformIconUrl and readCommand', () => {
        it('resolves file icons and codicons', () => {
            const ctx = createNormalizeCtx();
            expect(transformIconUrl(ctx, ctx.plugin, './media/icon.png')).to.deep.equal({
                iconUrl: 'hostedPlugin/acme_test_ext/.%2Fmedia%2Ficon.png'
            });
            expect(transformIconUrl(ctx, ctx.plugin, '$(zap)')).to.deep.equal({ themeIcon: '$(zap)' });
            expect(transformIconUrl(ctx, ctx.plugin, {
                light: './light.png',
                dark: './dark.png'
            })).to.deep.equal({
                iconUrl: {
                    light: 'hostedPlugin/acme_test_ext/.%2Flight.png',
                    dark: 'hostedPlugin/acme_test_ext/.%2Fdark.png'
                }
            });

            const command = readCommand(ctx, {
                command: 'sample.run',
                title: 'Run',
                original: 'Original',
                icon: '$(play)'
            }, ctx.plugin);
            expect(command).to.include({
                command: 'sample.run',
                title: 'Run',
                originalTitle: 'Original',
                themeIcon: '$(play)'
            });
        });
    });

    describe('readKeybinding and menus', () => {
        it('copies keybinding fields', () => {
            expect(readKeybinding({
                key: 'ctrl+shift+p',
                command: 'sample.run',
                when: 'editorFocus',
                mac: 'cmd+shift+p'
            })).to.deep.equal({
                keybinding: 'ctrl+shift+p',
                command: 'sample.run',
                when: 'editorFocus',
                mac: 'cmd+shift+p',
                linux: undefined,
                win: undefined,
                args: undefined
            });
        });

        it('copies menu fields', () => {
            expect(readMenus([{
                command: 'sample.run',
                group: 'navigation',
                when: 'true'
            }])).to.deep.equal([{
                command: 'sample.run',
                group: 'navigation',
                when: 'true',
                submenu: undefined,
                alt: undefined
            }]);
        });
    });

    describe('views', () => {
        it('extracts view ids across locations', () => {
            expect(extractPluginViewsIds({
                explorer: [{ id: 'a', name: 'A' }],
                panel: [{ id: 'b', name: 'B' }]
            })).to.deep.equal(['a', 'b']);
        });

        it('normalizes view containers, views, and welcome content order', () => {
            const ctx = createNormalizeCtx();
            const containers = readViewsContainers(ctx, [{
                id: 'sample.container',
                title: 'Sample',
                icon: '$(folder)'
            }], ctx.plugin);
            expect(containers[0]).to.include({
                id: 'sample.container',
                themeIcon: '$(folder)'
            });
            expect(containers[0].iconUrl).to.equal('hostedPlugin/acme_test_ext/%24(folder)');

            const views = readViews([{ id: 'sample.view', name: 'Sample View' }]);
            expect(views).to.deep.equal([{
                id: 'sample.view',
                name: 'Sample View',
                when: undefined,
                type: undefined
            }]);

            const welcome = readViewsWelcome([{
                view: 'sample.view',
                contents: 'Welcome'
            }], { explorer: [{ id: 'sample.view', name: 'Sample View' }] });
            expect(welcome[0].order).to.equal(0);
            expect(readViewWelcome({
                view: 'missing.view',
                contents: 'Missing'
            }, ['sample.view']).order).to.equal(1);
        });

        it('skips view containers without a string icon and reports an error', () => {
            const errors: unknown[] = [];
            const ctx = createNormalizeCtx({}, {
                onError: (_kind, message) => {
                    errors.push(message);
                }
            });
            expect(readViewContainer(ctx, {
                id: 'sample.container',
                title: 'Sample'
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
            } as any, ctx.plugin)).to.equal(undefined);
            expect(readViewsContainers(ctx, [{
                id: 'valid.container',
                title: 'Valid',
                icon: '$(folder)'
            }, {
                id: 'invalid.container',
                title: 'Invalid'
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
            } as any], ctx.plugin)).to.have.lengthOf(1);
            expect(errors.length).to.be.greaterThan(0);
        });
    });

    describe('custom editors and debuggers', () => {
        it('normalizes custom editors with default priority', () => {
            expect(readCustomEditors([{
                viewType: 'sample.editor',
                displayName: 'Editor'
            }])).to.deep.equal([{
                viewType: 'sample.editor',
                displayName: 'Editor',
                selector: [],
                priority: CustomEditorPriority.default
            }]);
        });

        it('copies debugger contributions', () => {
            expect(readDebuggers([{
                type: 'node',
                label: 'Node Debug',
                program: './out/debug.js'
            }])).to.deep.equal([{
                type: 'node',
                label: 'Node Debug',
                program: './out/debug.js',
                languages: undefined,
                enableBreakpointsFor: undefined,
                variables: undefined,
                adapterExecutableCommand: undefined,
                configurationSnippets: undefined,
                win: undefined,
                winx86: undefined,
                windows: undefined,
                osx: undefined,
                linux: undefined,
                args: undefined,
                runtime: undefined,
                runtimeArgs: undefined,
                configurationAttributes: undefined
            }]);
        });
    });

    describe('themes, snippets, icon themes, and colors', () => {
        it('resolves theme and snippet uris', () => {
            const ctx = createNormalizeCtx(undefined, undefined);
            const plugin = manifest({
                name: 'themes',
                contributes: {
                    themes: [{ id: 'dark', label: 'Dark', path: './themes/dark.json' }],
                    snippets: [{ language: 'typescript', path: './snippets/ts.json' }],
                    iconThemes: [{ id: 'set', label: 'Set', path: './icons/theme.json' }]
                }
            });
            ctx.plugin = plugin;

            expect(readThemes(ctx, plugin)).to.deep.equal([{
                id: 'dark',
                label: 'Dark',
                uri: 'hostedPlugin/acme_themes/.%2Fthemes%2Fdark.json',
                description: undefined,
                uiTheme: undefined
            }]);
            expect(readSnippets(ctx, plugin)).to.deep.equal([{
                language: 'typescript',
                source: 'Test Extension',
                uri: 'hostedPlugin/acme_themes/.%2Fsnippets%2Fts.json'
            }]);
            expect(readIconThemes(ctx, plugin)).to.deep.equal([{
                id: 'set',
                label: 'Set',
                uri: 'hostedPlugin/acme_themes/.%2Ficons%2Ftheme.json',
                description: undefined,
                uiTheme: undefined
            }]);
        });

        it('validates color contributions and reports invalid ids', () => {
            const errors: string[] = [];
            const ctx = createNormalizeCtx({ name: 'colors' }, {
                onError: (_kind, message) => {
                    errors.push(String(message));
                }
            });
            const plugin = manifest({
                name: 'colors',
                contributes: {
                    colors: [
                        {
                            id: 'valid.color',
                            description: 'Valid',
                            defaults: { light: '#fff', dark: '#000', highContrast: '#111' }
                        },
                        { id: 'bad id', description: 'Bad', defaults: { light: '#fff', dark: '#000', highContrast: '#111' } }
                    ]
                }
            });
            ctx.plugin = plugin;

            const colors = readColors(ctx, plugin);
            expect(colors).to.have.lengthOf(1);
            expect(colors![0].defaults).to.deep.equal({ light: '#fff', dark: '#000', hc: '#111' });
            expect(errors.some(message => message.includes('word[.word]*'))).to.equal(true);
        });

        it('rejects color contributions with empty descriptions', () => {
            const errors: string[] = [];
            const ctx = createNormalizeCtx({ name: 'colors' }, {
                onError: (_kind, message) => {
                    errors.push(String(message));
                }
            });
            const plugin = manifest({
                name: 'colors',
                contributes: {
                    colors: [{
                        id: 'valid.color',
                        description: '',
                        defaults: { light: '#fff', dark: '#000', highContrast: '#111' }
                    }]
                }
            });
            ctx.plugin = plugin;

            expect(readColors(ctx, plugin)).to.deep.equal([]);
            expect(errors.some(message => message.includes('description'))).to.equal(true);
        });
    });

    describe('icons', () => {
        it('accepts icon references and font-based defaults', () => {
            const ctx = createNormalizeCtx({ name: 'icons', publisher: 'acme' });
            const plugin = manifest({
                name: 'icons',
                publisher: 'acme',
                contributes: {
                    icons: {
                        'sample-icon': {
                            description: 'Sample icon',
                            default: 'other-icon'
                        },
                        'font-icon': {
                            description: 'Font icon',
                            default: {
                                fontPath: './media/icon.woff2',
                                fontCharacter: '\\E001'
                            }
                        }
                    }
                } as unknown as PluginManifest['contributes']
            });
            ctx.plugin = plugin;

            const icons = readIcons(ctx, plugin);
            expect(icons).to.deep.equal([
                {
                    id: 'sample-icon',
                    extensionId: 'acme.icons',
                    description: 'Sample icon',
                    defaults: { id: 'other-icon' }
                },
                {
                    id: 'font-icon',
                    extensionId: 'acme.icons',
                    description: 'Font icon',
                    defaults: {
                        fontCharacter: '\\E001',
                        location: 'hostedPlugin/acme_icons/.%2Fmedia%2Ficon.woff2'
                    }
                }
            ]);
        });
    });

    describe('terminals, localizations, submenus, and tasks', () => {
        it('reads terminal profiles with required fields only', () => {
            const plugin = manifest({
                name: 'terminal',
                contributes: {
                    terminal: {
                        profiles: [
                            { id: 'bash', title: 'Bash' },
                            { id: 'invalid' } as unknown as { id: string; title: string }
                        ]
                    }
                }
            });
            expect(readTerminals(plugin)).to.deep.equal([{ id: 'bash', title: 'Bash' }]);
        });

        it('reads localization bundles', () => {
            const plugin = manifest({
                name: 'l10n',
                packagePath: '/tmp/plugin',
                contributes: {
                    localizations: [{
                        languageId: 'de',
                        languageName: 'German',
                        translations: [{ id: 'package', path: './package.nls.de.json' }]
                    }]
                }
            });
            expect(readLocalizations(plugin)).to.deep.equal([{
                languageId: 'de',
                languageName: 'German',
                localizedLanguageName: undefined,
                translations: [{ id: 'package', path: './package.nls.de.json' }]
            }]);
        });

        it('reads submenu icons via transformIconUrl', () => {
            const ctx = createNormalizeCtx();
            expect(readSubmenus(ctx, [{
                id: 'sample.submenu',
                label: 'Sample',
                icon: '$(gear)'
            }], ctx.plugin)).to.deep.equal([{
                icon: '$(gear)',
                id: 'sample.submenu',
                label: 'Sample'
            }]);
        });

        it('builds task definition schema with required type property', () => {
            const definition = readTaskDefinition('sample.tasks', {
                type: 'npm',
                required: ['script'],
                properties: {
                    script: { type: 'string' }
                }
            });
            expect(definition.taskType).to.equal('npm');
            expect(definition.source).to.equal('sample.tasks');
            expect(definition.properties.all).to.deep.equal(['script']);
            expect(toSchema({
                type: 'npm',
                required: [],
                properties: { script: { type: 'string' } }
            }).properties!.type).to.deep.equal({ type: 'string', const: 'npm' });
        });
    });

    describe('readLanguage', () => {
        it('loads language configuration from a relative json file', async () => {
            const ctx = createNormalizeCtx({ name: 'lang', packagePath: '/tmp/plugin' }, {
                readJsonFile: async () => ({
                    autoClosingPairs: [['{', '}'], { open: '[', close: ']', notIn: ['string'] }],
                    surroundingPairs: [['(', ')']]
                })
            });
            const languages = await readLanguages(ctx, [{
                id: 'sample',
                configuration: './language-configuration.json'
            }], ctx.plugin);

            expect(languages[0].configuration?.autoClosingPairs).to.deep.equal([
                { open: '{', close: '}' },
                { open: '[', close: ']', notIn: ['string'] }
            ]);
            expect(languages[0].configuration?.surroundingPairs).to.deep.equal([{ open: '(', close: ')' }]);
        });
    });

    describe('normalizeContributions', () => {
        it('normalizes supported contribution kinds via injectable readers', async () => {
            const ctx = createNormalizeCtx({
                name: 'full',
                contributes: {
                    commands: [{ command: 'sample.run', title: 'Run' }],
                    keybindings: [{ key: 'ctrl+r', command: 'sample.run' }],
                    configuration: { title: 'Sample', properties: { enabled: { type: 'boolean' } } }
                }
            });

            const contributions = await normalizeContributions(ctx, {});
            expect(contributions).to.have.property('commands').with.lengthOf(1);
            expect(contributions).to.have.property('keybindings').with.lengthOf(1);
            expect(contributions).to.have.property('configuration').with.lengthOf(1);
        });

        it('runs the orchestrator for shell layout, passthrough, and async contribution kinds', async () => {
            const readGrammars = async () => [{ scopeName: 'source.sample', path: './grammar.json' }];
            const ctx = createNormalizeCtx({
                name: 'orchestrator',
                displayName: 'Orchestrator Extension',
                contributes: {
                    configuration: [
                        { title: 'General', properties: { 'sample.enabled': { type: 'boolean' } } },
                        { title: 'Advanced', properties: { 'sample.count': { type: 'number' } } }
                    ],
                    configurationDefaults: { 'sample.enabled': true },
                    submenus: [{ id: 'sample.submenu', label: 'Sample', icon: '$(gear)' }],
                    customEditors: [{ viewType: 'sample.editor', displayName: 'Editor' }],
                    viewsContainers: {
                        activitybar: [{ id: 'sample.container', title: 'Sample', icon: './media/icon.png' }],
                        panel: [{ id: 'panel.container', title: 'Panel', icon: '$(panel)' }]
                    },
                    views: {
                        explorer: [{ id: 'sample.view', name: 'Sample View' }]
                    },
                    viewsWelcome: [{ view: 'sample.view', contents: 'Welcome' }],
                    commands: [{ command: 'sample.run', title: 'Run' }],
                    menus: {
                        'editor/title': [{ command: 'sample.run', group: 'navigation' }]
                    },
                    keybindings: [{ key: 'ctrl+shift+r', command: 'sample.run' }],
                    debuggers: [{ type: 'node', label: 'Node Debug', program: './debug.js' }],
                    taskDefinitions: [{
                        type: 'npm',
                        required: ['script'],
                        properties: { script: { type: 'string' } }
                    }],
                    problemMatchers: [{ name: 'sample-matcher' }],
                    problemPatterns: [{ regexp: 'sample' }],
                    resourceLabelFormatters: [{ scheme: 'file' }],
                    authentication: [{ id: 'github', label: 'GitHub' }],
                    notebooks: [{ type: 'sample-notebook', displayName: 'Notebook' }],
                    notebookRenderer: [{ id: 'sample-renderer', displayName: 'Renderer' }],
                    notebookPreload: [{ type: 'sample-preload' }],
                    snippets: [{ language: 'typescript', path: './snippets/ts.json' }],
                    themes: [{ id: 'dark', label: 'Dark', path: './themes/dark.json' }],
                    colors: [{
                        id: 'sample.color',
                        description: 'Sample',
                        defaults: { light: '#fff', dark: '#000', highContrast: '#111' }
                    }],
                    iconThemes: [{ id: 'sample-icons', label: 'Icons', path: './icons/theme.json' }],
                    icons: {
                        'sample-icon': {
                            description: 'Sample icon',
                            default: 'other-icon'
                        }
                    },
                    terminal: { profiles: [{ id: 'bash', title: 'Bash' }] },
                    localizations: [{
                        languageId: 'de',
                        languageName: 'German',
                        translations: [{ id: 'package', path: './package.nls.de.json' }]
                    }],
                    languages: [{ id: 'sample-lang', extensions: ['.sample'] }],
                    grammars: [{ language: 'sample-lang', scopeName: 'source.sample', path: './grammar.json' }]
                } as unknown as PluginManifest['contributes']
            }, { readGrammars });

            const contributions = await normalizeContributions(ctx, {}) as Record<string, unknown>;

            expect(contributions.configurationDefaults).to.deep.equal({ 'sample.enabled': true });

            const configuration = contributions.configuration as Array<{ title?: string; properties: Record<string, { owner?: string; group?: string }> }>;
            expect(configuration).to.have.lengthOf(2);
            expect(configuration[0].properties['sample.enabled'].owner).to.equal('Orchestrator Extension');
            expect(configuration[0].properties['sample.enabled'].group).to.equal('General');

            expect(contributions.submenus).to.deep.equal([{
                icon: '$(gear)',
                id: 'sample.submenu',
                label: 'Sample'
            }]);
            expect(contributions.customEditors).to.deep.equal([{
                viewType: 'sample.editor',
                displayName: 'Editor',
                selector: [],
                priority: CustomEditorPriority.default
            }]);
            expect(contributions.viewsContainers).to.deep.equal({
                left: [{
                    id: 'sample.container',
                    title: 'Sample',
                    iconUrl: 'hostedPlugin/acme_orchestrator/.%2Fmedia%2Ficon.png',
                    themeIcon: undefined,
                    when: undefined
                }],
                bottom: [{
                    id: 'panel.container',
                    title: 'Panel',
                    iconUrl: 'hostedPlugin/acme_orchestrator/%24(panel)',
                    themeIcon: '$(panel)',
                    when: undefined
                }]
            });
            expect(contributions.views).to.deep.equal({
                explorer: [{ id: 'sample.view', name: 'Sample View', when: undefined, type: undefined }]
            });
            expect(contributions.viewsWelcome).to.deep.equal([{
                view: 'sample.view',
                content: 'Welcome',
                when: undefined,
                enablement: undefined,
                order: 0
            }]);
            expect(contributions.menus).to.deep.equal({
                'editor/title': [{ command: 'sample.run', group: 'navigation', submenu: undefined, alt: undefined, when: undefined }]
            });
            expect(contributions.debuggers).to.deep.equal([{
                type: 'node',
                label: 'Node Debug',
                program: './debug.js',
                languages: undefined,
                enableBreakpointsFor: undefined,
                variables: undefined,
                adapterExecutableCommand: undefined,
                configurationSnippets: undefined,
                win: undefined,
                winx86: undefined,
                windows: undefined,
                osx: undefined,
                linux: undefined,
                args: undefined,
                runtime: undefined,
                runtimeArgs: undefined,
                configurationAttributes: undefined
            }]);
            expect(contributions.taskDefinitions).to.deep.equal([{
                taskType: 'npm',
                source: 'orchestrator',
                properties: {
                    required: ['script'],
                    all: ['script'],
                    schema: {
                        type: 'object',
                        required: ['script'],
                        properties: {
                            type: { type: 'string', const: 'npm' },
                            script: { type: 'string' }
                        }
                    }
                }
            }]);
            expect(contributions.problemMatchers).to.deep.equal([{ name: 'sample-matcher' }]);
            expect(contributions.problemPatterns).to.deep.equal([{ regexp: 'sample' }]);
            expect(contributions.resourceLabelFormatters).to.deep.equal([{ scheme: 'file' }]);
            expect(contributions.authentication).to.deep.equal([{ id: 'github', label: 'GitHub' }]);
            expect(contributions.notebooks).to.deep.equal([{ type: 'sample-notebook', displayName: 'Notebook' }]);
            expect(contributions.notebookRenderer).to.deep.equal([{ id: 'sample-renderer', displayName: 'Renderer' }]);
            expect(contributions.notebookPreload).to.deep.equal([{ type: 'sample-preload' }]);
            expect(contributions.snippets).to.deep.equal([{
                language: 'typescript',
                source: 'Orchestrator Extension',
                uri: 'hostedPlugin/acme_orchestrator/.%2Fsnippets%2Fts.json'
            }]);
            expect(contributions.themes).to.deep.equal([{
                id: 'dark',
                label: 'Dark',
                uri: 'hostedPlugin/acme_orchestrator/.%2Fthemes%2Fdark.json',
                description: undefined,
                uiTheme: undefined
            }]);
            expect(contributions.colors).to.deep.equal([{
                id: 'sample.color',
                description: 'Sample',
                defaults: { light: '#fff', dark: '#000', hc: '#111' }
            }]);
            expect(contributions.iconThemes).to.deep.equal([{
                id: 'sample-icons',
                label: 'Icons',
                uri: 'hostedPlugin/acme_orchestrator/.%2Ficons%2Ftheme.json',
                description: undefined,
                uiTheme: undefined
            }]);
            expect(contributions.icons).to.deep.equal([{
                id: 'sample-icon',
                extensionId: 'acme.orchestrator',
                description: 'Sample icon',
                defaults: { id: 'other-icon' }
            }]);
            expect(contributions.terminalProfiles).to.deep.equal([{ id: 'bash', title: 'Bash' }]);
            expect(contributions.localizations).to.deep.equal([{
                languageId: 'de',
                languageName: 'German',
                localizedLanguageName: undefined,
                translations: [{ id: 'package', path: './package.nls.de.json' }]
            }]);
            expect(contributions.languages).to.deep.equal([{
                id: 'sample-lang',
                aliases: undefined,
                extensions: ['.sample'],
                filenamePatterns: undefined,
                filenames: undefined,
                firstLine: undefined,
                mimetypes: undefined,
                icon: undefined
            }]);
            expect(contributions.grammars).to.deep.equal([{ scopeName: 'source.sample', path: './grammar.json' }]);
        });

        it('merges aliased view container locations and reports async reader failures', async () => {
            const errors: Array<{ kind: string; message: unknown }> = [];
            const ctx = createNormalizeCtx({
                name: 'merge',
                contributes: {
                    viewsContainers: {
                        activitybar: [{ id: 'left-a', title: 'A', icon: '$(a)' }],
                        secondarySidebar: [{ id: 'right-a', title: 'Right', icon: '$(b)' }]
                    },
                    languages: [{ id: 'broken', configuration: './missing.json' }],
                    grammars: [{ language: 'broken', scopeName: 'source.broken', path: './broken.json' }]
                }
            }, {
                readJsonFile: async () => {
                    throw new Error('missing language config');
                },
                readGrammars: async () => {
                    throw new Error('missing grammar');
                },
                onError: (kind, message) => {
                    errors.push({ kind, message });
                }
            });

            const contributions = await normalizeContributions(ctx, {}) as Record<string, unknown>;
            expect(contributions.viewsContainers).to.deep.equal({
                left: [{
                    id: 'left-a',
                    title: 'A',
                    iconUrl: 'hostedPlugin/acme_merge/%24(a)',
                    themeIcon: '$(a)',
                    when: undefined
                }],
                right: [{
                    id: 'right-a',
                    title: 'Right',
                    iconUrl: 'hostedPlugin/acme_merge/%24(b)',
                    themeIcon: '$(b)',
                    when: undefined
                }]
            });
            expect(contributions).to.not.have.property('languages');
            expect(contributions).to.not.have.property('grammars');
            expect(errors.map(error => error.kind)).to.include.members(['languages', 'grammars']);
        });

        it('continues after reader errors and reports them', async () => {
            const errors: Array<{ kind: string; message: unknown }> = [];
            const ctx = createNormalizeCtx({
                name: 'broken',
                contributes: {
                    commands: [{ command: 'ok', title: 'OK' }],
                    configuration: { title: 'Broken' }
                }
            }, {
                readConfiguration: () => {
                    throw new Error('boom');
                },
                onError: (kind, message) => {
                    errors.push({ kind, message });
                }
            });

            const contributions = await normalizeContributions(ctx, {});
            expect(contributions).to.have.property('commands').with.lengthOf(1);
            expect(contributions).to.have.property('configuration').that.is.empty;
            expect(errors).to.have.lengthOf(1);
            expect(errors[0].kind).to.equal('configuration');
            expect(errors[0].message).to.be.instanceOf(Error);
        });
    });
});
