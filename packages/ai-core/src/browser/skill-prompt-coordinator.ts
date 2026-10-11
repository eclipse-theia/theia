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

import { inject, injectable, named } from '@theia/core/shared/inversify';
import { ILogger } from '@theia/core';
import { FrontendApplicationContribution } from '@theia/core/lib/browser';
import { SkillService } from './skill-service';
import { PromptService } from '../common/prompt-service';

@injectable()
export class SkillPromptCoordinator implements FrontendApplicationContribution {

    @inject(SkillService)
    protected readonly skillService: SkillService;

    @inject(PromptService)
    protected readonly promptService: PromptService;

    @inject(ILogger) @named('ai-core:SkillPromptCoordinator')
    protected readonly logger: ILogger;

    protected registeredSkillCommands = new Set<string>();

    onStart(): void {
        this.skillService.ready.then(() => {
            this.skillService.onSkillsChanged(() => {
                this.updateSkillCommands();
            });
            this.updateSkillCommands();
        }).catch(error => {
            this.logger.error('Failed to update skill commands', error);
        });
    }

    protected updateSkillCommands(): void {
        const currentSkills = this.skillService.getSkills();
        // Keyed by qualified name: two skills owned by different plugins can share a plain name.
        const currentSkillNames = new Set(currentSkills.map(s => s.qualifiedName));

        // Unregister removed skills
        for (const name of this.registeredSkillCommands) {
            if (!currentSkillNames.has(name)) {
                this.promptService.removePromptFragment(this.fragmentId(name));
                this.registeredSkillCommands.delete(name);
            }
        }

        // Register new skills
        for (const skill of currentSkills) {
            if (!this.registeredSkillCommands.has(skill.qualifiedName)) {
                this.promptService.addBuiltInPromptFragment({
                    id: this.fragmentId(skill.qualifiedName),
                    template: `Load the skill ${skill.qualifiedName} using ~{getSkillFileContent}.`,
                    isCommand: true,
                    commandName: skill.qualifiedName,
                    commandDescription: skill.description
                });
                this.registeredSkillCommands.add(skill.qualifiedName);
            }
        }
    }

    /**
     * A fragment id becomes a file name when the user customizes the fragment, so the qualifier's `:`
     * cannot survive into it - it is reserved on Windows. Only the id is sanitized; the command keeps
     * the qualified name.
     */
    protected fragmentId(qualifiedName: string): string {
        return `skill-command-${qualifiedName.replace(/:/g, '__')}`;
    }
}
