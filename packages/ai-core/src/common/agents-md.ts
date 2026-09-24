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

/**
 * File name of the [AGENTS.md standard](https://agents.md/), the source of project-specific context
 * for AI agents. Only this exact name is recognized: `AGENT.md`, `CLAUDE.md` and the various
 * vendor-specific instruction files are deliberately not treated as fallbacks.
 */
export const AGENTS_MD_FILE_NAME = 'AGENTS.md';

/**
 * Advertises the workspace's `AGENTS.md` files by path so that a tool-calling agent can read them on
 * demand. Reference it from a system prompt with `{{prompt:agents-md}}`.
 */
export const AGENTS_MD_PROMPT_FRAGMENT_ID = 'agents-md';

/**
 * Inlines the full `AGENTS.md` content.
 *
 * @deprecated Kept so that prompts still referencing `{{prompt:project-info}}` keep working, and for
 * consumers without a tool-calling loop, which cannot fetch anything on demand. Prefer
 * {@link AGENTS_MD_PROMPT_FRAGMENT_ID}, which lets the model load the content only when relevant.
 */
export const PROJECT_INFO_PROMPT_FRAGMENT_ID = 'project-info';
