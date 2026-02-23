import { deserialize, type JsonString } from './json';

export type Promised<T> = {
  [K in keyof T]: T[K] extends (...args: infer A) => infer R
    ? (...args: A) => Promise<R>
    : T[K];
};

type UnwrapJson<T> = T extends JsonString<infer U> ? U : T;

export type PromisedWithJson<T> = {
  [K in keyof T]: T[K] extends (...args: infer A) => infer R
    ? (...args: A) => Promise<UnwrapJson<R>>
    : T[K];
};

export type PartialScriptType<T> = Partial<Promised<T>>;
export type PartialScriptTypeWithJson<T> = Partial<PromisedWithJson<T>>;

export type GetPromisedServerScriptsOptions<
  T,
  IsJson extends boolean = boolean,
> = {
  mockupFunctions?: PartialScriptType<T>;
  parseJson?: IsJson;
  strictMock?: boolean;
};

export function getPromisedServerScripts<
  T extends Record<string, (...args: any[]) => any> = Omit<
    typeof google.script.run,
    'withSuccessHandler' | 'withFailureHandler' | 'withUserObject'
  >,
>(options: GetPromisedServerScriptsOptions<T, true>): PromisedWithJson<T>;

export function getPromisedServerScripts<
  T extends Record<string, (...args: any[]) => any> = Omit<
    typeof google.script.run,
    'withSuccessHandler' | 'withFailureHandler' | 'withUserObject'
  >,
>(options?: GetPromisedServerScriptsOptions<T, false>): Promised<T>;

export function getPromisedServerScripts<
  T extends Record<string, (...args: any[]) => any> = Omit<
    typeof google.script.run,
    'withSuccessHandler' | 'withFailureHandler' | 'withUserObject'
  >,
>(
  options: GetPromisedServerScriptsOptions<T> = {},
): Promised<T> | PromisedWithJson<T> {
  const {
    mockupFunctions = {},
    parseJson = false,
    strictMock = true,
  } = options;

  return new Proxy<
    Record<string, ((...arg: any[]) => Promise<any>) | undefined>
  >(mockupFunctions as any, {
    get(target, method: string) {
      if (!('google' in globalThis) || !google?.script?.run) {
        const mockFunc = target[method];
        if (!mockFunc) {
          if (strictMock) {
            return undefined;
          } else {
            return async () => {
              console.warn(
                `[gasnuki] Warning: Called undefined mock function '${method}'. Falling back to void.`,
              );
            };
          }
        }
        if (!parseJson) {
          return mockFunc;
        }
        return async (...args: any[]) => {
          const res = await mockFunc(...args);
          if (typeof res === 'string') {
            try {
              return deserialize(res as any);
            } catch {
              return res;
            }
          }
          return res;
        };
      }
      if (!(method in google.script.run)) {
        throw Error(`Method ${method} not found in AppsScript.`);
      }
      return (...args: Parameters<T[typeof method]>) =>
        new Promise((resolve, reject) => {
          google.script.run
            .withSuccessHandler((res) => {
              if (parseJson && typeof res === 'string') {
                try {
                  resolve(deserialize(res as any));
                } catch {
                  resolve(res);
                }
              } else {
                resolve(res);
              }
            })
            .withFailureHandler(reject)
            [method](...args);
        });
    },
  }) as any;
}
