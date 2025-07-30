import * as fs from 'node:fs';
import * as path from 'node:path';
import { consola } from 'consola';
import {
  type ArrowFunction,
  type FunctionDeclaration,
  type FunctionExpression,
  type InterfaceDeclaration,
  Project,
  SymbolFlags,
  SyntaxKind,
  type TypeAliasDeclaration,
  type VariableDeclaration,
} from 'ts-morph';
import type { GenerateOptions } from '..';
import { text as clientsideText } from './clientside.json';

const getInterfaceMethodDefinition_ = (
  name: string,
  node: FunctionDeclaration | ArrowFunction | FunctionExpression,
): string => {
  const typeParameters = node.getTypeParameters?.() ?? [];
  const typeParamsString =
    typeParameters.length > 0
      ? `<${typeParameters.map((tp) => tp.getText()).join(', ')}>`
      : '';

  const parameters = node
    .getParameters()
    .map((param) => {
      const paramName = param.getName();
      const type =
        param.getTypeNode()?.getText() ??
        param.getType().getText(node) ??
        'any';
      const questionToken = param.hasQuestionToken() ? '?' : '';
      return `${paramName}${questionToken}: ${type}`;
    })
    .join(', ');

  const returnTypeNode = node.getReturnTypeNode();
  let returnType: string;
  if (returnTypeNode != null) {
    returnType = returnTypeNode.getText();
  } else {
    const inferredReturnType = node.getReturnType();
    if (inferredReturnType.isVoid()) {
      returnType = 'void';
    } else {
      returnType = inferredReturnType.getText(node);
    }
  }

  let jsDocString = '';
  const jsDocOwner =
    'getJsDocs' in node
      ? node
      : 'getParentOrThrow' in node &&
          // @ts-expect-error variable declaration
          node.getParentOrThrow().getKind() === SyntaxKind.VariableDeclaration
        ? // @ts-expect-error variable declaration
          (node.getParentOrThrow() as VariableDeclaration)
        : null;

  if (jsDocOwner != null) {
    const jsDocs = 'getJsDocs' in jsDocOwner ? jsDocOwner.getJsDocs() : [];
    if (jsDocs.length > 0) {
      const firstDoc = jsDocs[0];
      jsDocString = `${firstDoc.getFullText().trim()}\n`;
    }
  }
  return `${jsDocString}${name}${typeParamsString}(${parameters}): ${returnType};`;
};

export const SIMPLE_TRIGGER_FUNCTION_NAMES = [
  'onOpen',
  'onEdit',
  'onInstall',
  'onSelectionChange',
  'doGet',
  'doPost',
];

export const generateAppsScriptTypes = async ({
  project: projectPath,
  srcDir,
  outDir,
  outputFile,
}: Omit<GenerateOptions, 'watch'>) => {
  const absoluteSrcDir = path.resolve(projectPath, srcDir);
  const absoluteOutDir = path.resolve(projectPath, outDir);
  const absoluteOutputFile = path.resolve(absoluteOutDir, outputFile);

  consola.info('Starting AppsScript type generation with gasnuki...');
  consola.info(`  AppsScript Source Directory: ${absoluteSrcDir}`);
  consola.info(`  Output File: ${absoluteOutputFile}`);

  const project = new Project({
    tsConfigFilePath: path.resolve(projectPath, 'tsconfig.json'),
    skipAddingFilesFromTsConfig: true,
  });

  const sourceFilesPattern = path
    .join(absoluteSrcDir, '**/*.ts')
    .replace(/\\/g, '/');
  const testFilesPattern = `!${path
    .join(absoluteSrcDir, '**/*.{test,spec}.ts')
    .replace(/\\/g, '/')}`;
  project.addSourceFilesAtPaths([sourceFilesPattern, testFilesPattern]);

  const sourceFiles = project.getSourceFiles();
  consola.info(`Found ${sourceFiles.length} source file(s).`);

  const methodDefinitions: string[] = [];

  const localDeclarations: (
    | FunctionDeclaration
    | VariableDeclaration
    | InterfaceDeclaration
    | TypeAliasDeclaration
  )[] = [];
  const localDeclarationNames = new Set<string>();

  for (const sourceFile of sourceFiles) {
    for (const iface of sourceFile.getInterfaces()) {
      const name = iface.getName?.();
      if (name && !name.endsWith('_')) {
        localDeclarations.push(iface);
        localDeclarationNames.add(name);
      }
    }
    for (const typeAlias of sourceFile.getTypeAliases()) {
      const name = typeAlias.getName();
      if (name && !name.endsWith('_')) {
        localDeclarations.push(typeAlias);
        localDeclarationNames.add(name);
      }
    }
    for (const func of sourceFile.getFunctions()) {
      const name = func.getName();
      if (
        name &&
        !func.isAmbient() &&
        !name.endsWith('_') &&
        !SIMPLE_TRIGGER_FUNCTION_NAMES.includes(name)
      ) {
        localDeclarations.push(func);
        localDeclarationNames.add(name);
        methodDefinitions.push(getInterfaceMethodDefinition_(name, func));
      }
    }
    for (const varStmt of sourceFile.getVariableStatements()) {
      if (varStmt.isAmbient()) continue;
      for (const varDecl of varStmt.getDeclarations()) {
        const name = varDecl.getName();
        const initializer = varDecl.getInitializer();
        if (
          !name.endsWith('_') &&
          !SIMPLE_TRIGGER_FUNCTION_NAMES.includes(name) &&
          initializer &&
          (initializer.getKind() === SyntaxKind.ArrowFunction ||
            initializer.getKind() === SyntaxKind.FunctionExpression)
        ) {
          localDeclarations.push(varDecl);
          localDeclarationNames.add(name);
          methodDefinitions.push(
            getInterfaceMethodDefinition_(
              name,
              initializer as ArrowFunction | FunctionExpression,
            ),
          );
        }
      }
    }
  }

  const importsMap = new Map<string, Set<string>>();

  for (const decl of localDeclarations) {
    const descendants =
      decl.getDescendantsOfKind?.(SyntaxKind.TypeReference) ?? [];
    for (const descendant of descendants) {
      const symbol =
        descendant.getType().getAliasSymbol() ??
        descendant.getType().getSymbol();

      if (symbol) {
        const symbolFlags = symbol.getFlags();
        // ジェネリック型パラメータ (Tなど) は除外
        if (symbolFlags & SymbolFlags.TypeParameter) {
          continue;
        }

        const symbolName = symbol.getName();
        // ローカル定義の型とTypeScript内部の一時的な型 '__type' は除外
        if (localDeclarationNames.has(symbolName) || symbolName === '__type') {
          continue;
        }

        const declaration = symbol.getDeclarations()[0];
        if (declaration) {
          // インポート元が export 宣言されていることを確認
          const declarationSourceFile = declaration.getSourceFile();
          if (declarationSourceFile.getFilePath().includes('node_modules')) {
            continue;
          }

          let modulePath = path
            .relative(absoluteOutDir, declarationSourceFile.getFilePath())
            .replace(/\\/g, '/');

          modulePath = modulePath.replace(/\.(d\.)?ts$/, '');
          if (modulePath.endsWith('/index')) {
            modulePath = modulePath.slice(0, -6);
          }
          if (modulePath === 'index' || modulePath === '') {
            modulePath = '.';
          }
          if (!modulePath.startsWith('.')) {
            modulePath = `./${modulePath}`;
          }
          if (!importsMap.has(modulePath)) {
            importsMap.set(modulePath, new Set());
          }
          importsMap.get(modulePath)?.add(symbolName);
        }
      }
    }
  }

  if (!fs.existsSync(absoluteOutDir)) {
    fs.mkdirSync(absoluteOutDir, { recursive: true });
    consola.info(`Created output directory: ${absoluteOutDir}`);
  }

  const generatorName = 'gasnuki';
  let outputContent = `// Auto-generated by ${generatorName}\n// Do NOT edit this file manually.\n\n`;

  const sortedModulePaths = [...importsMap.keys()].sort((a, b) => {
    const aIsRelative = a.startsWith('.');
    const bIsRelative = b.startsWith('.');
    if (aIsRelative !== bIsRelative) return aIsRelative ? 1 : -1;
    return a.localeCompare(b);
  });

  if (sortedModulePaths.length > 0) {
    const importStatements = sortedModulePaths.map((modulePath) => {
      const imports = [...(importsMap.get(modulePath) ?? [])].sort();
      const finalModulePath = modulePath === '.' ? './index' : modulePath;
      return `import type { ${imports.join(', ')} } from '${finalModulePath}';`;
    });
    outputContent += `${importStatements.join('\n')}\n\n`;
  }

  const globalTypeDefinitions = localDeclarations
    .filter(
      (d) =>
        d.getKind?.() === SyntaxKind.InterfaceDeclaration ||
        d.getKind?.() === SyntaxKind.TypeAliasDeclaration,
    )
    .map((decl) => decl.getText?.());

  if (globalTypeDefinitions.length > 0) {
    outputContent += `${globalTypeDefinitions.join('\n\n')}\n\n`;
  }

  if (methodDefinitions.length > 0) {
    const formattedMethods = methodDefinitions
      .map((method) =>
        method
          .split('\n')
          .map((line) => `  ${line}`)
          .join('\n'),
      )
      .join('\n\n');
    outputContent += `export type ServerScripts = {\n${formattedMethods}\n}\n`;
    consola.info(
      `Interface 'ServerScript' type definitions written to ${absoluteOutputFile} (${methodDefinitions.length} function(s), ${globalTypeDefinitions.length} type(s)).`,
    );
  } else {
    outputContent += 'export type ServerScripts = {}\n';
    consola.info(
      `Interface 'ServerScript' type definitions written to ${absoluteOutputFile} (no functions found).`,
    );
  }

  outputContent += `\n// Auto-generated Types for GoogleAppsScript in client-side code\n\n${clientsideText}`;

  fs.writeFileSync(absoluteOutputFile, outputContent);
};
