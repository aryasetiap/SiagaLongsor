import SwaggerParser from '@apidevtools/swagger-parser';
import process from 'node:process';
import { fileURLToPath, URL } from 'node:url';

const specificationPath = fileURLToPath(new URL('../specs/openapi.yaml', import.meta.url));

try {
  const specification = await SwaggerParser.validate(specificationPath);

  if (specification.openapi !== '3.1.0') {
    throw new Error(`Unsupported OpenAPI version: ${specification.openapi ?? 'missing'}`);
  }

  process.stdout.write('OpenAPI specification is valid.\n');
} catch (error) {
  process.stderr.write('OpenAPI specification validation failed.\n');
  process.stderr.write(`${error instanceof Error ? error.message : 'Unknown validation error.'}\n`);
  process.exitCode = 1;
}
