// @ts-check
const gulp = require('gulp');
const serverDir = './src/common/i18n/';
const extensionDir = 'lib/common/i18n';

gulp.task('copy_json_files', () => {
    gulp.src(serverDir + '*.json')
        .pipe(gulp.dest(extensionDir))
});






