// *****************************************************************************
// Copyright (C) 2022 TypeFox and others.
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

import { inject, injectable, postConstruct } from 'inversify';
import { escapeRegExpCharacters } from '../../common/strings';
import { Emitter, Event } from '../../common/event';
import { CorePreferences } from '../core-preferences';
import { FrontendApplicationConfigProvider } from '../frontend-application-config-provider';

export const InitialWindowTitleParts = {
    activeEditorShort: undefined,
    activeEditorMedium: undefined,
    activeEditorLong: undefined,
    activeFolderShort: undefined,
    activeFolderMedium: undefined,
    activeFolderLong: undefined,
    folderName: undefined,
    folderPath: undefined,
    rootName: undefined,
    rootPath: undefined,
    appName: FrontendApplicationConfigProvider.get().applicationName,
    remoteName: undefined,
    dirty: undefined,
    developmentHost: undefined
};

@injectable()
export class WindowTitleService {

    @inject(CorePreferences)
    protected readonly preferences: CorePreferences;

    protected _title = '';
    protected titleTemplate?: string;

    protected onDidChangeTitleEmitter = new Emitter<string>();
    protected titleParts = new Map<string, string | undefined>(Object.entries(InitialWindowTitleParts));
    protected separator = ' - ';

    @postConstruct()
    protected init(): void {
        this.titleTemplate = this.preferences['window.title'];
        this.separator = this.preferences['window.titleSeparator'];
        this.updateTitle();
        this.preferences.onPreferenceChanged(e => {
            if (e.preferenceName === 'window.title') {
                this.titleTemplate = e.newValue;
                this.updateTitle();
            } else if (e.preferenceName === 'window.titleSeparator') {
                this.separator = e.newValue;
                this.updateTitle();
            }
        });
    }

    get onDidChangeTitle(): Event<string> {
        return this.onDidChangeTitleEmitter.event;
    }

    get title(): string {
        return this._title;
    }

    update(parts: Record<string, string | undefined>): void {
        for (const [key, value] of Object.entries(parts)) {
            this.titleParts.set(key, value);
        }
        this.updateTitle();
    }

    protected updateTitle(): void {
        if (!this.titleTemplate) {
            this._title = '';
        } else {
            let title = this.titleTemplate;
            for (const [key, value] of this.titleParts.entries()) {
                if (key !== 'developmentHost') {
                    const label = `$\{${key}\}`;
                    const regex = new RegExp(escapeRegExpCharacters(label), 'g');
                    title = title.replace(regex, value ?? '');
                }
            }
            const separatedTitle = title.split('${separator}').filter(e => e.trim().length > 0);
            this._title = separatedTitle.join(this.separator);
        }
        const developmentHost = this.titleParts.get('developmentHost');
        if (developmentHost) {
            this._title = developmentHost + this.separator + this._title;
        }
        document.title = this._title || FrontendApplicationConfigProvider.get().applicationName;
        this.onDidChangeTitleEmitter.fire(this._title);
    }

}
