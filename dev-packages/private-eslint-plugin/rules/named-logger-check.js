/** @type {import('eslint').Rule.RuleModule} */
module.exports = {
    meta: {
        type: 'problem',
        docs: {
            description: 'Enforce ILogger usage and naming conventions in @injectable classes',
        },
        messages: {
            noConsole: 'Use injected ILogger instead of console statements in @injectable classes.',
            missingNamed: 'Injected ILoggers must use the @named decorator.',
            invalidNameFormat: 'Logger name must follow the convention: [optional-purpose]package-name:class-name#optional-suffix',
        }
    },
    create(context) {
        const filename = context.getFilename();
        if (filename.includes('/electron-main/')) {
            return {};
        }

        const injectableClassStack = [];

        return {
            ClassDeclaration(node) {
                const hasInjectable = node.decorators?.some(
                    (/** @type {any} */ d) =>
                        d.expression &&
                        d.expression.type === 'CallExpression' &&
                        d.expression.callee &&
                        d.expression.callee.name === 'injectable'
                );
                injectableClassStack.push(!!hasInjectable);
            },

            'ClassDeclaration:exit'() {
                injectableClassStack.pop();
            },

            CallExpression(node) {
                const isInsideInjectable = injectableClassStack.some(Boolean);
                if (isInsideInjectable) {
                    if (
                        node.callee &&
                        node.callee.type === 'MemberExpression' &&
                        node.callee.object &&
                        node.callee.object.type === 'Identifier' &&
                        node.callee.object.name === 'console'
                    ) {
                        context.report({ node, messageId: 'noConsole' });
                    }
                }
            },

            Decorator(node) {
                if (
                    node.expression &&
                    node.expression.type === 'CallExpression' &&
                    node.expression.callee &&
                    node.expression.callee.name === 'inject'
                ) {
                    const arg = node.expression.arguments[0];
                    if (arg && arg.type === 'Identifier' && arg.name === 'ILogger') {
                        const target = node.parent;
                        const allDecorators = target.decorators || [];

                        const namedDecorator = allDecorators.find(
                            (/** @type {any} */ d) =>
                                d.expression &&
                                d.expression.type === 'CallExpression' &&
                                d.expression.callee &&
                                d.expression.callee.name === 'named'
                        );

                        if (!namedDecorator) {
                            context.report({ node: target, messageId: 'missingNamed' });
                        } else {
                            const namedArg = namedDecorator.expression.arguments[0];
                            if (namedArg && namedArg.type === 'Literal' && typeof namedArg.value === 'string') {
                                const namePattern = /^(\[[a-zA-Z0-9_.-]+\])?[a-zA-Z0-9_.-]+:[a-zA-Z0-9_.-]+(#[a-zA-Z0-9_.-]+)?$/;

                                if (!namePattern.test(namedArg.value)) {
                                    context.report({ node: namedArg, messageId: 'invalidNameFormat' });
                                }
                            }
                        }
                    }
                }
            }
        };
    }
};
