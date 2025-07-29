import * as fs from 'node:fs';
import * as path from 'node:path';
import { consola } from 'consola';
import {
  type ArrowFunction,
  type FunctionDeclaration,
  type FunctionExpression,
  type InterfaceDeclaration,
  Project,
  type Symbol as SymbolType,
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

  project.addSourceFilesAtPaths(
    path.join(absoluteSrcDir, '**/*.ts').replace(/\\/g, '/'),
  );

  const sourceFiles = project.getSourceFiles();
  consola.info(`Found ${sourceFiles.length} source file(s).`);

  const methodDefinitions: string[] = [];
  const globalTypeDeclarations: (
    | InterfaceDeclaration
    | TypeAliasDeclaration
  )[] = [];
  const functionDeclarations: (
    | FunctionDeclaration
    | ArrowFunction
    | FunctionExpression
  )[] = [];

  for (const sourceFile of sourceFiles) {
    for (const iface of sourceFile.getInterfaces()) {
      const name = iface.getName?.();
      if (name && !name.endsWith('_')) {
        globalTypeDeclarations.push(iface);
      }
    }
    for (const typeAlias of sourceFile.getTypeAliases()) {
      const name = typeAlias.getName?.();
      if (name && !name.endsWith('_')) {
        globalTypeDeclarations.push(typeAlias);
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
        functionDeclarations.push(func);
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
          const funcExpr = initializer as ArrowFunction | FunctionExpression;
          functionDeclarations.push(funcExpr);
          methodDefinitions.push(getInterfaceMethodDefinition_(name, funcExpr));
        }
      }
    }
  }

  const typeChecker = project.getTypeChecker?.();
  const usedSymbols = new Set<SymbolType>();
  const nodesToInspect = [...globalTypeDeclarations, ...functionDeclarations];

  for (const node of nodesToInspect) {
    node.forEachDescendant?.((descendant) => {
      if (descendant.getKind() === SyntaxKind.TypeReference) {
        const symbol = descendant.getType().getSymbol();
        if (symbol) {
          usedSymbols.add(symbol.getAliasedSymbol() ?? symbol);
        }
      }
    });
  }

  const importsMap = new Map<string, Set<string>>();

  for (const sourceFile of sourceFiles) {
    const importDecls = sourceFile.getImportDeclarations?.() ?? [];
    for (const importDecl of importDecls) {
      const namedImports = importDecl.getNamedImports();
      for (const namedImport of namedImports) {
        const symbol = namedImport.getNameNode().getSymbolOrThrow();
        const aliasedSymbol = typeChecker.getAliasedSymbol(symbol) ?? symbol;
        if (usedSymbols?.has(aliasedSymbol)) {
          let modulePath = importDecl.getModuleSpecifierValue();
          if (modulePath.startsWith('.')) {
            const sourceFilePath = sourceFile.getFilePath();
            const absoluteModulePath = path.resolve(
              path.dirname(sourceFilePath),
              modulePath,
            );
            modulePath = path
              .relative(absoluteOutDir, absoluteModulePath)
              .replace(/\\/g, '/');
            if (!modulePath.startsWith('.')) {
              modulePath = `./${modulePath}`;
            }
          }
          if (!importsMap.has(modulePath)) {
            importsMap.set(modulePath, new Set());
          }
          importsMap.get(modulePath)?.add(namedImport.getName());
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
      return `import type { ${imports.join(', ')} } from "${modulePath}";`;
    });
    outputContent += `${importStatements.join('\n')}\n\n`;
  }

  if (globalTypeDeclarations.length > 0) {
    outputContent += `${globalTypeDeclarations.map((decl) => decl.getText()).join('\n\n')}\n\n`;
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
      `Interface 'ServerScript' type definitions written to ${absoluteOutputFile} (${methodDefinitions.length} function(s), ${globalTypeDeclarations.length} type(s)).`,
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
