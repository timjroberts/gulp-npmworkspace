declare namespace JsonFile {
    export interface WriteOptions {
        spaces?: number;
    }
}

declare module "jsonfile" {
    export function writeFileSync(filePath: string, obj: any, options?: JsonFile.WriteOptions): void;
}
