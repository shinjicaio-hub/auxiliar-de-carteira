import type Database from 'better-sqlite3'
import { analisarMes, type Panorama, type PanoramaMes } from '../../shared/analise'
import { CODIGO_REALIZADAS_FUTURAS } from '../../shared/api'
import { dataNoMes, diaDaData, formatarMesCurto, mesDaData, somarMeses } from '../../shared/datas'
import type {
  CriarLancamento,
  EditarAPartirDe,
  EditarOcorrencia,
  EncerrarSerie,
  ExcluirOcorrencia,
  RegistrarRealizado
} from '../../shared/esquemas'
import { ocorrenciasDoMes, serieAtivaNoMes, ultimoMesDaSerie } from '../../shared/ocorrencias'
import { calcularResumo } from '../../shared/resumo'
import {
  ehReserva,
  reservaAceitaPor,
  type CamposLancamento,
  type Categoria,
  type FormaPagamento,
  type Ocorrencia,
  type RegistroOcorrencia,
  type Repeticao,
  type ResumoMensal,
  type Serie,
  type Tipo,
  type VersaoSerie
} from '../../shared/tipos'
import { ErroNegocio } from './erros'

interface LinhaSerie {
  id: number
  tipo: Tipo
  repeticao: Repeticao
  mes_inicial: string
  parcela_inicial: number | null
  parcelas_total: number | null
  mes_encerramento: string | null
  demo: number
}

interface LinhaCampos {
  nome: string
  valor_centavos: number
  categoria_id: number | null
  forma_pagamento: FormaPagamento | null
  fatura: string | null
  reserva_serie_id: number | null
  observacao: string | null
}

type LinhaVersao = LinhaCampos & { serie_id: number; a_partir_de: string; dia: number }

type LinhaOcorrencia = LinhaCampos & {
  serie_id: number
  mes: string
  excluida: number
  editada: number
  data: string
  realizado_centavos: number | null
  data_realizacao: string | null
}

function paraSerie(l: LinhaSerie): Serie {
  return {
    id: l.id,
    tipo: l.tipo,
    repeticao: l.repeticao,
    mesInicial: l.mes_inicial,
    parcelaInicial: l.parcela_inicial,
    parcelasTotal: l.parcelas_total,
    mesEncerramento: l.mes_encerramento,
    demo: l.demo === 1
  }
}

function paraCampos(l: LinhaCampos): CamposLancamento {
  return {
    nome: l.nome,
    valorCentavos: l.valor_centavos,
    categoriaId: l.categoria_id,
    formaPagamento: l.forma_pagamento,
    fatura: l.fatura,
    reservaSerieId: l.reserva_serie_id,
    observacao: l.observacao
  }
}

function paraVersao(l: LinhaVersao): VersaoSerie {
  return { ...paraCampos(l), serieId: l.serie_id, aPartirDe: l.a_partir_de, dia: l.dia }
}

function paraRegistro(l: LinhaOcorrencia): RegistroOcorrencia {
  return {
    serieId: l.serie_id,
    mes: l.mes,
    excluida: l.excluida === 1,
    edicao: l.editada === 1 ? { ...paraCampos(l), data: l.data } : null,
    realizadoCentavos: l.realizado_centavos,
    dataRealizacao: l.data_realizacao
  }
}

function parametrosCampos(c: CamposLancamento) {
  return {
    nome: c.nome,
    valor: c.valorCentavos,
    categoria: c.categoriaId,
    forma: c.formaPagamento,
    fatura: c.fatura,
    reserva: c.reservaSerieId,
    observacao: c.observacao
  }
}

const PREFIXO_DEMONSTRACAO = '[Demonstração] '

export class Repositorio {
  constructor(private readonly db: Database.Database) {}

  // ---------- Categorias ----------

  listarCategorias(): Categoria[] {
    const linhas = this.db
      .prepare('SELECT id, nome, ativa FROM categorias ORDER BY nome COLLATE NOCASE')
      .all() as { id: number; nome: string; ativa: number }[]
    return linhas.map((l) => ({ id: l.id, nome: l.nome, ativa: l.ativa === 1 }))
  }

  criarCategoria(nome: string): void {
    this.exigirNomeLivre(nome, null)
    this.db.prepare('INSERT INTO categorias (nome) VALUES (?)').run(nome)
  }

  renomearCategoria(id: number, nome: string): void {
    this.exigirNomeLivre(nome, id)
    const r = this.db.prepare('UPDATE categorias SET nome = ? WHERE id = ?').run(nome, id)
    if (r.changes === 0) throw new ErroNegocio('Categoria não encontrada.')
  }

  definirCategoriaAtiva(id: number, ativa: boolean): void {
    const r = this.db.prepare('UPDATE categorias SET ativa = ? WHERE id = ?').run(ativa ? 1 : 0, id)
    if (r.changes === 0) throw new ErroNegocio('Categoria não encontrada.')
  }

  excluirCategoria(id: number): void {
    const emUso = this.db
      .prepare(
        `SELECT (SELECT count(*) FROM series_versoes WHERE categoria_id = @id)
              + (SELECT count(*) FROM ocorrencias WHERE categoria_id = @id) AS total`
      )
      .get({ id }) as { total: number }
    if (emUso.total > 0) {
      throw new ErroNegocio(
        'Esta categoria está em uso e não pode ser excluída. Arquive-a para que não apareça em novos lançamentos.'
      )
    }
    this.db.prepare('DELETE FROM categorias WHERE id = ?').run(id)
  }

  private exigirNomeLivre(nome: string, idAtual: number | null): void {
    const existente = this.db.prepare('SELECT id FROM categorias WHERE nome = ?').get(nome) as
      | { id: number }
      | undefined
    if (existente && existente.id !== idAtual) {
      throw new ErroNegocio('Já existe uma categoria com esse nome.')
    }
  }

  // ---------- Consultas ----------

  private carregar(): { series: Serie[]; versoes: VersaoSerie[] } {
    const series = this.db.prepare('SELECT * FROM series').all() as LinhaSerie[]
    const versoes = this.db.prepare('SELECT * FROM series_versoes').all() as LinhaVersao[]
    return { series: series.map(paraSerie), versoes: versoes.map(paraVersao) }
  }

  listarMes(mes: string): Ocorrencia[] {
    const { series, versoes } = this.carregar()
    const linhas = this.db
      .prepare('SELECT * FROM ocorrencias WHERE mes = ?')
      .all(mes) as LinhaOcorrencia[]
    return ocorrenciasDoMes(series, versoes, linhas.map(paraRegistro), mes)
  }

  resumoMes(mes: string): ResumoMensal {
    return calcularResumo(mes, this.listarMes(mes))
  }

  /** Cinco meses anteriores, o mês consultado e os onze seguintes, com uma só leitura. */
  panorama(mes: string): Panorama {
    const { series, versoes } = this.carregar()
    const linhas = this.db.prepare('SELECT * FROM ocorrencias').all() as LinhaOcorrencia[]
    const registros = linhas.map(paraRegistro)

    const meses: PanoramaMes[] = []
    const planejados: Ocorrencia[] = []
    for (let deslocamento = -5; deslocamento <= 11; deslocamento++) {
      const alvo = somarMeses(mes, deslocamento)
      const ocorrencias = ocorrenciasDoMes(series, versoes, registros, alvo)
      meses.push(analisarMes(alvo, ocorrencias, calcularResumo(alvo, ocorrencias)))
      if (deslocamento < 0) continue
      planejados.push(
        ...ocorrencias.filter(
          (o) =>
            o.repeticao === 'unico' &&
            (o.tipo === 'lazer' ||
              ((o.tipo === 'gasto_livre' || o.tipo === 'compromisso') &&
                o.realizadoCentavos === null))
        )
      )
    }
    return { meses, planejados }
  }

  private serie(id: number): Serie {
    const linha = this.db.prepare('SELECT * FROM series WHERE id = ?').get(id) as
      | LinhaSerie
      | undefined
    if (!linha) throw new ErroNegocio('Lançamento não encontrado.')
    return paraSerie(linha)
  }

  private exigirOcorrencia(serie: Serie, mes: string): void {
    const excluida = this.db
      .prepare('SELECT 1 FROM ocorrencias WHERE serie_id = ? AND mes = ? AND excluida = 1')
      .get(serie.id, mes)
    if (!serieAtivaNoMes(serie, mes) || excluida) {
      throw new ErroNegocio(`Este lançamento não existe em ${formatarMesCurto(mes)}.`)
    }
  }

  private validarReferencias(tipo: Tipo, campos: CamposLancamento): void {
    if (campos.categoriaId !== null) {
      const existe = this.db.prepare('SELECT 1 FROM categorias WHERE id = ?').get(campos.categoriaId)
      if (!existe) throw new ErroNegocio('Categoria não encontrada.')
    }
    if (campos.reservaSerieId !== null) {
      const esperado = reservaAceitaPor(tipo)
      const reserva = this.serie(campos.reservaSerieId)
      if (esperado === null || reserva.tipo !== esperado) {
        throw new ErroNegocio('A reserva escolhida não combina com este tipo de lançamento.')
      }
    }
  }

  // ---------- Criação ----------

  criarLancamento(e: CriarLancamento, demo = false): number {
    return this.db.transaction(() => {
      this.validarReferencias(e.tipo, e)
      const mes = mesDaData(e.data)
      const { lastInsertRowid } = this.db
        .prepare(
          `INSERT INTO series (tipo, repeticao, mes_inicial, parcela_inicial, parcelas_total, demo)
           VALUES (?, ?, ?, ?, ?, ?)`
        )
        .run(e.tipo, e.repeticao, mes, e.parcelaInicial, e.parcelasTotal, demo ? 1 : 0)
      const serieId = Number(lastInsertRowid)
      this.gravarVersao(serieId, mes, e.dia ?? diaDaData(e.data), e)
      if (e.jaRealizado) this.gravarRealizado(serieId, mes, e.valorCentavos, e.data)
      return serieId
    })()
  }

  private gravarVersao(serieId: number, aPartirDe: string, dia: number, c: CamposLancamento): void {
    this.db
      .prepare(
        `INSERT INTO series_versoes
           (serie_id, a_partir_de, nome, valor_centavos, dia, categoria_id, forma_pagamento,
            fatura, reserva_serie_id, observacao)
         VALUES (@serieId, @aPartirDe, @nome, @valor, @dia, @categoria, @forma, @fatura, @reserva, @observacao)
         ON CONFLICT (serie_id, a_partir_de) DO UPDATE SET
           nome = excluded.nome, valor_centavos = excluded.valor_centavos, dia = excluded.dia,
           categoria_id = excluded.categoria_id, forma_pagamento = excluded.forma_pagamento,
           fatura = excluded.fatura, reserva_serie_id = excluded.reserva_serie_id,
           observacao = excluded.observacao`
      )
      .run({ serieId, aPartirDe, dia, ...parametrosCampos(c) })
  }

  private gravarRealizado(serieId: number, mes: string, valor: number, data: string): void {
    this.db
      .prepare(
        `INSERT INTO ocorrencias (serie_id, mes, realizado_centavos, data_realizacao)
         VALUES (?, ?, ?, ?)
         ON CONFLICT (serie_id, mes) DO UPDATE SET
           realizado_centavos = excluded.realizado_centavos,
           data_realizacao = excluded.data_realizacao`
      )
      .run(serieId, mes, valor, data)
  }

  // ---------- Valor realizado ----------

  registrarRealizado(p: RegistrarRealizado): void {
    this.db.transaction(() => {
      const serie = this.serie(p.serieId)
      if (ehReserva(serie.tipo)) {
        throw new ErroNegocio(
          'Reservas não têm valor realizado. Registre o uso com um gasto ou aporte ligado à reserva.'
        )
      }
      this.exigirOcorrencia(serie, p.mes)
      if (p.realizadoCentavos !== null) {
        this.gravarRealizado(p.serieId, p.mes, p.realizadoCentavos, p.dataRealizacao!)
        return
      }
      this.db
        .prepare(
          `UPDATE ocorrencias SET realizado_centavos = NULL, data_realizacao = NULL
           WHERE serie_id = ? AND mes = ?`
        )
        .run(p.serieId, p.mes)
      this.db
        .prepare(
          `DELETE FROM ocorrencias
           WHERE serie_id = ? AND mes = ? AND editada = 0 AND excluida = 0`
        )
        .run(p.serieId, p.mes)
    })()
  }

  // ---------- Edição ----------

  /** Altera só o mês selecionado. Em lançamentos únicos, a data pode mudar de mês. */
  editarOcorrencia(p: EditarOcorrencia): void {
    this.db.transaction(() => {
      const serie = this.serie(p.serieId)
      this.exigirOcorrencia(serie, p.mes)
      this.validarReferencias(serie.tipo, p)

      // Em gastos e aportes, o valor digitado é o próprio valor gasto: se já estava
      // realizado, acompanha a edição em vez de ficar preso ao valor antigo.
      if (reservaAceitaPor(serie.tipo) !== null) {
        this.db
          .prepare(
            `UPDATE ocorrencias SET realizado_centavos = ?, data_realizacao = ?
             WHERE serie_id = ? AND mes = ? AND realizado_centavos IS NOT NULL`
          )
          .run(p.valorCentavos, p.data, p.serieId, p.mes)
      }

      if (serie.repeticao === 'unico') {
        const novoMes = mesDaData(p.data)
        this.db.prepare('UPDATE series SET mes_inicial = ? WHERE id = ?').run(novoMes, serie.id)
        this.db.prepare('DELETE FROM series_versoes WHERE serie_id = ?').run(serie.id)
        this.gravarVersao(serie.id, novoMes, diaDaData(p.data), p)
        this.db.prepare('UPDATE ocorrencias SET mes = ? WHERE serie_id = ?').run(novoMes, serie.id)
        return
      }

      if (mesDaData(p.data) !== p.mes) {
        throw new ErroNegocio(
          `A data precisa continuar em ${formatarMesCurto(p.mes)}. Para mudar o vencimento dos próximos meses, altere "a partir deste mês".`
        )
      }
      this.db
        .prepare(
          `INSERT INTO ocorrencias
             (serie_id, mes, editada, nome, valor_centavos, data, categoria_id, forma_pagamento,
              fatura, reserva_serie_id, observacao)
           VALUES (@serieId, @mes, 1, @nome, @valor, @data, @categoria, @forma, @fatura, @reserva, @observacao)
           ON CONFLICT (serie_id, mes) DO UPDATE SET
             editada = 1, nome = excluded.nome, valor_centavos = excluded.valor_centavos,
             data = excluded.data, categoria_id = excluded.categoria_id,
             forma_pagamento = excluded.forma_pagamento, fatura = excluded.fatura,
             reserva_serie_id = excluded.reserva_serie_id, observacao = excluded.observacao`
        )
        .run({ serieId: p.serieId, mes: p.mes, data: p.data, ...parametrosCampos(p) })
    })()
  }

  /** Altera do mês informado em diante, sem tocar nos meses anteriores. */
  editarAPartirDe(p: EditarAPartirDe): void {
    this.db.transaction(() => {
      const serie = this.serie(p.serieId)
      if (serie.repeticao === 'unico') {
        throw new ErroNegocio('Lançamentos únicos só têm um mês para alterar.')
      }
      if (!serieAtivaNoMes(serie, p.aPartirDe)) {
        throw new ErroNegocio(`Este lançamento não existe em ${formatarMesCurto(p.aPartirDe)}.`)
      }
      this.validarReferencias(serie.tipo, p)

      if (serie.repeticao === 'parcelado' && p.parcelasTotal !== null) {
        this.alterarTotalParcelas(serie, p.parcelasTotal, p.aPartirDe, p.confirmarRealizadas)
      }
      this.db
        .prepare('DELETE FROM series_versoes WHERE serie_id = ? AND a_partir_de > ?')
        .run(serie.id, p.aPartirDe)
      this.gravarVersao(serie.id, p.aPartirDe, p.dia, p)
    })()
  }

  private alterarTotalParcelas(
    serie: Serie,
    total: number,
    aPartirDe: string,
    confirmarRealizadas: boolean
  ): void {
    if (total === serie.parcelasTotal) return
    const novoFim = somarMeses(serie.mesInicial, total - serie.parcelaInicial!)
    if (total < serie.parcelaInicial! || novoFim < aPartirDe) {
      throw new ErroNegocio(
        `O parcelamento não pode terminar antes de ${formatarMesCurto(aPartirDe)}.`
      )
    }
    this.removerDepoisDe(serie.id, novoFim, confirmarRealizadas)
    this.db.prepare('UPDATE series SET parcelas_total = ? WHERE id = ?').run(total, serie.id)
  }

  // ---------- Exclusão e encerramento ----------

  excluirOcorrencia(p: ExcluirOcorrencia): void {
    this.db.transaction(() => {
      const serie = this.serie(p.serieId)
      this.exigirOcorrencia(serie, p.mes)

      if (serie.repeticao === 'unico') {
        this.db.prepare('DELETE FROM series WHERE id = ?').run(serie.id)
        return
      }
      if (p.escopo === 'esta') {
        this.db
          .prepare(
            `INSERT INTO ocorrencias (serie_id, mes, excluida) VALUES (?, ?, 1)
             ON CONFLICT (serie_id, mes) DO UPDATE SET
               excluida = 1, editada = 0, realizado_centavos = NULL, data_realizacao = NULL`
          )
          .run(serie.id, p.mes)
        return
      }
      const ultimoMes = somarMeses(p.mes, -1)
      this.removerDepoisDe(serie.id, ultimoMes, p.confirmarRealizadas)
      if (ultimoMes < serie.mesInicial) {
        this.db.prepare('DELETE FROM series WHERE id = ?').run(serie.id)
      } else {
        this.gravarEncerramento(serie.id, ultimoMes)
      }
    })()
  }

  /** Define o último mês da série. Os meses até ele continuam como estão. */
  encerrarSerie(p: EncerrarSerie): void {
    this.db.transaction(() => {
      const serie = this.serie(p.serieId)
      if (serie.repeticao === 'unico') {
        throw new ErroNegocio('Lançamentos únicos não precisam ser encerrados.')
      }
      if (!serieAtivaNoMes(serie, p.ultimoMes)) {
        const fim = ultimoMesDaSerie(serie)
        throw new ErroNegocio(
          fim
            ? `Escolha um mês entre ${formatarMesCurto(serie.mesInicial)} e ${formatarMesCurto(fim)}.`
            : `Escolha um mês a partir de ${formatarMesCurto(serie.mesInicial)}.`
        )
      }
      this.removerDepoisDe(serie.id, p.ultimoMes, p.confirmarRealizadas)
      this.gravarEncerramento(serie.id, p.ultimoMes)
    })()
  }

  private gravarEncerramento(serieId: number, ultimoMes: string): void {
    this.db.prepare('UPDATE series SET mes_encerramento = ? WHERE id = ?').run(ultimoMes, serieId)
  }

  /** Remove exceções após o mês. Valores realizados só saem com confirmação explícita. */
  private removerDepoisDe(serieId: number, ultimoMes: string, confirmado: boolean): void {
    const { total } = this.db
      .prepare(
        `SELECT count(*) AS total FROM ocorrencias
         WHERE serie_id = ? AND mes > ? AND realizado_centavos IS NOT NULL`
      )
      .get(serieId, ultimoMes) as { total: number }
    if (total > 0 && !confirmado) {
      throw new ErroNegocio(
        `Há ${total} ocorrência(s) com valor realizado depois de ${formatarMesCurto(ultimoMes)}.`,
        CODIGO_REALIZADAS_FUTURAS,
        total
      )
    }
    this.db.prepare('DELETE FROM ocorrencias WHERE serie_id = ? AND mes > ?').run(serieId, ultimoMes)
    this.db
      .prepare('DELETE FROM series_versoes WHERE serie_id = ? AND a_partir_de > ?')
      .run(serieId, ultimoMes)
  }

  // ---------- Dados de demonstração ----------

  temDemonstracao(): boolean {
    return this.db.prepare('SELECT 1 FROM series WHERE demo = 1 LIMIT 1').get() !== undefined
  }

  removerDemonstracao(): void {
    this.db.prepare('DELETE FROM series WHERE demo = 1').run()
  }

  carregarDemonstracao(mes: string): void {
    if (this.temDemonstracao()) {
      throw new ErroNegocio('Os dados de demonstração já estão carregados.')
    }
    const categoria = (nome: string): number | null => {
      const linha = this.db.prepare('SELECT id FROM categorias WHERE nome = ?').get(nome) as
        | { id: number }
        | undefined
      return linha?.id ?? null
    }
    const base = {
      categoriaId: null,
      formaPagamento: null,
      fatura: null,
      reservaSerieId: null,
      observacao: 'Dado de demonstração',
      parcelaInicial: null,
      parcelasTotal: null,
      jaRealizado: false
    }
    const criar = (e: Partial<CriarLancamento> & Pick<CriarLancamento, 'tipo' | 'repeticao' | 'nome' | 'valorCentavos'>, dia: number) =>
      this.criarLancamento(
        { ...base, ...e, nome: PREFIXO_DEMONSTRACAO + e.nome, data: dataNoMes(mes, dia) },
        true
      )

    this.db.transaction(() => {
      criar({ tipo: 'receita', repeticao: 'recorrente', nome: 'Salário', valorCentavos: 650000, categoriaId: categoria('Salário') }, 5)
      criar({ tipo: 'compromisso', repeticao: 'recorrente', nome: 'Aluguel', valorCentavos: 180000, categoriaId: categoria('Moradia'), formaPagamento: 'boleto' }, 10)
      criar({ tipo: 'compromisso', repeticao: 'recorrente', nome: 'Internet', valorCentavos: 11990, categoriaId: categoria('Moradia'), formaPagamento: 'debito' }, 15)
      criar({ tipo: 'compromisso', repeticao: 'recorrente', nome: 'Netflix', valorCentavos: 4490, categoriaId: categoria('Assinaturas'), formaPagamento: 'credito', fatura: 'Cartão demo' }, 20)
      criar({ tipo: 'compromisso', repeticao: 'parcelado', nome: 'Celular', valorCentavos: 25000, categoriaId: categoria('Outros'), formaPagamento: 'credito', fatura: 'Cartão demo', parcelaInicial: 2, parcelasTotal: 10 }, 20)
      criar({ tipo: 'investimento', repeticao: 'recorrente', nome: 'Investimento mensal', valorCentavos: 100000, categoriaId: categoria('Investimentos') }, 5)
      const lazer = criar({ tipo: 'lazer', repeticao: 'recorrente', nome: 'Lazer do mês', valorCentavos: 40000, categoriaId: categoria('Lazer') }, 1)
      criar({ tipo: 'gasto_livre', repeticao: 'unico', nome: 'Cinema', valorCentavos: 6000, categoriaId: categoria('Lazer'), formaPagamento: 'pix', reservaSerieId: lazer, jaRealizado: true }, 8)
      criar({ tipo: 'gasto_livre', repeticao: 'unico', nome: 'Almoço fora', valorCentavos: 4500, categoriaId: categoria('Alimentação'), formaPagamento: 'debito', jaRealizado: true }, 12)
    })()
  }
}
