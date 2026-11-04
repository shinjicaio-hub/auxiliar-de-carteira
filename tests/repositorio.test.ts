import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import Database from 'better-sqlite3'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { GerenciadorBanco, validarBackup } from '../src/main/db/gerenciador'
import { VERSAO_ESQUEMA } from '../src/main/db/migracoes'
import { CODIGO_REALIZADAS_FUTURAS } from '../src/shared/api'
import type { CriarLancamento } from '../src/shared/esquemas'

let pasta: string
let banco: GerenciadorBanco

const repo = () => banco.repositorio

function lancamento(parcial: Partial<CriarLancamento> = {}): CriarLancamento {
  return {
    tipo: 'compromisso',
    repeticao: 'unico',
    data: '2026-03-10',
    nome: 'Conta',
    valorCentavos: 10000,
    categoriaId: null,
    formaPagamento: null,
    fatura: null,
    reservaSerieId: null,
    observacao: null,
    parcelaInicial: null,
    parcelasTotal: null,
    jaRealizado: false,
    ...parcial
  }
}

function campos(serieId: number, nome: string, valorCentavos: number) {
  return {
    serieId,
    nome,
    valorCentavos,
    categoriaId: null,
    formaPagamento: null,
    fatura: null,
    reservaSerieId: null,
    observacao: null
  }
}

const recorrente = (parcial: Partial<CriarLancamento> = {}) =>
  repo().criarLancamento(lancamento({ repeticao: 'recorrente', data: '2026-01-10', ...parcial }))

const valorEm = (mes: string) => repo().listarMes(mes)[0]?.previstoCentavos

beforeEach(() => {
  pasta = mkdtempSync(join(tmpdir(), 'carteira-teste-'))
  banco = new GerenciadorBanco(join(pasta, 'carteira.sqlite'))
})

afterEach(() => {
  banco.fechar()
  rmSync(pasta, { recursive: true, force: true })
})

describe('migrações e persistência', () => {
  it('cria o esquema e as categorias iniciais', () => {
    expect(repo().listarCategorias().map((c) => c.nome)).toContain('Moradia')
  })

  it('mantém os dados ao fechar e abrir de novo', () => {
    const id = recorrente({ nome: 'Internet' })
    repo().registrarRealizado({
      serieId: id,
      mes: '2026-02',
      realizadoCentavos: 12345,
      dataRealizacao: '2026-02-11'
    })
    banco.fechar()
    banco = new GerenciadorBanco(join(pasta, 'carteira.sqlite'))
    const [o] = repo().listarMes('2026-02')
    expect(o?.nome).toBe('Internet')
    expect(o?.consideradoCentavos).toBe(12345)
  })

  it('reabrir não reaplica migrações nem duplica categorias', () => {
    const antes = repo().listarCategorias().length
    banco.fechar()
    banco = new GerenciadorBanco(join(pasta, 'carteira.sqlite'))
    expect(repo().listarCategorias()).toHaveLength(antes)
  })

  it('atualiza um banco da versão 1 sem perder dados e guarda uma cópia', () => {
    const id = recorrente({ nome: 'Dado antigo' })
    repo().registrarRealizado({
      serieId: id,
      mes: '2026-02',
      realizadoCentavos: 9000,
      dataRealizacao: '2026-02-10'
    })
    repo().criarCategoria('Minha categoria')
    banco.fechar()

    // Volta o arquivo ao estado da v1, com uma categoria de mesmo nome criada pelo usuário.
    const caminho = join(pasta, 'carteira.sqlite')
    const db = new Database(caminho)
    db.exec(`DELETE FROM categorias WHERE nome IN ('Água', 'Cartão de crédito', 'Conta de luz', 'Gás', 'Telefone')`)
    db.exec(`UPDATE categorias SET nome = 'INTERNET' WHERE nome = 'Internet'`)
    db.pragma('user_version = 1')
    db.close()

    banco = new GerenciadorBanco(caminho)
    const nomes = repo().listarCategorias().map((c) => c.nome)
    expect(nomes).toEqual(expect.arrayContaining(['Conta de luz', 'Cartão de crédito', 'Minha categoria', 'INTERNET']))
    expect(nomes).not.toContain('Internet')
    expect(repo().listarMes('2026-02')[0]).toMatchObject({
      nome: 'Dado antigo',
      consideradoCentavos: 9000
    })
    expect(existsSync(`${caminho}.antes-da-v${VERSAO_ESQUEMA}`)).toBe(true)
  })

  it('renda fixa com dia 31 começando em fevereiro mantém o dia original', () => {
    repo().criarLancamento(
      lancamento({ tipo: 'receita', repeticao: 'recorrente', data: '2027-02-28', dia: 31 })
    )
    expect(repo().listarMes('2027-02')[0]?.data).toBe('2027-02-28')
    expect(repo().listarMes('2027-03')[0]?.data).toBe('2027-03-31')
    expect(repo().listarMes('2027-04')[0]?.data).toBe('2027-04-30')
  })

  it('recusa um banco de versão mais nova', () => {
    const caminho = join(pasta, 'novo.sqlite')
    const outro = new GerenciadorBanco(caminho)
    outro.fechar()
    const db = new Database(caminho)
    db.pragma(`user_version = ${VERSAO_ESQUEMA + 1}`)
    db.close()
    expect(() => new GerenciadorBanco(caminho)).toThrow(/versão mais nova/)
  })

  it('o banco recusa dados inválidos mesmo sem passar pela validação', () => {
    expect(() => repo().criarLancamento(lancamento({ valorCentavos: 10.5 }))).toThrow()
    expect(() => repo().criarLancamento(lancamento({ valorCentavos: -1 }))).toThrow()
    expect(repo().listarMes('2026-03')).toHaveLength(0)
  })
})

describe('identidade das ocorrências', () => {
  it('navegar entre meses não grava nada nem cria duplicatas', () => {
    recorrente()
    for (const mes of ['2026-02', '2026-06', '2026-02', '2027-01', '2026-02']) {
      repo().listarMes(mes)
      repo().resumoMes(mes)
    }
    expect(repo().listarMes('2026-02')).toHaveLength(1)
  })

  it('registrar o realizado duas vezes substitui em vez de duplicar', () => {
    const id = recorrente()
    const base = { serieId: id, mes: '2026-02', dataRealizacao: '2026-02-10' }
    repo().registrarRealizado({ ...base, realizadoCentavos: 9000 })
    repo().registrarRealizado({ ...base, realizadoCentavos: 9500 })
    const lista = repo().listarMes('2026-02')
    expect(lista).toHaveLength(1)
    expect(lista[0]?.consideradoCentavos).toBe(9500)
  })

  it('limpar o realizado volta ao valor previsto', () => {
    const id = recorrente()
    const alvo = { serieId: id, mes: '2026-02' }
    repo().registrarRealizado({ ...alvo, realizadoCentavos: 9000, dataRealizacao: '2026-02-10' })
    repo().registrarRealizado({ ...alvo, realizadoCentavos: null, dataRealizacao: null })
    expect(repo().listarMes('2026-02')[0]?.consideradoCentavos).toBe(10000)
  })

  it('reserva não aceita valor realizado', () => {
    const id = recorrente({ tipo: 'lazer' })
    expect(() =>
      repo().registrarRealizado({
        serieId: id,
        mes: '2026-02',
        realizadoCentavos: 100,
        dataRealizacao: '2026-02-10'
      })
    ).toThrow(/Reservas/)
  })

  it('gasto só usa reserva do tipo correto', () => {
    const investimento = recorrente({ tipo: 'investimento' })
    expect(() =>
      repo().criarLancamento(lancamento({ tipo: 'gasto_livre', reservaSerieId: investimento }))
    ).toThrow(/reserva/i)
  })
})

describe('edição com histórico preservado', () => {
  it('alteração a partir de um mês não muda os anteriores', () => {
    const id = recorrente()
    repo().editarAPartirDe({
      ...campos(id, 'Conta', 15000),
      aPartirDe: '2026-04',
      dia: 10,
      parcelasTotal: null,
      confirmarRealizadas: false
    })
    expect(valorEm('2026-03')).toBe(10000)
    expect(valorEm('2026-04')).toBe(15000)
    expect(valorEm('2026-12')).toBe(15000)
  })

  it('nova alteração anterior substitui as posteriores', () => {
    const id = recorrente()
    const alterar = (aPartirDe: string, valor: number) =>
      repo().editarAPartirDe({
        ...campos(id, 'Conta', valor),
        aPartirDe,
        dia: 10,
        parcelasTotal: null,
        confirmarRealizadas: false
      })
    alterar('2026-06', 20000)
    alterar('2026-03', 15000)
    expect(valorEm('2026-02')).toBe(10000)
    expect(valorEm('2026-03')).toBe(15000)
    expect(valorEm('2026-07')).toBe(15000)
  })

  it('edição pontual afeta só o mês selecionado', () => {
    const id = recorrente()
    repo().editarOcorrencia({
      ...campos(id, 'Conta especial', 7000),
      mes: '2026-03',
      data: '2026-03-05'
    })
    expect(valorEm('2026-02')).toBe(10000)
    expect(repo().listarMes('2026-03')[0]).toMatchObject({
      nome: 'Conta especial',
      previstoCentavos: 7000,
      data: '2026-03-05'
    })
    expect(valorEm('2026-04')).toBe(10000)
  })

  it('edição pontual continua valendo depois de alteração anterior a ela', () => {
    const id = recorrente()
    repo().editarOcorrencia({ ...campos(id, 'Conta', 7000), mes: '2026-06', data: '2026-06-10' })
    repo().editarAPartirDe({
      ...campos(id, 'Conta', 15000),
      aPartirDe: '2026-03',
      dia: 10,
      parcelasTotal: null,
      confirmarRealizadas: false
    })
    expect(valorEm('2026-06')).toBe(7000)
    expect(valorEm('2026-07')).toBe(15000)
  })

  it('edição pontual em recorrência não pode sair do mês', () => {
    const id = recorrente()
    expect(() =>
      repo().editarOcorrencia({ ...campos(id, 'Conta', 7000), mes: '2026-03', data: '2026-04-05' })
    ).toThrow(/precisa continuar/)
  })

  it('lançamento único muda de mês levando o realizado junto', () => {
    const id = repo().criarLancamento(lancamento({ jaRealizado: true }))
    repo().editarOcorrencia({ ...campos(id, 'Conta', 10000), mes: '2026-03', data: '2026-05-02' })
    expect(repo().listarMes('2026-03')).toHaveLength(0)
    const [o] = repo().listarMes('2026-05')
    expect(o?.data).toBe('2026-05-02')
    expect(o?.realizadoCentavos).toBe(10000)
  })

  it('editar o valor de um gasto já realizado atualiza o que foi gasto', () => {
    const id = repo().criarLancamento(
      lancamento({ tipo: 'gasto_livre', valorCentavos: 5000, jaRealizado: true })
    )
    repo().editarOcorrencia({ ...campos(id, 'Conta', 6000), mes: '2026-03', data: '2026-03-10' })
    expect(repo().listarMes('2026-03')[0]).toMatchObject({
      previstoCentavos: 6000,
      realizadoCentavos: 6000
    })
    expect(repo().resumoMes('2026-03').gastosLivresCentavos).toBe(6000)
  })

  it('editar o previsto de um compromisso pago mantém o valor pago', () => {
    const id = repo().criarLancamento(lancamento({ valorCentavos: 5000, jaRealizado: true }))
    repo().editarOcorrencia({ ...campos(id, 'Conta', 6000), mes: '2026-03', data: '2026-03-10' })
    expect(repo().listarMes('2026-03')[0]).toMatchObject({
      previstoCentavos: 6000,
      realizadoCentavos: 5000
    })
  })

  it('mudar o dia a partir de um mês respeita meses curtos', () => {
    const id = recorrente()
    repo().editarAPartirDe({
      ...campos(id, 'Conta', 10000),
      aPartirDe: '2026-02',
      dia: 31,
      parcelasTotal: null,
      confirmarRealizadas: false
    })
    expect(repo().listarMes('2026-01')[0]?.data).toBe('2026-01-10')
    expect(repo().listarMes('2026-02')[0]?.data).toBe('2026-02-28')
    expect(repo().listarMes('2026-03')[0]?.data).toBe('2026-03-31')
  })

  it('corrige o total de parcelas sem mexer nas já passadas', () => {
    const id = repo().criarLancamento(
      lancamento({ repeticao: 'parcelado', parcelaInicial: 1, parcelasTotal: 10, data: '2026-01-10' })
    )
    repo().editarAPartirDe({
      ...campos(id, 'Conta', 10000),
      aPartirDe: '2026-03',
      dia: 10,
      parcelasTotal: 5,
      confirmarRealizadas: false
    })
    expect(repo().listarMes('2026-05')[0]?.parcelasTotal).toBe(5)
    expect(repo().listarMes('2026-06')).toHaveLength(0)
  })
})

describe('exclusão e encerramento', () => {
  it('excluir só esta ocorrência mantém as demais', () => {
    const id = recorrente()
    repo().excluirOcorrencia({
      serieId: id,
      mes: '2026-03',
      escopo: 'esta',
      confirmarRealizadas: false
    })
    expect(repo().listarMes('2026-02')).toHaveLength(1)
    expect(repo().listarMes('2026-03')).toHaveLength(0)
    expect(repo().listarMes('2026-04')).toHaveLength(1)
  })

  it('excluir esta e as futuras preserva o histórico', () => {
    const id = recorrente()
    repo().registrarRealizado({
      serieId: id,
      mes: '2026-02',
      realizadoCentavos: 9000,
      dataRealizacao: '2026-02-10'
    })
    repo().excluirOcorrencia({
      serieId: id,
      mes: '2026-04',
      escopo: 'esta_e_futuras',
      confirmarRealizadas: false
    })
    expect(repo().listarMes('2026-02')[0]?.consideradoCentavos).toBe(9000)
    expect(repo().listarMes('2026-03')).toHaveLength(1)
    expect(repo().listarMes('2026-04')).toHaveLength(0)
    expect(repo().listarMes('2027-01')).toHaveLength(0)
  })

  it('encerrar recorrência mantém os meses até o encerramento', () => {
    const id = recorrente()
    repo().editarAPartirDe({
      ...campos(id, 'Conta', 12000),
      aPartirDe: '2026-03',
      dia: 10,
      parcelasTotal: null,
      confirmarRealizadas: false
    })
    repo().encerrarSerie({ serieId: id, ultimoMes: '2026-05', confirmarRealizadas: false })
    expect(valorEm('2026-02')).toBe(10000)
    expect(valorEm('2026-05')).toBe(12000)
    expect(repo().listarMes('2026-06')).toHaveLength(0)
  })

  it('terminar um parcelamento antes do fim preserva as parcelas passadas', () => {
    const id = repo().criarLancamento(
      lancamento({ repeticao: 'parcelado', parcelaInicial: 1, parcelasTotal: 10, data: '2026-01-10' })
    )
    repo().encerrarSerie({ serieId: id, ultimoMes: '2026-03', confirmarRealizadas: false })
    expect(repo().listarMes('2026-03')[0]?.parcelaAtual).toBe(3)
    expect(repo().listarMes('2026-04')).toHaveLength(0)
  })

  it('pede confirmação antes de descartar realizados futuros', () => {
    const id = recorrente()
    repo().registrarRealizado({
      serieId: id,
      mes: '2026-06',
      realizadoCentavos: 9000,
      dataRealizacao: '2026-06-10'
    })
    const encerrar = (confirmarRealizadas: boolean) =>
      repo().encerrarSerie({ serieId: id, ultimoMes: '2026-03', confirmarRealizadas })
    expect(() => encerrar(false)).toThrow(
      expect.objectContaining({ codigo: CODIGO_REALIZADAS_FUTURAS, quantidade: 1 })
    )
    expect(repo().listarMes('2026-06')).toHaveLength(1)
    encerrar(true)
    expect(repo().listarMes('2026-06')).toHaveLength(0)
  })

  it('excluir lançamento único remove o registro', () => {
    const id = repo().criarLancamento(lancamento())
    repo().excluirOcorrencia({
      serieId: id,
      mes: '2026-03',
      escopo: 'esta',
      confirmarRealizadas: false
    })
    expect(repo().listarMes('2026-03')).toHaveLength(0)
  })

  it('excluir a reserva não apaga o gasto, que passa a ser gasto livre', () => {
    const lazer = repo().criarLancamento(lancamento({ tipo: 'lazer', valorCentavos: 5000 }))
    repo().criarLancamento(
      lancamento({ tipo: 'gasto_livre', valorCentavos: 2000, reservaSerieId: lazer })
    )
    repo().excluirOcorrencia({
      serieId: lazer,
      mes: '2026-03',
      escopo: 'esta',
      confirmarRealizadas: false
    })
    expect(repo().resumoMes('2026-03').gastosLivresCentavos).toBe(2000)
  })
})

describe('panorama', () => {
  it('cobre 5 meses antes e 11 depois, sem gravar nada', () => {
    recorrente({ data: '2026-01-10' })
    const { meses } = repo().panorama('2026-03')
    expect(meses).toHaveLength(17)
    expect(meses[0]?.mes).toBe('2025-10')
    expect(meses[16]?.mes).toBe('2027-02')
    expect(meses.find((m) => m.mes === '2025-12')?.pendenteCentavos).toBe(0)
    expect(meses.find((m) => m.mes === '2026-12')?.pendenteCentavos).toBe(10000)
    expect(repo().listarMes('2026-03')).toHaveLength(1)
  })

  it('usa os valores realizados de cada mês', () => {
    const id = recorrente()
    repo().registrarRealizado({
      serieId: id,
      mes: '2026-02',
      realizadoCentavos: 12000,
      dataRealizacao: '2026-02-10'
    })
    const { meses } = repo().panorama('2026-03')
    expect(meses.find((m) => m.mes === '2026-02')).toMatchObject({
      pagoCentavos: 12000,
      pendenteCentavos: 0
    })
  })

  it('lista só o que ainda vai acontecer como planejado', () => {
    repo().criarLancamento(lancamento({ tipo: 'lazer', nome: 'Viagem', data: '2026-06-10' }))
    repo().criarLancamento(lancamento({ tipo: 'gasto_livre', nome: 'Presente', data: '2026-05-10' }))
    repo().criarLancamento(
      lancamento({ tipo: 'gasto_livre', nome: 'Já pago', data: '2026-05-11', jaRealizado: true })
    )
    repo().criarLancamento(lancamento({ tipo: 'lazer', nome: 'Antigo', data: '2026-01-10' }))
    recorrente({ nome: 'Recorrente' })
    const { planejados } = repo().panorama('2026-03')
    expect(planejados.map((o) => o.nome)).toEqual(['Presente', 'Viagem'])
  })
})

describe('categorias', () => {
  it('não exclui categoria em uso, mas permite arquivar', () => {
    const categoria = repo().listarCategorias()[0]!
    repo().criarLancamento(lancamento({ categoriaId: categoria.id }))
    expect(() => repo().excluirCategoria(categoria.id)).toThrow(/em uso/)
    repo().definirCategoriaAtiva(categoria.id, false)
    expect(repo().listarCategorias().find((c) => c.id === categoria.id)?.ativa).toBe(false)
  })

  it('recusa nome repetido sem diferenciar maiúsculas', () => {
    expect(() => repo().criarCategoria('moradia')).toThrow(/Já existe/)
  })
})

describe('demonstração', () => {
  it('carrega identificada e remove sem tocar nos dados reais', () => {
    recorrente({ nome: 'Real', data: '2026-03-10' })
    repo().carregarDemonstracao('2026-03')
    const lista = repo().listarMes('2026-03')
    expect(lista.filter((o) => o.demo).every((o) => o.nome.startsWith('[Demonstração]'))).toBe(true)
    expect(lista.filter((o) => o.demo).length).toBeGreaterThan(5)
    expect(() => repo().carregarDemonstracao('2026-03')).toThrow(/já estão/)
    repo().removerDemonstracao()
    expect(repo().listarMes('2026-03').map((o) => o.nome)).toEqual(['Real'])
  })
})

describe('backup e restauração', () => {
  it('restaura exatamente o estado salvo', async () => {
    const id = recorrente({ nome: 'Antes do backup' })
    repo().registrarRealizado({
      serieId: id,
      mes: '2026-02',
      realizadoCentavos: 9000,
      dataRealizacao: '2026-02-10'
    })
    const backup = join(pasta, 'backup.sqlite')
    await banco.exportarBackup(backup)

    recorrente({ nome: 'Depois do backup' })
    expect(repo().listarMes('2026-02')).toHaveLength(2)

    await banco.restaurarBackup(backup)
    const lista = repo().listarMes('2026-02')
    expect(lista.map((o) => o.nome)).toEqual(['Antes do backup'])
    expect(lista[0]?.consideradoCentavos).toBe(9000)
  })

  it('guarda cópia dos dados atuais antes de restaurar', async () => {
    recorrente({ nome: 'Original' })
    const backup = join(pasta, 'backup.sqlite')
    await banco.exportarBackup(backup)
    recorrente({ nome: 'Novo' })

    const copia = await banco.restaurarBackup(backup)
    validarBackup(copia)
    const db = new Database(copia, { readonly: true })
    expect(db.prepare('SELECT count(*) AS n FROM series').get()).toEqual({ n: 2 })
    db.close()
  })

  it('continua funcionando e gravando depois de restaurar', async () => {
    const backup = join(pasta, 'backup.sqlite')
    await banco.exportarBackup(backup)
    await banco.restaurarBackup(backup)
    recorrente({ nome: 'Pós-restauração' })
    banco.fechar()
    banco = new GerenciadorBanco(join(pasta, 'carteira.sqlite'))
    expect(repo().listarMes('2026-02')[0]?.nome).toBe('Pós-restauração')
  })

  it('recusa arquivo que não é banco e mantém os dados', async () => {
    recorrente({ nome: 'Intacto' })
    const falso = join(pasta, 'falso.sqlite')
    writeFileSync(falso, 'isto não é um banco de dados, apenas texto comum'.repeat(100))
    await expect(banco.restaurarBackup(falso)).rejects.toThrow(/backup/i)
    expect(repo().listarMes('2026-02')[0]?.nome).toBe('Intacto')
  })

  it('recusa banco SQLite de outro aplicativo', async () => {
    const outro = join(pasta, 'outro.sqlite')
    const db = new Database(outro)
    db.exec('CREATE TABLE qualquer (id INTEGER)')
    db.close()
    await expect(banco.restaurarBackup(outro)).rejects.toThrow(/não é um backup/)
  })

  it('recusa backup danificado', async () => {
    recorrente()
    const backup = join(pasta, 'backup.sqlite')
    await banco.exportarBackup(backup)
    const { readFileSync } = await import('node:fs')
    const bytes = readFileSync(backup)
    bytes.fill(0xff, 4096, Math.min(bytes.length, 12288))
    writeFileSync(backup, bytes)
    await expect(banco.restaurarBackup(backup)).rejects.toThrow()
  })

  it('recusa exportar por cima do banco em uso', async () => {
    await expect(banco.exportarBackup(banco.caminho)).rejects.toThrow(/diferente/)
  })
})
