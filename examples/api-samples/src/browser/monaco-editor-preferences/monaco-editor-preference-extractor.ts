/********************************************************************************
 * Copyright (C) 2022 Ericsson and others.
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

/**
 * The command contributed in this file allows us to generate a copy of the schema expected for editor preferences by Monaco,
 * as well as an interface corresponding to those properties for use with our EditorPreferences PreferenceProxy.
 * It examines the schemata registered with the Monaco `ConfigurationRegistry` and writes any configurations associated with the editor
 * to a file in the `editor` package. It also generates an interface based on the types specified in the schema.
 * The only manual work required during a Monaco uplift is to run the command and then update any fields of the interface where the
 * schema type is `array` or `object`, since it is tricky to extract the type details for such fields automatically.
 */
import { ConfigurationScope, Extensions, IConfigurationRegistry } from '@theia/monaco-editor-core/esm/vs/platform/configuration/common/configurationRegistry';
import { Registry } from '@theia/monaco-editor-core/esm/vs/platform/registry/common/platform';
import { CommandContribution, CommandRegistry, MessageService } from '@theia/core';
import { inject, injectable, interfaces } from '@theia/core/shared/inversify';
import { FileService } from '@theia/filesystem/lib/browser/file-service';
import { WorkspaceService } from '@theia/workspace/lib/browser';

function generateContent(properties: string, interfaceEntries: string[]): string {
    return `/********************************************************************************
 * Copyright (C) 2022 Ericsson and others.
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

import { isOSX, isWindows, nls } from '@theia/core';
import { PreferenceSchema } from '@theia/core/lib/browser';

/* eslint-disable @typescript-eslint/quotes,max-len,@theia/localization-check,no-null/no-null */

/**
 * Please do not modify this file by hand. It should be generated automatically
 * during a Monaco uplift using the command registered by monaco-editor-preference-extractor.ts
 * The only manual work required is fixing preferences with type 'array' or 'object'.
 */

export const generatedEditorPreferenceProperties: PreferenceSchema['properties'] = ${properties};

export interface GeneratedEditorPreferences {
    ${interfaceEntries.join('\n    ')}
}
`;
}
const deQuoteMarker = '@#@';

// From src/vs/editor/common/config/editorOptions.ts
const DEFAULT_WINDOWS_FONT_FAMILY = "Consolas, \\'Courier New\\', monospace";
const DEFAULT_MAC_FONT_FAMILY = "Menlo, Monaco, \\'Courier New\\', monospace";
const DEFAULT_LINUX_FONT_FAMILY = "\\'Droid Sans Mono\\', \\'monospace\\', monospace";

const fontFamilyText = `${deQuoteMarker}isOSX ? '${DEFAULT_MAC_FONT_FAMILY}' : isWindows ? '${DEFAULT_WINDOWS_FONT_FAMILY}' : '${DEFAULT_LINUX_FONT_FAMILY}'${deQuoteMarker}`;
const fontSizeText = `${deQuoteMarker}isOSX ? 12 : 14${deQuoteMarker}`;

/**
 * This class is intended for use when uplifting Monaco.
 */
@injectable()
export class MonacoEditorPreferenceSchemaExtractor implements CommandContribution {
    @inject(WorkspaceService) protected readonly workspaceService: WorkspaceService;
    @inject(MessageService) protected readonly messageService: MessageService;
    @inject(FileService) protected readonly fileService: FileService;

    registerCommands(commands: CommandRegistry): void {
        commands.registerCommand({ id: 'extract-editor-preference-schema', label: 'Extract Editor preference schema from Monaco' }, {
            execute: async () => {
                const roots = this.workspaceService.tryGetRoots();
                if (roots.length !== 1 || !(roots[0].resource.path.toString() ?? '').includes('theia')) {
                    this.messageService.warn('This command should only be executed in the Theia workspace.');
                }
                const theiaRoot = roots[0];
                const fileToWrite = theiaRoot.resource.resolve('packages/editor/src/browser/editor-generated-preference-schema.ts');
                const properties = {};
                Registry.as<IConfigurationRegistry>(Extensions.Configuration).getConfigurations().forEach(config => {
                    if (config.id === 'editor' && config.properties) {
                        Object.assign(properties, config.properties);
                    }
                });
                this.guaranteePlatformOptions(properties);
                const interfaceEntries = [];
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                for (const [name, description] of Object.entries(properties) as Array<[string, any]>) {
                    description.scope = this.getScope(description.scope);
                    delete description.defaultDefaultValue;
                    if (name === 'editor.fontSize') {
                        description.default = fontSizeText;
                    } else if (name === 'editor.fontFamily') {
                        description.default = fontFamilyText;
                    }
                    interfaceEntries.push(`'${name}': ${this.formatTypeForInterface(description.enum ?? description.type)};`);
                }
                const propertyList = this.deQuoteCodeSnippets(JSON.stringify(properties, (key, value) => this.withLocalization(key, value), 4));
                const content = generateContent(propertyList, interfaceEntries);
                await this.fileService.write(fileToWrite, content);
            }
        });
    }

    protected getScope(monacoScope: unknown): string | undefined {
        switch (monacoScope) {
            case ConfigurationScope.MACHINE_OVERRIDABLE:
            case ConfigurationScope.WINDOW:
                return 'window';
            case ConfigurationScope.RESOURCE:
                return 'resource';
            case ConfigurationScope.LANGUAGE_OVERRIDABLE:
                return 'language-overridable';
            case ConfigurationScope.APPLICATION:
            case ConfigurationScope.MACHINE:
                return 'application';
        }
        return undefined;
    }

    protected formatTypeForInterface(jsonType: string | string[]): string {
        if (Array.isArray(jsonType)) {
            return jsonType.map(subtype => this.formatTypeForInterface(subtype)).join(' | ');
        }
        switch (jsonType) {
            case 'boolean':
            case 'number':
            case 'string':
            case 'true':
            case 'false':
                return jsonType;
            case 'integer':
                return 'number';
            case 'array':
            case 'object':
                // These have to be fixed manually, so we output a type that will cause a TS error.
                return 'Help';
        }
        // Most of the rest are string literals.
        return `'${jsonType}'`;
    }

    protected withLocalization(key: string, value: unknown): unknown {
        if ((key === 'description' || key === 'markdownDescription') && typeof value === 'string') {
            return `nls.localizeByDefault("${value}")`;
        }
        if ((key === 'enumDescriptions' || key === 'markdownEnumDescriptions') && Array.isArray(value)) {
            return value.map(description => `${deQuoteMarker}nls.localizeByDefault("${description}")${deQuoteMarker}`);
        }
        return value;
    }

    protected deQuoteCodeSnippets(stringification: string): string {
        return stringification
            .replace(new RegExp(`${deQuoteMarker}"|"${deQuoteMarker}`, 'g'), '')
            .replace(/\\\\'/g, "\\'");
    }

    /**
     * Ensures that options that are only relevant on certain platforms are caught.
     * Check for use of `platform` in src/vs/editor/common/config/editorOptions.ts
     */
    protected guaranteePlatformOptions(properties: object): void {
        Object.assign(properties, {
            'editor.find.globalFindClipboard': {
                type: 'boolean',
                default: false,
                description: 'Controls whether the Find Widget should read or modify the shared find clipboard on macOS.',
                included: `${deQuoteMarker}isOSX${deQuoteMarker}`,
            },
            'editor.selectionClipboard': {
                type: 'boolean',
                default: true,
                description: 'Controls whether the Linux primary clipboard should be supported.',
                included: `${deQuoteMarker}!isOSX && !isWindows${deQuoteMarker}`
            }
        });
    }
}

// Utility to assist with Monaco uplifts to generate preference schema. Not for regular use in the application.
export function bindMonacoPreferenceExtractor(bind: interfaces.Bind): void {
    // bind(MonacoEditorPreferenceSchemaExtractor).toSelf().inSingletonScope();
    // bind(CommandContribution).to(MonacoEditorPreferenceSchemaExtractor);
}
