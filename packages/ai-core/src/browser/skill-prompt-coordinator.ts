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

import { inject, injectable } from '@theia/core/shared/inversify';
import { FrontendApplicationContribution } from '@theia/core/lib/browser';
import { SkillService } from './skill-service';
import { PromptService } from '../common/prompt-service';

@injectable()
export class SkillPromptCoordinator implements FrontendApplicationContribution {

    @inject(SkillService)
    protected readonly skillService: SkillService;

    @inject(PromptService)
    protected readonly promptService: PromptService;

    protected registeredSkillCommands = new Set<string>();

    onStart(): void {
        // Register initial skills
        this.updateSkillCommands();

        // Listen for skill changes
        this.skillService.onSkillsChanged(() => {
            this.updateSkillCommands();
        });
    }

    protected updateSkillCommands(): void {
        const currentSkills = this.skillService.getSkills();
        const currentSkillNames = new Set(currentSkills.map(s => s.name));

        // Unregister removed skills
        for (const name of this.registeredSkillCommands) {
            if (!currentSkillNames.has(name)) {
                this.promptService.removePromptFragment(`skill-command-${name}`);
                this.registeredSkillCommands.delete(name);
            }
        }

        // Register new skills
        for (const skill of currentSkills) {
            if (!this.registeredSkillCommands.has(skill.name)) {
                this.promptService.addBuiltInPromptFragment({
                    id: `skill-command-${skill.name}`,
                    template: `{{skill:${skill.name}}}`,
                    isCommand: true,
                    commandName: skill.name,
                    commandDescription: skill.description
                });
                this.registeredSkillCommands.add(skill.name);
            }
        }
    }
}
