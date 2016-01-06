import * as path from "path";
import * as fs from "fs";
import * as os from "os";
import * as childProcess from "child_process";
import * as util from "gulp-util";
import * as through from "through2";
import * as _ from "underscore";
import * as glob from "glob";
import File = require("vinyl");

import {ArgumentOptions,
        PackageDescriptor} from "./interfaces";

import {TypeScriptCompileOptions} from "./options";
import {pluginName} from "./plugin";

const TSC_ARGS_FILENAME: string = "__args.tmp";

/**
 * Accepts and returns a stream of 'package.json' files and executes the TypeScript compiler for each one.
 *
 * @param options A hash of options.
 */
export function buildTypeScriptProject(options?: TypeScriptCompileOptions): NodeJS.ReadWriteStream {
    options = _.defaults(options || { }, { continueOnError: true, fastCompile: true });

    return through.obj(function(file: File, encoding, callback) {
        if (file.isStream()) return callback(new util.PluginError(pluginName, "Streams not supported."));

        let pathInfo = path.parse(file.path);

        if (pathInfo.base !== "package.json") return callback(new util.PluginError(pluginName, "Expected a 'package.json' file."));

        let packageDescriptor: PackageDescriptor = JSON.parse(file.contents.toString());

        let globalTypeScriptConfigPath = path.join(process.cwd(), "tsconfig.json");
        let hasGlobalTypeScriptConfig = fs.existsSync(globalTypeScriptConfigPath);

        let localTypeScriptConfigPath = path.join(pathInfo.dir, "tsconfig.json");
        let hasLocalTypeScriptConfig = fs.existsSync(localTypeScriptConfigPath);

        if (!hasGlobalTypeScriptConfig && !hasLocalTypeScriptConfig) {
            util.log(util.colors.yellow(`Cannot compile workspace package '${packageDescriptor.name}'. Could not find a local or global 'tsconfig.json' file.`));

            return callback(null, file);
        }

        util.log(`Compiling workspace package '${util.colors.cyan(packageDescriptor.name)}'`);

        if (hasLocalTypeScriptConfig && !options.fastCompile) {
            shellExecuteTsc(pathInfo.dir);

            callback(null, file);
        }
        else {
            // Generate an @args file for the compiler
            let compilerOptions: Object
                = _.extend({ },
                           hasGlobalTypeScriptConfig ? require(globalTypeScriptConfigPath).compilerOptions || { } : { },
                           hasLocalTypeScriptConfig ? require(localTypeScriptConfigPath).compilerOptions || { } : { });

            let excludedFolders: Array<string>
                = _.union<string>(hasGlobalTypeScriptConfig ? require(globalTypeScriptConfigPath).exclude || [ ] : [ ],
                                  hasLocalTypeScriptConfig ? require(localTypeScriptConfigPath).exclude || [ ] : [ ]);

            createTscArgsFile(pathInfo.dir, compilerOptions, excludedFolders, () => {
                shellExecuteTsc(pathInfo.dir, [ "@" + TSC_ARGS_FILENAME ]);

                fs.unlinkSync(path.join(pathInfo.dir, TSC_ARGS_FILENAME));

                callback(null, file);
            });
        }
    });
}

function shellExecuteTsc(packagePath: string, compilerArgs: Array<string> = [ ]): void {
    let hasLocalTypeScript = fs.existsSync(path.join(packagePath, "node_modules", "typescript"));
    let result = childProcess.spawnSync(path.join(hasLocalTypeScript ? "." : "..", "node_modules/.bin", process.platform === "win32" ? "tsc.cmd" : "tsc"), compilerArgs, { cwd: packagePath });

    if (result.status !== 0) {
        util.log(util.colors.red(`Compilation failed:${os.EOL}${result.stdout.toString()}`));
    }
}

function createTscArgsFile(packagePath: string, compilerOptions: Object, excludedFolders: Array<string>, onCompleteFunc: Function): void {
    let argsFilePath = path.join(packagePath, TSC_ARGS_FILENAME);

    let fileStream = fs.createWriteStream(argsFilePath);

    fileStream.once("finish", () =>
    {
        onCompleteFunc();
    });

    for (let compilerOption in compilerOptions) {
        if (typeof compilerOptions[compilerOption] === "string") {
            fileStream.write(`--${compilerOption} ${compilerOptions[compilerOption]} `);
        }
        else {
            fileStream.write(`--${compilerOption} `);
        }
    }

    glob.sync(`./*.ts`, { cwd: packagePath }).forEach((srcFile) => {
        fileStream.write(`${os.EOL}\"${srcFile}\"`)
    });

    let packageFolders: Array<string> = _.filter(fs.readdirSync(packagePath), (p) => fs.statSync(path.join(packagePath, p)).isDirectory());
    let srcFolders: Array<string> = _.difference(packageFolders, excludedFolders); // remove the excluded folders

    srcFolders.forEach((srcFolder) => {
        glob.sync(`./${srcFolder}/**/*.ts`, { cwd: packagePath }).forEach((srcFile) => {
            fileStream.write(`${os.EOL}\"${srcFile}\"`)
        });
    });

    fileStream.end();
}
