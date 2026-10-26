export type Page = { pagina?: string; limite?: string };
export function pagination(query: Page = {}) {
  const take = Math.min(Number(query.limite ?? 100), 100);
  return { take, skip: (Number(query.pagina ?? 1) - 1) * take };
}
