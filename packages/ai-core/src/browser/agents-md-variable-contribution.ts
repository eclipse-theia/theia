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
import { MaybePromise, nls } from '@theia/core';
import {
    AIVariable, AIVariableContext, AIVariableContribution, AIVariableResolutionRequest,
    AIVariableResolver, AIVariableService, ResolvedAIVariable
} from '../common/variable-service';
import { WorkspaceService } from '@theia/workspace/lib/browser';
import { AGENTS_MD_FILE_NAME } from '../common/agents-md';
import { AgentsMdFile, AgentsMdService } from './agents-md-service';

export const AGENTS_MD_AUTO_LOADED_VARIABLE: AIVariable = {
    id: 'agentsMdAutoLoaded',
    name: 'agentsMdAutoLoaded',
    description: nls.localize('theia/ai/core/agentsMdAutoLoadedVariable/description',
        'Returns the content of the workspace root AGENTS.md when the workspace has a single root, so that it is always in context')
};

export const AGENTS_MD_VARIABLE: AIVariable = {
    id: 'agentsMd',
    name: 'agentsMd',
    description: nls.localize('theia/ai/core/agentsMdVariable/description',
        'Lists the AGENTS.md files an agent has to read on demand, i.e. the ones that are not already loaded')
};

export const AGENTS_MD_CONTENT_VARIABLE: AIVariable = {
    id: 'agentsMdContent',
    name: 'agentsMdContent',
    description: nls.localize('theia/ai/core/agentsMdContentVariable/description',
        'Returns the full content of the AGENTS.md files of the workspace')
};

/**
 * Resolves the three ways of consuming `AGENTS.md`.
 *
 * A **single-root** workspace has an unambiguous project root, so its `AGENTS.md` is always in
 * context, mirroring how other tools implementing the standard treat the root file. A workspace with
 * several roots has no such file, so nothing is loaded and every discovered file is advertised
 * instead, to be read on demand. {@link AGENTS_MD_AUTO_LOADED_VARIABLE} and
 * {@link AGENTS_MD_VARIABLE} are therefore mutually exclusive by construction: at most one of them is
 * ever non-empty.
 *
 * - {@link AGENTS_MD_AUTO_LOADED_VARIABLE} inlines the single root's file, or nothing.
 * - {@link AGENTS_MD_VARIABLE} advertises files by path so a tool-calling agent can fetch them with
 *   `getFileContent`, or nothing.
 * - {@link AGENTS_MD_CONTENT_VARIABLE} always inlines everything discovered, regardless of root
 *   count, for consumers such as code completion that have no tool-calling loop and therefore cannot
 *   fetch anything on demand.
 *
 * All three resolve to the empty string when the workspace has no `AGENTS.md`.
 */
@injectable()
export class AgentsMdVariableContribution implements AIVariableContribution, AIVariableResolver {

    @inject(AgentsMdService)
    protected readonly agentsMdService: AgentsMdService;

    @inject(WorkspaceService)
    protected readonly workspaceService: WorkspaceService;

    registerVariables(service: AIVariableService): void {
        service.registerResolver(AGENTS_MD_AUTO_LOADED_VARIABLE, this);
        service.registerResolver(AGENTS_MD_VARIABLE, this);
        service.registerResolver(AGENTS_MD_CONTENT_VARIABLE, this);
    }

    canResolve(request: AIVariableResolutionRequest, _context: AIVariableContext): MaybePromise<number> {
        if (request.variable.name === AGENTS_MD_AUTO_LOADED_VARIABLE.name
            || request.variable.name === AGENTS_MD_VARIABLE.name
            || request.variable.name === AGENTS_MD_CONTENT_VARIABLE.name) {
            return 1;
        }
        return -1;
    }

    async resolve(request: AIVariableResolutionRequest, _context: AIVariableContext): Promise<ResolvedAIVariable | undefined> {
        // Without this a request issued before the initial scan completes would silently report that
        // the workspace has no project context.
        await this.agentsMdService.ready;
        const files = this.agentsMdService.getAgentsMdFiles();

        if (request.variable.name === AGENTS_MD_AUTO_LOADED_VARIABLE.name) {
            return { variable: request.variable, value: this.generateAutoLoaded(files) };
        }
        if (request.variable.name === AGENTS_MD_VARIABLE.name) {
            // Suppressed when the root file is already in context, so the model is never told to read
            // a file it has just been handed.
            return { variable: request.variable, value: this.isAutoLoading() ? '' : this.generateAgentsMdXML(files) };
        }
        if (request.variable.name === AGENTS_MD_CONTENT_VARIABLE.name) {
            return { variable: request.variable, value: this.mergeContent(files) };
        }
        return undefined;
    }

    /**
     * Whether the workspace root's `AGENTS.md` is put into context rather than advertised. Keyed on
     * the number of workspace **roots**, not the number of discovered files: a workspace with several
     * roots has no single project root whose file could stand for the whole session, even when only
     * one of those roots happens to carry an `AGENTS.md`.
     */
    protected isAutoLoading(): boolean {
        return this.workspaceService.tryGetRoots().length === 1;
    }

    /**
     * Inlines the single root's file. The content is raw Markdown and deliberately not escaped; only
     * the path, which is an attribute, is.
     */
    protected generateAutoLoaded(files: AgentsMdFile[]): string {
        if (!this.isAutoLoading() || files.length === 0) {
            return '';
        }
        const file = files[0];
        return `<project_instructions path="${this.escapeXml(this.toWorkspaceRelativePath(file))}">\n${file.content}\n</project_instructions>`;
    }

    /**
     * Advertises the files by their `<rootName>/AGENTS.md` path, the path format the workspace tools
     * accept and return, so the model can pass it to `getFileContent` verbatim.
     */
    protected generateAgentsMdXML(files: AgentsMdFile[]): string {
        if (files.length === 0) {
            return '';
        }
        const entries = files.map(file => `<file>${this.escapeXml(this.toWorkspaceRelativePath(file))}</file>`).join('\n');
        return `<agents_md_files>\n${entries}\n</agents_md_files>`;
    }

    /**
     * Inlines the content. A single root contributes its file verbatim; only a multi-root workspace
     * gets provenance headings, mirroring how equal-priority prompt fragment sources are merged.
     */
    protected mergeContent(files: AgentsMdFile[]): string {
        if (files.length === 0) {
            return '';
        }
        if (files.length === 1) {
            return files[0].content;
        }
        return files.map(file => `### ${file.rootName}\n\n${file.content}`).join('\n\n');
    }

    protected toWorkspaceRelativePath(file: AgentsMdFile): string {
        return `${file.rootName}/${AGENTS_MD_FILE_NAME}`;
    }

    protected escapeXml(text: string): string {
        return text
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&apos;');
    }
}
