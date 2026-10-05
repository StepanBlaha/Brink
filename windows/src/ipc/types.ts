/** Payload types mirrored by serde structs in src-tauri (camelCase). */
export interface AppVersion {
  marketing: string;
  build: string;
}

export interface AppError {
  kind: string;
  message: string;
  transient: boolean;
  code?: string;
}
