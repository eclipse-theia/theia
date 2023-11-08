// *****************************************************************************
// Copyright (C) 2023 EclipseSource and others.
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
import { Emitter, Event } from '../common';
import { IconThemeService } from './icon-theme-service';
import { DidChangeLabelEvent, LabelProviderContribution } from './label-provider';
import { LanguageService } from './language-service';

@injectable()
export class LanguageIconLabelProvider implements LabelProviderContribution {
    @inject(IconThemeService) protected readonly iconThemeService: IconThemeService;
    @inject(LanguageService) protected readonly languageService: LanguageService;

    protected readonly onDidChangeEmitter = new Emitter<DidChangeLabelEvent>();

    @postConstruct()
    protected init(): void {
        this.languageService.onDidChangeIcon(() => this.fireDidChange());
    }

    canHandle(element: object): number {
        const current = this.iconThemeService.getDefinition(this.iconThemeService.current);
        return current?.showLanguageModeIcons === true && this.languageService.getIcon(element) ? Number.MAX_SAFE_INTEGER : 0;
    }

    getIcon(element: object): string | undefined {
        const language = this.languageService.detectLanguage(element);
        return this.languageService.getIcon(language!.id);
    }

    get onDidChange(): Event<DidChangeLabelEvent> {
        return this.onDidChangeEmitter.event;
    }

    protected fireDidChange(): void {
        this.onDidChangeEmitter.fire({
            affects: element => this.canHandle(element) > 0
        });
    }

}
