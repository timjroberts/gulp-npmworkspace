declare namespace JsonFile {
    export interface WriteOptions {
        spaces?: number;
    }
    
    export function writeFileSync(filePath: string, obj: any, options?: JsonFile.WriteOptions): void;
}

declare module "jsonfile" {
    export = JsonFile;
}
