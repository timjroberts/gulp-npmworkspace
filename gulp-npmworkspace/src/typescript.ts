// import * as path from "path";
// import * as fs from "fs";
// import * as os from "os";
// import * as childProcess from "child_process";
// import * as util from "gulp-util";
// import * as through from "through2";
// import * as _ from "underscore";
// import * as glob from "glob";
// import File = require("vinyl");
//
// import {ArgumentOptions,
//         PackageDescriptor} from "./interfaces";
//
// import {TypeScriptCompileOptions,
//         AsyncAction} from "./options";
//
// import {pluginName,
//         Logger,
//         argvExclusiveProjectName} from "./plugin";
//
// const TSC_ARGS_FILENAME: string = "_args.tmp";
// const TSCONFIG_FILENAME: string = "tsconfig.json";
//
//
// enum FileMode {
//     Inclusion,
//     Exclusion
// }
//
//
// /**
//  * Accepts and returns a stream of 'package.json' files and executes the TypeScript compiler for each one.
//  *
//  * @param options A hash of options.
//  */
// export function buildTypeScriptProject(options?: TypeScriptCompileOptions): NodeJS.ReadWriteStream {
//     options = _.defaults(options || { }, { continueOnError: true, fastCompile: true, includeTypings: true });
//
//     let requiredPackageName = argvExclusiveProjectName();
//
//     return through.obj(function(file: File, encoding, callback) {
//         if (file.isStream()) return callback(new util.PluginError(pluginName, "Streams not supported."));
//
//         let pathInfo = path.parse(file.path);
//
//         if (pathInfo.base !== "package.json") return callback(new util.PluginError(pluginName, "Expected a 'package.json' file."));
//
//         let packageDescriptor: PackageDescriptor = JSON.parse(file.contents.toString());
//
//         if (requiredPackageName && packageDescriptor.name !== requiredPackageName) {
//             return callback(null, file);
//         }
//
//         let getTypeScriptCompilerConfigFunc: () => Array<Object>
//             = file["getWorkspace"]()["getTypeScriptCompilerConfig"]
//               || function(): Array<Object> {
//                     return glob.sync("./tsconfig*.json", { cwd: pathInfo.dir }).map((file) => require(path.resolve(pathInfo.dir, file)));
//               };
//
//         let typeScriptConfigs = getTypeScriptCompilerConfigFunc();
//
//         if (typeScriptConfigs.length === 0) {
//             Logger.warn(util.colors.yellow(`Cannot compile workspace package '${packageDescriptor.name}'. Could not find a 'tsconfig.json' file.`));
//
//             return callback(null, file);
//         }
//
//         Logger.info(`Compiling workspace package '${util.colors.cyan(packageDescriptor.name)}'`);
//
//         let typeScriptConfigsRemaining = typeScriptConfigs.length;
//         let typeScriptArgsFileNames: Array<string> = [ ];
//
//         let onTypeScriptArgumentFileCreated = function(typeScriptArgsFileName: string) {
//             typeScriptArgsFileNames.push(typeScriptArgsFileName);
//
//             if (--typeScriptConfigsRemaining === 0) {
//                 try {
//                     for (let idx = 0; idx < typeScriptArgsFileNames.length; idx++) {
//                         let argsFileName = typeScriptArgsFileNames[idx];
//
//                         try {
//                             shellExecuteTsc(pathInfo.dir, [ `@${argsFileName}` ]);
//                         }
//                         catch (error) {
//                             let message = `Compilation failed for workspace package '${util.colors.cyan(packageDescriptor.name)}'`;
//
//                             Logger.error(message + os.EOL + util.colors.red(error.message));
//
//                             return callback(options.continueOnError ? null
//                                                                     : new util.PluginError(pluginName, message, { showProperties: false, showStack: false}),
//                                             file);
//                         }
//                     }
//
//                     let postCompileAction = <AsyncAction>file["getWorkspace"]()["postTypeScriptCompile"];
//
//                     if (postCompileAction && typeof postCompileAction === "function") {
//                         Logger.info(`Running post-compile action for workspace package '${util.colors.cyan(packageDescriptor.name)}'`);
//
//                         postCompileAction(pathInfo.dir, packageDescriptor, (error?: Error) => {
//                             if (error) {
//                                 let message = `Post-compile action failed for workspace package '${util.colors.cyan(packageDescriptor.name)}'`;
//
//                                 Logger.error(message + os.EOL + util.colors.red(error.message));
//
//                                 return callback(options.continueOnError ? null
//                                                                         : new util.PluginError(pluginName, message, { showProperties: false, showStack: false}),
//                                                 file);
//                             }
//
//                             callback(null, file);
//                         });
//                     }
//                     else {
//                         callback(null, file);
//                     }
//                 }
//                 finally {
//                     typeScriptArgsFileNames.forEach((argsFileName) => { fs.unlinkSync(path.join(pathInfo.dir, argsFileName)); });
//                 }
//             }
//         };
//
//         typeScriptConfigs.forEach((typeScriptConfig, idx) => {
//             let argsFileName = `_${idx.toString()}_${TSC_ARGS_FILENAME}`;
//
//             let compilerOptions = typeScriptConfig["compilerOptions"] || { };
//             let fileMode
//                 = typeScriptConfig["files"] ? FileMode.Inclusion
//                                             : FileMode.Exclusion;
//             let filesOrFolders
//                 = fileMode === FileMode.Inclusion ? typeScriptConfig["files"] || [ ]
//                                                   : typeScriptConfig["exclude"] || [ ];
//
//             Logger.verbose((logger) => {
//                 logger(`Compiler options: ${JSON.stringify(compilerOptions)}`);
//
//                 if (fileMode === FileMode.Exclusion) {
//                     filesOrFolders.forEach((exclFolder) => { logger(`Excluding folder '${util.colors.blue(exclFolder)}'`); });
//                 }
//             });
//
//             createTscArgsFile(pathInfo.dir, argsFileName, compilerOptions, fileMode, filesOrFolders, () => { onTypeScriptArgumentFileCreated(argsFileName); });
//         });
//     });
// }
//
//
// /**
//  * Shells out to the TypeScript compiler. If a compiler is installed in the workspace pacakge then that
//  * version is used over the version that is installed in the workspace.
//  *
//  * @param packagePath The path to the root of the package.
//  * @param compilerArgs An array of arguments to pass to the compiler.
//  */
// function shellExecuteTsc(packagePath: string, compilerArgs: Array<string> = [ ]): void {
//     let hasLocalTypeScript = fs.existsSync(path.join(packagePath, "node_modules", "typescript"));
//     let result = childProcess.spawnSync(path.join(hasLocalTypeScript ? "." : "..", "node_modules/.bin", process.platform === "win32" ? "tsc.cmd" : "tsc"), compilerArgs, { cwd: packagePath });
//
//     if (result.error) throw new Error("Could not locate a TypeScript compiler.");
//
//     if (result.status !== 0) throw new Error(result.stdout.toString());
// }
//
//
// /**
//  * A PreCompileAction implementation that generates a TypeScript 'args' file.
//  *
//  * @param packagePath The path to the root of the package.
//  * @param argsFileName The filename of the 'args' file.
//  * @param compilerOptions A hash of the TypeScript compiler options.
//  * @excludedFolders An array of folders that should be excluded from compilation.
//  * @onCompleteFunc The callback to invoke when the pre-compilation action is complete.
//  */
// function createTscArgsFile(packagePath: string, argsFileName: string, compilerOptions: Object, fileMode: FileMode, filesOrFolders: Array<string>, onCompleteFunc: Function): void {
//     let fileStream = fs.createWriteStream(path.join(packagePath, argsFileName));
//
//     fileStream.once("finish", () =>
//     {
//         onCompleteFunc();
//     });
//
//     for (let compilerOption in compilerOptions) {
//         if (typeof compilerOptions[compilerOption] === "string") {
//             fileStream.write(`--${compilerOption} ${compilerOptions[compilerOption]} `);
//         }
//         else {
//             if ((<boolean>compilerOptions[compilerOption])) {
//                 fileStream.write(`--${compilerOption} `);
//             }
//         }
//     }
//
//     if (fileMode === FileMode.Inclusion) {
//         filesOrFolders.forEach((srcFile) => {
//             fileStream.write(`${os.EOL}\"${srcFile}\"`);
//         });
//     }
//     else {
//         glob.sync("./*.ts", { cwd: packagePath, nosort: true }).forEach((srcFile) => {
//             fileStream.write(`${os.EOL}\"${srcFile}\"`);
//         });
//
//         let packageFolders: Array<string> = _.filter(fs.readdirSync(packagePath), (p) => fs.statSync(path.join(packagePath, p)).isDirectory());
//         let srcFolders: Array<string> = _.difference(packageFolders, filesOrFolders); // remove the excluded folders
//
//         srcFolders.forEach((srcFolder) => {
//             glob.sync(`./${srcFolder}/**/*.ts`, { cwd: packagePath, nosort: true }).forEach((srcFile) => {
//                 fileStream.write(`${os.EOL}\"${srcFile}\"`);
//             });
//         });
//     }
//
//     fileStream.end();
// }
