export function serverEnv(name: string): string | undefined {
  return process.env[name]?.trim() || undefined;
}

export function publicTileBaseUrl(): string {
  return serverEnv("NEXT_PUBLIC_MAP_TILES_BASE_URL") ?? "https://tiles.map.nomadeezee.com";
}
