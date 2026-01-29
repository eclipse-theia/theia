// *****************************************************************************
// Copyright (C) 2026 EclipseSource GmbH.
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

import { nls, URI } from '@theia/core';
import { OpenerService, open } from '@theia/core/lib/browser';
import { inject, injectable, postConstruct } from '@theia/core/shared/inversify';
import * as React from '@theia/core/shared/react';
import { Skill } from '@theia/ai-core/lib/common/skill';
import { SkillService } from '@theia/ai-core/lib/browser/skill-service';
import { AITableConfigurationWidget, TableColumn } from './base/ai-table-configuration-widget';

@injectable()
export class AISkillsConfigurationWidget extends AITableConfigurationWidget<Skill> {
    static readonly ID = 'ai-skills-configuration-widget';
    static readonly LABEL = nls.localize('theia/ai/ide/skillsConfiguration/label', 'Skills');

    @inject(SkillService)
    protected readonly skillService: SkillService;

    @inject(OpenerService)
    protected readonly openerService: OpenerService;

    @postConstruct()
    protected init(): void {
        this.id = AISkillsConfigurationWidget.ID;
        this.title.label = AISkillsConfigurationWidget.LABEL;
        this.title.closable = false;
        this.addClass('ai-configuration-widget');

        this.loadItems().then(() => this.update());
        this.toDispose.push(this.skillService.onSkillsChanged(() => {
            this.loadItems().then(() => this.update());
        }));
    }

    protected async loadItems(): Promise<void> {
        this.items = this.skillService.getSkills();
    }

    protected getItemId(item: Skill): string {
        return item.name;
    }

    protected getColumns(): TableColumn<Skill>[] {
        return [
            {
                id: 'skill-name',
                label: nls.localizeByDefault('Name'),
                className: 'skill-name-column',
                renderCell: (item: Skill) => <span>{item.name}</span>
            },
            {
                id: 'skill-description',
                label: nls.localizeByDefault('Description'),
                className: 'skill-description-column',
                renderCell: (item: Skill) => <span>{item.description}</span>
            },
            {
                id: 'skill-location',
                label: nls.localize('theia/ai/ide/skillsConfiguration/location/label', 'Location'),
                className: 'skill-location-column',
                renderCell: (item: Skill) => <span>{item.location}</span>
            },
            {
                id: 'skill-open',
                label: '',
                className: 'skill-open-column',
                renderCell: (item: Skill) => (
                    <button
                        className="theia-button secondary"
                        onClick={() => this.openSkill(item)}
                        title={nls.localizeByDefault('Open')}
                    >
                        {nls.localizeByDefault('Open')}
                    </button>
                )
            }
        ];
    }

    protected openSkill(skill: Skill): void {
        open(this.openerService, URI.fromFilePath(skill.location));
    }
}
