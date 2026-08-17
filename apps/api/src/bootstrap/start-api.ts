import { APP_CONFIG, type AppConfig } from '../config/app-config.js';

export interface ApiListeningApplication {
  get(token: typeof APP_CONFIG): AppConfig;
  listen(port: number, host: string): Promise<unknown>;
}

export async function startApi(app: ApiListeningApplication): Promise<void> {
  const config = app.get(APP_CONFIG);
  await app.listen(config.port, config.host);
}
