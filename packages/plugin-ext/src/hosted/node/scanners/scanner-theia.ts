/********************************************************************************
 * Copyright (C) 2015-2018 Red Hat, Inc.
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
import {
    PluginEngine,
    PluginModel,
    PluginPackage,
    PluginScanner,
    PluginLifecycle,
    buildFrontendModuleName,
    PluginContribution,
    PluginPackageLanguageContribution,
    LanguageContribution,
    PluginPackageLanguageContributionConfiguration,
    LanguageConfiguration,
    AutoClosingPairConditional,
    AutoClosingPair,
    ViewContainer,
    PluginPackageViewContainer,
    View,
    PluginPackageView,
    Menu,
    PluginPackageMenu
} from '../../../common/plugin-protocol';
import * as fs from 'fs';
import * as path from 'path';
import { isObject } from 'util';
import { GrammarsReader } from './grammars-reader';
import { CharacterPair } from '../../../api/plugin-api';

@injectable()
export class TheiaPluginScanner implements PluginScanner {
    private readonly _apiType: PluginEngine = 'theiaPlugin';

    @inject(GrammarsReader)
    private readonly grammarsReader: GrammarsReader;

    get apiType(): PluginEngine {
        return this._apiType;
    }

    getModel(plugin: PluginPackage): PluginModel {
        const result: PluginModel = {
            id: `${plugin.publisher}.${plugin.name}`,
            name: plugin.name,
            publisher: plugin.publisher,
            version: plugin.version,
            displayName: plugin.displayName,
            description: plugin.description,
            engine: {
                type: this._apiType,
                version: plugin.engines[this._apiType]
            },
            entryPoint: {
                frontend: plugin.theiaPlugin!.frontend,
                backend: plugin.theiaPlugin!.backend
            }
        };
        result.contributes = this.readContributions(plugin);
        return result;
    }

    getLifecycle(plugin: PluginPackage): PluginLifecycle {
        return {
            startMethod: 'start',
            stopMethod: 'stop',
            frontendModuleName: buildFrontendModuleName(plugin),

            backendInitPath: __dirname + '/backend-init-theia.js'
        };
    }

    protected readContributions(rawPlugin: PluginPackage): PluginContribution | undefined {
        if (!rawPlugin.contributes) {
            return undefined;
        }

        const contributions: PluginContribution = {};
        if (rawPlugin.contributes!.languages) {
            const languages = this.readLanguages(rawPlugin.contributes.languages!, rawPlugin.packagePath);
            contributions.languages = languages;
        }

        if (rawPlugin.contributes!.grammars) {
            const grammars = this.grammarsReader.readGrammars(rawPlugin.contributes.grammars!, rawPlugin.packagePath);
            contributions.grammars = grammars;
        }

        if (rawPlugin.contributes!.viewsContainers) {
            contributions.viewsContainers = {};

            Object.keys(rawPlugin.contributes.viewsContainers!).forEach(location => {
                const containers = this.readViewsContainers(rawPlugin.contributes!.viewsContainers![location], rawPlugin.packagePath);
                if (location === 'activitybar') {
                    location = 'left';
                }

                if (contributions.viewsContainers![location]) {
                    contributions.viewsContainers![location] = contributions.viewsContainers![location].concat(containers);
                } else {
                    contributions.viewsContainers![location] = containers;
                }
            });
        }

        if (rawPlugin.contributes!.views) {
            contributions.views = {};

            Object.keys(rawPlugin.contributes.views!).forEach(location => {
                const views = this.readViews(rawPlugin.contributes!.views![location]);
                contributions.views![location] = views;
            });
        }

        if (rawPlugin.contributes!.menus) {
            contributions.menus = {};

            Object.keys(rawPlugin.contributes.menus!).forEach(location => {
                const menus = this.readMenus(rawPlugin.contributes!.menus![location]);
                contributions.menus![location] = menus;
            });
        }

        return contributions;
    }

    private readViewsContainers(rawViewsContainers: PluginPackageViewContainer[], pluginPath: string): ViewContainer[] {
        return rawViewsContainers.map(rawViewContainer => this.readViewContainer(rawViewContainer, pluginPath));
    }

    private readViewContainer(rawViewContainer: PluginPackageViewContainer, pluginPath: string): ViewContainer {
        const result: ViewContainer = {
            id: rawViewContainer.id,
            title: rawViewContainer.title,
            icon: rawViewContainer.icon
        };

        return result;
    }

    private readViews(rawViews: PluginPackageView[]): View[] {
        return rawViews.map(rawView => this.readView(rawView));
    }

    private readView(rawView: PluginPackageView): View {
        const result: View = {
            id: rawView.id,
            name: rawView.name
        };

        return result;
    }

    private readMenus(rawMenus: PluginPackageMenu[]): Menu[] {
        return rawMenus.map(rawMenu => this.readMenu(rawMenu));
    }

    private readMenu(rawMenu: PluginPackageMenu): Menu {
        const result: Menu = {
            command: rawMenu.command,
            group: rawMenu.group
        };
        return result;
    }

    private readLanguages(rawLanguages: PluginPackageLanguageContribution[], pluginPath: string): LanguageContribution[] {
        return rawLanguages.map(language => this.readLanguage(language, pluginPath));
    }

    private readLanguage(rawLang: PluginPackageLanguageContribution, pluginPath: string): LanguageContribution {
        // TODO: add validation to all parameters
        const result: LanguageContribution = {
            id: rawLang.id,
            aliases: rawLang.aliases,
            extensions: rawLang.extensions,
            filenamePatterns: rawLang.filenamePatterns,
            filenames: rawLang.filenames,
            firstLine: rawLang.firstLine,
            mimetypes: rawLang.mimetypes
        };
        if (rawLang.configuration) {
            const conf = fs.readFileSync(path.resolve(pluginPath, rawLang.configuration), 'utf8');
            if (conf) {
                const rawConfiguration: PluginPackageLanguageContributionConfiguration = JSON.parse(conf);

                const configuration: LanguageConfiguration = {
                    brackets: rawConfiguration.brackets,
                    comments: rawConfiguration.comments,
                    folding: rawConfiguration.folding,
                    wordPattern: rawConfiguration.wordPattern,
                    autoClosingPairs: this.extractValidAutoClosingPairs(rawLang.id, rawConfiguration),
                    indentationRules: rawConfiguration.indentationRules,
                    surroundingPairs: this.extractValidSurroundingPairs(rawLang.id, rawConfiguration)
                };
                result.configuration = configuration;
            }
        }
        return result;

    }

    private extractValidAutoClosingPairs(langId: string, configuration: PluginPackageLanguageContributionConfiguration): AutoClosingPairConditional[] | undefined {
        const source = configuration.autoClosingPairs;
        if (typeof source === 'undefined') {
            return undefined;
        }
        if (!Array.isArray(source)) {
            console.warn(`[${langId}]: language configuration: expected \`autoClosingPairs\` to be an array.`);
            return undefined;
        }

        let result: AutoClosingPairConditional[] | undefined = undefined;
        // tslint:disable-next-line:one-variable-per-declaration
        for (let i = 0, len = source.length; i < len; i++) {
            const pair = source[i];
            if (Array.isArray(pair)) {
                if (!isCharacterPair(pair)) {
                    console.warn(`[${langId}]: language configuration: expected \`autoClosingPairs[${i}]\` to be an array of two strings or an object.`);
                    continue;
                }
                result = result || [];
                result.push({ open: pair[0], close: pair[1] });
            } else {
                if (!isObject(pair)) {
                    console.warn(`[${langId}]: language configuration: expected \`autoClosingPairs[${i}]\` to be an array of two strings or an object.`);
                    continue;
                }
                if (typeof pair.open !== 'string') {
                    console.warn(`[${langId}]: language configuration: expected \`autoClosingPairs[${i}].open\` to be a string.`);
                    continue;
                }
                if (typeof pair.close !== 'string') {
                    console.warn(`[${langId}]: language configuration: expected \`autoClosingPairs[${i}].close\` to be a string.`);
                    continue;
                }
                if (typeof pair.notIn !== 'undefined') {
                    if (!isStringArr(pair.notIn)) {
                        console.warn(`[${langId}]: language configuration: expected \`autoClosingPairs[${i}].notIn\` to be a string array.`);
                        continue;
                    }
                }
                result = result || [];
                result.push({ open: pair.open, close: pair.close, notIn: pair.notIn });
            }
        }
        return result;
    }

    private extractValidSurroundingPairs(langId: string, configuration: PluginPackageLanguageContributionConfiguration): AutoClosingPair[] | undefined {
        const source = configuration.surroundingPairs;
        if (typeof source === 'undefined') {
            return undefined;
        }
        if (!Array.isArray(source)) {
            console.warn(`[${langId}]: language configuration: expected \`surroundingPairs\` to be an array.`);
            return undefined;
        }

        let result: AutoClosingPair[] | undefined = undefined;
        // tslint:disable-next-line:one-variable-per-declaration
        for (let i = 0, len = source.length; i < len; i++) {
            const pair = source[i];
            if (Array.isArray(pair)) {
                if (!isCharacterPair(pair)) {
                    console.warn(`[${langId}]: language configuration: expected \`surroundingPairs[${i}]\` to be an array of two strings or an object.`);
                    continue;
                }
                result = result || [];
                result.push({ open: pair[0], close: pair[1] });
            } else {
                if (!isObject(pair)) {
                    console.warn(`[${langId}]: language configuration: expected \`surroundingPairs[${i}]\` to be an array of two strings or an object.`);
                    continue;
                }
                if (typeof pair.open !== 'string') {
                    console.warn(`[${langId}]: language configuration: expected \`surroundingPairs[${i}].open\` to be a string.`);
                    continue;
                }
                if (typeof pair.close !== 'string') {
                    console.warn(`[${langId}]: language configuration: expected \`surroundingPairs[${i}].close\` to be a string.`);
                    continue;
                }
                result = result || [];
                result.push({ open: pair.open, close: pair.close });
            }
        }
        return result;
    }

}

function isCharacterPair(something: CharacterPair): boolean {
    return (
        isStringArr(something)
        && something.length === 2
    );
}

function isStringArr(something: string[]): boolean {
    if (!Array.isArray(something)) {
        return false;
    }
    // tslint:disable-next-line:one-variable-per-declaration
    for (let i = 0, len = something.length; i < len; i++) {
        if (typeof something[i] !== 'string') {
            return false;
        }
    }
    return true;

}
