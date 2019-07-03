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
import { TextmateRegistry, getEncodedLanguageId, MonacoTextmateService } from '@theia/monaco/lib/browser/textmate';
import { MenusContributionPointHandler } from './menus/menus-contribution-handler';
import { ViewRegistry } from './view/view-registry';
import { PluginContribution, IndentationRules, FoldingRules, ScopeMap } from '../../common';
import { PreferenceSchemaProvider } from '@theia/core/lib/browser';
import { PreferenceSchema, PreferenceSchemaProperties } from '@theia/core/lib/browser/preferences';
import { KeybindingsContributionPointHandler } from './keybindings/keybindings-contribution-handler';
import { MonacoSnippetSuggestProvider } from '@theia/monaco/lib/browser/monaco-snippet-suggest-provider';
import { PluginSharedStyle } from './plugin-shared-style';
import { CommandRegistry, Command, CommandHandler } from '@theia/core/lib/common/command';
import { Disposable, DisposableCollection } from '@theia/core/lib/common/disposable';
import { Emitter } from '@theia/core/lib/common/event';
import { TaskDefinitionRegistry, ProblemMatcherRegistry, ProblemPatternRegistry } from '@theia/task/lib/browser';

@injectable()
export class PluginContributionHandler {

    private injections = new Map<string, string[]>();

    @inject(TextmateRegistry)
    private readonly grammarsRegistry: TextmateRegistry;

    @inject(ViewRegistry)
    private readonly viewRegistry: ViewRegistry;

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

    protected readonly commandHandlers = new Map<string, CommandHandler['execute'] | undefined>();

    protected readonly onDidRegisterCommandHandlerEmitter = new Emitter<string>();
    readonly onDidRegisterCommandHandler = this.onDidRegisterCommandHandlerEmitter.event;

    handleContributions(contributions: PluginContribution): void {
        if (contributions.configuration) {
            this.updateConfigurationSchema(contributions.configuration);
        }
        if (contributions.configurationDefaults) {
            this.updateDefaultOverridesSchema(contributions.configurationDefaults);
        }

        if (contributions.languages) {
            for (const lang of contributions.languages) {
                monaco.languages.register({
                    id: lang.id,
                    aliases: lang.aliases,
                    extensions: lang.extensions,
                    filenamePatterns: lang.filenamePatterns,
                    filenames: lang.filenames,
                    firstLine: lang.firstLine,
                    mimetypes: lang.mimetypes
                });
                if (lang.configuration) {
                    monaco.languages.setLanguageConfiguration(lang.id, {
                        wordPattern: this.createRegex(lang.configuration.wordPattern),
                        autoClosingPairs: lang.configuration.autoClosingPairs,
                        brackets: lang.configuration.brackets,
                        comments: lang.configuration.comments,
                        folding: this.convertFolding(lang.configuration.folding),
                        surroundingPairs: lang.configuration.surroundingPairs,
                        indentationRules: this.convertIndentationRules(lang.configuration.indentationRules)
                    });
                }
            }
        }

        if (contributions.grammars) {
            for (const grammar of contributions.grammars) {
                if (grammar.injectTo) {
                    for (const injectScope of grammar.injectTo) {
                        let injections = this.injections.get(injectScope);
                        if (!injections) {
                            injections = [];
                            this.injections.set(injectScope, injections);
                        }
                        injections.push(grammar.scope);
                    }
                }

                this.grammarsRegistry.registerTextmateGrammarScope(grammar.scope, {
                    async getGrammarDefinition() {
                        return {
                            format: grammar.format,
                            content: grammar.grammar || '',
                        };
                    },
                    getInjections: (scopeName: string) =>
                        this.injections.get(scopeName)!
                });
                if (grammar.language) {
                    this.grammarsRegistry.mapLanguageIdToTextmateGrammar(grammar.language, grammar.scope);
                    this.grammarsRegistry.registerGrammarConfiguration(grammar.language, {
                        embeddedLanguages: this.convertEmbeddedLanguages(grammar.embeddedLanguages),
                        tokenTypes: this.convertTokenTypes(grammar.tokenTypes)
                    });
                    monaco.languages.onLanguage(grammar.language, () => this.monacoTextmateService.activateLanguage(grammar.language!));
                }
            }
        }

        if (contributions.viewsContainers) {
            for (const location in contributions.viewsContainers) {
                if (contributions.viewsContainers!.hasOwnProperty(location)) {
                    const viewContainers = contributions.viewsContainers[location];
                    viewContainers.forEach(container => {
                        const views = contributions.views && contributions.views[container.id] ? contributions.views[container.id] : [];
                        this.viewRegistry.registerViewContainer(location, container, views);
                    });
                }
            }
        }

        this.registerCommands(contributions);
        this.menusContributionHandler.handle(contributions);
        this.keybindingsContributionHandler.handle(contributions);
        if (contributions.snippets) {
            for (const snippet of contributions.snippets) {
                this.snippetSuggestProvider.fromURI(snippet.uri, {
                    language: snippet.language,
                    source: snippet.source
                });
            }
        }

        if (contributions.taskDefinitions) {
            contributions.taskDefinitions.forEach(def => this.taskDefinitionRegistry.register(def));
        }

        if (contributions.problemPatterns) {
            contributions.problemPatterns.forEach(pattern => this.problemPatternRegistry.register(pattern));
        }

        if (contributions.problemMatchers) {
            contributions.problemMatchers.forEach(matcher => this.problemMatcherRegistry.register(matcher));
        }
    }

    protected registerCommands(contribution: PluginContribution): void {
        if (!contribution.commands) {
            return;
        }
        for (const { iconUrl, command, category, title } of contribution.commands) {
            const iconClass = iconUrl ? this.style.toIconClass(iconUrl) : undefined;
            this.registerCommand({
                id: command,
                category,
                label: title,
                iconClass
            });
        }
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
            isEnabled() { return true; },
            // Visibility rules are defined via the `menus` contribution point.
            isVisible() { return true; }
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

    private updateConfigurationSchema(schema: PreferenceSchema): void {
        this.validateConfigurationSchema(schema);
        this.preferenceSchemaProvider.setSchema(schema);
    }

    protected updateDefaultOverridesSchema(configurationDefaults: PreferenceSchemaProperties): void {
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
            this.preferenceSchemaProvider.setSchema(defaultOverrides);
        }
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
