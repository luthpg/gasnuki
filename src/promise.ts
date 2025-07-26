export type Promised<T> = {
  [K in keyof T]: T[K] extends (...args: infer A) => infer R
    ? (...args: A) => Promise<R>
    : T[K];
};

export type PartialScriptType<T> = Partial<Promised<T>>;

export const getPromisedServerScripts = <
  T extends Record<string, (...args: any[]) => any> = Omit<
    typeof google.script.run,
    'withSuccessHandler' | 'withFailureHandler' | 'withUserObject'
  >,
>(
  mockupFunctions: PartialScriptType<T> = {},
): Promised<T> => {
  return new Proxy<
    Record<string, ((...arg: any[]) => Promise<any>) | undefined>
  >(mockupFunctions, {
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
            .withSuccessHandler(resolve)
            .withFailureHandler(reject)
            [method](...args);
        });
    },
  }) as Promised<T>;
};
