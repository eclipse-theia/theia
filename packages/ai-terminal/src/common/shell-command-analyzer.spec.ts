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

import { expect } from 'chai';
import { DefaultShellCommandAnalyzer } from './shell-command-analyzer';

describe('shell-command-analyzer', () => {
    let analyzer: DefaultShellCommandAnalyzer;

    beforeEach(() => {
        analyzer = new DefaultShellCommandAnalyzer();
    });

    describe('parseCommand', () => {
        it('should parse a single command', () => {
            expect(analyzer.parseCommand('git log')).to.deep.equal(['git log']);
        });

        it('should split on AND operator (&&)', () => {
            expect(analyzer.parseCommand('git status && git log')).to.deep.equal(['git status', 'git log']);
        });

        it('should split on OR operator (||)', () => {
            expect(analyzer.parseCommand('cmd1 || cmd2')).to.deep.equal(['cmd1', 'cmd2']);
        });

        it('should split on semicolon (;)', () => {
            expect(analyzer.parseCommand('cmd1 ; cmd2')).to.deep.equal(['cmd1', 'cmd2']);
        });

        it('should split on pipe (|)', () => {
            expect(analyzer.parseCommand('cat file | grep pattern')).to.deep.equal(['cat file', 'grep pattern']);
        });

        it('should split on background operator (&)', () => {
            expect(analyzer.parseCommand('echo test & cat /etc/passwd')).to.deep.equal(['echo test', 'cat /etc/passwd']);
        });

        it('should split on && without confusing with single &', () => {
            expect(analyzer.parseCommand('cmd1 && cmd2')).to.deep.equal(['cmd1', 'cmd2']);
        });

        it('should handle mixed operators', () => {
            expect(analyzer.parseCommand('cmd1 && cmd2 | cmd3 ; cmd4')).to.deep.equal(['cmd1', 'cmd2', 'cmd3', 'cmd4']);
        });

        it('should trim whitespace from sub-commands', () => {
            expect(analyzer.parseCommand('  git log  &&  git status  ')).to.deep.equal(['git log', 'git status']);
        });

        it('should return empty array for empty command', () => {
            expect(analyzer.parseCommand('')).to.deep.equal([]);
        });

        it('should return empty array for only operators', () => {
            expect(analyzer.parseCommand('&& || ;')).to.deep.equal([]);
        });

        it('should split on pipe-with-stderr operator (|&)', () => {
            expect(analyzer.parseCommand('bad_cmd |& cat /etc/passwd')).to.deep.equal(['bad_cmd', 'cat /etc/passwd']);
        });

        it('should not confuse |& with | followed by &', () => {
            // |& is a single bash operator (pipe stderr+stdout), distinct from | then &
            expect(analyzer.parseCommand('cmd1 |& cmd2')).to.deep.equal(['cmd1', 'cmd2']);
        });

        it('should not split on pipe inside double quotes', () => {
            expect(analyzer.parseCommand('grep "foo|bar" file | head')).to.deep.equal(['grep "foo|bar" file', 'head']);
        });

        it('should not split on backslash-pipe inside double quotes', () => {
            expect(analyzer.parseCommand('grep "foo\\|bar" file | head')).to.deep.equal(['grep "foo\\|bar" file', 'head']);
        });

        it('should not split on semicolon inside single quotes', () => {
            expect(analyzer.parseCommand("echo 'a;b' ; ls")).to.deep.equal(["echo 'a;b'", 'ls']);
        });

        it('should not split on AND operator inside double quotes', () => {
            expect(analyzer.parseCommand('echo "a && b" && ls')).to.deep.equal(['echo "a && b"', 'ls']);
        });

        it('should handle mixed quotes with operators', () => {
            expect(analyzer.parseCommand('echo "a|b" && echo \'c;d\'')).to.deep.equal(['echo "a|b"', "echo 'c;d'"]);
        });

        it('should not split on |& inside double quotes', () => {
            expect(analyzer.parseCommand('echo "foo|&bar" |& cat')).to.deep.equal(['echo "foo|&bar"', 'cat']);
        });

        it('should handle escaped double quote inside double quotes with pipe', () => {
            expect(analyzer.parseCommand('echo "say \\"hello\\"" | cat')).to.deep.equal(['echo "say \\"hello\\""', 'cat']);
        });

        it('should treat unmatched quote as part of current sub-command', () => {
            expect(analyzer.parseCommand('echo "hello | cat')).to.deep.equal(['echo "hello | cat']);
        });

        it('should not split when backslash escapes separator outside quotes', () => {
            expect(analyzer.parseCommand('echo foo \\| bar')).to.deep.equal(['echo foo \\| bar']);
        });

        it('should preserve backslash before & and not split', () => {
            expect(analyzer.parseCommand('echo foo \\& bar')).to.deep.equal(['echo foo \\& bar']);
        });

        it('should preserve backslash before ; and not split', () => {
            expect(analyzer.parseCommand('echo foo \\; bar')).to.deep.equal(['echo foo \\; bar']);
        });

        it('should preserve backslash before backslash', () => {
            expect(analyzer.parseCommand('echo foo \\\\ bar')).to.deep.equal(['echo foo \\\\ bar']);
        });

        it('should handle single quotes inside double quotes with pipe', () => {
            expect(analyzer.parseCommand('echo "it\'s here" | cat')).to.deep.equal(['echo "it\'s here"', 'cat']);
        });

        it('should handle grep with backslash-pipe pattern piped to head', () => {
            expect(analyzer.parseCommand('grep -n "foo\\|bar" file | head -40')).to.deep.equal(['grep -n "foo\\|bar" file', 'head -40']);
        });

        it('should not split on AND inside single quotes with semicolon separator', () => {
            expect(analyzer.parseCommand("echo 'hello && world' ; ls")).to.deep.equal(["echo 'hello && world'", 'ls']);
        });

        it('should handle multiple quoted separators in compound command', () => {
            expect(analyzer.parseCommand('echo "a;b" && cat "c|d"')).to.deep.equal(['echo "a;b"', 'cat "c|d"']);
        });

        it('should not split on OR operator inside double quotes', () => {
            expect(analyzer.parseCommand('echo "a || b" || ls')).to.deep.equal(['echo "a || b"', 'ls']);
        });

        it('should not split on OR operator inside single quotes', () => {
            expect(analyzer.parseCommand("echo 'a || b' || ls")).to.deep.equal(["echo 'a || b'", 'ls']);
        });

        it('should split on newline as command separator', () => {
            expect(analyzer.parseCommand('echo test\nls')).to.deep.equal(['echo test', 'ls']);
        });

        it('should split on carriage-return-newline as command separator', () => {
            expect(analyzer.parseCommand('echo test\r\nls')).to.deep.equal(['echo test', 'ls']);
        });

        it('should split on carriage-return as command separator', () => {
            expect(analyzer.parseCommand('echo test\rls')).to.deep.equal(['echo test', 'ls']);
        });

        it('should not split on newline inside double quotes', () => {
            expect(analyzer.parseCommand('echo "hello\nworld"')).to.deep.equal(['echo "hello\nworld"']);
        });

        it('should not split on newline inside single quotes', () => {
            expect(analyzer.parseCommand('echo \'hello\nworld\'')).to.deep.equal(["echo 'hello\nworld'"]);
        });

        it('should collapse whitespace outside quotes', () => {
            expect(analyzer.parseCommand('sh  -e "foo"')).to.deep.equal(['sh -e "foo"']);
        });

        it('should preserve whitespace inside double quotes while collapsing outside', () => {
            expect(analyzer.parseCommand('echo   "hello   world"')).to.deep.equal(['echo "hello   world"']);
        });

        it('should collapse multiple spaces in unquoted command', () => {
            expect(analyzer.parseCommand('git  log  --oneline')).to.deep.equal(['git log --oneline']);
        });

        it('should collapse tabs to single space outside quotes', () => {
            expect(analyzer.parseCommand('sh\t-e "foo"')).to.deep.equal(['sh -e "foo"']);
        });

        it('should strip meaningless backslash escapes outside quotes', () => {
            expect(analyzer.parseCommand('s\\h -e "foo"')).to.deep.equal(['sh -e "foo"']);
        });

        it('should strip backslash before non-special characters', () => {
            expect(analyzer.parseCommand('ec\\ho test')).to.deep.equal(['echo test']);
        });
    });

    describe('containsDangerousPatterns', () => {
        it('should return false for safe commands', () => {
            expect(analyzer.containsDangerousPatterns('git log')).to.be.false;
        });

        it('should return true for command substitution with $(', () => {
            expect(analyzer.containsDangerousPatterns('echo $(whoami)')).to.be.true;
        });

        it('should return true for backticks', () => {
            expect(analyzer.containsDangerousPatterns('echo `whoami`')).to.be.true;
        });

        it('should return true when dangerous pattern is nested in argument', () => {
            expect(analyzer.containsDangerousPatterns('git log $(malicious)')).to.be.true;
        });

        it('should return false for safe dollar sign (variable)', () => {
            expect(analyzer.containsDangerousPatterns('echo $HOME')).to.be.false;
        });

        it('should return true for process substitution with <(', () => {
            expect(analyzer.containsDangerousPatterns('cat <(ls)')).to.be.true;
            expect(analyzer.containsDangerousPatterns('diff <(ls dir1) <(ls dir2)')).to.be.true;
        });

        it('should return true for process substitution with >(', () => {
            expect(analyzer.containsDangerousPatterns('tee >(grep foo)')).to.be.true;
        });

        it('should return true for parameter expansion with ${', () => {
            expect(analyzer.containsDangerousPatterns('echo ${PATH}')).to.be.true;
            expect(analyzer.containsDangerousPatterns('echo ${var:-default}')).to.be.true;
        });

        it('should return true for subshell at command start', () => {
            expect(analyzer.containsDangerousPatterns('(cd /tmp && ls)')).to.be.true;
            expect(analyzer.containsDangerousPatterns('  (cd /tmp && ls)')).to.be.true; // with leading whitespace
        });

        it('should return false for safe parentheses in arguments', () => {
            expect(analyzer.containsDangerousPatterns("grep '(pattern)' file")).to.be.false;
            expect(analyzer.containsDangerousPatterns('echo "(hello)"')).to.be.false;
        });

        // Newlines as dangerous (shell treats \n as command separator)
        it('should detect newline as dangerous', () => {
            expect(analyzer.containsDangerousPatterns('echo safe\ncat /etc/passwd')).to.be.true;
        });

        it('should detect carriage return + newline as dangerous', () => {
            expect(analyzer.containsDangerousPatterns('echo safe\r\ncat /etc/passwd')).to.be.true;
        });

        it('should detect carriage return as dangerous', () => {
            expect(analyzer.containsDangerousPatterns('echo safe\rcat /etc/passwd')).to.be.true;
        });

        // Case statement attacks (;; and ;& and ;;& are case delimiters that enable multi-command execution)
        it('should detect case statement with ;; as dangerous', () => {
            expect(analyzer.containsDangerousPatterns('case x in *) cat /etc/passwd ;; esac')).to.be.true;
        });

        it('should detect case statement with ;& fallthrough as dangerous', () => {
            expect(analyzer.containsDangerousPatterns('case x in *) echo ok ;& *) cat /etc/passwd ;; esac')).to.be.true;
        });

        it('should detect case statement with ;;& as dangerous', () => {
            expect(analyzer.containsDangerousPatterns('case x in *) echo ok ;;& *) cat /etc/passwd ;; esac')).to.be.true;
        });

        it('should detect case statement with tab whitespace', () => {
            expect(analyzer.containsDangerousPatterns('case\tx in *) cat /etc/passwd ;; esac')).to.be.true;
        });

        it('should detect brace group as dangerous', () => {
            expect(analyzer.containsDangerousPatterns('{ cmd1; cmd2; }')).to.be.true;
        });

        it('should detect brace group with leading whitespace as dangerous', () => {
            expect(analyzer.containsDangerousPatterns('  { echo safe; cat /etc/passwd; }')).to.be.true;
        });

        it('should detect coproc as dangerous', () => {
            expect(analyzer.containsDangerousPatterns('coproc cat /etc/passwd')).to.be.true;
        });

        it('should detect coproc with tab whitespace as dangerous', () => {
            expect(analyzer.containsDangerousPatterns('coproc\tcat /etc/passwd')).to.be.true;
        });

        it('should not flag commands containing coproc in arguments', () => {
            expect(analyzer.containsDangerousPatterns('echo coproc')).to.be.false;
        });

        it('should not flag commands containing brace in arguments', () => {
            expect(analyzer.containsDangerousPatterns('echo {a,b,c}')).to.be.false;
        });

        describe('-exec family detection', () => {
            it('should detect find with -exec as dangerous', () => {
                expect(analyzer.containsDangerousPatterns('find / -exec rm -rf {} \\;')).to.be.true;
            });

            it('should detect find with -execdir as dangerous', () => {
                expect(analyzer.containsDangerousPatterns('find . -execdir cat {} \\;')).to.be.true;
            });

            it('should detect find with -ok as dangerous', () => {
                expect(analyzer.containsDangerousPatterns('find . -ok rm {} \\;')).to.be.true;
            });

            it('should detect find with -okdir as dangerous', () => {
                expect(analyzer.containsDangerousPatterns('find . -okdir rm {} \\;')).to.be.true;
            });

            it('should detect git rebase --exec= as dangerous', () => {
                expect(analyzer.containsDangerousPatterns('git rebase --exec="make test" HEAD~3')).to.be.true;
            });

            it('should detect git rebase --exec (space-separated) as dangerous', () => {
                expect(analyzer.containsDangerousPatterns('git rebase --exec make HEAD~3')).to.be.true;
            });

            it('should detect git bisect run --exec as dangerous', () => {
                expect(analyzer.containsDangerousPatterns('git bisect run --exec test')).to.be.true;
            });

            it('should not flag "exec" embedded in a word like executable', () => {
                expect(analyzer.containsDangerousPatterns('ls executable_file')).to.be.false;
            });

            it('should not flag --executor as it is not --exec', () => {
                expect(analyzer.containsDangerousPatterns('echo --executor')).to.be.false;
            });

            it('should not flag exec in path/filename', () => {
                expect(analyzer.containsDangerousPatterns('./my-exec-tool')).to.be.false;
            });

            it('should not flag exec at start of filename', () => {
                expect(analyzer.containsDangerousPatterns('cat execfile.txt')).to.be.false;
            });

            it('should not flag -ok embedded in a larger flag', () => {
                expect(analyzer.containsDangerousPatterns('echo -ok-result')).to.be.false;
            });
        });
    });
});
