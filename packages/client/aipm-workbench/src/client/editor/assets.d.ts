/** Third-party stylesheets the editor injects as scoped text. */
declare module '*.css?inline' {
  const source: string
  export default source
}
