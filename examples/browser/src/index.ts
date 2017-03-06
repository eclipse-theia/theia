

window.onload = () => {
    (<any>window).require(["vs/editor/editor.main"], () => {
        require('./main');
    });
};
