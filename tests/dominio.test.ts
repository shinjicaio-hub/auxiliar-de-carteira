import { describe, expect, it } from 'vitest'
import { dataNoMes, dataValida, diferencaMeses, somarMeses, ultimoDiaDoMes } from '../src/shared/datas'
import { centavosParaCampo, formatarReais, reaisParaCentavos } from '../src/shared/dinheiro'
import { ocorrenciasDoMes, ultimoMesDaSerie } from '../src/shared/ocorrencias'
import { calcularResumo } from '../src/shared/resumo'
import type { RegistroOcorrencia, Repeticao, Serie, Tipo, VersaoSerie } from '../src/shared/tipos'

let proximoId = 1

interface Opcoes {
  tipo?: Tipo
  repeticao?: Repeticao
  mes?: string
  valor?: number
  dia?: number
  parcelaInicial?: number
  parcelasTotal?: number
  encerramento?: string
  reserva?: number
}

function criar(nome: string, o: Opcoes = {}): { serie: Serie; versao: VersaoSerie } {
  const id = proximoId++
  const repeticao = o.repeticao ?? 'unico'
  const mes = o.mes ?? '2026-03'
  return {
    serie: {
      id,
      tipo: o.tipo ?? 'compromisso',
      repeticao,
      mesInicial: mes,
      parcelaInicial: repeticao === 'parcelado' ? (o.parcelaInicial ?? 1) : null,
      parcelasTotal: repeticao === 'parcelado' ? (o.parcelasTotal ?? 1) : null,
      mesEncerramento: o.encerramento ?? null,
      demo: false
    },
    versao: {
      serieId: id,
      aPartirDe: mes,
      nome,
      valorCentavos: o.valor ?? 10000,
      dia: o.dia ?? 10,
      categoriaId: null,
      formaPagamento: null,
      fatura: null,
      reservaSerieId: o.reserva ?? null,
      observacao: null
    }
  }
}

function realizado(serieId: number, mes: string, valor: number): RegistroOcorrencia {
  return {
    serieId,
    mes,
    excluida: false,
    edicao: null,
    realizadoCentavos: valor,
    dataRealizacao: `${mes}-15`
  }
}

function resumo(
  itens: { serie: Serie; versao: VersaoSerie }[],
  registros: RegistroOcorrencia[] = [],
  mes = '2026-03'
) {
  return calcularResumo(
    mes,
    ocorrenciasDoMes(
      itens.map((i) => i.serie),
      itens.map((i) => i.versao),
      registros,
      mes
    )
  )
}

describe('dinheiro', () => {
  it('converte texto em centavos sem erro de arredondamento', () => {
    expect(reaisParaCentavos('1.234,56')).toBe(123456)
    expect(reaisParaCentavos('1234,56')).toBe(123456)
    expect(reaisParaCentavos('1234.56')).toBe(123456)
    expect(reaisParaCentavos('R$ 12,5')).toBe(1250)
    expect(reaisParaCentavos('19,99')).toBe(1999)
    expect(reaisParaCentavos('0,07')).toBe(7)
    expect(reaisParaCentavos('1.000')).toBe(100000)
  })

  it('recusa textos inválidos', () => {
    for (const texto of ['', 'abc', '1,234', '12,345', '-5', '1.23.45', '1,2,3']) {
      expect(reaisParaCentavos(texto)).toBeNull()
    }
  })

  it('formata em reais com sinal nos negativos', () => {
    expect(formatarReais(123456)).toBe('R$ 1.234,56')
    expect(formatarReais(-5)).toBe('−R$ 0,05')
    expect(centavosParaCampo(100000000)).toBe('1.000.000,00')
  })
})

describe('datas', () => {
  it('atravessa a virada do ano nos dois sentidos', () => {
    expect(somarMeses('2026-11', 3)).toBe('2027-02')
    expect(somarMeses('2027-01', -1)).toBe('2026-12')
    expect(diferencaMeses('2026-11', '2027-02')).toBe(3)
  })

  it('reconhece anos bissextos', () => {
    expect(ultimoDiaDoMes('2028-02')).toBe(29)
    expect(ultimoDiaDoMes('2026-02')).toBe(28)
    expect(ultimoDiaDoMes('2100-02')).toBe(28)
    expect(ultimoDiaDoMes('2000-02')).toBe(29)
  })

  it('usa o último dia válido', () => {
    expect(dataNoMes('2026-02', 31)).toBe('2026-02-28')
    expect(dataNoMes('2026-02', 29)).toBe('2026-02-28')
    expect(dataNoMes('2028-02', 30)).toBe('2028-02-29')
    expect(dataNoMes('2026-04', 31)).toBe('2026-04-30')
  })

  it('valida datas de calendário', () => {
    expect(dataValida('2028-02-29')).toBe(true)
    expect(dataValida('2026-02-29')).toBe(false)
    expect(dataValida('2026-13-01')).toBe(false)
    expect(dataValida('01/02/2026')).toBe(false)
  })
})

describe('repetição', () => {
  it('único aparece só no mês definido', () => {
    const { serie, versao } = criar('Compra', { mes: '2026-03' })
    expect(ocorrenciasDoMes([serie], [versao], [], '2026-03')).toHaveLength(1)
    expect(ocorrenciasDoMes([serie], [versao], [], '2026-02')).toHaveLength(0)
    expect(ocorrenciasDoMes([serie], [versao], [], '2026-04')).toHaveLength(0)
  })

  it('parcelado atravessa a virada do ano e numera as parcelas', () => {
    const { serie, versao } = criar('Celular', {
      repeticao: 'parcelado',
      mes: '2026-11',
      parcelasTotal: 4,
      valor: 25000
    })
    const parcela = (mes: string) => ocorrenciasDoMes([serie], [versao], [], mes)[0]
    expect(parcela('2026-10')).toBeUndefined()
    expect(parcela('2026-11')?.parcelaAtual).toBe(1)
    expect(parcela('2026-12')?.parcelaAtual).toBe(2)
    expect(parcela('2027-01')?.parcelaAtual).toBe(3)
    expect(parcela('2027-02')?.parcelaAtual).toBe(4)
    expect(parcela('2027-03')).toBeUndefined()
    expect(parcela('2027-01')?.totalCompraCentavos).toBe(100000)
  })

  it('parcelamento em andamento começa na parcela informada', () => {
    const { serie, versao } = criar('TV', {
      repeticao: 'parcelado',
      mes: '2026-03',
      parcelaInicial: 3,
      parcelasTotal: 10
    })
    expect(ultimoMesDaSerie(serie)).toBe('2026-10')
    expect(ocorrenciasDoMes([serie], [versao], [], '2026-03')[0]?.parcelaAtual).toBe(3)
    expect(ocorrenciasDoMes([serie], [versao], [], '2026-10')[0]?.parcelaAtual).toBe(10)
    expect(ocorrenciasDoMes([serie], [versao], [], '2026-11')).toHaveLength(0)
  })

  it('recorrente repete até o encerramento', () => {
    const { serie, versao } = criar('Internet', {
      repeticao: 'recorrente',
      mes: '2026-01',
      encerramento: '2026-06'
    })
    expect(ocorrenciasDoMes([serie], [versao], [], '2026-06')).toHaveLength(1)
    expect(ocorrenciasDoMes([serie], [versao], [], '2026-07')).toHaveLength(0)
  })

  it('vencimento no dia 31 volta ao dia original depois de fevereiro', () => {
    const { serie, versao } = criar('Aluguel', { repeticao: 'recorrente', mes: '2026-01', dia: 31 })
    const data = (mes: string) => ocorrenciasDoMes([serie], [versao], [], mes)[0]?.data
    expect(data('2026-01')).toBe('2026-01-31')
    expect(data('2026-02')).toBe('2026-02-28')
    expect(data('2026-03')).toBe('2026-03-31')
    expect(data('2026-04')).toBe('2026-04-30')
    expect(data('2026-05')).toBe('2026-05-31')
  })

  it('vencimentos nos dias 29 e 30 em fevereiro', () => {
    const d29 = criar('A', { repeticao: 'recorrente', mes: '2027-12', dia: 29 })
    const d30 = criar('B', { repeticao: 'recorrente', mes: '2027-12', dia: 30 })
    const series = [d29.serie, d30.serie]
    const versoes = [d29.versao, d30.versao]
    const datas = (mes: string) => ocorrenciasDoMes(series, versoes, [], mes).map((o) => o.data)
    expect(datas('2028-02')).toEqual(['2028-02-29', '2028-02-29'])
    expect(datas('2027-02')).toEqual([])
    expect(datas('2029-02')).toEqual(['2029-02-28', '2029-02-28'])
    expect(datas('2029-03')).toEqual(['2029-03-29', '2029-03-30'])
  })

  it('alteração a partir de um mês preserva os anteriores', () => {
    const { serie, versao } = criar('Academia', {
      repeticao: 'recorrente',
      mes: '2026-01',
      valor: 10000
    })
    const nova = { ...versao, aPartirDe: '2026-04', valorCentavos: 12000 }
    const valor = (mes: string) =>
      ocorrenciasDoMes([serie], [versao, nova], [], mes)[0]?.previstoCentavos
    expect(valor('2026-03')).toBe(10000)
    expect(valor('2026-04')).toBe(12000)
    expect(valor('2026-09')).toBe(12000)
  })

  it('consultar o mesmo mês várias vezes dá sempre o mesmo resultado', () => {
    const { serie, versao } = criar('Netflix', { repeticao: 'recorrente', mes: '2026-01' })
    const primeira = ocorrenciasDoMes([serie], [versao], [], '2026-05')
    ocorrenciasDoMes([serie], [versao], [], '2026-06')
    expect(ocorrenciasDoMes([serie], [versao], [], '2026-05')).toEqual(primeira)
    expect(primeira).toHaveLength(1)
  })

  it('exclusão pontual some só naquele mês', () => {
    const { serie, versao } = criar('Netflix', { repeticao: 'recorrente', mes: '2026-01' })
    const registro: RegistroOcorrencia = {
      serieId: serie.id,
      mes: '2026-02',
      excluida: true,
      edicao: null,
      realizadoCentavos: null,
      dataRealizacao: null
    }
    expect(ocorrenciasDoMes([serie], [versao], [registro], '2026-02')).toHaveLength(0)
    expect(ocorrenciasDoMes([serie], [versao], [registro], '2026-03')).toHaveLength(1)
  })
})

describe('orçamento', () => {
  it('segue a fórmula do orçamento livre', () => {
    const r = resumo([
      criar('Salário', { tipo: 'receita', valor: 500000 }),
      criar('Aluguel', { valor: 150000 }),
      criar('Aporte mensal', { tipo: 'investimento', valor: 100000 }),
      criar('Viagem', { tipo: 'lazer', valor: 50000 })
    ])
    expect(r.orcamentoLivreCentavos).toBe(200000)
    expect(r.restanteLivreCentavos).toBe(200000)
  })

  it('realizado substitui o previsto, sem somar os dois', () => {
    const salario = criar('Salário', { tipo: 'receita', valor: 500000 })
    const luz = criar('Luz', { valor: 20000 })
    const r = resumo(
      [salario, luz],
      [realizado(salario.serie.id, '2026-03', 480000), realizado(luz.serie.id, '2026-03', 23000)]
    )
    expect(r.renda.consideradoCentavos).toBe(480000)
    expect(r.renda.previstoCentavos).toBe(500000)
    expect(r.renda.realizadoCentavos).toBe(480000)
    expect(r.compromissos.consideradoCentavos).toBe(23000)
    expect(r.compromissos.pendenteCentavos).toBe(0)
    expect(r.orcamentoLivreCentavos).toBe(457000)
  })

  it('soma vários recebimentos no mês e separa o que falta receber', () => {
    const a = criar('Salário', { tipo: 'receita', valor: 300000 })
    const b = criar('Freela', { tipo: 'receita', valor: 80000 })
    const r = resumo([a, b], [realizado(a.serie.id, '2026-03', 300000)])
    expect(r.renda.consideradoCentavos).toBe(380000)
    expect(r.renda.realizadoCentavos).toBe(300000)
    expect(r.renda.pendenteCentavos).toBe(80000)
  })

  it('gasto livre reduz o restante, não o orçamento', () => {
    const r = resumo([
      criar('Salário', { tipo: 'receita', valor: 100000 }),
      criar('Almoço', { tipo: 'gasto_livre', valor: 3000 })
    ])
    expect(r.orcamentoLivreCentavos).toBe(100000)
    expect(r.gastosLivresCentavos).toBe(3000)
    expect(r.restanteLivreCentavos).toBe(97000)
  })

  it('gasto dentro da reserva de lazer não é descontado duas vezes', () => {
    const lazer = criar('Show', { tipo: 'lazer', valor: 30000 })
    const r = resumo([
      criar('Salário', { tipo: 'receita', valor: 100000 }),
      lazer,
      criar('Ingresso', { tipo: 'gasto_livre', valor: 18000, reserva: lazer.serie.id })
    ])
    expect(r.lazer).toEqual({
      reservadoCentavos: 30000,
      utilizadoCentavos: 18000,
      restanteCentavos: 12000,
      excedenteCentavos: 0
    })
    expect(r.gastosLivresCentavos).toBe(0)
    expect(r.orcamentoLivreCentavos).toBe(70000)
    expect(r.restanteLivreCentavos).toBe(70000)
  })

  it('só o que ultrapassa a reserva de lazer reduz o restante', () => {
    const lazer = criar('Show', { tipo: 'lazer', valor: 30000 })
    const r = resumo([
      criar('Salário', { tipo: 'receita', valor: 100000 }),
      lazer,
      criar('Ingresso', { tipo: 'gasto_livre', valor: 25000, reserva: lazer.serie.id }),
      criar('Jantar', { tipo: 'gasto_livre', valor: 10000, reserva: lazer.serie.id })
    ])
    expect(r.lazer.utilizadoCentavos).toBe(35000)
    expect(r.lazer.restanteCentavos).toBe(0)
    expect(r.lazer.excedenteCentavos).toBe(5000)
    expect(r.restanteLivreCentavos).toBe(65000)
  })

  it('aporte consome a reserva de investimento sem desconto duplo', () => {
    const reserva = criar('Investir', { tipo: 'investimento', valor: 100000 })
    const r = resumo([
      criar('Salário', { tipo: 'receita', valor: 300000 }),
      reserva,
      criar('Tesouro', { tipo: 'aporte', valor: 60000, reserva: reserva.serie.id }),
      criar('Ações', { tipo: 'aporte', valor: 40000, reserva: reserva.serie.id })
    ])
    expect(r.investimento.utilizadoCentavos).toBe(100000)
    expect(r.investimento.restanteCentavos).toBe(0)
    expect(r.restanteLivreCentavos).toBe(200000)
  })

  it('aporte acima da reserva e aporte sem reserva reduzem o restante', () => {
    const reserva = criar('Investir', { tipo: 'investimento', valor: 100000 })
    const r = resumo([
      criar('Salário', { tipo: 'receita', valor: 300000 }),
      reserva,
      criar('Tesouro', { tipo: 'aporte', valor: 120000, reserva: reserva.serie.id }),
      criar('Extra', { tipo: 'aporte', valor: 5000 })
    ])
    expect(r.investimento.excedenteCentavos).toBe(20000)
    expect(r.aportesSemReservaCentavos).toBe(5000)
    expect(r.restanteLivreCentavos).toBe(175000)
  })

  it('uso de reserva inexistente no mês conta como gasto livre', () => {
    const lazer = criar('Show', { tipo: 'lazer', valor: 30000, mes: '2026-02' })
    const r = resumo([
      lazer,
      criar('Ingresso', { tipo: 'gasto_livre', valor: 18000, reserva: lazer.serie.id })
    ])
    expect(r.gastosLivresCentavos).toBe(18000)
    expect(r.restanteLivreCentavos).toBe(-18000)
  })

  it('permite resultado negativo', () => {
    const r = resumo([
      criar('Salário', { tipo: 'receita', valor: 100000 }),
      criar('Aluguel', { valor: 150000 })
    ])
    expect(r.orcamentoLivreCentavos).toBe(-50000)
  })

  it('itens de uma fatura contam uma vez cada, sem total agregado', () => {
    const itens = [criar('Netflix', { valor: 5000 }), criar('Mercado', { valor: 20000 })]
    itens.forEach((i) => (i.versao.fatura = 'Nubank'))
    expect(resumo(itens).compromissos.consideradoCentavos).toBe(25000)
  })
})
