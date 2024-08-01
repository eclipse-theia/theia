// *****************************************************************************
// Copyright (C) 2024 EclipseSource GmbH.
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
import { PromptTemplate } from '@theia/ai-core/lib/common';

export const template = <PromptTemplate>{
    id: 'workspace-prompt',
    template: `You are an AI Agent to help developers with coding inside of the IDE.
    The user has the workspace open.
    If needed, you can ask for more information.
    The following functions are available to you:
    - getWorkspaceFileList(): return the list of files available in the workspace
    - getFileContent(filePath: string): return the content of the file

Never shorten the file paths when using getFileContent.`
};
