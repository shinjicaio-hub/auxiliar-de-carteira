import { useMemo, useState, type FormEvent } from 'react'
import { simularCompra, type Simulacao, type Veredito } from '../../../shared/analise'
import {
  formatarData,
  formatarMes,
  formatarMesCurto,
  formatarMesEixo,
  mesDaData,
  somarMeses
} from '../../../shared/datas'
import { formatarReais, reaisParaCentavos } from '../../../shared/dinheiro'
import { esquemaCriarLancamento, primeiraMensagem } from '../../../shared/esquemas'
import type { Ocorrencia } from '../../../shared/tipos'
import { chamar, mensagemDe, useDados } from '../api'
import { Aviso, Valor } from '../componentes/Basicos'
import { DialogoExcluir, DialogoRealizado } from '../componentes/DialogosOcorrencia'
import { FormRapido } from '../componentes/FormRapido'
import { GraficoMeses, Legenda, VerComoTabela, type Serie } from '../componentes/Graficos'
import { IconeAlerta, IconeBom, IconeCritico } from '../componentes/Icones'

type Natureza = 'lazer' | 'compra'

type Acao =
  | { tipo: 'usar'; ocorrencia: Ocorrencia }
  | { tipo: 'pagar' | 'excluir'; ocorrencia: Ocorrencia }

const SERIES: Serie[] = [
  { id: 'antes', rotulo: 'Sem essa compra', cor: 'var(--serie-contexto)', forma: 'barra' },
  { id: 'depois', rotulo: 'Com essa compra', cor: 'var(--serie-1)', forma: 'barra' }
]

const VEREDITOS: Record<Veredito, { titulo: string; Icone: () => React.JSX.Element }> = {
  cabe: { titulo: 'Cabe no orçamento', Icone: IconeBom },
  aperta: { titulo: 'Cabe, mas fica apertado', Icone: IconeAlerta },
  nao_cabe: { titulo: 'Não cabe no orçamento', Icone: IconeCritico }
}

function Resultado({ s }: { s: Simulacao }) {
  const { titulo, Icone } = VEREDITOS[s.veredito]
  const { mes, depoisCentavos } = s.piorMes
  return (
    <div className="resultado-simulacao" data-testid="veredito">
      <div className={`veredito veredito-${s.veredito}`}>
        <Icone />
        <div>
          <strong>{titulo}</strong>
          <p>
            {depoisCentavos < 0
              ? `Em ${formatarMesCurto(mes)} faltariam ${formatarReais(-depoisCentavos)}.`
              : `O mês mais justo é ${formatarMesCurto(mes)}, com ${formatarReais(depoisCentavos)} livres.`}
          </p>
        </div>
      </div>
      <Legenda series={SERIES} />
      <GraficoMeses
        altura={220}
        series={SERIES}
        rotulo="Dinheiro livre de cada mês, sem e com a compra"
        meses={s.meses.map((m) => ({
          mes: m.mes,
          colunas: [
            [{ serieId: 'antes', centavos: m.antesCentavos }],
            [{ serieId: 'depois', centavos: m.depoisCentavos }]
          ]
        }))}
      />
      {s.parcelasForaDoHorizonte > 0 && (
        <p className="nota">
          Mais {s.parcelasForaDoHorizonte} parcela(s) além dos meses mostrados.
        </p>
      )}
      <VerComoTabela>
        <table className="tabela">
          <thead>
            <tr>
              <th>Mês</th>
              <th className="numero">Sem a compra</th>
              <th className="numero">Com a compra</th>
            </tr>
          </thead>
          <tbody>
            {s.meses.map((m) => (
              <tr key={m.mes}>
                <td>{formatarMesEixo(m.mes)}</td>
                <td className="numero">
                  <Valor centavos={m.antesCentavos} />
                </td>
                <td className="numero">
                  <Valor centavos={m.depoisCentavos} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </VerComoTabela>
    </div>
  )
}

export function Planejar({
  mes,
  hoje,
  chave,
  aoAlterar
}: {
  mes: string
  hoje: string
  chave: number
  aoAlterar: () => void
}) {
  const { dados, erro } = useDados(async () => {
    const [panorama, categorias] = await Promise.all([
      chamar('panorama', mes),
      chamar('listarCategorias')
    ])
    return { panorama, categorias }
  }, `${mes}:${chave}`)

  const [natureza, setNatureza] = useState<Natureza>('compra')
  const [nome, setNome] = useState('')
  const [valor, setValor] = useState('')
  const [parcelas, setParcelas] = useState('1')
  const [mesPlano, setMesPlano] = useState(mes)
  const [categoriaId, setCategoriaId] = useState('')
  const [retorno, setRetorno] = useState<{ tipo: 'erro' | 'sucesso'; texto: string } | null>(null)
  const [acao, setAcao] = useState<Acao | null>(null)

  const opcoesMes = useMemo(
    () => Array.from({ length: 12 }, (_, i) => somarMeses(mes, i)),
    [mes]
  )
  const mesEscolhido = opcoesMes.includes(mesPlano) ? mesPlano : mes

  const valorCentavos = reaisParaCentavos(valor)
  const numeroParcelas = Number(parcelas)
  const parcelasValidas =
    Number.isInteger(numeroParcelas) && numeroParcelas >= 1 && numeroParcelas <= 600
  const parcelado = parcelasValidas && numeroParcelas > 1

  const simulacao = useMemo(() => {
    if (!dados || !valorCentavos || !parcelasValidas) return null
    return simularCompra(dados.panorama.meses, {
      mesInicial: mesEscolhido,
      valorCentavos,
      parcelas: numeroParcelas
    })
  }, [dados, valorCentavos, parcelasValidas, numeroParcelas, mesEscolhido])

  async function salvarPlano(e: FormEvent) {
    e.preventDefault()
    setRetorno(null)
    if (valorCentavos === null) {
      return setRetorno({ tipo: 'erro', texto: 'Informe o valor em reais, por exemplo 1.234,56.' })
    }
    if (!parcelasValidas) {
      return setRetorno({ tipo: 'erro', texto: 'Informe o número de parcelas.' })
    }
    const r = esquemaCriarLancamento.safeParse({
      tipo: parcelado ? 'compromisso' : natureza === 'lazer' ? 'lazer' : 'gasto_livre',
      repeticao: parcelado ? 'parcelado' : 'unico',
      nome,
      valorCentavos,
      data: mesDaData(hoje) === mesEscolhido ? hoje : `${mesEscolhido}-01`,
      categoriaId: categoriaId ? Number(categoriaId) : null,
      formaPagamento: null,
      fatura: null,
      reservaSerieId: null,
      observacao: null,
      parcelaInicial: parcelado ? 1 : null,
      parcelasTotal: parcelado ? numeroParcelas : null,
      jaRealizado: false
    })
    if (!r.success) return setRetorno({ tipo: 'erro', texto: primeiraMensagem(r.error) })

    try {
      await chamar('criarLancamento', r.data)
      setRetorno({ tipo: 'sucesso', texto: `"${r.data.nome}" foi adicionado ao seu planejamento.` })
      setNome('')
      setValor('')
      setParcelas('1')
      aoAlterar()
    } catch (falha) {
      setRetorno({ tipo: 'erro', texto: mensagemDe(falha) })
    }
  }

  function concluir() {
    setAcao(null)
    aoAlterar()
  }

  if (erro) return <Aviso tipo="erro">{erro}</Aviso>
  if (!dados) return null

  const { planejados } = dados.panorama
  const usoPorReserva = new Map(
    dados.panorama.meses.flatMap((m) =>
      m.resumo.reservas.map((x) => [`${x.serieId}-${m.mes}`, x] as const)
    )
  )
  const porMes = new Map<string, Ocorrencia[]>()
  for (const o of planejados) porMes.set(o.mes, [...(porMes.get(o.mes) ?? []), o])

  return (
    <div className="pilha">
      <div className="grade-simulador">
        <form className="painel" onSubmit={salvarPlano} noValidate>
          <h3>Posso comprar?</h3>
          <p className="subtitulo">Teste um gasto antes de decidir. Nada é salvo até você pedir.</p>

          {retorno && <Aviso tipo={retorno.tipo}>{retorno.texto}</Aviso>}

          <div className="grade-form margem-form">
            <div className="campo">
              <label htmlFor="plano-valor">
                {parcelado ? 'Valor de cada parcela (R$)' : 'Valor (R$)'}
              </label>
              <input
                id="plano-valor"
                inputMode="decimal"
                placeholder="0,00"
                value={valor}
                onChange={(e) => setValor(e.target.value)}
              />
            </div>
            <div className="campo">
              <label htmlFor="plano-parcelas">Parcelas</label>
              <input
                id="plano-parcelas"
                type="number"
                min={1}
                max={600}
                value={parcelas}
                onChange={(e) => setParcelas(e.target.value)}
              />
            </div>
            {parcelado && valorCentavos !== null && (
              <p className="nota-form campo-inteiro">
                Total da compra:{' '}
                <strong>{formatarReais(valorCentavos * numeroParcelas)}</strong>
              </p>
            )}
            <div className="campo">
              <label htmlFor="plano-mes">{parcelado ? 'Primeira parcela em' : 'Em que mês?'}</label>
              <select
                id="plano-mes"
                value={mesEscolhido}
                onChange={(e) => setMesPlano(e.target.value)}
              >
                {opcoesMes.map((m) => (
                  <option key={m} value={m}>
                    {formatarMes(m)}
                  </option>
                ))}
              </select>
            </div>
            <div className="campo">
              <label htmlFor="plano-categoria">Categoria</label>
              <select
                id="plano-categoria"
                value={categoriaId}
                onChange={(e) => setCategoriaId(e.target.value)}
              >
                <option value="">Sem categoria</option>
                {dados.categorias
                  .filter((c) => c.ativa)
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nome}
                    </option>
                  ))}
              </select>
            </div>
            {!parcelado && (
              <fieldset className="grupo-escopo campo-inteiro">
                <legend>O que é?</legend>
                <label className="opcao">
                  <input
                    type="radio"
                    name="natureza"
                    checked={natureza === 'compra'}
                    onChange={() => setNatureza('compra')}
                  />
                  Compra isolada
                </label>
                <label className="opcao">
                  <input
                    type="radio"
                    name="natureza"
                    checked={natureza === 'lazer'}
                    onChange={() => setNatureza('lazer')}
                  />
                  Lazer (reserva o dinheiro para usar aos poucos)
                </label>
              </fieldset>
            )}
            <div className="campo campo-inteiro">
              <label htmlFor="plano-nome">Nome, para guardar no planejamento</label>
              <input
                id="plano-nome"
                maxLength={120}
                placeholder="Ex.: Viagem para a praia, Tênis novo"
                value={nome}
                onChange={(e) => setNome(e.target.value)}
              />
            </div>
          </div>
          <div className="acoes-dialogo">
            <button type="submit" className="botao botao-primario">
              Adicionar ao planejamento
            </button>
          </div>
        </form>

        <section className="painel">
          <h3>Impacto no dinheiro livre</h3>
          {simulacao ? (
            <Resultado s={simulacao} />
          ) : (
            <div className="vazio-interno">
              <p>Digite um valor e o resultado aparece aqui.</p>
            </div>
          )}
        </section>
      </div>

      <section className="painel">
        <h3>Gastos planejados</h3>
        {planejados.length === 0 ? (
          <p className="nota">
            Nada planejado a partir de {formatarMes(mes)}. Use o quadro acima para separar dinheiro
            para lazer ou uma compra pontual.
          </p>
        ) : (
          <table className="tabela">
            <thead>
              <tr>
                <th>Nome</th>
                <th>Data</th>
                <th>Tipo</th>
                <th className="numero">Valor</th>
                <th>Ações</th>
              </tr>
            </thead>
            {[...porMes.entries()].map(([grupo, itens]) => (
              <tbody key={grupo}>
                <tr className="linha-grupo">
                  <td colSpan={3}>{formatarMes(grupo)}</td>
                  <td className="numero">
                    <Valor centavos={itens.reduce((t, o) => t + o.previstoCentavos, 0)} forte />
                  </td>
                  <td />
                </tr>
                {itens.map((o) => {
                  const uso = usoPorReserva.get(`${o.serieId}-${o.mes}`)
                  return (
                    <tr key={o.serieId}>
                      <td className="nome-item">{o.nome}</td>
                      <td className="sem-quebra">{formatarData(o.data)}</td>
                      <td>{o.tipo === 'lazer' ? 'Lazer reservado' : 'Compra isolada'}</td>
                      <td className="numero">
                        <Valor centavos={o.previstoCentavos} />
                        {uso && (
                          <div className="nota-celula">
                            resta {formatarReais(uso.restanteCentavos)}
                          </div>
                        )}
                      </td>
                      <td>
                        <div className="acoes-linha">
                          <button
                            type="button"
                            className="botao botao-pequeno"
                            onClick={() =>
                              setAcao({
                                tipo: o.tipo === 'lazer' ? 'usar' : 'pagar',
                                ocorrencia: o
                              })
                            }
                          >
                            {o.tipo === 'lazer' ? 'Usar' : 'Aconteceu'}
                          </button>
                          <button
                            type="button"
                            className="botao botao-pequeno botao-texto-perigo"
                            onClick={() => setAcao({ tipo: 'excluir', ocorrencia: o })}
                          >
                            Excluir
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            ))}
          </table>
        )}
      </section>

      {acao?.tipo === 'usar' && (
        <FormRapido
          mes={acao.ocorrencia.mes}
          hoje={hoje}
          reservaInicial={acao.ocorrencia.serieId}
          aoFechar={() => setAcao(null)}
          aoSalvar={concluir}
        />
      )}
      {acao?.tipo === 'pagar' && (
        <DialogoRealizado
          ocorrencia={acao.ocorrencia}
          aoFechar={() => setAcao(null)}
          aoSalvar={concluir}
        />
      )}
      {acao?.tipo === 'excluir' && (
        <DialogoExcluir
          ocorrencia={acao.ocorrencia}
          aoFechar={() => setAcao(null)}
          aoSalvar={concluir}
        />
      )}
    </div>
  )
}
