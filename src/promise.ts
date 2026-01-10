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

export function getPromisedServerScripts<
  T extends Record<string, (...args: any[]) => any> = Omit<
    typeof google.script.run,
    'withSuccessHandler' | 'withFailureHandler' | 'withUserObject'
  >,
>(
  mockupFunctions: PartialScriptTypeWithJson<T> | undefined,
  options: { parseJson: true },
): PromisedWithJson<T>;

export function getPromisedServerScripts<
  T extends Record<string, (...args: any[]) => any> = Omit<
    typeof google.script.run,
    'withSuccessHandler' | 'withFailureHandler' | 'withUserObject'
  >,
>(
  mockupFunctions?: PartialScriptType<T>,
  options?: { parseJson?: false },
): Promised<T>;

export function getPromisedServerScripts<
  T extends Record<string, (...args: any[]) => any> = Omit<
    typeof google.script.run,
    'withSuccessHandler' | 'withFailureHandler' | 'withUserObject'
  >,
>(
  mockupFunctions: PartialScriptType<T> | PartialScriptTypeWithJson<T> = {},
  options?: { parseJson?: boolean },
): Promised<T> | PromisedWithJson<T> {
  return new Proxy<
    Record<string, ((...arg: any[]) => Promise<any>) | undefined>
  >(mockupFunctions as any, {
    get(target, method: string) {
      if (!('google' in globalThis) || !google?.script?.run) {
        return target[method];
      }
      if (!(method in google.script.run)) {
        throw Error(`Method ${method} not found in AppsScript.`);
      }
      return (...args: Parameters<T[typeof method]>) =>
        new Promise((resolve, reject) => {
          google.script.run
            .withSuccessHandler((res) => {
              if (options?.parseJson && typeof res === 'string') {
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
