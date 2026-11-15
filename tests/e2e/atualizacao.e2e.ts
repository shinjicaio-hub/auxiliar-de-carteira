import { createHash } from 'node:crypto'
import { createReadStream, existsSync, mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { _electron, type ElectronApplication, type Page } from 'playwright-core'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

// Só faz sentido no aplicativo empacotado: fora dele a atualização fica desligada.
const executavel = process.env['AUX_CARTEIRA_EXE']
const versaoAtual = JSON.parse(readFileSync('package.json', 'utf8')).version as string
const instalador = resolve(`dist/Auxiliar-de-Carteira-Setup-${versaoAtual}.exe`)
const VERSAO_NOVA = '9.9.9'
const NOME_NOVO = `Auxiliar-de-Carteira-Setup-${VERSAO_NOVA}.exe`
// Pasta onde o electron-updater guarda o download: nome do pacote + "-updater".
const cacheAtualizacao = join(process.env['LOCALAPPDATA'] ?? '', 'auxiliar-de-carteira-updater')

let pasta: string
let servidor: Server
let app: ElectronApplication
let pagina: Page
/** O download de teste cai em 'pending'; o resto da pasta pertence à instalação real. */
const pendente = join(cacheAtualizacao, 'pending')
let pendenteExistia = false
/** O que o servidor falso anuncia: uma versão, ou falha. */
let anunciar: string | 'falha' = versaoAtual

function latestYml(versao: string, sha512: string, tamanho: number): string {
  return [
    `version: ${versao}`,
    'files:',
    `  - url: ${NOME_NOVO}`,
    `    sha512: ${sha512}`,
    `    size: ${tamanho}`,
    `path: ${NOME_NOVO}`,
    `sha512: ${sha512}`,
    `releaseDate: '2026-11-15T00:00:00.000Z'`,
    ''
  ].join('\n')
}

async function estado(): Promise<string> {
  return (await pagina.getByTestId('estado-atualizacao').textContent()) ?? ''
}

describe.skipIf(!executavel)('atualização automática no aplicativo empacotado', () => {
  beforeAll(async () => {
    expect(existsSync(instalador), `instalador ${instalador} não encontrado`).toBe(true)
    pendenteExistia = existsSync(pendente)
    expect(pendenteExistia, 'já há uma atualização pendente real; o teste não vai mexer nela').toBe(false)
    const sha512 = createHash('sha512').update(readFileSync(instalador)).digest('base64')
    const tamanho = statSync(instalador).size

    // Imita as Releases do GitHub: o mesmo instalador, anunciado como versão nova.
    servidor = createServer((req, res) => {
      if (anunciar === 'falha') {
        res.writeHead(500).end()
      } else if (req.url?.startsWith('/latest.yml')) {
        res.writeHead(200, { 'Content-Type': 'text/yaml' }).end(latestYml(anunciar, sha512, tamanho))
      } else if (req.url === `/${NOME_NOVO}`) {
        res.writeHead(200, { 'Content-Length': tamanho, 'Content-Type': 'application/octet-stream' })
        createReadStream(instalador).pipe(res)
      } else {
        res.writeHead(404).end()
      }
    })
    await new Promise<void>((r) => servidor.listen(0, '127.0.0.1', r))
    const { port } = servidor.address() as AddressInfo

    pasta = mkdtempSync(join(tmpdir(), 'carteira-atualizacao-'))
    const env = {
      ...process.env,
      AUX_CARTEIRA_PASTA_DADOS: join(pasta, 'dados'),
      AUX_CARTEIRA_URL_ATUALIZACAO: `http://127.0.0.1:${port}/`
    } as Record<string, string>
    delete env['ELECTRON_RUN_AS_NODE']
    app = await _electron.launch({ executablePath: executavel!, args: [], env })
    pagina = await app.firstWindow()
    pagina.setDefaultTimeout(5000)
    await pagina.waitForSelector('h1')
    await pagina.getByRole('button', { name: 'Configurações', exact: true }).click()
  }, 60000)

  afterAll(async () => {
    await app?.close()
    servidor?.close()
    if (pasta) rmSync(pasta, { recursive: true, force: true })
    // Remove só o download do teste. O installer.exe da instalação real fica intacto.
    if (!pendenteExistia) rmSync(pendente, { recursive: true, force: true })
  })

  it('procura sozinho ao abrir e informa que está na versão mais recente', async () => {
    await expect.poll(estado, { timeout: 15000 }).toBe('Você está na versão mais recente.')
    expect(await pagina.getByText(`Versão instalada: ${versaoAtual}`).count()).toBe(1)
    expect(await pagina.getByTestId('faixa-atualizacao').count()).toBe(0)
  })

  it('sem conexão, explica o problema sem travar', async () => {
    anunciar = 'falha'
    await pagina.getByRole('button', { name: 'Procurar agora' }).click()
    await expect.poll(estado, { timeout: 15000 }).toContain('Não foi possível procurar')
    expect(await pagina.getByTestId('faixa-atualizacao').count()).toBe(0)
  })

  it('avisa da versão nova e deixa adiar', async () => {
    anunciar = VERSAO_NOVA
    await pagina.getByRole('button', { name: 'Procurar agora' }).click()
    const faixa = pagina.getByTestId('faixa-atualizacao')
    await faixa.getByText(`Nova versão ${VERSAO_NOVA} disponível.`).waitFor({ timeout: 15000 })
    await faixa.getByRole('button', { name: 'Agora não' }).click()
    await faixa.waitFor({ state: 'detached' })
    expect(await estado()).toBe(`Versão ${VERSAO_NOVA} disponível.`)
  })

  it('baixa, confere a integridade e fica pronta sem instalar sozinha', async () => {
    await pagina.evaluate(() => window.carteira.baixarAtualizacao())
    const faixa = pagina.getByTestId('faixa-atualizacao')
    await faixa.getByText(`Versão ${VERSAO_NOVA} pronta.`).waitFor({ timeout: 90000 })
    await faixa.getByRole('button', { name: 'Reiniciar e atualizar' }).waitFor()
    expect(existsSync(join(pendente, NOME_NOVO))).toBe(true)
    // O aplicativo continua aberto: só instala quando a pessoa pede.
    expect(await pagina.title()).toBe('Auxiliar de Carteira')
  }, 120000)

  it('desligar a busca automática fica salvo', async () => {
    const opcao = pagina.getByLabel('Procurar atualizações ao abrir o aplicativo')
    expect(await opcao.isChecked()).toBe(true)
    await opcao.uncheck()
    await expect.poll(() => opcao.isChecked()).toBe(false)
    const salvo = JSON.parse(readFileSync(join(pasta, 'dados', 'configuracoes.json'), 'utf8'))
    expect(salvo).toEqual({ atualizacaoAutomatica: false })
  })
})
