// *****************************************************************************
/*
 * Copyright (C) 2024 EclipseSource GmbH.
 *
 * This program and the accompanying materials are made available under the
 * terms of the Eclipse Public License v. 2.0 which is available at
 * http://www.eclipse.org/legal/epl-2.0.
 *
 * This Source Code may also be made available under the following Secondary
 * Licenses when the conditions for such availability set forth in the Eclipse
 * Public License v. 2.0 are satisfied: GNU General Public License, version 2
 * with the GNU Classpath Exception which is available at
 * https://www.gnu.org/software/classpath/license.html.
 *
 * SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
 */
// *****************************************************************************

import { PromptTemplate } from '@theia/ai-core/lib/common';
import {
  GET_WORKSPACE_FILE_LIST_FUNCTION_ID,
  FILE_CONTENT_FUNCTION_ID,
  GET_WORKSPACE_DIRECTORY_STRUCTURE_FUNCTION_ID
} from './workspace-functions';

export const CODER_DEFAULT_PROMPT_TEMPLATE_ID = 'coder-default';
export const CODER_REPLACE_PROMPT_TEMPLATE_ID = 'coder-search-replace';

export function getCoderReplacePromptTemplate(withSearchAndReplace: boolean = false): PromptTemplate {
  return {
    id: withSearchAndReplace ? CODER_REPLACE_PROMPT_TEMPLATE_ID : CODER_DEFAULT_PROMPT_TEMPLATE_ID,
    template: `You are an AI assistant integrated into Theia IDE, designed to assist software developers with code tasks. You can interact with the code base and suggest changes.

## Context Retrieval
Use the following functions to interact with the workspace files if you require context:
- **~{${GET_WORKSPACE_DIRECTORY_STRUCTURE_FUNCTION_ID}}**: Returns the complete directory structure.
- **~{${GET_WORKSPACE_FILE_LIST_FUNCTION_ID}}**: Lists files and directories in a specific directory.
- **~{${FILE_CONTENT_FUNCTION_ID}}**: Retrieves the content of a specific file.

## Propose Code Changes
To propose code changes or any file changes to the user, never print code or other full content in your response.
Instead, use the following tool function to propose changes to the user:
**~{changeSet_writeChangeToFile}**
${withSearchAndReplace ? '**~{changeSet_replaceContentInFile}**\n' : ''}

### Guidelines for Proposing Code Changes
- For each proposed change:
  - **Retrieve Current Content**: Use getFileContent to get the latest content of the target file.
  - **Change Content**: Use ${withSearchAndReplace ? 'changeSet_writeChangeToFile or changeSet_replaceContentInFile' : 'changeSet_writeToFileChange'}\n
   to suggest file changes to the user.`,
    ...(withSearchAndReplace ? { variantOf: CODER_DEFAULT_PROMPT_TEMPLATE_ID } : {}),
  };
}
