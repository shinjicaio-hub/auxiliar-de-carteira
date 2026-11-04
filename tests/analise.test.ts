import { describe, expect, it } from 'vitest'
import {
  analisarMes,
  contasDoMes,
  distribuicaoRenda,
  gastoDoMes,
  gerarInsights,
  mediaAnterior,
  ritmoDoMes,
  simularCompra,
  type PanoramaMes
} from '../src/shared/analise'
import { calcularResumo } from '../src/shared/resumo'
import type { Ocorrencia, Tipo } from '../src/shared/tipos'

let id = 1

function item(tipo: Tipo, valor: number, o: Partial<Ocorrencia> = {}): Ocorrencia {
  return {
    serieId: id++,
    mes: '2026-11',
    tipo,
    repeticao: 'unico',
    nome: 'Item',
    categoriaId: null,
    formaPagamento: null,
    fatura: null,
    reservaSerieId: null,
    observacao: null,
    data: '2026-11-10',
    diaOriginal: 10,
    previstoCentavos: valor,
    realizadoCentavos: null,
    dataRealizacao: null,
    consideradoCentavos: o.realizadoCentavos ?? valor,
    parcelaAtual: null,
    parcelasTotal: null,
    totalCompraCentavos: null,
    mesInicial: '2026-11',
    ultimoMes: '2026-11',
    mesEncerramento: null,
    editadaNoMes: false,
    demo: false,
    ...o
  }
}

function panorama(mes: string, itens: Ocorrencia[]): PanoramaMes {
  const doMes = itens.map((i) => ({ ...i, mes }))
  return analisarMes(mes, doMes, calcularResumo(mes, doMes))
}

const nomeCategoria = (categoria: number | null) => `Categoria ${categoria}`

describe('gasto do mês', () => {
  it('separa o que já saiu do que ainda vai sair, sem contar investimento', () => {
    const p = panorama('2026-11', [
      item('compromisso', 100000, { realizadoCentavos: 110000 }),
      item('compromisso', 50000),
      item('gasto_livre', 3000, { realizadoCentavos: 3000 }),
      item('investimento', 200000),
      item('aporte', 200000, { realizadoCentavos: 200000 }),
      item('receita', 900000)
    ])
    expect(p.pagoCentavos).toBe(113000)
    expect(p.pendenteCentavos).toBe(50000)
    expect(gastoDoMes(p)).toBe(163000)
  })

  it('realizado e previsto de um mesmo item não somam na categoria', () => {
    const p = panorama('2026-11', [
      item('compromisso', 10000, { categoriaId: 1, realizadoCentavos: 12000 }),
      item('compromisso', 5000, { categoriaId: 1 }),
      item('compromisso', 90000, { categoriaId: 2 })
    ])
    expect(p.categorias).toEqual([
      { categoriaId: 2, pagoCentavos: 0, pendenteCentavos: 90000 },
      { categoriaId: 1, pagoCentavos: 12000, pendenteCentavos: 5000 }
    ])
  })

  it('reserva de lazer ainda não usada não conta como gasto', () => {
    const lazer = item('lazer', 30000)
    const p = panorama('2026-11', [
      lazer,
      item('gasto_livre', 10000, {
        realizadoCentavos: 10000,
        reservaSerieId: lazer.serieId
      })
    ])
    expect(gastoDoMes(p)).toBe(10000)
  })
})

describe('para onde vai a renda', () => {
  it('as partes somam a renda quando sobra dinheiro', () => {
    const lazer = item('lazer', 30000)
    const r = panorama('2026-11', [
      item('receita', 500000),
      item('compromisso', 150000),
      item('investimento', 100000),
      lazer,
      item('gasto_livre', 40000, { reservaSerieId: lazer.serieId }),
      item('gasto_livre', 5000),
      item('aporte', 2000)
    ]).resumo
    const soma = distribuicaoRenda(r).reduce((t, p) => t + p.centavos, 0)
    expect(soma).toBe(500000)
  })

  it('ainda livre nunca é negativo', () => {
    const r = panorama('2026-11', [item('receita', 1000), item('compromisso', 5000)]).resumo
    expect(distribuicaoRenda(r).find((p) => p.id === 'livre')?.centavos).toBe(0)
  })
})

describe('ritmo diário', () => {
  const r = panorama('2026-11', [item('receita', 300000)]).resumo

  it('divide o restante pelos dias que faltam, contando hoje', () => {
    expect(ritmoDoMes(r, '2026-11-01')).toEqual({ diasRestantes: 30, porDiaCentavos: 10000 })
    expect(ritmoDoMes(r, '2026-11-30')).toEqual({ diasRestantes: 1, porDiaCentavos: 300000 })
  })

  it('não existe fora do mês corrente', () => {
    expect(ritmoDoMes(r, '2026-12-01')).toBeNull()
  })

  it('não sugere valor negativo por dia', () => {
    const negativo = panorama('2026-11', [item('compromisso', 5000)]).resumo
    expect(ritmoDoMes(negativo, '2026-11-10')?.porDiaCentavos).toBe(0)
  })
})

describe('contas do mês', () => {
  it('separa atrasadas e a vencer, ignorando o que já foi pago e as reservas', () => {
    const atrasada = item('compromisso', 100, { data: '2026-11-02' })
    const hoje = item('compromisso', 100, { data: '2026-11-10' })
    const paga = item('compromisso', 100, { data: '2026-11-01', realizadoCentavos: 100 })
    const reserva = item('lazer', 100, { data: '2026-11-01' })
    const contas = contasDoMes([atrasada, hoje, paga, reserva], '2026-11-10')
    expect(contas.atrasadas).toEqual([atrasada])
    expect(contas.aVencer).toEqual([hoje])
  })
})

describe('média anterior', () => {
  it('ignora meses vazios e usa no máximo três', () => {
    const meses = [
      panorama('2026-06', [item('compromisso', 900000)]),
      panorama('2026-07', [item('compromisso', 10000)]),
      panorama('2026-08', []),
      panorama('2026-09', [item('compromisso', 20000)]),
      panorama('2026-10', [item('compromisso', 30000)]),
      panorama('2026-11', [item('compromisso', 500000)])
    ]
    expect(mediaAnterior(meses, '2026-11')).toBe(20000)
  })

  it('sem histórico não inventa média', () => {
    expect(mediaAnterior([panorama('2026-11', [item('compromisso', 1)])], '2026-11')).toBeNull()
  })
})

describe('alertas', () => {
  const insights = (mes: string, hoje: string, ocorrencias: Ocorrencia[], meses: PanoramaMes[]) =>
    gerarInsights({ mes, hoje, ocorrencias, meses, nomeCategoria })
  const ids = (lista: { id: string }[]) => lista.map((i) => i.id)

  it('mês tranquilo não gera alerta', () => {
    const itens = [item('receita', 500000), item('compromisso', 100000, { data: '2026-11-20' })]
    expect(insights('2026-11', '2026-11-10', itens, [panorama('2026-11', itens)])).toEqual([])
  })

  it('aponta planejamento acima da renda como crítico e primeiro', () => {
    const itens = [item('receita', 1000), item('compromisso', 5000, { data: '2026-11-20' })]
    const [primeiro] = insights('2026-11', '2026-11-10', itens, [panorama('2026-11', itens)])
    expect(primeiro).toMatchObject({ id: 'planejamento', nivel: 'critico' })
  })

  it('aponta contas vencidas sem contar recebimentos atrasados', () => {
    const itens = [
      item('receita', 500000, { data: '2026-11-01' }),
      item('compromisso', 10000, { data: '2026-11-02' })
    ]
    const lista = insights('2026-11', '2026-11-10', itens, [panorama('2026-11', itens)])
    expect(lista[0]).toMatchObject({ id: 'atrasadas', titulo: '1 conta sem pagamento registrado' })
  })

  it('projeta o ritmo de gasto livre', () => {
    const itens = [
      item('receita', 100000),
      item('gasto_livre', 50000, { realizadoCentavos: 50000, data: '2026-11-05' })
    ]
    const lista = insights('2026-11', '2026-11-10', itens, [panorama('2026-11', itens)])
    expect(ids(lista)).toContain('ritmo')
  })

  it('não projeta ritmo nos primeiros dias, com pouca informação', () => {
    const itens = [
      item('receita', 100000),
      item('gasto_livre', 50000, { realizadoCentavos: 50000, data: '2026-11-02' })
    ]
    const lista = insights('2026-11', '2026-11-03', itens, [panorama('2026-11', itens)])
    expect(ids(lista)).not.toContain('ritmo')
  })

  it('aponta categoria acima da média só com histórico e diferença relevante', () => {
    const base = (valor: number) => [item('compromisso', valor, { categoriaId: 7, data: '2026-11-20' })]
    const historico = [panorama('2026-09', base(10000)), panorama('2026-10', base(10000))]
    const alta = base(20000)
    expect(
      ids(insights('2026-11', '2026-11-10', alta, [...historico, panorama('2026-11', alta)]))
    ).toContain('categoria-7')

    const pequena = base(11000)
    expect(
      ids(insights('2026-11', '2026-11-10', pequena, [...historico, panorama('2026-11', pequena)]))
    ).not.toContain('categoria-7')

    expect(ids(insights('2026-11', '2026-11-10', alta, [panorama('2026-11', alta)]))).not.toContain(
      'categoria-7'
    )
  })

  it('despesa que começou há pouco não é tratada como gasto fora do normal', () => {
    const curso = (valor: number) => [item('compromisso', valor, { categoriaId: 8, data: '2026-11-20' })]
    const outra = [item('compromisso', 10000, { categoriaId: 9, data: '2026-11-20' })]
    const meses = [
      panorama('2026-08', outra),
      panorama('2026-09', [...outra, ...curso(48000)]),
      panorama('2026-10', [...outra, ...curso(48000)])
    ]
    const atual = [...outra, ...curso(48000)]
    expect(
      ids(insights('2026-11', '2026-11-10', atual, [...meses, panorama('2026-11', atual)]))
    ).not.toContain('categoria-8')
  })

  it('avisa quando a reserva de lazer está no fim e quando passa', () => {
    const quase = item('lazer', 10000)
    const usoQuase = item('gasto_livre', 9000, { reservaSerieId: quase.serieId, data: '2026-11-20' })
    const renda = item('receita', 900000, { data: '2026-11-20' })
    const lista = [renda, quase, usoQuase]
    expect(insights('2026-11', '2026-11-01', lista, [panorama('2026-11', lista)])[0]?.titulo).toContain(
      'quase no fim'
    )
    const passou = item('lazer', 10000)
    const usoPassou = item('gasto_livre', 12000, { reservaSerieId: passou.serieId, data: '2026-11-20' })
    const outra = [renda, passou, usoPassou]
    expect(insights('2026-11', '2026-11-01', outra, [panorama('2026-11', outra)])[0]?.titulo).toContain(
      'ultrapassada'
    )
  })

  it('celebra parcela perto do fim e soma as que terminam juntas', () => {
    const parcela = (nome: string, ultimoMes: string) =>
      item('compromisso', 25000, { nome, repeticao: 'parcelado', ultimoMes, data: '2026-11-20' })
    const itens = [
      parcela('Celular', '2027-01'),
      parcela('TV', '2027-01'),
      parcela('Sofá', '2027-02'),
      parcela('Carro', '2029-01')
    ]
    const alerta = insights('2026-11', '2026-11-10', itens, [panorama('2026-11', itens)]).find(
      (i) => i.id === 'parcelas'
    )
    expect(alerta).toMatchObject({ nivel: 'bom', titulo: 'Parcela termina em 01/2027' })
    expect(alerta?.detalhe).toContain('Celular, TV')
    expect(alerta?.detalhe).toContain('R$ 500,00')
    expect(alerta?.detalhe).toContain('02/2027')
  })

  it('avisa de um mês futuro negativo', () => {
    const atual = [item('receita', 100000)]
    const futuro = panorama('2027-02', [item('compromisso', 5000, { data: '2027-02-10' })])
    const lista = insights('2026-11', '2026-11-10', atual, [panorama('2026-11', atual), futuro])
    expect(lista[0]).toMatchObject({ id: 'mes-futuro', titulo: '02/2027 fica no negativo' })
  })

  it('mostra no máximo cinco alertas, com os críticos primeiro', () => {
    const itens = [
      item('compromisso', 10000, { data: '2026-11-02' }),
      ...Array.from({ length: 8 }, () => {
        const reserva = item('lazer', 100)
        return [reserva, item('gasto_livre', 500, { reservaSerieId: reserva.serieId, data: '2026-11-20' })]
      }).flat()
    ]
    const lista = insights('2026-11', '2026-11-10', itens, [panorama('2026-11', itens)])
    expect(lista).toHaveLength(5)
    expect(lista[0]?.nivel).toBe('critico')
  })
})

describe('simulador de compra', () => {
  const meses = ['2026-11', '2026-12', '2027-01', '2027-02', '2027-03'].map((mes) =>
    panorama(mes, [item('receita', 100000), item('compromisso', 40000)])
  )

  it('compra à vista afeta só o mês escolhido', () => {
    const s = simularCompra(meses, { mesInicial: '2026-12', valorCentavos: 10000, parcelas: 1 })!
    expect(s.meses.map((m) => m.depoisCentavos)).toEqual([50000, 60000, 60000])
    expect(s.meses.map((m) => m.antesCentavos)).toEqual([60000, 60000, 60000])
    expect(s.veredito).toBe('cabe')
  })

  it('parcelas atravessam o ano e afetam a quantidade certa de meses', () => {
    const s = simularCompra(meses, { mesInicial: '2026-12', valorCentavos: 10000, parcelas: 3 })!
    expect(s.meses.map((m) => [m.mes, m.depoisCentavos])).toEqual([
      ['2026-12', 50000],
      ['2027-01', 50000],
      ['2027-02', 50000]
    ])
  })

  it('não cabe quando algum mês fica negativo, e aponta o pior', () => {
    const s = simularCompra(meses, { mesInicial: '2026-11', valorCentavos: 70000, parcelas: 1 })!
    expect(s.veredito).toBe('nao_cabe')
    expect(s.piorMes).toMatchObject({ mes: '2026-11', depoisCentavos: -10000 })
  })

  it('aperta quando sobra menos de 10% da renda', () => {
    const s = simularCompra(meses, { mesInicial: '2026-11', valorCentavos: 55000, parcelas: 1 })!
    expect(s.veredito).toBe('aperta')
  })

  it('informa parcelas além do horizonte conhecido', () => {
    const s = simularCompra(meses, { mesInicial: '2027-02', valorCentavos: 100, parcelas: 6 })!
    expect(s.meses).toHaveLength(2)
    expect(s.parcelasForaDoHorizonte).toBe(4)
  })

  it('não inventa resultado sem meses disponíveis', () => {
    expect(simularCompra(meses, { mesInicial: '2030-01', valorCentavos: 1, parcelas: 1 })).toBeNull()
  })
})
