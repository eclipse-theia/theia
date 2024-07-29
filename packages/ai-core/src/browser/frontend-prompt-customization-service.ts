// *****************************************************************************
// Copyright (C) 2024 EclipseSource GmbH.
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

import { inject, injectable, postConstruct } from '@theia/core/shared/inversify';
import { PromptCustomizationService } from '../common';
import { PromptPreferences } from './prompt-preferences';
import { FileService } from '@theia/filesystem/lib/browser/file-service';
import { URI } from '@theia/core';

@injectable()
export class FrontendPromptCustomizationServiceImpl implements PromptCustomizationService {

    @inject(PromptPreferences)
    protected readonly preferences: PromptPreferences;

    @inject(FileService)
    protected readonly fileService: FileService;

    protected readonly templates = new Map<string, string>();

    @postConstruct()
    protected init(): void {
        this.preferences.onPreferenceChanged(event => {
            if (event.preferenceName === 'ai-chat.templates-folder') {
                this.update();
            }
        });
        this.update();
    }

    protected async update(): Promise<void> {
        this.templates.clear();
        const templateFolder = this.preferences['ai-chat.templates-folder'];
        if (templateFolder === undefined || templateFolder.trim().length === 0) {
            return;
        }
        const stat = await this.fileService.resolve(URI.fromFilePath(templateFolder));
        if (stat.children === undefined) {
            return;
        }
        for (const file of stat.children) {
            if (!file.isFile) {
                continue;
            }
            const filecontent = await this.fileService.read(file.resource);
            this.templates.set(this.removePromptTemplateSuffix(file.name), filecontent.value);
        }
    }

    protected removePromptTemplateSuffix(filename: string): string {
        const suffix = '.prompttemplate';
        if (filename.endsWith(suffix)) {
            return filename.slice(0, -suffix.length);
        }
        return filename;
    }

    isPromptTemplateCustomized(id: string): boolean {
        return this.templates.has(id);
    }

    getCustomizedPromptTemplate(id: string): string | undefined {
        return this.templates.get(id);
    }
}
