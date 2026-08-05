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

import { FrontendApplicationContribution } from '@theia/core/lib/browser';
import { inject, injectable } from '@theia/core/shared/inversify';
import { PromptService } from '@theia/ai-core';
import { nls } from '@theia/core';
import { GET_WORKSPACE_FILE_LIST_FUNCTION_ID, FILE_CONTENT_FUNCTION_ID, SEARCH_IN_WORKSPACE_FUNCTION_ID, FIND_FILES_BY_PATTERN_FUNCTION_ID } from '../common/workspace-functions';
import { WRITE_FILE_REPLACEMENTS_ID, WRITE_FILE_CONTENT_ID } from '../common/file-changeset-function-ids';
import { MEMORY_DIRECTORY_VARIABLE } from './memory-directory-variable-contribution';

@injectable()
export class MemoryCapabilityContribution implements FrontendApplicationContribution {

    @inject(PromptService)
    protected readonly promptService: PromptService;

    onStart(): void {
        this.promptService.addBuiltInPromptFragment({
            id: 'memory',
            template: this.buildTemplate()
        });
    }

    protected buildTemplate(): string {
        const name = nls.localize('theia/ai/ide/memoryCapability/name', 'Memory');
        const description = nls.localize('theia/ai/ide/memoryCapability/description',
            'Lets the agent maintain a persistent, wiki-style knowledge base for the workspace, so this and future sessions '
            + 'build on what came before instead of starting from scratch.');
        const dir = `{{${MEMORY_DIRECTORY_VARIABLE.name}}}`;

        return `---
name: ${name}
description: ${description}
---

## Memory

Maintain a persistent knowledge base under \`${dir}\`, the same way a personal
LLM-maintained wiki is built: raw material is ingested once, then incrementally *compiled* into a linked set of concept
articles that you read from on every future task. The raw material itself is not the knowledge base — the compiled wiki is.

That directory belongs to the current workspace but lies outside it, so what you learn about one project neither bleeds into
the next nor shows up in the user's repository. Reach it with the ordinary file tools, prefixing every memory path with it.

- \`${dir}/raw/\` — append-only ingest: session transcripts, pasted findings, anything worth preserving verbatim. Keep one
  file per task, \`raw/<date>-<topic>.md\` with the \`yyyy-mm-dd\` prefix of {{today:inIso8601}} as the date: create it with
  ~{${WRITE_FILE_CONTENT_ID}} as soon as there is something worth keeping and append later findings to it as new sections
  (~{${WRITE_FILE_REPLACEMENTS_ID}}, so you don't re-emit the whole file). Only ever append to the current task's file — earlier
  files and a single shared log are both off limits. Pruning \`raw/\` is the user's call, not yours.
- \`${dir}/wiki/\` — the actual knowledge base: one short, single-concept \`.md\` article per topic (a project fact, a
  convention, an environment quirk, a standing decision), cross-linked from \`wiki/index.md\` and from related articles. This is
  what you read from, not \`raw/\`.
- Start of task: read \`${dir}/wiki/index.md\` (~{${GET_WORKSPACE_FILE_LIST_FUNCTION_ID}} / ~{${FILE_CONTENT_FUNCTION_ID}})
  and follow only the links relevant to the current task — browse the wiki, don't grep a diary. An empty memory directory simply
  means this workspace has no memory yet: create \`wiki/index.md\` the first time you have something durable to record.
- Compile, don't just log: when something durable comes up, fold it into the right existing article
  (~{${WRITE_FILE_REPLACEMENTS_ID}}) or create a new one linked from \`index.md\` and its related articles — don't leave it
  stranded only in \`raw/\`.
- File outputs back in: substantial findings, decisions, or analysis produced during a task should be written into the wiki
  article they inform, so future queries benefit from this session's work too, not just the next session's memory of it.
- Lint occasionally: when asked to clean up memory, or an article looks stale, use ~{${SEARCH_IN_WORKSPACE_FUNCTION_ID}} /
  ~{${FIND_FILES_BY_PATTERN_FUNCTION_ID}} across \`${dir}/wiki/\` to find contradictions, duplicate articles, and missing
  links, then merge or fix them. Both take that directory as their search root.
- Memory is yours to maintain unprompted — that is what separates it from the project info file described below, which is the
  user's own description of the project and is only updated when they ask for it. Record what you learn in the wiki instead of
  editing that file.
- Keep the knowledge base to what belongs in it: what you learned about this project and how to work in it. It is not a place for
  secrets, credentials, or copies of the user's files.

Use judgement on what's worth compiling — a small number of accurate, well-linked articles beats an exhaustive log.`;
    }
}
