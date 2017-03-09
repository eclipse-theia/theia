window.onload = () => {
    const w = <any>window;
    w.require(["vs/editor/editor.main"], () => {
        w.require([
            'vs/basic-languages/src/monaco.contribution',
            'vs/language/css/monaco.contribution',
            'vs/language/typescript/src/monaco.contribution',
            'vs/language/html/monaco.contribution',
            'vs/language/json/monaco.contribution'
        ], () => {
            require('./main');
        });
    });
};
