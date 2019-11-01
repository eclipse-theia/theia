/********************************************************************************
 * Copyright (C) 2018 Red Hat, Inc. and others.
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

import { injectable, inject } from 'inversify';
import { ITokenTypeMap, IEmbeddedLanguagesMap, StandardTokenType } from 'vscode-textmate';
import { TextmateRegistry, getEncodedLanguageId, MonacoTextmateService, GrammarDefinition } from '@theia/monaco/lib/browser/textmate';
import { MenusContributionPointHandler } from './menus/menus-contribution-handler';
import { PluginViewRegistry } from './view/plugin-view-registry';
import { PluginContribution, IndentationRules, FoldingRules, ScopeMap, DeployedPlugin } from '../../common';
import { PreferenceSchemaProvider } from '@theia/core/lib/browser';
import { PreferenceSchema, PreferenceSchemaProperties } from '@theia/core/lib/browser/preferences';
import { KeybindingsContributionPointHandler } from './keybindings/keybindings-contribution-handler';
import { MonacoSnippetSuggestProvider } from '@theia/monaco/lib/browser/monaco-snippet-suggest-provider';
import { PluginSharedStyle } from './plugin-shared-style';
import { CommandRegistry, Command, CommandHandler } from '@theia/core/lib/common/command';
import { Disposable, DisposableCollection } from '@theia/core/lib/common/disposable';
import { Emitter } from '@theia/core/lib/common/event';
import { TaskDefinitionRegistry, ProblemMatcherRegistry, ProblemPatternRegistry } from '@theia/task/lib/browser';
import { PluginDebugService } from './debug/plugin-debug-service';
import { DebugSchemaUpdater } from '@theia/debug/lib/browser/debug-schema-updater';
import { MonacoThemingService } from '@theia/monaco/lib/browser/monaco-theming-service';
import { ColorRegistry } from '@theia/core/lib/browser/color-registry';

@injectable()
export class PluginContributionHandler {

    private injections = new Map<string, string[]>();

    @inject(TextmateRegistry)
    private readonly grammarsRegistry: TextmateRegistry;

    @inject(PluginViewRegistry)
    private readonly viewRegistry: PluginViewRegistry;

    @inject(MenusContributionPointHandler)
    private readonly menusContributionHandler: MenusContributionPointHandler;

    @inject(PreferenceSchemaProvider)
    private readonly preferenceSchemaProvider: PreferenceSchemaProvider;

    @inject(MonacoTextmateService)
    private readonly monacoTextmateService: MonacoTextmateService;

    @inject(KeybindingsContributionPointHandler)
    private readonly keybindingsContributionHandler: KeybindingsContributionPointHandler;

    @inject(MonacoSnippetSuggestProvider)
    protected readonly snippetSuggestProvider: MonacoSnippetSuggestProvider;

    @inject(CommandRegistry)
    protected readonly commands: CommandRegistry;

    @inject(PluginSharedStyle)
    protected readonly style: PluginSharedStyle;

    @inject(TaskDefinitionRegistry)
    protected readonly taskDefinitionRegistry: TaskDefinitionRegistry;

    @inject(ProblemMatcherRegistry)
    protected readonly problemMatcherRegistry: ProblemMatcherRegistry;

    @inject(ProblemPatternRegistry)
    protected readonly problemPatternRegistry: ProblemPatternRegistry;

    @inject(PluginDebugService)
    protected readonly debugService: PluginDebugService;

    @inject(DebugSchemaUpdater)
    protected readonly debugSchema: DebugSchemaUpdater;

    @inject(MonacoThemingService)
    protected readonly monacoThemingService: MonacoThemingService;

    @inject(ColorRegistry)
    protected readonly colors: ColorRegistry;

    protected readonly commandHandlers = new Map<string, CommandHandler['execute'] | undefined>();

    protected readonly onDidRegisterCommandHandlerEmitter = new Emitter<string>();
    readonly onDidRegisterCommandHandler = this.onDidRegisterCommandHandlerEmitter.event;

    protected readonly activatedLanguages = new Set<string>();

    /**
     * Always synchronous in order to simplify handling disconnections.
     * @throws never, loading of each contribution should handle errors
     * in order to avoid preventing loading of other contibutions or extensions
     */
    handleContributions(clientId: string, plugin: DeployedPlugin): Disposable {
        const contributions = plugin.contributes;
        if (!contributions) {
            return Disposable.NULL;
        }
        const toDispose = new DisposableCollection();
        const pushContribution = (id: string, contribute: () => Disposable) => {
            try {
                toDispose.push(contribute());
            } catch (e) {
                console.error(`[${clientId}][${plugin.metadata.model.id}]: Failed to load '${id}' contribution.`, e);
            }
        };

        const configuration = contributions.configuration;
        if (configuration) {
            for (const config of configuration) {
                pushContribution('configuration', () => this.updateConfigurationSchema(config));
            }
        }

        const configurationDefaults = contributions.configurationDefaults;
        if (configurationDefaults) {
            pushContribution('configurationDefaults', () => this.updateDefaultOverridesSchema(configurationDefaults));
        }

        const languages = contributions.languages;
        if (languages && languages.length) {
            for (const lang of languages) {
                /*
                 * Monaco guesses a language for opened plain text models on `monaco.languages.register`.
                 * It can trigger language activation before grammars are registered.
                 * Install onLanguage listener earlier in order to catch such activations and activate grammars as well.
                 */
                monaco.languages.onLanguage(lang.id, () => this.activatedLanguages.add(lang.id));
                // it is not possible to unregister a language
                monaco.languages.register({
                    id: lang.id,
                    aliases: lang.aliases,
                    extensions: lang.extensions,
                    filenamePatterns: lang.filenamePatterns,
                    filenames: lang.filenames,
                    firstLine: lang.firstLine,
                    mimetypes: lang.mimetypes
                });
                const langConfiguration = lang.configuration;
                if (langConfiguration) {
                    pushContribution(`language.${lang.id}.configuration`, () => monaco.languages.setLanguageConfiguration(lang.id, {
                        wordPattern: this.createRegex(langConfiguration.wordPattern),
                        autoClosingPairs: langConfiguration.autoClosingPairs,
                        brackets: langConfiguration.brackets,
                        comments: langConfiguration.comments,
                        folding: this.convertFolding(langConfiguration.folding),
                        surroundingPairs: langConfiguration.surroundingPairs,
                        indentationRules: this.convertIndentationRules(langConfiguration.indentationRules)
                    }));
                }
            }
        }

        const grammars = contributions.grammars;
        if (grammars && grammars.length) {
            for (const grammar of grammars) {
                if (grammar.injectTo) {
                    for (const injectScope of grammar.injectTo) {
                        pushContribution(`grammar.injectTo.${injectScope}`, () => {
                            const injections = this.injections.get(injectScope) || [];
                            injections.push(grammar.scope);
                            this.injections.set(injectScope, injections);
                            return Disposable.create(() => {
                                const index = injections.indexOf(grammar.scope);
                                if (index !== -1) {
                                    injections.splice(index, 1);
                                }
                            });
                        });
                    }
                }

                pushContribution(`grammar.textmate.scope.${grammar.scope}`, () => this.grammarsRegistry.registerTextmateGrammarScope(grammar.scope, {
                    async getGrammarDefinition(): Promise<GrammarDefinition> {
                        return {
                            format: grammar.format,
                            content: grammar.grammar || '',
                            location: grammar.grammarLocation
                        };
                    },
                    getInjections: (scopeName: string) =>
                        this.injections.get(scopeName)!
                }));
                const language = grammar.language;
                if (language) {
                    pushContribution(`grammar.language.${language}.scope`, () => this.grammarsRegistry.mapLanguageIdToTextmateGrammar(language, grammar.scope));
                    pushContribution(`grammar.language.${language}.configuration`, () => this.grammarsRegistry.registerGrammarConfiguration(language, {
                        embeddedLanguages: this.convertEmbeddedLanguages(grammar.embeddedLanguages),
                        tokenTypes: this.convertTokenTypes(grammar.tokenTypes)
                    }));
                    pushContribution(`grammar.language.${language}.activation`,
                        () => this.onDidActivateLanguage(language, () => this.monacoTextmateService.activateLanguage(language))
                    );
                }
            }
        }

        pushContribution('commands', () => this.registerCommands(contributions));
        pushContribution('menus', () => this.menusContributionHandler.handle(contributions));
        pushContribution('keybindings', () => this.keybindingsContributionHandler.handle(contributions));

        if (contributions.viewsContainers) {
            for (const location in contributions.viewsContainers) {
                if (contributions.viewsContainers!.hasOwnProperty(location)) {
                    for (const viewContainer of contributions.viewsContainers[location]) {
                        pushContribution(`viewContainers.${viewContainer.id}`,
                            () => this.viewRegistry.registerViewContainer(location, viewContainer)
                        );
                    }
                }
            }
        }
        if (contributions.views) {
            // tslint:disable-next-line:forin
            for (const location in contributions.views) {
                for (const view of contributions.views[location]) {
                    pushContribution(`views.${view.id}`,
                        () => this.viewRegistry.registerView(location, view)
                    );
                }
            }
        }

        if (contributions.snippets) {
            for (const snippet of contributions.snippets) {
                pushContribution(`snippets.${snippet.uri}`, () => this.snippetSuggestProvider.fromURI(snippet.uri, {
                    language: snippet.language,
                    source: snippet.source
                }));
            }
        }

        if (contributions.themes && contributions.themes.length) {
            const includes = {};
            for (const theme of contributions.themes) {
                pushContribution(`themes.${theme.uri}`, () => this.monacoThemingService.register(theme, includes));
            }
        }

        if (contributions.colors) {
            pushContribution('colors', () => this.colors.register(...contributions.colors));
        }

        if (contributions.taskDefinitions) {
            for (const taskDefinition of contributions.taskDefinitions) {
                pushContribution(`taskDefinitions.${taskDefinition.taskType}`,
                    () => this.taskDefinitionRegistry.register(taskDefinition)
                );
            }
        }

        if (contributions.problemPatterns) {
            for (const problemPattern of contributions.problemPatterns) {
                pushContribution(`problemPatterns.${problemPattern.name || problemPattern.regexp}`,
                    () => this.problemPatternRegistry.register(problemPattern)
                );
            }
        }

        if (contributions.problemMatchers) {
            for (const problemMatcher of contributions.problemMatchers) {
                pushContribution(`problemMatchers.${problemMatcher.label}`,
                    () => this.problemMatcherRegistry.register(problemMatcher)
                );
            }
        }

        if (contributions.debuggers && contributions.debuggers.length) {
            toDispose.push(Disposable.create(() => this.debugSchema.update()));
            for (const contribution of contributions.debuggers) {
                pushContribution(`debuggers.${contribution.type}`,
                    () => this.debugService.registerDebugger(contribution)
                );
            }
            this.debugSchema.update();
        }

        return toDispose;
    }

    protected registerCommands(contribution: PluginContribution): Disposable {
        if (!contribution.commands) {
            return Disposable.NULL;
        }
        const toDispose = new DisposableCollection();
        for (const { iconUrl, command, category, title } of contribution.commands) {
            const reference = iconUrl && this.style.toIconClass(iconUrl);
            let iconClass;
            if (reference) {
                toDispose.push(reference);
                iconClass = reference.object.iconClass;
            }
            toDispose.push(this.registerCommand({ id: command, category, label: title, iconClass }));
        }
        return toDispose;
    }

    registerCommand(command: Command): Disposable {
        const toDispose = new DisposableCollection();
        toDispose.push(this.commands.registerCommand(command, {
            execute: async (...args) => {
                const handler = this.commandHandlers.get(command.id);
                if (!handler) {
                    throw new Error(`command '${command.id}' not found`);
                }
                return handler(...args);
            },
            // Always enabled - a command can be executed programmatically or via the commands palette.
            isEnabled(): boolean { return true; },
            // Visibility rules are defined via the `menus` contribution point.
            isVisible(): boolean { return true; }
        }));
        this.commandHandlers.set(command.id, undefined);
        toDispose.push(Disposable.create(() => this.commandHandlers.delete(command.id)));
        return toDispose;
    }

    registerCommandHandler(id: string, execute: CommandHandler['execute']): Disposable {
        this.commandHandlers.set(id, execute);
        this.onDidRegisterCommandHandlerEmitter.fire(id);
        return Disposable.create(() => this.commandHandlers.set(id, undefined));
    }

    hasCommand(id: string): boolean {
        return this.commandHandlers.has(id);
    }

    hasCommandHandler(id: string): boolean {
        return !!this.commandHandlers.get(id);
    }

    protected onDidActivateLanguage(language: string, cb: () => {}): Disposable {
        if (this.activatedLanguages.has(language)) {
            cb();
            return Disposable.NULL;
        }
        return monaco.languages.onLanguage(language, cb);
    }

    private updateConfigurationSchema(schema: PreferenceSchema): Disposable {
        this.validateConfigurationSchema(schema);
        return this.preferenceSchemaProvider.setSchema(schema);
    }

    protected updateDefaultOverridesSchema(configurationDefaults: PreferenceSchemaProperties): Disposable {
        const defaultOverrides: PreferenceSchema = {
            id: 'defaultOverrides',
            title: 'Default Configuration Overrides',
            properties: {}
        };
        // tslint:disable-next-line:forin
        for (const key in configurationDefaults) {
            const defaultValue = configurationDefaults[key];
            if (this.preferenceSchemaProvider.testOverrideValue(key, defaultValue)) {
                defaultOverrides.properties[key] = {
                    type: 'object',
                    default: defaultValue,
                    description: `Configure editor settings to be overridden for ${key} language.`
                };
            }
        }
        if (Object.keys(defaultOverrides.properties).length) {
            return this.preferenceSchemaProvider.setSchema(defaultOverrides);
        }
        return Disposable.NULL;
    }

    private createRegex(value: string | undefined): RegExp | undefined {
        if (typeof value === 'string') {
            return new RegExp(value, '');
        }
        return undefined;
    }

    private convertIndentationRules(rules?: IndentationRules): monaco.languages.IndentationRule | undefined {
        if (!rules) {
            return undefined;
        }
        return {
            decreaseIndentPattern: this.createRegex(rules.decreaseIndentPattern)!,
            increaseIndentPattern: this.createRegex(rules.increaseIndentPattern)!,
            indentNextLinePattern: this.createRegex(rules.indentNextLinePattern),
            unIndentedLinePattern: this.createRegex(rules.unIndentedLinePattern)
        };
    }

    private convertFolding(folding?: FoldingRules): monaco.languages.FoldingRules | undefined {
        if (!folding) {
            return undefined;
        }
        const result: monaco.languages.FoldingRules = {
            offSide: folding.offSide
        };

        if (folding.markers) {
            result.markers = {
                end: this.createRegex(folding.markers.end)!,
                start: this.createRegex(folding.markers.start)!
            };
        }

        return result;

    }

    private convertTokenTypes(tokenTypes?: ScopeMap): ITokenTypeMap | undefined {
        if (typeof tokenTypes === 'undefined' || tokenTypes === null) {
            return undefined;
        }
        // tslint:disable-next-line:no-null-keyword
        const result = Object.create(null);
        const scopes = Object.keys(tokenTypes);
        const len = scopes.length;
        for (let i = 0; i < len; i++) {
            const scope = scopes[i];
            const tokenType = tokenTypes[scope];
            switch (tokenType) {
                case 'string':
                    result[scope] = StandardTokenType.String;
                    break;
                case 'other':
                    result[scope] = StandardTokenType.Other;
                    break;
                case 'comment':
                    result[scope] = StandardTokenType.Comment;
                    break;
            }
        }
        return result;
    }

    private convertEmbeddedLanguages(languages?: ScopeMap): IEmbeddedLanguagesMap | undefined {
        if (typeof languages === 'undefined' || languages === null) {
            return undefined;
        }

        // tslint:disable-next-line:no-null-keyword
        const result = Object.create(null);
        const scopes = Object.keys(languages);
        const len = scopes.length;
        for (let i = 0; i < len; i++) {
            const scope = scopes[i];
            const langId = languages[scope];
            result[scope] = getEncodedLanguageId(langId);
        }
        return result;
    }

    protected validateConfigurationSchema(schema: PreferenceSchema): void {
        // tslint:disable-next-line:forin
        for (const p in schema.properties) {
            const property = schema.properties[p];
            if (property.type !== 'object') {
                continue;
            }

            if (!property.default) {
                this.validateDefaultValue(property);
            }

            const properties = property['properties'];
            if (properties) {
                // tslint:disable-next-line:forin
                for (const key in properties) {
                    if (typeof properties[key] !== 'object') {
                        delete properties[key];
                    }
                }
            }
        }
    }

    private validateDefaultValue(property: PreferenceSchemaProperties): void {
        property.default = {};

        const properties = property['properties'];
        if (properties) {
            // tslint:disable-next-line:forin
            for (const key in properties) {
                if (properties[key].default) {
                    property.default[key] = properties[key].default;
                    delete properties[key].default;
                }
            }
        }
    }

}
