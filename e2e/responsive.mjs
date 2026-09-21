/**
 * Verifica estouro horizontal em todas as rotas nas larguras-alvo.
 *   BASE_URL=http://localhost:3100 npm run e2e:responsive
 * Opcional: SHOTS=/caminho/pasta salva capturas (uma por rota/largura em 375 e 1440).
 */
import { chromium } from "playwright-core";
import { mkdirSync } from "node:fs";

const BASE = process.env.BASE_URL ?? "http://localhost:3100";
const SHOTS = process.env.SHOTS;
if (SHOTS) mkdirSync(SHOTS, { recursive: true });
const WIDTHS = [320, 375, 390, 414, 768, 1024, 1280, 1440, 1920];
const ROUTES = [
  "/", "/agendar", "/servicos", "/barbeiros", "/galeria", "/sobre", "/contato", "/fidelidade",
  "/politica-de-privacidade", "/termos", "/minha-conta", "/minha-conta/agendamentos", "/minha-conta/historico",
  "/minha-conta/fidelidade", "/minha-conta/beneficios", "/minha-conta/perfil",
  "/admin/dashboard", "/admin/agenda", "/admin/agendamentos", "/admin/clientes", "/admin/servicos",
  "/admin/barbeiros", "/admin/fidelidade", "/admin/recompensas", "/admin/campanhas", "/admin/configuracoes",
];

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? "/opt/pw-browsers/chromium", args: ["--no-sandbox"] });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
await ctx.route((u) => !u.href.startsWith(BASE), (r) => r.abort());
const page = await ctx.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));

// Prepara: entra no painel, carrega dados de demonstração e entra como o primeiro cliente demo.
await page.goto(`${BASE}/admin/dashboard`, { waitUntil: "load" });
await page.getByRole("button", { name: /Entrar no painel/ }).click();
const load = page.getByRole("button", { name: /Carregar dados de demonstração/ }).first();
if (await load.isVisible().catch(() => false)) {
  await load.click();
  await page.getByText("Dados de demonstração carregados.").first().waitFor();
}
// O login de demonstração já carrega os dados fictícios (assíncrono): espera aparecerem.
await page.waitForFunction(() => {
  const raw = localStorage.getItem("fdb-demo-state");
  return raw && JSON.parse(raw).customers.some((x) => x.isDemo);
});
await page.evaluate(() => {
  const s = JSON.parse(localStorage.getItem("fdb-demo-state"));
  const c = s.customers.find((x) => x.isDemo);
  localStorage.setItem("fdb-demo-session", JSON.stringify({ customerId: c.id, admin: true }));
});

const bad = [];
for (const w of WIDTHS) {
  await page.setViewportSize({ width: w, height: 900 });
  for (const r of ROUTES) {
    await page.goto(`${BASE}${r}`, { waitUntil: "load" });
    await page.waitForTimeout(250);
    const over = await page.evaluate(() => {
      const de = document.documentElement;
      return de.scrollWidth - de.clientWidth;
    });
    if (over > 1) bad.push(`${w}px ${r}: +${over}px`);
    if (SHOTS && (w === 375 || w === 1440)) {
      await page.screenshot({ path: `${SHOTS}/${w}${r.replace(/\//g, "_") || "_home"}.png`, fullPage: true });
    }
  }
}
await browser.close();
console.log(bad.length ? "ESTOURO HORIZONTAL:\n" + bad.join("\n") : `sem estouro horizontal em ${ROUTES.length} rotas x ${WIDTHS.length} larguras`);
if (errors.length) console.log("erros:", [...new Set(errors)]);
process.exit(bad.length || errors.length ? 1 : 0);
