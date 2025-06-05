type RemoveReturnType<T> = {
  // biome-ignore lint/suspicious/noExplicitAny: not use returnType
  [P in keyof T]: T[P] extends (...args: infer A) => any
    ? (...args: A) => void
    : T[P];
};

interface ServerScripts {
  onOpen: () => void;
  onEdit: () => void;
  getContent: (label: string) => string;
  getSheetsNumber: (sheetName: string) => number;
}

type _AppsScriptRun = RemoveReturnType<ServerScripts> & {
  // biome-ignore lint/suspicious/noExplicitAny: user object type
  withSuccessHandler: <T = string | number | boolean | undefined, U = any>(
    callback: (returnValues: T, userObject?: U) => void,
  ) => _AppsScriptRun;
  // biome-ignore lint/suspicious/noExplicitAny: user object type
  withFailureHandler: <U = any>(
    callback: (error: Error, userObject?: U) => void,
  ) => _AppsScriptRun;
  // biome-ignore lint/suspicious/noExplicitAny: user object type
  withUserObject: <U = any>(userObject: U) => _AppsScriptRun;
};

type _AppsScriptHistoryFunction = (
  stateObject: object,
  params: object,
  hash: string,
) => void;

interface _WebAppLovacationType {
  hash: string;
  parameter: Record<string, string>;
  parameters: Record<string, string[]>;
}

export declare interface GoogleClientSideApi {
  script: {
    run: _AppsScriptRun;
    url: {
      getLocation: (
        callback: (location: _WebAppLovacationType) => void,
      ) => void;
    };
    history: {
      push: _AppsScriptHistoryFunction;
      replace: _AppsScriptHistoryFunction;
      setChangeHandler: (
        callback: (e: {
          state: object;
          location: _WebAppLovacationType;
        }) => void,
      ) => void;
    };
  };
}

declare global {
  const google: GoogleClientSideApi;
}
