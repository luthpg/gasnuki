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
  type Type,
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
  const exportedDeclarations: (
    | FunctionDeclaration
    | VariableDeclaration
    | InterfaceDeclaration
    | TypeAliasDeclaration
  )[] = [];
  const exportedDeclarationNames = new Set<string>();
  const exportedFunctions: (
    | FunctionDeclaration
    | ArrowFunction
    | FunctionExpression
  )[] = [];

  // 1. First pass: Collect all exported declarations and functions
  for (const sourceFile of sourceFiles) {
    for (const iface of sourceFile.getInterfaces()) {
      if (!iface.getName()?.endsWith('_')) {
        exportedDeclarations.push(iface);
        exportedDeclarationNames.add(iface.getName());
      }
    }
    for (const typeAlias of sourceFile.getTypeAliases()) {
      if (!typeAlias.getName().endsWith('_')) {
        exportedDeclarations.push(typeAlias);
        exportedDeclarationNames.add(typeAlias.getName());
      }
    }
    for (const func of sourceFile.getFunctions()) {
      const name = func.getName();
      if (
        name &&
        !name.endsWith('_') &&
        !SIMPLE_TRIGGER_FUNCTION_NAMES.includes(name)
      ) {
        exportedDeclarations.push(func);
        exportedDeclarationNames.add(name);
        methodDefinitions.push(getInterfaceMethodDefinition_(name, func));
        exportedFunctions.push(func);
      }
    }
    for (const varStmt of sourceFile.getVariableStatements()) {
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
          exportedDeclarations.push(varDecl);
          exportedDeclarationNames.add(name);
          methodDefinitions.push(getInterfaceMethodDefinition_(name, funcExpr));
          exportedFunctions.push(funcExpr);
        }
      }
    }
  }

  const collectSymbolsFromType = (
    type: Type,
    foundSymbols: Set<import('ts-morph').Symbol>,
  ) => {
    const symbol = type.getAliasSymbol() ?? type.getSymbol();
    if (symbol && !foundSymbols.has(symbol)) {
      foundSymbols.add(symbol);
      if (type.isObject()) {
        for (const prop of type.getProperties()) {
          const propDecl = prop.getDeclarations()[0];
          if (propDecl) {
            collectSymbolsFromType(propDecl.getType(), foundSymbols);
          }
        }
      }
    }
    for (const typeArg of type.getTypeArguments()) {
      collectSymbolsFromType(typeArg, foundSymbols);
    }
    if (type.isUnion()) {
      for (const unionType of type.getUnionTypes()) {
        collectSymbolsFromType(unionType, foundSymbols);
      }
    }
    if (type.isIntersection()) {
      for (const intersectionType of type.getIntersectionTypes()) {
        collectSymbolsFromType(intersectionType, foundSymbols);
      }
    }
  };

  const returnValueSymbols = new Set<import('ts-morph').Symbol>();
  for (const func of exportedFunctions) {
    collectSymbolsFromType(func.getReturnType(), returnValueSymbols);
  }

  const symbolsToProcess = new Set<import('ts-morph').Symbol>();

  // Collect dependencies from function signatures and exported types
  for (const decl of exportedDeclarations) {
    // For functions, only scan parameters and return type nodes
    if (
      decl.getKind() === SyntaxKind.FunctionDeclaration ||
      (decl.getKind() === SyntaxKind.VariableDeclaration &&
        ((decl as VariableDeclaration).getInitializer()?.getKind() ===
          SyntaxKind.ArrowFunction ||
          (decl as VariableDeclaration).getInitializer()?.getKind() ===
            SyntaxKind.FunctionExpression))
    ) {
      const func =
        decl.getKind() === SyntaxKind.FunctionDeclaration
          ? (decl as FunctionDeclaration)
          : ((decl as VariableDeclaration).getInitializer() as
              | ArrowFunction
              | FunctionExpression);

      const parameters = func.getParameters();
      for (const param of parameters) {
        const typeRefs = param.getDescendantsOfKind(SyntaxKind.TypeReference);
        for (const typeRef of typeRefs) {
          const symbol =
            typeRef.getType().getAliasSymbol() ?? typeRef.getType().getSymbol();
          if (symbol) symbolsToProcess.add(symbol);
        }
      }

      const returnTypeNode = func.getReturnTypeNode();
      if (returnTypeNode) {
        const typeRefs = returnTypeNode.getDescendantsOfKind(
          SyntaxKind.TypeReference,
        );
        for (const typeRef of typeRefs) {
          const symbol =
            typeRef.getType().getAliasSymbol() ?? typeRef.getType().getSymbol();
          if (symbol) symbolsToProcess.add(symbol);
        }
      }
    }
    // For interfaces and type aliases, scan the whole declaration
    else if (
      decl.getKind() === SyntaxKind.InterfaceDeclaration ||
      decl.getKind() === SyntaxKind.TypeAliasDeclaration
    ) {
      const typeRefs = decl.getDescendantsOfKind(SyntaxKind.TypeReference);
      for (const typeRef of typeRefs) {
        const symbol =
          typeRef.getType().getAliasSymbol() ?? typeRef.getType().getSymbol();
        if (symbol) symbolsToProcess.add(symbol);
      }
    }
  }

  const importsMap = new Map<string, Set<string>>();
  const inlineDefinitions = new Map<string, string>();
  const processedSymbols = new Set<string>();

  while (symbolsToProcess.size > 0) {
    const symbol = symbolsToProcess.values().next().value;
    if (!symbol) continue;
    symbolsToProcess.delete(symbol);

    const symbolName = symbol.getName();
    if (
      processedSymbols.has(symbolName) ||
      exportedDeclarationNames.has(symbolName) ||
      symbolName === '__type'
    ) {
      continue;
    }

    const symbolFlags = symbol.getFlags();
    if (symbolFlags & SymbolFlags.TypeParameter) {
      continue;
    }

    const declaration = symbol.getDeclarations()[0];
    if (!declaration) {
      continue;
    }

    const sourceFile = declaration.getSourceFile();
    if (sourceFile.getFilePath().includes('node_modules')) {
      continue;
    }

    processedSymbols.add(symbolName);

    const isLocalDefinition =
      declaration.getParent()?.getKind() !== SyntaxKind.SourceFile;

    if (isLocalDefinition) {
      if (returnValueSymbols.has(symbol)) {
        const declText = declaration.getText();
        inlineDefinitions.set(symbolName, declText);

        const tempSourceFile = project.createSourceFile(
          `__temp_${symbolName}.ts`,
          declText,
        );
        for (const descendant of tempSourceFile.getDescendantsOfKind(
          SyntaxKind.TypeReference,
        )) {
          const newSymbol =
            descendant.getType().getAliasSymbol() ??
            descendant.getType().getSymbol();
          if (newSymbol) {
            symbolsToProcess.add(newSymbol);
          }
        }
        tempSourceFile.delete();
      }
    } else {
      let modulePath = path
        .relative(absoluteOutDir, sourceFile.getFilePath())
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

  if (inlineDefinitions.size > 0) {
    outputContent += `${[...inlineDefinitions.values()].join('\n\n')}\n\n`;
  }

  const exportedTypeDefinitions = exportedDeclarations
    .filter(
      (d) =>
        d.getKind() === SyntaxKind.InterfaceDeclaration ||
        d.getKind() === SyntaxKind.TypeAliasDeclaration,
    )
    .map((decl) => decl.getText());

  if (exportedTypeDefinitions.length > 0) {
    outputContent += `${exportedTypeDefinitions.join('\n\n')}\n\n`;
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
      `Interface 'ServerScript' type definitions written to ${absoluteOutputFile} (${methodDefinitions.length} function(s), ${
        exportedTypeDefinitions.length + inlineDefinitions.size
      } type(s)).`,
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
