// @ts-check
const gulp = require('gulp');
const serverDir = './src/browser/i18n/';
const extensionDir = 'lib/browser/i18n';

gulp.task('copy_json_files', () => {
    gulp.src(serverDir + '*.json')
        .pipe(gulp.dest(extensionDir))
});






