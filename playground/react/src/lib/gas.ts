import { getPromisedServerScripts, type PartialScriptType } from "@ciderjs/gasnuki/promise";
import type { ServerScripts, Person } from "../../types/appsscript";

export const mockupScripts: PartialScriptType<ServerScripts> = {
  sayHello: async (name) => `Hello, ${name}! - from mockup scripts -`,
  getPerson: async () => JSON.stringify({ name: 'John', age: 15 } as Person),
};

export const serverScripts = getPromisedServerScripts<ServerScripts>(mockupScripts);
