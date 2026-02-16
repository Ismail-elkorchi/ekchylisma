declare module "node:fs/promises" {
  export function readFile(path: string, encoding: string): Promise<string>;
  export function writeFile(
    path: string,
    data: string,
    encoding: string,
  ): Promise<void>;
}
