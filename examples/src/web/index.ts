window.onload = () => {
    const w = <any>window;
    w.require(["vs/editor/editor.main"], () => {
        w.require([
            'vs/basic-languages/src/monaco.contribution',
            'vs/language/css/monaco.contribution',
            'vs/language/typescript/src/monaco.contribution',
            'vs/language/html/monaco.contribution',
            'vs/language/json/monaco.contribution',
            'vs/platform/commands/common/commands',
            'vs/platform/actions/common/actions'
        ], (basic: any, css: any, ts: any, html: any, json: any, commands: any, actions: any) => {
            const global: any = self;
            global.monaco.commands = commands;
            global.monaco.actions = actions;
            require('./main');
        });
    });
};