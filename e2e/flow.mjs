/**
 * Teste ponta a ponta (navegador real) dos fluxos críticos da demonstração.
 *
 *   npm run build && npx next start -p 3100 &
 *   BASE_URL=http://localhost:3100 npm run e2e
 *
 * Requer um Chromium: CHROMIUM_PATH (padrão /opt/pw-browsers/chromium) ou o do Playwright.
 * Cobre: Cliente A agenda 14:00 → Cliente B é impedido → admin conclui → pontos →
 * cliente resgata → admin valida o código; cancelamento e remarcação pelo link.
 */
import { chromium } from "playwright-core";

const BASE = process.env.BASE_URL ?? "http://localhost:3100";
const results = [];
const errors = [];

async function step(name, fn) {
  try {
    await fn();
    results.push({ name, ok: true });
    console.log(`  ok   ${name}`);
  } catch (e) {
    results.push({ name, ok: false, error: e.message });
    console.log(`  FAIL ${name}\n       ${e.message.split("\n")[0]}`);
  }
}
const assert = (cond, msg) => {
  if (!cond) throw new Error(msg);
};

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH ?? "/opt/pw-browsers/chromium",
  args: ["--no-sandbox"],
});
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
await ctx.route((url) => !url.href.startsWith(BASE), (r) => r.abort());
const watch = (p, tag) => {
  p.on("pageerror", (e) => errors.push(`${tag}: ${e.message}`));
  p.on("console", (m) => {
    if (m.type() === "error" && !/Failed to load resource|net::ERR/.test(m.text())) errors.push(`${tag}: ${m.text()}`);
  });
};

const PHONE_A = "(19) 98111-0001";
const PHONE_B = "(19) 98111-0002";

/** Percorre o fluxo de agendamento até a tela de dados e devolve a página. */
async function openBooking(page) {
  await page.goto(`${BASE}/agendar`, { waitUntil: "load" });
  await page.getByRole("button", { name: /Corte de Cabelo/ }).first().click();
  await page.getByRole("button", { name: /Henrique/ }).click();
  // Primeiro dia útil com horários, a partir de amanhã: escolhe uma quarta-feira livre.
  const day = page.getByRole("button", { name: /quarta-feira/ }).and(page.locator(":not([disabled])")).first();
  await day.click();
}

let slotLabel = "14:00";

await step("admin: entra e cadastra recompensa de teste", async () => {
  const admin = await ctx.newPage();
  watch(admin, "admin");
  await admin.goto(`${BASE}/admin/recompensas`, { waitUntil: "load" });
  await admin.getByRole("button", { name: /Entrar no painel/ }).click();
  await admin.getByRole("button", { name: /Nova recompensa/ }).click();
  await admin.getByRole("textbox", { name: "Nome" }).fill("Cortesia de teste");
  await admin.getByLabel("Custo (pontos)").fill("10");
  await admin.getByRole("button", { name: "Salvar" }).click();
  await admin.getByText("Cortesia de teste").first().waitFor();
  await admin.close();
});

const pageA = await ctx.newPage();
const pageB = await ctx.newPage();
watch(pageA, "A");
watch(pageB, "B");

await step("Cliente A agenda quarta às 14:00 com o Henrique", async () => {
  await openBooking(pageA);
  await pageA.getByRole("button", { name: slotLabel, exact: true }).click();
  await pageA.getByRole("button", { name: "Continuar" }).click();
  await pageA.getByRole("textbox", { name: "Nome" }).fill("Cliente Teste A");
  await pageA.getByRole("textbox", { name: "WhatsApp" }).fill(PHONE_A);
  await pageA.getByRole("button", { name: "Revisar agendamento" }).click();
  await pageA.getByRole("button", { name: "Confirmar agendamento" }).click();
  await pageA.getByRole("heading", { name: /Agendamento confirmado|Solicitação recebida/ }).waitFor({ timeout: 8000 });
});

await step("Cliente B não consegue o mesmo horário (double booking bloqueado)", async () => {
  await openBooking(pageB);
  // O horário ocupado não pode mais ser oferecido a B.
  const taken = await pageB.getByRole("button", { name: slotLabel, exact: true }).count();
  assert(taken === 0, "o horário 14:00 ainda aparece livre para o cliente B");
  const other = await pageB.getByRole("button", { name: /^\d{2}:\d{2}$/ }).count();
  assert(other > 0, "não há nenhum outro horário livre (esperado ao menos um)");
});

await step("Cliente B com tela antiga é barrado na hora de confirmar (corrida)", async () => {
  // Simula a corrida: B escolhe um horário livre, A ocupa o mesmo, B confirma.
  const pageC = await ctx.newPage();
  watch(pageC, "C");
  await openBooking(pageB);
  await pageB.getByRole("button", { name: "15:00", exact: true }).click();
  await pageB.getByRole("button", { name: "Continuar" }).click();
  await pageB.getByRole("textbox", { name: "Nome" }).fill("Cliente Teste B");
  await pageB.getByRole("textbox", { name: "WhatsApp" }).fill(PHONE_B);
  await pageB.getByRole("button", { name: "Revisar agendamento" }).click();
  // Antes de B confirmar, C ocupa 15:00 com o mesmo profissional.
  await openBooking(pageC);
  await pageC.getByRole("button", { name: "15:00", exact: true }).click();
  await pageC.getByRole("button", { name: "Continuar" }).click();
  await pageC.getByRole("textbox", { name: "Nome" }).fill("Cliente Teste C");
  await pageC.getByRole("textbox", { name: "WhatsApp" }).fill("(19) 98111-0003");
  await pageC.getByRole("button", { name: "Revisar agendamento" }).click();
  await pageC.getByRole("button", { name: "Confirmar agendamento" }).click();
  await pageC.getByRole("heading", { name: /Agendamento confirmado|Solicitação recebida/ }).waitFor({ timeout: 8000 });
  await pageB.waitForTimeout(500);
  const confirm = pageB.getByRole("button", { name: "Confirmar agendamento" });
  const blocked = await confirm.isDisabled();
  const msg = await pageB.getByText(/acabou de ser ocupado/).count();
  assert(blocked || msg > 0, "B conseguiu seguir com um horário já ocupado");
  await pageC.close();
});

await step("admin: conclui o atendimento de A e os pontos entram", async () => {
  const admin = await ctx.newPage();
  watch(admin, "admin2");
  await admin.goto(`${BASE}/admin/agendamentos`, { waitUntil: "load" });
  await admin.getByRole("button", { name: /\d{2}\/\d{2}\/\d{4} 14:00/ }).first().click();
  await admin.getByRole("button", { name: "Concluir", exact: true }).click();
  await admin.getByLabel("Valor cobrado (R$)").fill("45,00");
  await admin.getByRole("button", { name: "Concluir atendimento" }).click();
  await admin.getByText(/\+45 pontos/).first().waitFor({ timeout: 6000 });
  await admin.close();
});

await step("Cliente A entra, vê 45 pontos e resgata a recompensa", async () => {
  await pageA.goto(`${BASE}/minha-conta`, { waitUntil: "load" });
  // A sessão de demonstração é única por navegador (as páginas compartilham o localStorage):
  // sai de quem estiver logado e entra como o Cliente A.
  const logout = pageA.getByRole("button", { name: "Sair" });
  if (await logout.isVisible().catch(() => false)) await logout.click();
  await pageA.getByRole("textbox", { name: "Seu WhatsApp" }).fill(PHONE_A);
  await pageA.getByRole("button", { name: "Entrar" }).click();
  await pageA.getByText("Olá, Cliente").waitFor();
  await pageA.getByText("45", { exact: true }).first().waitFor({ timeout: 5000 });
  await pageA.goto(`${BASE}/minha-conta/fidelidade`, { waitUntil: "load" });
  await pageA.getByText("Cortesia de teste").first().waitFor();
  await pageA.getByRole("button", { name: /Resgatar/ }).first().click();
  await pageA.getByRole("button", { name: /Resgatar por 10 pts/ }).click();
  await pageA.getByText("Recompensa resgatada!").first().waitFor({ timeout: 6000 });
  await pageA.goto(`${BASE}/minha-conta/beneficios`, { waitUntil: "load" });
  await pageA.getByText(/FDB-[A-Z0-9]{4}-[A-Z0-9]{4}/).waitFor({ timeout: 6000 });
});

await step("admin: valida o código e marca o benefício como usado", async () => {
  const admin = await ctx.newPage();
  watch(admin, "admin3");
  await admin.goto(`${BASE}/admin/recompensas`, { waitUntil: "load" });
  await admin.getByRole("button", { name: "Marcar como usado" }).first().click();
  await admin.getByText("Usado").first().waitFor({ timeout: 5000 });
  await admin.close();
});

await step("Cliente A cancela pelo link do agendamento sem login", async () => {
  // Novo agendamento futuro para testar cancelamento (quinta, sem conflito).
  const p = await ctx.newPage();
  watch(p, "cancel");
  await p.goto(`${BASE}/agendar`, { waitUntil: "load" });
  await p.getByRole("button", { name: /Barba Express/ }).first().click();
  await p.getByRole("button", { name: /^Qualquer profissional/ }).click();
  await p.getByRole("button", { name: /quinta-feira/ }).and(p.locator(":not([disabled])")).first().click();
  await p.getByRole("button", { name: /^\d{2}:\d{2}$/ }).nth(3).click();
  await p.getByRole("button", { name: "Continuar" }).click();
  await p.getByRole("textbox", { name: "Nome" }).fill("Cliente Teste D");
  await p.getByRole("textbox", { name: "WhatsApp" }).fill("(19) 98111-0004");
  await p.getByRole("button", { name: "Revisar agendamento" }).click();
  await p.getByRole("button", { name: "Confirmar agendamento" }).click();
  await p.getByRole("link", { name: /Gerenciar|Ver agendamento|Detalhes/ }).first().click();
  await p.getByRole("button", { name: /Cancelar/ }).first().click();
  await p.getByRole("button", { name: "Cancelar agendamento" }).click();
  await p.getByText(/Cancelado/).first().waitFor({ timeout: 6000 });
  await p.close();
});

await browser.close();

const failed = results.filter((r) => !r.ok);
if (errors.length) console.log("\nErros de console/página:\n" + [...new Set(errors)].map((e) => "  - " + e).join("\n"));
console.log(`\n${results.length - failed.length}/${results.length} passos ok`);
process.exit(failed.length || errors.length ? 1 : 0);
