// *****************************************************************************
// Copyright (C) 2023 Ericsson and others.
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

import { asCSSPropertyValue } from '@theia/monaco-editor-core/esm/vs/base/browser/dom';
import { Endpoint } from '@theia/core/lib/browser';
import { Disposable, DisposableCollection } from '@theia/core/lib/common/disposable';
import { getIconRegistry } from '@theia/monaco-editor-core/esm/vs/platform/theme/common/iconRegistry';
import { inject, injectable } from '@theia/core/shared/inversify';
import { URI } from '@theia/core/shared/vscode-uri';
import { IconFontDefinition, IconContribution as Icon } from '@theia/core/lib/browser/icon-registry';
import { MonacoIconRegistry } from '@theia/monaco/lib/browser/monaco-icon-registry';
import * as path from 'path';
import { IconContribution, DeployedPlugin, IconDefinition } from '../../common/plugin-protocol';
import { IThemeService } from '@theia/monaco-editor-core/esm/vs/platform/theme/common/themeService';
import { UnthemedProductIconTheme } from '@theia/monaco-editor-core/esm/vs/platform/theme/browser/iconsStyleSheet';

@injectable()
export class PluginIconService implements Disposable {

    @inject(MonacoIconRegistry)
    protected readonly iconRegistry: MonacoIconRegistry;

    protected readonly toDispose = new DisposableCollection();

    styleSheet: string = '';
    styleElement: HTMLStyleElement;

    register(contribution: IconContribution, plugin: DeployedPlugin): Disposable {
        const defaultIcon = contribution.defaults;
        if (IconContribution.isIconDefinition(defaultIcon)) {
            this.registerFontIcon(contribution, defaultIcon);
        } else {
            this.registerRegularIcon(contribution, defaultIcon.id);
        }
        this.updateStyle(contribution);
        return Disposable.NULL;
    }

    updateStyle(contribution: IconContribution): void {
        this.updateStyleElement();
        const css = this.getCSS(contribution);
        if (css) {
            this.styleElement.innerText = css;
        }
        const toRemoveStyleElement = Disposable.create(() => this.styleElement.remove());
        this.toDispose.push(toRemoveStyleElement);
    }

    dispose(): void {
        this.toDispose.dispose();
    }

    protected registerFontIcon(contribution: IconContribution, defaultIcon: IconDefinition): void {
        const location = defaultIcon.location;
        const format = getFileExtension(location);
        const fontId = getFontId(contribution.extensionId, location);
        const definition = this.iconRegistry.registerIconFont(fontId, { src: [{ location: URI.file(location), format }] });
        this.iconRegistry.registerIcon(contribution.id, {
            fontCharacter: defaultIcon.fontCharacter,
            font: {
                id: fontId,
                definition
            }
        }, contribution.description);
    }

    protected registerRegularIcon(contribution: IconContribution, defaultIconId: string): void {
        this.iconRegistry.registerIcon(contribution.id, { id: defaultIconId }, contribution.description);
    }

    protected updateStyleElement(): void {
        if (!this.styleElement) {
            const styleElement = document.createElement('style');
            styleElement.type = 'text/css';
            styleElement.media = 'screen';
            styleElement.id = 'contributedIconsStyles';
            document.head.appendChild(styleElement);
            this.styleElement = styleElement;
        }
    }
    protected getCSS(iconContribution: IconContribution, themeService?: IThemeService): string | undefined {
        const iconRegistry = getIconRegistry();
        const productIconTheme = themeService ? themeService.getProductIconTheme() : new UnthemedProductIconTheme();
        const usedFontIds: { [id: string]: IconFontDefinition } = {};
        const formatIconRule = (contribution: Icon): string | undefined => {
            const definition = productIconTheme.getIcon(contribution);
            if (!definition) {
                return undefined;
            }
            const fontContribution = definition.font;
            if (fontContribution) {
                usedFontIds[fontContribution.id] = fontContribution.definition;
                return `.codicon-${contribution.id}:before { content: '${definition.fontCharacter}'; font-family: ${asCSSPropertyValue(iconContribution.extensionId)}; }`;
            }
            // default font (codicon)
            return `.codicon-${contribution.id}:before { content: '${definition.fontCharacter}'; }`;
        };

        const rules = [];
        for (const contribution of iconRegistry.getIcons()) {
            const rule = formatIconRule(contribution);
            if (rule) {
                rules.push(rule);
            }
        }
        for (const id in usedFontIds) {
            if (id) {
                const definition = usedFontIds[id];
                const fontWeight = definition.weight ? `font-weight: ${definition.weight};` : '';
                const fontStyle = definition.style ? `font-style: ${definition.style};` : '';
                const src = definition.src.map(icon =>
                    `${this.toPluginUrl(iconContribution.extensionId, getIconRelativePath(icon.location.path))} format('${icon.format}')`)
                    .join(', ');
                rules.push(`@font-face { src: ${src}; font-family: ${asCSSPropertyValue(iconContribution.extensionId)};${fontWeight}${fontStyle} font-display: block; }`);
            }
        }
        return rules.join('\n');
    }

    protected toPluginUrl(id: string, relativePath: string): string {
        return `url('${new Endpoint({
            path: `hostedPlugin/${this.formatExtensionId(id)}/${encodeURIComponent(relativePath)}`
        }).getRestUrl().toString()}')`;
    }

    protected formatExtensionId(id: string): string {
        return id.replace(/\W/g, '_');
    }
}

function getIconRelativePath(iconPath: string): string {
    const index = iconPath.indexOf('extension');
    return index === -1 ? '' : iconPath.substring(index + 'extension'.length + 1);
}

function getFontId(extensionId: string, fontPath: string): string {
    return path.join(extensionId, fontPath);
}

function getFileExtension(filePath: string): string {
    const index = filePath.lastIndexOf('.');
    return index === -1 ? '' : filePath.substring(index + 1);
}
