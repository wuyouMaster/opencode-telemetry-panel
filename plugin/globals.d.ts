declare const process: {
  platform: string
  arch: string
  env: Record<string, string | undefined>
}

declare const Bun: {
  spawn: (
    cmd: string[],
    options: { detached?: boolean; stdio: ["ignore", "ignore", "ignore"] },
  ) => {
    unref: () => void
  }
}
