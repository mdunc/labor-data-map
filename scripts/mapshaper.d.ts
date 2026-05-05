declare module "mapshaper" {
  export function runCommands(commands: string): Promise<void>;
}
