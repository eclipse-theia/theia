// *****************************************************************************
// Copyright (C) 2025 EclipseSource GmbH.
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

import { ChatResponsePartRenderer } from '@theia/ai-chat-ui/lib/browser/chat-response-part-renderer';
import { ResponseNode } from '@theia/ai-chat-ui/lib/browser/chat-tree-view';
import { ChatResponseContent, ToolCallChatResponseContent } from '@theia/ai-chat/lib/common';
import { codicon, LabelProvider } from '@theia/core/lib/browser';
import { URI } from '@theia/core/lib/common/uri';
import { inject, injectable } from '@theia/core/shared/inversify';
import * as React from '@theia/core/shared/react';
import { ReactNode } from '@theia/core/shared/react';
import { WorkspaceService } from '@theia/workspace/lib/browser';
import { ClaudeCodeToolCallChatResponseContent } from '../claude-code-tool-call-content';
import { CollapsibleToolRenderer } from './collapsible-tool-renderer';
import { nls } from '@theia/core';

interface GrepToolInput {
    pattern: string;
    path?: string;
    output_mode?: keyof typeof GREP_OUTPUT_MODES;
    glob?: string;
    type?: string;
    '-i'?: boolean;
    '-n'?: boolean;
    '-A'?: number;
    '-B'?: number;
    '-C'?: number;
    multiline?: boolean;
    head_limit?: number;
}

const GREP_OUTPUT_MODES = {
    'content': nls.localize('theia/ai/claude-code/grepOutputModes/content', 'content'),
    'files_with_matches': nls.localize('theia/ai/claude-code/grepOutputModes/filesWithMatches', 'files with matches'),
    'count': nls.localize('theia/ai/claude-code/grepOutputModes/count', 'count')
};

@injectable()
export class GrepToolRenderer implements ChatResponsePartRenderer<ToolCallChatResponseContent> {

    @inject(WorkspaceService)
    protected readonly workspaceService: WorkspaceService;

    @inject(LabelProvider)
    protected readonly labelProvider: LabelProvider;

    canHandle(response: ChatResponseContent): number {
        if (ClaudeCodeToolCallChatResponseContent.is(response) && response.name === 'Grep') {
            return 15; // Higher than default ToolCallPartRenderer (10)
        }
        return -1;
    }

    render(response: ToolCallChatResponseContent, parentNode: ResponseNode): ReactNode {
        try {
            const input = JSON.parse(response.arguments || '{}') as GrepToolInput;
            return <GrepToolComponent
                input={input}
                workspaceService={this.workspaceService}
                labelProvider={this.labelProvider}
            />;
        } catch (error) {
            console.warn('Failed to parse Grep tool input:', error);
            return <div className="claude-code-tool error">{nls.localize('theia/ai/claude-code/failedToParseGrepToolData', 'Failed to parse Grep tool data')}</div>;
        }
    }
}

const GrepToolComponent: React.FC<{
    input: GrepToolInput;
    workspaceService: WorkspaceService;
    labelProvider: LabelProvider;
}> = ({ input, workspaceService, labelProvider }) => {
    const getSearchScope = (): string => {
        if (input.path) {
            return input.path.split('/').pop() || input.path;
        }
        return nls.localize('theia/ai/claude-code/project', 'project');
    };

    const getWorkspaceRelativePath = async (filePath: string): Promise<string> => {
        try {
            const absoluteUri = new URI(filePath);
            const workspaceRelativePath = await workspaceService.getWorkspaceRelativePath(absoluteUri);
            return workspaceRelativePath || '';
        } catch {
            return '';
        }
    };

    const [relativePath, setRelativePath] = React.useState<string>('');

    React.useEffect(() => {
        if (input.path) {
            getWorkspaceRelativePath(input.path).then(setRelativePath);
        }
    }, [input.path]);

    const getOptionsInfo = (): { label: string; count: number } => {
        const options = [];
        if (input['-i']) { options.push(nls.localize('theia/ai/claude-code/grepOptions/caseInsensitive', 'case-insensitive')); }
        if (input['-n']) { options.push(nls.localize('theia/ai/claude-code/grepOptions/lineNumbers', 'line numbers')); }
        if (input['-A']) { options.push(nls.localize('theia/ai/claude-code/grepOptions/linesAfter', '+{0} after'), input['-A']); }
        if (input['-B']) { options.push(nls.localize('theia/ai/claude-code/grepOptions/linesBefore', '+{0} before', input['-B'])); }
        if (input['-C']) { options.push(nls.localize('theia/ai/claude-code/grepOptions/linesContext', '±{0} context', input['-C'])); }
        if (input.multiline) { options.push(nls.localize('theia/ai/claude-code/grepOptions/multiLine', 'multiline')); }
        if (input.glob) { options.push(nls.localize('theia/ai/claude-code/grepOptions/glob', 'glob: {0}', input.glob)); }
        if (input.type) { options.push(nls.localize('theia/ai/claude-code/grepOptions/type', 'type: {0}', input.type)); }
        if (input.head_limit) { options.push(nls.localize('theia/ai/claude-code/grepOptions/headLimit', 'limit: {0}', input.head_limit)); }

        return {
            label: options.length > 0 ? options.join(', ') : '',
            count: options.length
        };
    };

    const optionsInfo = getOptionsInfo();

    const compactHeader = (
        <>
            <div className="claude-code-tool header-left">
                <span className="claude-code-tool title">{nls.localize('theia/ai/claude-code/searching', 'Searching')}</span>
                <span className={`${codicon('search')} claude-code-tool icon`} />
                <span className="claude-code-tool pattern">"{input.pattern}"</span>
                <span className="claude-code-tool scope">{nls.localizeByDefault('in {0}', getSearchScope())}</span>
                {relativePath && <span className="claude-code-tool relative-path">{relativePath}</span>}
            </div>
            <div className="claude-code-tool header-right">
                {input.output_mode && input.output_mode !== 'files_with_matches' && (
                    <span className="claude-code-tool badge">{GREP_OUTPUT_MODES[input.output_mode]}</span>
                )}
                {optionsInfo.count > 0 && (
                    <span className="claude-code-tool badge" title={optionsInfo.label}>
                        {optionsInfo.count > 1
                            ? nls.localize('theia/ai/claude-code/optionsCount', '{0} options', optionsInfo.count)
                            : nls.localize('theia/ai/claude-code/oneOption', '1 option')}
                    </span>
                )}
            </div>
        </>
    );

    const expandedContent = (
        <div className="claude-code-tool details">
            <div className="claude-code-tool detail-row">
                <span className="claude-code-tool detail-label">{nls.localize('theia/ai/claude-code/pattern', 'Pattern')}</span>
                <code className="claude-code-tool detail-value">"{input.pattern}"</code>
            </div>
            <div className="claude-code-tool detail-row">
                <span className="claude-code-tool detail-label">{nls.localize('theia/ai/claude-code/searchPath', 'Search Path')}</span>
                <code className="claude-code-tool detail-value">{input.path || nls.localize('theia/ai/claude-code/projectRoot', 'project root')}</code>
            </div>
            {input.output_mode && (
                <div className="claude-code-tool detail-row">
                    <span className="claude-code-tool detail-label">{nls.localizeByDefault('Mode')}</span>
                    <span className="claude-code-tool detail-value">{GREP_OUTPUT_MODES[input.output_mode]}</span>
                </div>
            )}
            {input.glob && (
                <div className="claude-code-tool detail-row">
                    <span className="claude-code-tool detail-label">{nls.localize('theia/ai/claude-code/fileFilter', 'File Filter')}</span>
                    <code className="claude-code-tool detail-value">{input.glob}</code>
                </div>
            )}
            {input.type && (
                <div className="claude-code-tool detail-row">
                    <span className="claude-code-tool detail-label">{nls.localize('theia/ai/claude-code/fileType', 'File Type')}</span>
                    <span className="claude-code-tool detail-value">{input.type}</span>
                </div>
            )}
            {optionsInfo.label && (
                <div className="claude-code-tool detail-row">
                    <span className="claude-code-tool detail-label">{nls.localizeByDefault('Options')}</span>
                    <span className="claude-code-tool detail-value">{optionsInfo.label}</span>
                </div>
            )}
        </div>
    );

    return (
        <CollapsibleToolRenderer
            compactHeader={compactHeader}
            expandedContent={expandedContent}
        />
    );
};
