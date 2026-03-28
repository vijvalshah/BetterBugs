export interface SourceMapResolver {
  resolveStackTrace(stack: string): Promise<string | undefined>;
}

export interface SourceMapResult {
  sourceMappedStack?: string;
  sourceMapStatus: 'mapped' | 'unmapped' | 'resolver-error';
}

let sourceMapResolver: SourceMapResolver | undefined;

export function registerSourceMapResolver(resolver?: SourceMapResolver): void {
  sourceMapResolver = resolver;
}

export async function resolveStackWithSourceMap(stack: string | undefined): Promise<SourceMapResult> {
  if (!stack) {
    return {
      sourceMapStatus: 'unmapped',
    };
  }

  if (!sourceMapResolver) {
    return {
      sourceMapStatus: 'unmapped',
    };
  }

  try {
    const mapped = await sourceMapResolver.resolveStackTrace(stack);
    if (mapped && mapped !== stack) {
      return {
        sourceMappedStack: mapped,
        sourceMapStatus: 'mapped',
      };
    }

    return {
      sourceMapStatus: 'unmapped',
    };
  } catch {
    return {
      sourceMapStatus: 'resolver-error',
    };
  }
}