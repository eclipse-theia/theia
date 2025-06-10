// *****************************************************************************
// Copyright (C) 2025 EclipseSource GmbH and others.
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
import { Summary, TaskContextStorageService } from './task-context-service';
import { Emitter } from '@theia/core';
import { AIVariableResourceResolver } from '@theia/ai-core';
import { TASK_CONTEXT_VARIABLE } from './task-context-variable';
import { open, OpenerService } from '@theia/core/lib/browser';

@injectable()
export class InMemoryTaskContextStorage implements TaskContextStorageService {
    protected summaries = new Map<string, Summary>();

    protected readonly onDidChangeEmitter = new Emitter<void>();
    readonly onDidChange = this.onDidChangeEmitter.event;

    protected sanitizeLabel(label: string): string {
        return label.replace(/^[^\p{L}\p{N}]+/vg, '');
    }

    @inject(AIVariableResourceResolver)
    protected readonly variableResourceResolver: AIVariableResourceResolver;

    @inject(OpenerService)
    protected readonly openerService: OpenerService;

    store(summary: Summary): void {
        this.summaries.set(summary.id, { ...summary, label: this.sanitizeLabel(summary.label) });
        this.onDidChangeEmitter.fire();
    }

    getAll(): Summary[] {
        return Array.from(this.summaries.values());
    }

    get(identifier: string): Summary | undefined {
        return this.summaries.get(identifier);
    }

    delete(identifier: string): boolean {
        const didDelete = this.summaries.delete(identifier);
        if (didDelete) {
            this.onDidChangeEmitter.fire();
        }
        return didDelete;
    }

    clear(): void {
        if (this.summaries.size) {
            this.summaries.clear();
            this.onDidChangeEmitter.fire();
        }
    }

    async open(identifier: string): Promise<void> {
        const summary = this.get(identifier);
        if (!summary) {
            throw new Error('Unable to upon requested task context: none found.');
        }
        const resource = this.variableResourceResolver.getOrCreate({ variable: TASK_CONTEXT_VARIABLE, arg: identifier }, {}, summary.summary);
        resource.update({ onSave: async content => { summary.summary = content; }, readOnly: false });
        await open(this.openerService, resource.uri);
        resource.dispose();
    }
}
