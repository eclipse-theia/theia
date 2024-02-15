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

import { Endpoint } from '@theia/core/lib/browser';
import { Disposable, DisposableCollection } from '@theia/core/lib/common/disposable';
import { inject, injectable } from '@theia/core/shared/inversify';
import { URI } from '@theia/core/shared/vscode-uri';
import { MonacoIconRegistry } from '@theia/monaco/lib/browser/monaco-icon-registry';
import * as path from 'path';
import { IconContribution, DeployedPlugin, IconDefinition } from '../../common/plugin-protocol';

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
        return Disposable.NULL;
    }

    dispose(): void {
        this.toDispose.dispose();
    }

    protected registerFontIcon(contribution: IconContribution, defaultIcon: IconDefinition): void {
        const location = this.toPluginUrl(contribution.extensionId, getIconRelativePath(URI.parse(defaultIcon.location).path));
        const format = getFileExtension(location.path);
        const fontId = getFontId(contribution.extensionId, location.path);

        const definition = this.iconRegistry.registerIconFont(fontId, { src: [{ location: location, format }] });
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

    protected toPluginUrl(id: string, relativePath: string): URI {
        return URI.from(new Endpoint({
            path: `hostedPlugin/${this.formatExtensionId(id)}/${encodeURIComponent(relativePath)}`
        }).getRestUrl().toComponents());
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
