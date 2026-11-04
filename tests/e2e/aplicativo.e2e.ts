import { existsSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { _electron, type ElectronApplication, type Page } from 'playwright-core'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

// Com AUX_CARTEIRA_EXE definido, os mesmos testes rodam no executável empacotado.
const executavel = process.env['AUX_CARTEIRA_EXE']
const pastaCapturas = resolve('tests/e2e/capturas')

let pasta: string
let app: ElectronApplication
let pagina: Page

async function abrir(): Promise<void> {
  const env = { ...process.env, AUX_CARTEIRA_PASTA_DADOS: join(pasta, 'dados') } as Record<string, string>
  // O VS Code define esta variável, que faria o Electron rodar como Node.
  delete env['ELECTRON_RUN_AS_NODE']
  app = await _electron.launch(
    executavel ? { executablePath: executavel, args: [], env } : { args: ['.'], env }
  )
  pagina = await app.firstWindow()
  // Falha rápido e aponta o passo exato, em vez de esperar até o limite do teste.
  pagina.setDefaultTimeout(5000)
  await pagina.waitForSelector('h1')
}

async function irPara(area: string): Promise<void> {
  await pagina.getByRole('button', { name: area, exact: true }).click()
  await pagina.getByRole('heading', { level: 1, name: area }).waitFor()
}

async function escolherMes(ano: string, mes: string): Promise<void> {
  await pagina.getByLabel('Ano').selectOption(ano)
  await pagina.getByLabel('Mês', { exact: true }).selectOption(mes)
}

interface Novo {
  tipo: string
  nome: string
  valor: string
  data: string
  repeticao?: string
  parcelas?: string
  parcelaInicial?: string
  jaRealizado?: boolean
}

async function novoLancamento(n: Novo): Promise<void> {
  await pagina.getByRole('button', { name: 'Novo lançamento' }).click()
  await pagina.locator('#tipo').selectOption(n.tipo)
  await pagina.locator('#nome').fill(n.nome)
  await pagina.locator('#repeticao').selectOption(n.repeticao ?? 'unico')
  await pagina.locator('#valor').fill(n.valor)
  await pagina.locator('#data').fill(n.data)
  if (n.parcelas) await pagina.locator('#parcelas-total').fill(n.parcelas)
  if (n.parcelaInicial) await pagina.locator('#parcela-inicial').fill(n.parcelaInicial)
  await pagina.getByRole('button', { name: 'Salvar' }).click()
  await pagina.locator('dialog').waitFor({ state: 'detached' })
}

const linha = (nome: string) => pagina.locator('tbody tr', { hasText: nome })
const restante = () => pagina.getByTestId('restante-livre').textContent()

beforeAll(async () => {
  pasta = mkdtempSync(join(tmpdir(), 'carteira-e2e-'))
  mkdirSync(pastaCapturas, { recursive: true })
  await abrir()
})

afterAll(async () => {
  await app?.close()
  rmSync(pasta, { recursive: true, force: true })
})

describe('aplicativo real', () => {
  it('abre com a interface isolada do Node', async () => {
    expect(await pagina.title()).toBe('Auxiliar de Carteira')
    const ambiente = await pagina.evaluate(() => ({
      require: typeof (globalThis as Record<string, unknown>)['require'],
      process: typeof (globalThis as Record<string, unknown>)['process'],
      operacoes: Object.keys(window.carteira).length
    }))
    expect(ambiente).toEqual({ require: 'undefined', process: 'undefined', operacoes: 19 })
  })

  it('recusa dados inválidos enviados direto pelo IPC', async () => {
    const resposta = await pagina.evaluate(() =>
      (window.carteira.criarLancamento as (p: unknown) => Promise<unknown>)({ nome: '' })
    )
    expect(resposta).toMatchObject({ ok: false })
  })

  it('mostra estado vazio útil', async () => {
    await pagina.getByText('Nada planejado para').waitFor()
  })

  it('mostra erro compreensível no formulário', async () => {
    await irPara('Lançamentos')
    await pagina.getByRole('button', { name: 'Novo lançamento' }).click()
    await pagina.locator('#nome').fill('Sem valor')
    await pagina.locator('#valor').fill('abc')
    await pagina.getByRole('button', { name: 'Salvar' }).click()
    await pagina.getByRole('alert').getByText('Informe o valor em reais').waitFor()
    await pagina.getByRole('button', { name: 'Cancelar' }).click()
  })

  it('cadastra lançamentos e calcula o orçamento sem desconto duplo', async () => {
    await escolherMes('2026', '11')
    await novoLancamento({
      tipo: 'receita',
      nome: 'Salário',
      valor: '5.000,00',
      data: '2026-11-05',
      repeticao: 'recorrente'
    })
    await novoLancamento({
      tipo: 'compromisso',
      nome: 'Aluguel',
      valor: '1500',
      data: '2026-11-30',
      repeticao: 'recorrente'
    })
    await novoLancamento({
      tipo: 'compromisso',
      nome: 'Celular',
      valor: '250,00',
      data: '2026-11-10',
      repeticao: 'parcelado',
      parcelas: '10',
      parcelaInicial: '9'
    })
    await novoLancamento({
      tipo: 'investimento',
      nome: 'Reserva investir',
      valor: '1.000,00',
      data: '2026-11-05',
      repeticao: 'recorrente'
    })
    await novoLancamento({ tipo: 'lazer', nome: 'Show', valor: '300,00', data: '2026-11-20' })

    await linha('Show').getByRole('button', { name: 'Usar' }).click()
    await pagina.locator('#nome').fill('Ingresso')
    await pagina.locator('#valor').fill('180,00')
    await pagina.locator('#data').fill('2026-11-20')
    await pagina.locator('#reserva option', { hasText: 'Show' }).waitFor({ state: 'attached' })
    await expect.poll(() => pagina.locator('#reserva').inputValue()).not.toBe('')
    await pagina.getByRole('button', { name: 'Salvar' }).click()
    await pagina.locator('dialog').waitFor({ state: 'detached' })

    await novoLancamento({ tipo: 'gasto_livre', nome: 'Almoço', valor: '50,00', data: '2026-11-12' })

    await expect.poll(() => linha('Celular').textContent()).toContain('Parcela 9/10')
    expect(await linha('Celular').textContent()).toContain('Total da compra: R$ 2.500,00')

    await pagina.screenshot({ path: join(pastaCapturas, 'lancamentos.png') })
    await irPara('Resumo mensal')
    // 5000 − 1500 − 250 − 1000 − 300 = 1950; − 50 de gasto livre. O ingresso já está na reserva.
    await expect.poll(restante).toBe('R$ 1.900,00')
    await pagina.getByText('R$ 1.950,00').first().waitFor()
    await pagina.screenshot({ path: join(pastaCapturas, 'resumo.png'), fullPage: true })
  })

  it('valor realizado substitui o previsto', async () => {
    await irPara('Lançamentos')
    await linha('Aluguel').getByRole('button', { name: 'Pagar' }).click()
    await pagina.locator('#valor-realizado').fill('1.600,00')
    await pagina.getByRole('button', { name: 'Salvar' }).click()
    await pagina.locator('dialog').waitFor({ state: 'detached' })
    await irPara('Resumo mensal')
    await expect.poll(restante).toBe('R$ 1.800,00')
  })

  it('parcela vira o ano, termina no mês certo e navegar não duplica', async () => {
    await irPara('Lançamentos')
    await escolherMes('2026', '12')
    await expect.poll(() => linha('Celular').textContent()).toContain('Parcela 10/10')
    await pagina.getByRole('button', { name: 'Próximo mês' }).click()
    await linha('Aluguel').waitFor()
    expect(await linha('Celular').count()).toBe(0)

    await escolherMes('2027', '02')
    await expect.poll(() => linha('Aluguel').textContent()).toContain('28/02/2027')

    await escolherMes('2026', '11')
    await expect.poll(() => linha('Aluguel').count()).toBe(1)
    expect(await linha('Salário').count()).toBe(1)
  })

  it('altera recorrência a partir de um mês preservando os anteriores', async () => {
    await escolherMes('2027', '01')
    await linha('Aluguel').getByRole('button', { name: 'Editar' }).click()
    await pagina.getByLabel('Esta e as próximas, a partir de um mês').check()
    await pagina.locator('#valor').fill('1.700,00')
    await pagina.getByRole('button', { name: 'Salvar' }).click()
    await pagina.locator('dialog').waitFor({ state: 'detached' })
    await expect.poll(() => linha('Aluguel').textContent()).toContain('R$ 1.700,00')

    await escolherMes('2026', '12')
    await expect.poll(() => linha('Aluguel').textContent()).toContain('R$ 1.500,00')
  })

  it('encerra recorrência com confirmação de escopo e mantém o histórico', async () => {
    await novoLancamento({
      tipo: 'compromisso',
      nome: 'Academia',
      valor: '100,00',
      data: '2026-12-15',
      repeticao: 'recorrente'
    })
    await linha('Academia').getByRole('button', { name: 'Encerrar' }).click()
    await pagina.getByRole('dialog').getByRole('button', { name: 'Encerrar' }).click()
    await pagina.locator('dialog').waitFor({ state: 'detached' })
    await expect.poll(() => linha('Academia').textContent()).toContain('Até 12/2026')
    await pagina.getByRole('button', { name: 'Próximo mês' }).click()
    await linha('Aluguel').waitFor()
    expect(await linha('Academia').count()).toBe(0)
  })

  it('exclusão pede confirmação e distingue o escopo', async () => {
    await escolherMes('2026', '12')
    await linha('Salário').getByRole('button', { name: 'Excluir' }).click()
    await pagina.getByLabel(/Só esta ocorrência/).waitFor()
    await pagina.getByRole('dialog').getByRole('button', { name: 'Cancelar' }).click()
    await pagina.locator('dialog').waitFor({ state: 'detached' })
    expect(await linha('Salário').count()).toBe(1)
  })

  it('mantém tudo depois de fechar e abrir de novo', async () => {
    await app.close()
    await abrir()
    await escolherMes('2026', '11')
    await expect.poll(restante).toBe('R$ 1.800,00')
  })

  it('exporta backup e restaura depois de confirmar', async () => {
    const backup = join(pasta, 'meu-backup.sqlite')
    await irPara('Configurações')
    await app.evaluate(({ dialog }, caminho) => {
      dialog.showSaveDialog = (async () => ({ canceled: false, filePath: caminho })) as never
    }, backup)
    await pagina.getByRole('button', { name: 'Exportar backup' }).click()
    await pagina.getByText('Backup salvo em').waitFor()
    expect(existsSync(backup)).toBe(true)

    await irPara('Lançamentos')
    await escolherMes('2026', '11')
    await novoLancamento({ tipo: 'gasto_livre', nome: 'Depois do backup', valor: '10,00', data: '2026-11-13' })
    await linha('Depois do backup').waitFor()

    await irPara('Configurações')
    await app.evaluate(({ dialog }, caminho) => {
      dialog.showOpenDialog = (async () => ({ canceled: false, filePaths: [caminho] })) as never
      dialog.showMessageBox = (async () => ({ response: 0, checkboxChecked: false })) as never
    }, backup)
    await pagina.getByRole('button', { name: 'Restaurar backup' }).click()
    await irPara('Lançamentos')
    await linha('Depois do backup').waitFor()

    await irPara('Configurações')
    await app.evaluate(({ dialog }) => {
      dialog.showMessageBox = (async () => ({ response: 1, checkboxChecked: false })) as never
    })
    await pagina.getByRole('button', { name: 'Restaurar backup' }).click()
    await pagina.getByText('Backup restaurado').waitFor()

    await irPara('Lançamentos')
    await linha('Aluguel').waitFor()
    expect(await linha('Depois do backup').count()).toBe(0)
  })

  it('cadastra renda e despesas fixas por categoria', async () => {
    await irPara('Renda e despesas fixas')
    await escolherMes('2027', '02')
    await pagina.getByTestId('total-renda-fixa').getByText('R$ 5.000,00').waitFor()

    await pagina.getByRole('button', { name: 'Adicionar renda fixa' }).click()
    await pagina.locator('#fixo-nome').fill('Bônus mensal')
    await pagina.locator('#fixo-valor').fill('500,00')
    await pagina.locator('#fixo-dia').fill('5')
    expect(await pagina.locator('#fixo-categoria option:checked').textContent()).toBe('Salário')
    await pagina.getByRole('button', { name: 'Salvar' }).click()
    await pagina.locator('dialog').waitFor({ state: 'detached' })

    await pagina.getByRole('button', { name: 'Adicionar despesa fixa' }).click()
    await pagina.locator('#fixo-nome').fill('Luz da casa')
    await pagina.locator('#fixo-valor').fill('180,00')
    await pagina.locator('#fixo-dia').fill('31')
    await pagina.locator('#fixo-categoria').selectOption({ label: 'Conta de luz' })
    await pagina.getByRole('button', { name: 'Salvar' }).click()
    await pagina.locator('dialog').waitFor({ state: 'detached' })

    await pagina.getByRole('button', { name: 'Adicionar despesa fixa' }).click()
    await pagina.locator('#fixo-nome').fill('Seguro do cartão')
    await pagina.locator('#fixo-valor').fill('20,00')
    await pagina.locator('#fixo-dia').fill('10')
    await pagina.locator('#fixo-categoria').selectOption({ label: 'Criar nova categoria…' })
    await pagina.locator('#fixo-nova-categoria').fill('Seguros')
    await pagina.locator('#fixo-forma').selectOption('credito')
    await pagina.locator('#fixo-fatura').fill('Cartão Azul')
    await pagina.getByRole('button', { name: 'Salvar' }).click()
    await pagina.locator('dialog').waitFor({ state: 'detached' })

    // Aluguel de 1.700,00 (alterado antes) + 180,00 + 20,00.
    await pagina.getByTestId('total-despesas-fixas').getByText('R$ 1.900,00').waitFor()
    await pagina.getByTestId('sobra-fixos').getByText('R$ 3.600,00').waitFor()
    expect(await linha('Seguros').textContent()).toContain('R$ 20,00')
    await pagina.screenshot({ path: join(pastaCapturas, 'fixos.png'), fullPage: true })

    await escolherMes('2027', '01')
    await pagina.getByTestId('total-despesas-fixas').getByText('R$ 1.700,00').waitFor()

    await escolherMes('2027', '03')
    await pagina.getByTestId('total-despesas-fixas').getByText('R$ 1.900,00').waitFor()
    await irPara('Lançamentos')
    await expect.poll(() => linha('Luz da casa').textContent()).toContain('31/03/2027')
  })

  it('editar um fixo já vem marcado para valer daqui em diante', async () => {
    await irPara('Renda e despesas fixas')
    await linha('Luz da casa').getByRole('button', { name: 'Editar' }).click()
    expect(await pagina.getByLabel('Esta e as próximas, a partir de um mês').isChecked()).toBe(true)
    await pagina.locator('#valor').fill('200,00')
    await pagina.getByRole('button', { name: 'Salvar' }).click()
    await pagina.locator('dialog').waitFor({ state: 'detached' })
    await pagina.getByTestId('total-despesas-fixas').getByText('R$ 1.920,00').waitFor()
    await pagina.getByRole('button', { name: 'Mês anterior' }).click()
    await pagina.getByTestId('total-despesas-fixas').getByText('R$ 1.900,00').waitFor()
  })

  it('registra um gasto rápido e o resumo mostra o efeito', async () => {
    await irPara('Resumo mensal')
    await escolherMes('2027', '02')
    await expect.poll(restante).toBeTruthy()
    const antes = await restante()

    await pagina.getByRole('button', { name: 'Registrar gasto' }).click()
    await pagina.locator('#rapido-valor').fill('100,00')
    await pagina.locator('#rapido-nome').fill('Mercado')
    await pagina.locator('#rapido-data').fill('2027-02-10')
    await pagina.getByRole('button', { name: 'Salvar' }).click()
    await pagina.locator('dialog').waitFor({ state: 'detached' })

    await expect.poll(restante).not.toBe(antes)
    await pagina.screenshot({ path: join(pastaCapturas, 'painel.png'), fullPage: true })
  })

  it('mostra os valores do mês ao passar o mouse e ao focar pelo teclado', async () => {
    const alvo = pagina.locator('.alvo-grafico[aria-label="fevereiro de 2027"]')
    await alvo.scrollIntoViewIfNeeded()
    await alvo.hover()
    await pagina.locator('.dica').getByText('fevereiro de 2027').waitFor()
    await pagina.locator('.dica').getByText('Compromissos').waitFor()
    await pagina.mouse.move(0, 0)
    await pagina.locator('.dica').waitFor({ state: 'detached' })

    await alvo.focus()
    await pagina.locator('.dica').getByText('fevereiro de 2027').waitFor()
    await alvo.blur()
  })

  it('o gráfico de meses não mostra meses anteriores ao primeiro registro', async () => {
    await escolherMes('2026', '12')
    await pagina.getByRole('button', { name: 'Mês anterior' }).click()
    await expect.poll(() => pagina.locator('.alvo-grafico').first().getAttribute('aria-label')).toBe(
      'novembro de 2026'
    )
    await escolherMes('2027', '02')
    await expect.poll(restante).toBeTruthy()
  })

  it('paga uma conta direto do resumo', async () => {
    const conta = pagina.locator('.lista-contas li', { hasText: 'Luz da casa' })
    await conta.getByRole('button', { name: 'Pagar' }).click()
    await pagina.locator('#valor-realizado').fill('170,00')
    await pagina.getByRole('button', { name: 'Salvar' }).click()
    await pagina.locator('dialog').waitFor({ state: 'detached' })
    await expect.poll(() => conta.count()).toBe(0)
  })

  it('simula uma compra sem gravar e só salva quando pedido', async () => {
    await irPara('Planejar')
    await escolherMes('2027', '02')
    await pagina.locator('#plano-valor').fill('300,00')
    await pagina.locator('#plano-parcelas').fill('4')
    await pagina.getByTestId('veredito').getByText('Cabe no orçamento').waitFor()
    await pagina.getByText('Total da compra:').waitFor()

    // O gráfico precisa caber na área de conteúdo, sem vazar pela direita.
    const painel = await pagina.locator('.grade-simulador > section').boundingBox()
    const grafico = await pagina.locator('.grade-simulador svg[role=img]').boundingBox()
    const conteudo = await pagina.locator('.conteudo').boundingBox()
    expect(painel!.x + painel!.width).toBeLessThanOrEqual(conteudo!.x + conteudo!.width)
    expect(grafico!.x + grafico!.width).toBeLessThanOrEqual(painel!.x + painel!.width)

    await irPara('Lançamentos')
    await linha('Aluguel').waitFor()
    expect(await pagina.locator('tbody tr').filter({ hasText: 'Notebook' }).count()).toBe(0)

    await irPara('Planejar')
    await pagina.locator('#plano-valor').fill('99.000,00')
    await pagina.locator('#plano-parcelas').fill('1')
    await pagina.getByTestId('veredito').getByText('Não cabe no orçamento').waitFor()

    await pagina.locator('#plano-valor').fill('300,00')
    await pagina.locator('#plano-parcelas').fill('4')
    await pagina.locator('#plano-nome').fill('Notebook')
    await pagina.getByRole('button', { name: 'Adicionar ao planejamento' }).click()
    await pagina.getByText('foi adicionado ao seu planejamento').waitFor()
    await pagina.screenshot({ path: join(pastaCapturas, 'planejar.png'), fullPage: true })

    await irPara('Lançamentos')
    await expect.poll(() => linha('Notebook').textContent()).toContain('Parcela 1/4')
  })

  it('planeja lazer de um mês futuro e usa a reserva', async () => {
    await irPara('Planejar')
    await pagina.locator('#plano-valor').fill('800,00')
    await pagina.locator('#plano-nome').fill('Viagem')
    await pagina.getByLabel(/Lazer \(reserva/).check()
    await pagina.locator('#plano-mes').selectOption('2027-04')
    await pagina.getByRole('button', { name: 'Adicionar ao planejamento' }).click()
    await linha('Viagem').waitFor()
    expect(await linha('Viagem').textContent()).toContain('Lazer reservado')

    await linha('Viagem').getByRole('button', { name: 'Usar' }).click()
    await pagina.locator('#rapido-valor').fill('350,00')
    await pagina.locator('#rapido-nome').fill('Hotel')
    await expect.poll(() => pagina.locator('#rapido-reserva').inputValue()).not.toBe('')
    await pagina.getByRole('button', { name: 'Salvar' }).click()
    await pagina.locator('dialog').waitFor({ state: 'detached' })
    await expect.poll(() => linha('Viagem').textContent()).toContain('resta R$ 450,00')
  })

  it('paga um fixo sem sair da tela de fixos', async () => {
    await irPara('Renda e despesas fixas')
    await escolherMes('2027', '02')
    await linha('Salário').getByRole('button', { name: 'Receber' }).click()
    await pagina.getByRole('button', { name: 'Salvar' }).click()
    await pagina.locator('dialog').waitFor({ state: 'detached' })
    await expect.poll(() => linha('Salário').textContent()).toContain('Recebido R$ 5.000,00')
  })

  it('troca para o tema escuro', async () => {
    await irPara('Configurações')
    await pagina.locator('#tema').selectOption('escuro')
    const fundo = await pagina.evaluate(() => getComputedStyle(document.body).backgroundColor)
    expect(fundo).toBe('rgb(15, 15, 14)')
    await irPara('Resumo mensal')
    await escolherMes('2027', '02')
    await expect.poll(restante).toBeTruthy()
    await pagina.screenshot({ path: join(pastaCapturas, 'painel-escuro.png'), fullPage: true })
    await irPara('Configurações')
    await pagina.locator('#tema').selectOption('claro')
  })

  it('carrega e remove dados de demonstração', async () => {
    await irPara('Configurações')
    await pagina.getByRole('button', { name: 'Carregar dados de demonstração' }).click()
    await pagina.getByRole('button', { name: 'Remover dados de demonstração' }).waitFor()
    await irPara('Lançamentos')
    await pagina.getByText('[Demonstração] Aluguel').waitFor()
    await pagina.screenshot({ path: join(pastaCapturas, 'demonstracao.png') })
    await irPara('Configurações')
    await pagina.getByRole('button', { name: 'Remover dados de demonstração' }).click()
    await pagina.getByRole('dialog').getByRole('button', { name: 'Remover' }).click()
    await pagina.getByRole('button', { name: 'Carregar dados de demonstração' }).waitFor()
  })
})
