var gulp = require("gulp");
var util = require("gulp-util");
var childProcess = require("child_process");
var path = require("path");
var through = require("through2");

function compileProject() {
    return through.obj(function(file, encoding, callback) {
        var pathInfo = path.parse(file.path);
        try {
            childProcess.execSync("\"./node_modules/.bin/tsc\"", { cwd: pathInfo.dir });    
        } catch (error) {
            util.log(util.colors.red(error.stdout.toString()));
        }

        callback(null, file);
    });
}

gulp.task("compile", function() {
    return gulp.src("./tsconfig.json")
        .pipe(compileProject());
});
