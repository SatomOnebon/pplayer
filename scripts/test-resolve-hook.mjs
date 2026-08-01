// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
export async function resolve(specifier, context, nextResolve) {
  if (
    (specifier.startsWith('./') || specifier.startsWith('../')) &&
    !/\.(?:ts|js|json|node)$/.test(specifier)
  ) {
    try {
      return await nextResolve(`${specifier}.ts`, context)
    } catch {
      // fall through to default resolution
    }
  }
  return nextResolve(specifier, context)
}
