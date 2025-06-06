type Promised<T> = {
  [K in keyof T]: T[K] extends (...args: infer A) => infer R
    ? (...args: A) => Promise<R>
    : T[K];
};

export const ServerScripts = <
  T extends Record<string, (...args: any[]) => any> = Omit<
    Omit<
      Omit<typeof google.script.run, 'withSuccessHandler'>,
      'withFailureHandler'
    >,
    'withUserObject'
  >,
>(): Promised<T> => {
  const serverScripts: Record<string, (...arg: any[]) => Promise<any>> = {};
  for (const method of Object.keys(google.script.run)) {
    type TargetScriptType = T[typeof method];
    if (
      ['withSuccessHandler', 'withFailureHandler', 'withUserObject'].includes(
        String(method),
      )
    ) {
      continue;
    }
    serverScripts[method] = ((...args: Parameters<TargetScriptType>) =>
      new Promise<ReturnType<TargetScriptType>>((resolve, reject) => {
        google.script.run
          .withSuccessHandler<ReturnType<TargetScriptType>>(resolve)
          .withFailureHandler(reject)
          // ts-expect-error arguments has some types
          [method](...args);
      })) as Promised<T>[typeof method];
  }
  return serverScripts as Promised<T>;
};
