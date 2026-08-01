// Vite's `?raw` suffix, declared locally because the Worker tsconfig keeps
// `types: []` and so does not pull in `vite/client`.
declare module "*.sql?raw" {
  const content: string;
  export default content;
}
