// *****************************************************************************
// Copyright (C) 2018 TypeFox and others.
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

import { inject, injectable, unmanaged } from '@theia/core/shared/inversify';
import { EditorManager, TextEditor, EditorDecoration, EditorDecorationOptions, Range, Position, EditorDecorationStyle } from '@theia/editor/lib/browser';
import { GitFileBlame } from '../../common';
import { Disposable, DisposableCollection, nls } from '@theia/core';
import { DateTime } from 'luxon';
import URI from '@theia/core/lib/common/uri';
import { DecorationStyle } from '@theia/core/lib/browser';
import * as monaco from '@theia/monaco-editor-core';
import { LanguageSelector } from '@theia/monaco-editor-core/esm/vs/editor/common/languageSelector';

@injectable()
export class BlameDecorator implements monaco.languages.HoverProvider {

    constructor(
        @unmanaged() protected blameDecorationsStyleSheet: CSSStyleSheet = DecorationStyle.createStyleSheet('gitBlameDecorationsStyle')
    ) {
        DecorationStyle.getOrCreateStyleRule(`.${BlameDecorator.GIT_BLAME_HIGHLIGHT}`,
            this.blameDecorationsStyleSheet).style.backgroundColor = 'var(--theia-gitlens-lineHighlightBackgroundColor)';
        DecorationStyle.getOrCreateStyleRule(`.${BlameDecorator.GIT_BLAME_CONTINUATION_LINE}::before`, this.blameDecorationsStyleSheet).style.content = "'\u2007'"; // blank
        DecorationStyle.getOrCreateStyleRule(`.${BlameDecorator.GIT_BLAME_CONTINUATION_LINE}::after`, this.blameDecorationsStyleSheet).style.content = "'\u2007'"; // blank;
    }

    @inject(EditorManager)
    protected readonly editorManager: EditorManager;

    protected registerHoverProvider(uri: string): Disposable {
        // The public typedef of this method only accepts strings, but it immediately delegates to a method that accepts LanguageSelectors.
        return (monaco.languages.registerHoverProvider as (languageId: LanguageSelector, provider: monaco.languages.HoverProvider) => Disposable)
            ([{ pattern: new URI(uri).path.toString() }], this);
    }

    protected emptyHover: monaco.languages.Hover = {
        contents: [{
            value: ''
        }]
    };

    async provideHover(model: monaco.editor.ITextModel, position: monaco.Position, token: monaco.CancellationToken): Promise<monaco.languages.Hover> {
        const line = position.lineNumber - 1;
        const uri = model.uri.toString();
        const applications = this.appliedDecorations.get(uri);
        if (!applications) {
            return this.emptyHover;
        }
        const blame = applications.blame;
        if (!blame) {
            return this.emptyHover;
        }
        const commitLine = blame.lines.find(l => l.line === line);
        if (!commitLine) {
            return this.emptyHover;
        }
        const sha = commitLine.sha;
        const commit = blame.commits.find(c => c.sha === sha)!;
        const date = new Date(commit.author.timestamp);
        let commitMessage = commit.summary + '\n' + (commit.body || '');
        commitMessage = commitMessage.replace(/[`\>\#\*\_\-\+]/g, '\\$&').replace(/\n/g, '  \n');
        const value = `${commit.sha}\n \n ${commit.author.name}, ${date.toString()}\n \n> ${commitMessage}`;

        const hover = {
            contents: [{ value }],
            range: monaco.Range.fromPositions(new monaco.Position(position.lineNumber, 1), new monaco.Position(position.lineNumber, 10 ^ 10))
        };
        return hover;
    }

    protected appliedDecorations = new Map<string, AppliedBlameDecorations>();

    decorate(blame: GitFileBlame, editor: TextEditor, highlightLine: number): Disposable {
        const uri = editor.uri.toString();
        let applications = this.appliedDecorations.get(uri);
        if (!applications) {
            const that = applications = new AppliedBlameDecorations();
            this.appliedDecorations.set(uri, applications);
            applications.toDispose.push(this.registerHoverProvider(uri));
            applications.toDispose.push(Disposable.create(() => {
                this.appliedDecorations.delete(uri);
            }));
            applications.toDispose.push(Disposable.create(() => {
                editor.deltaDecorations({ oldDecorations: that.previousDecorations, newDecorations: [] });
            }));
        }
        if (applications.highlightedSha) {
            const sha = this.getShaForLine(blame, highlightLine);
            if (applications.highlightedSha === sha) {
                return applications;
            }
            applications.highlightedSha = sha;
        }
        applications.previousStyles.dispose();
        const blameDecorations = this.toDecorations(blame, highlightLine);
        applications.previousStyles.pushAll(blameDecorations.styles);
        const newDecorations = blameDecorations.editorDecorations;
        const oldDecorations = applications.previousDecorations;
        const appliedDecorations = editor.deltaDecorations({ oldDecorations, newDecorations });
        applications.previousDecorations.length = 0;
        applications.previousDecorations.push(...appliedDecorations);
        applications.blame = blame;
        return applications;
    }

    protected getShaForLine(blame: GitFileBlame, line: number): string | undefined {
        const commitLines = blame.lines;
        const commitLine = commitLines.find(c => c.line === line);
        return commitLine ? commitLine.sha : undefined;
    }

    protected toDecorations(blame: GitFileBlame, highlightLine: number): BlameDecorations {
        const beforeContentStyles = new Map<string, EditorDecorationStyle>();
        const commits = blame.commits;
        for (const commit of commits) {
            const sha = commit.sha;
            const commitTime = DateTime.fromISO(commit.author.timestamp);
            const heat = this.getHeatColor(commitTime);
            const content = commit.summary.replace('\n', '↩︎').replace(/'/g, "\\'");
            const short = sha.substring(0, 7);
            new EditorDecorationStyle('.git-' + short, style => {
                Object.assign(style, BlameDecorator.defaultGutterStyles);
                style.borderColor = heat;
            }, this.blameDecorationsStyleSheet);
            beforeContentStyles.set(sha, new EditorDecorationStyle('.git-' + short + '::before', style => {
                Object.assign(style, BlameDecorator.defaultGutterBeforeStyles);
                style.content = `'${content}'`;
            }, this.blameDecorationsStyleSheet));
            new EditorDecorationStyle('.git-' + short + '::after', style => {
                Object.assign(style, BlameDecorator.defaultGutterAfterStyles);
                style.content = (this.now.diff(commitTime, 'seconds').toObject().seconds ?? 0) < 60
                    ? `'${nls.localize('theia/git/aFewSecondsAgo', 'a few seconds ago')}'`
                    : `'${commitTime.toRelative({ locale: nls.locale })}'`;
            }, this.blameDecorationsStyleSheet);
        }
        const commitLines = blame.lines;
        const highlightedSha = this.getShaForLine(blame, highlightLine) || '';
        let previousLineSha = '';
        const editorDecorations: EditorDecoration[] = [];

        for (const commitLine of commitLines) {
            const { line, sha } = commitLine;
            const beforeContentClassName = beforeContentStyles.get(sha)!.className;
            const options = <EditorDecorationOptions>{
                beforeContentClassName,
            };
            if (sha === highlightedSha) {
                options.beforeContentClassName += ' ' + BlameDecorator.GIT_BLAME_HIGHLIGHT;
            }
            if (sha === previousLineSha) {
                options.beforeContentClassName += ' ' + BlameDecorator.GIT_BLAME_CONTINUATION_LINE + ' ' + BlameDecorator.GIT_BLAME_CONTINUATION_LINE;
            }
            previousLineSha = sha;
            const range = Range.create(Position.create(line, 0), Position.create(line, 0));
            editorDecorations.push(<EditorDecoration>{ range, options });
        }
        const styles = [...beforeContentStyles.values()];
        return { editorDecorations, styles };
    }

    protected now = DateTime.now();
    protected getHeatColor(commitTime: DateTime): string {
        const daysFromNow = this.now.diff(commitTime, 'days').toObject().days ?? 0;
        if (daysFromNow <= 2) {
            return 'var(--md-orange-50)';
        }
        if (daysFromNow <= 5) {
            return 'var(--md-orange-100)';
        }
        if (daysFromNow <= 10) {
            return 'var(--md-orange-200)';
        }
        if (daysFromNow <= 15) {
            return 'var(--md-orange-300)';
        }
        if (daysFromNow <= 60) {
            return 'var(--md-orange-400)';
        }
        if (daysFromNow <= 180) {
            return 'var(--md-deep-orange-600)';
        }
        if (daysFromNow <= 365) {
            return 'var(--md-deep-orange-700)';
        }
        if (daysFromNow <= 720) {
            return 'var(--md-deep-orange-800)';
        }
        return 'var(--md-deep-orange-900)';
    }

}

export namespace BlameDecorator {

    export const GIT_BLAME_HIGHLIGHT = 'git-blame-highlight';
    export const GIT_BLAME_CONTINUATION_LINE = 'git-blame-continuation-line';

    export const defaultGutterStyles = <CSSStyleDeclaration>{
        display: 'inline-flex',
        width: '50ch',
        marginRight: '26px',
        justifyContent: 'space-between',
        backgroundColor: 'var(--theia-gitlens-gutterBackgroundColor)',
        borderRight: '2px solid',
        height: '100%',
        overflow: 'hidden'
    };

    export const defaultGutterBeforeStyles = <CSSStyleDeclaration>{
        color: 'var(--theia-gitlens-gutterForegroundColor)',
        overflow: 'hidden',
        textOverflow: 'ellipsis'
    };

    export const defaultGutterAfterStyles = <CSSStyleDeclaration>{
        color: 'var(--theia-gitlens-gutterForegroundColor)',
        marginLeft: '12px'
    };
}

export interface BlameDecorations {
    editorDecorations: EditorDecoration[]
    styles: EditorDecorationStyle[]
}

export class AppliedBlameDecorations implements Disposable {
    readonly toDispose = new DisposableCollection();
    readonly previousStyles = new DisposableCollection();
    readonly previousDecorations: string[] = [];
    blame: GitFileBlame | undefined;
    highlightedSha: string | undefined;

    dispose(): void {
        this.previousStyles.dispose();
        this.toDispose.dispose();
        this.blame = undefined;
    }
}
