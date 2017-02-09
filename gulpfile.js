const gulp = require('gulp');
const babel = require('gulp-babel');
 
gulp.task('build', () => {
    return gulp.src('./src/**/*.js')
        .pipe(babel({
        		presets: ['es2015'],
            plugins: ['transform-runtime']
        }))
        .pipe(gulp.dest('lib'));
});