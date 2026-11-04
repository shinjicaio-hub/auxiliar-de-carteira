import { useMemo, useState, type ReactNode } from 'react'
import {
  contasDoMes,
  distribuicaoRenda,
  gastoDoMes,
  gerarInsights,
  mediaAnterior,
  ritmoDoMes,
  type IdParte,
  type Insight,
  type PanoramaMes
} from '../../../shared/analise'
import { formatarData, formatarMes, formatarMesEixo, somarMeses } from '../../../shared/datas'
import { formatarReais } from '../../../shared/dinheiro'
import type { Ocorrencia, ResumoMensal } from '../../../shared/tipos'
import { chamar, useDados } from '../api'
import { Aviso, Valor } from '../componentes/Basicos'
import { DialogoRealizado } from '../componentes/DialogosOcorrencia'
import {
  BarraSegmentada,
  GraficoMeses,
  Legenda,
  Medidor,
  VerComoTabela,
  type ParteBarra,
  type Serie
} from '../componentes/Graficos'
import { IconeAlerta, IconeBom, IconeCritico } from '../componentes/Icones'

const CORES: Record<IdParte, string> = {
  compromissos: 'var(--serie-1)',
  gastos: 'var(--serie-2)',
  lazer: 'var(--serie-3)',
  investimento: 'var(--serie-4)',
  livre: 'var(--serie-neutra)'
}

const SERIES_MESES: Serie[] = [
  { id: 'compromissos', rotulo: 'Compromissos', cor: CORES.compromissos, forma: 'barra' },
  { id: 'gastos', rotulo: 'Gastos livres', cor: CORES.gastos, forma: 'barra' },
  { id: 'lazer', rotulo: 'Lazer', cor: CORES.lazer, forma: 'barra' },
  { id: 'investimento', rotulo: 'Investimento', cor: CORES.investimento, forma: 'barra' },
  { id: 'renda', rotulo: 'Renda', cor: 'var(--texto)', forma: 'linha' }
]

const MAXIMO_CATEGORIAS = 6

function Quadro({
  titulo,
  children,
  acao,
  classe
}: {
  titulo: string
  children: ReactNode
  acao?: ReactNode
  classe?: string
}) {
  return (
    <section className={classe ? `painel ${classe}` : 'painel'}>
      <div className="painel-topo">
        <h3>{titulo}</h3>
        {acao}
      </div>
      {children}
    </section>
  )
}

function Destaque({ r, hoje }: { r: ResumoMensal; hoje: string }) {
  const ritmo = ritmoDoMes(r, hoje)
  const negativo = r.restanteLivreCentavos < 0
  const usado = r.orcamentoLivreCentavos - r.restanteLivreCentavos
  const percentual =
    r.orcamentoLivreCentavos > 0 ? Math.round((usado / r.orcamentoLivreCentavos) * 100) : null

  return (
    <section className="painel destaque">
      <div>
        <p className="rotulo-destaque">{negativo ? 'Passou do orçamento' : 'Ainda posso gastar'}</p>
        <p className="valor-destaque" data-testid="restante-livre">
          {formatarReais(r.restanteLivreCentavos)}
        </p>
        <p className="apoio-destaque">
          de <Valor centavos={r.orcamentoLivreCentavos} /> de orçamento livre
        </p>
      </div>
      <div className="destaque-medidor">
        {ritmo && (
          <div className="ritmo">
            <span className="ritmo-valor">{formatarReais(ritmo.porDiaCentavos)}</span>
            <span className="ritmo-rotulo">
              por dia, {ritmo.diasRestantes === 1 ? 'só hoje' : `nos ${ritmo.diasRestantes} dias que faltam`}
            </span>
          </div>
        )}
        {r.orcamentoLivreCentavos > 0 && (
          <>
            <Medidor usado={usado} limite={r.orcamentoLivreCentavos} rotulo="Orçamento livre usado" />
            <p className="nota-medidor">{percentual}% do orçamento livre já usado</p>
          </>
        )}
      </div>
    </section>
  )
}

function Indicadores({ atual, media }: { atual: PanoramaMes; media: number | null }) {
  const r = atual.resumo
  const gasto = gastoDoMes(atual)
  const diferenca = media ? Math.round(((gasto - media) / media) * 100) : null

  return (
    <div className="grade-cartoes">
      <section className="cartao">
        <h3>Vou receber</h3>
        <p className="valor-cartao">
          <Valor centavos={r.renda.consideradoCentavos} forte />
        </p>
        <p className="apoio-cartao">
          {formatarReais(r.renda.realizadoCentavos)} recebido
        </p>
      </section>
      <section className="cartao">
        <h3>Gasto do mês</h3>
        <p className="valor-cartao">
          <Valor centavos={gasto} forte />
        </p>
        <p className="apoio-cartao">
          Saiu {formatarReais(atual.pagoCentavos)} · falta {formatarReais(atual.pendenteCentavos)}
        </p>
        {diferenca !== null && diferenca !== 0 && (
          <p className="apoio-cartao">
            {diferenca > 0 ? '↑' : '↓'} {Math.abs(diferenca)}% {diferenca > 0 ? 'acima' : 'abaixo'} da
            média recente
          </p>
        )}
      </section>
      <section className="cartao">
        <h3>Para investir</h3>
        <p className="valor-cartao">
          <Valor centavos={r.investimento.reservadoCentavos} forte />
        </p>
        <p className="apoio-cartao">
          {formatarReais(r.investimento.utilizadoCentavos + r.aportesSemReservaCentavos)} aplicado
        </p>
      </section>
      <section className="cartao">
        <h3>Lazer planejado</h3>
        <p className="valor-cartao">
          <Valor centavos={r.lazer.reservadoCentavos} forte />
        </p>
        <p className="apoio-cartao">{formatarReais(r.lazer.restanteCentavos)} disponível</p>
      </section>
    </div>
  )
}

const ICONES_INSIGHT = { critico: IconeCritico, atencao: IconeAlerta, bom: IconeBom }
const ROTULOS_INSIGHT = { critico: 'Importante', atencao: 'Atenção', bom: 'Boa notícia' }

function Alertas({ insights }: { insights: Insight[] }) {
  return (
    <Quadro titulo="O que merece atenção">
      {insights.length === 0 ? (
        <p className="tudo-certo">
          <IconeBom /> Tudo em ordem neste mês.
        </p>
      ) : (
        <ul className="lista-insights">
          {insights.map((i) => {
            const Icone = ICONES_INSIGHT[i.nivel]
            return (
              <li key={i.id} className={`insight insight-${i.nivel}`}>
                <span className="insight-icone" title={ROTULOS_INSIGHT[i.nivel]}>
                  <Icone />
                </span>
                <div>
                  <strong>{i.titulo}</strong>
                  <p>{i.detalhe}</p>
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </Quadro>
  )
}

function Contas({
  ocorrencias,
  hoje,
  aoAbrirLista,
  aoRegistrar
}: {
  ocorrencias: Ocorrencia[]
  hoje: string
  aoAbrirLista: () => void
  aoRegistrar: (o: Ocorrencia) => void
}) {
  const { atrasadas, aVencer } = contasDoMes(ocorrencias, hoje)
  const lista = [...atrasadas, ...aVencer]
  const visiveis = lista.slice(0, 6)
  return (
    <Quadro
      titulo="Próximas contas"
      acao={
        lista.length > visiveis.length && (
          <button type="button" className="botao-link" onClick={aoAbrirLista}>
            Ver todas ({lista.length})
          </button>
        )
      }
    >
      {lista.length === 0 ? (
        <p className="tudo-certo">
          <IconeBom /> Nada pendente neste mês.
        </p>
      ) : (
        <ul className="lista-contas">
          {visiveis.map((o) => {
            const atrasada = o.data < hoje
            return (
              <li key={o.serieId}>
                <div className="conta-data">
                  {formatarData(o.data).slice(0, 5)}
                  {atrasada && o.tipo !== 'receita' && <span className="selo-atraso">Vencida</span>}
                </div>
                <div className="conta-nome">{o.nome}</div>
                <div className="numero">
                  {o.tipo === 'receita' && '+ '}
                  <Valor centavos={o.previstoCentavos} />
                </div>
                <button
                  type="button"
                  className="botao botao-pequeno"
                  onClick={() => aoRegistrar(o)}
                >
                  {o.tipo === 'receita' ? 'Receber' : 'Pagar'}
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </Quadro>
  )
}

function Calculo({ r }: { r: ResumoMensal }) {
  const excedente = r.lazer.excedenteCentavos + r.investimento.excedenteCentavos
  const linha = (rotulo: string, centavos: number, total?: boolean) => (
    <tr className={total ? 'linha-total' : undefined}>
      <td>{rotulo}</td>
      <td className="numero">
        <Valor centavos={centavos} forte={total} />
      </td>
    </tr>
  )
  return (
    <details className="ver-tabela">
      <summary>Como chegamos nesse valor</summary>
      <table className="tabela tabela-calculo">
        <tbody>
          {linha('Renda do mês', r.renda.consideradoCentavos)}
          {linha('− Compromissos', r.compromissos.consideradoCentavos)}
          {linha('− Investimento reservado', r.investimento.reservadoCentavos)}
          {linha('− Lazer planejado', r.lazer.reservadoCentavos)}
          {linha('= Orçamento livre', r.orcamentoLivreCentavos, true)}
          {linha('− Gastos livres', r.gastosLivresCentavos)}
          {excedente > 0 && linha('− Uso acima das reservas', excedente)}
          {r.aportesSemReservaCentavos > 0 &&
            linha('− Aportes sem reserva', r.aportesSemReservaCentavos)}
          {linha('= Ainda posso gastar', r.restanteLivreCentavos, true)}
        </tbody>
      </table>
      <p className="nota">
        Valores realizados substituem os previstos. Isto é planejamento, não o saldo da sua conta
        bancária.
      </p>
    </details>
  )
}

function ParaOndeVai({ r }: { r: ResumoMensal }) {
  const partes: ParteBarra[] = distribuicaoRenda(r).map((p) => ({
    ...p,
    cor: CORES[p.id],
    corTexto: p.id === 'livre' ? 'var(--texto)' : p.id === 'investimento' ? '#0b0b0b' : '#ffffff'
  }))
  return (
    <Quadro titulo="Para onde vai sua renda">
      <BarraSegmentada
        partes={partes}
        rotulo={partes
          .filter((p) => p.centavos > 0)
          .map((p) => `${p.rotulo}: ${formatarReais(p.centavos)}`)
          .join('; ')}
      />
      <Calculo r={r} />
    </Quadro>
  )
}

function PorCategoria({
  atual,
  nomeCategoria
}: {
  atual: PanoramaMes
  nomeCategoria: (id: number | null) => string
}) {
  const principais = atual.categorias.slice(0, MAXIMO_CATEGORIAS)
  const resto = atual.categorias.slice(MAXIMO_CATEGORIAS)
  const linhas = principais.map((c) => ({
    chave: String(c.categoriaId),
    nome: nomeCategoria(c.categoriaId),
    pago: c.pagoCentavos,
    pendente: c.pendenteCentavos
  }))
  if (resto.length > 0) {
    linhas.push({
      chave: 'outras',
      nome: `Outras (${resto.length})`,
      pago: resto.reduce((t, c) => t + c.pagoCentavos, 0),
      pendente: resto.reduce((t, c) => t + c.pendenteCentavos, 0)
    })
  }
  const maior = Math.max(...linhas.map((l) => l.pago + l.pendente), 1)

  return (
    <Quadro titulo="Gastos por categoria">
      {linhas.length === 0 ? (
        <p className="nota">Nenhum gasto neste mês.</p>
      ) : (
        <>
          <Legenda
            series={[
              { id: 'pago', rotulo: 'Já saiu', cor: 'var(--tom-forte)', forma: 'barra' },
              { id: 'pendente', rotulo: 'A sair', cor: 'var(--tom-fraco)', forma: 'barra' }
            ]}
          />
          <ul className="barras-categoria">
            {linhas.map((l) => {
              const total = l.pago + l.pendente
              return (
                <li key={l.chave}>
                  <span className="categoria-nome">{l.nome}</span>
                  <span
                    className="categoria-barra"
                    style={{ width: `${(total / maior) * 100}%` }}
                    title={`${formatarReais(l.pago)} já saiu, ${formatarReais(l.pendente)} a sair`}
                  >
                    {l.pago > 0 && <i className="tom-forte" style={{ flexGrow: l.pago }} />}
                    {l.pendente > 0 && <i className="tom-fraco" style={{ flexGrow: l.pendente }} />}
                  </span>
                  <span className="categoria-valor">
                    <Valor centavos={total} />
                  </span>
                </li>
              )
            })}
          </ul>
        </>
      )}
    </Quadro>
  )
}

function Reservas({ r }: { r: ResumoMensal }) {
  return (
    <Quadro titulo="Reservas do mês">
      {r.reservas.length === 0 ? (
        <p className="nota">
          Nenhuma reserva neste mês. Em Planejar, separe dinheiro para lazer ou uma compra.
        </p>
      ) : (
        <ul className="lista-reservas">
          {r.reservas.map((x) => (
            <li key={x.serieId}>
              <div className="reserva-topo">
                <span>{x.nome}</span>
                <span>
                  <Valor centavos={x.utilizadoCentavos} /> de{' '}
                  <Valor centavos={x.reservadoCentavos} />
                </span>
              </div>
              <Medidor
                usado={x.utilizadoCentavos}
                limite={x.reservadoCentavos}
                rotulo={`Uso da reserva ${x.nome}`}
              />
              <p className="nota-medidor">
                {x.excedenteCentavos > 0
                  ? `${formatarReais(x.excedenteCentavos)} acima do reservado`
                  : `Resta ${formatarReais(x.restanteCentavos)}`}
              </p>
            </li>
          ))}
        </ul>
      )}
    </Quadro>
  )
}

function Evolucao({ meses, mes, mesAtual }: { meses: PanoramaMes[]; mes: string; mesAtual: string }) {
  const fim = somarMeses(mes, 6)
  // Meses antes do primeiro registro não são "renda zero": apenas não têm dados.
  const primeiro = meses.find(
    (m) => m.resumo.renda.consideradoCentavos > 0 || gastoDoMes(m) > 0 || m.mes === mes
  )!.mes
  const visiveis = meses.filter((m) => m.mes >= primeiro && m.mes <= fim)
  const dados = visiveis.map((m) => {
    const partes = distribuicaoRenda(m.resumo).filter((p) => p.id !== 'livre')
    return {
      mes: m.mes,
      linha: m.resumo.renda.consideradoCentavos,
      colunas: [partes.map((p) => ({ serieId: p.id, centavos: p.centavos }))]
    }
  })
  return (
    <Quadro titulo="Meses anteriores e próximos">
      <p className="subtitulo">
        O que já está comprometido nos próximos meses, comparado com a renda.
      </p>
      <Legenda series={SERIES_MESES} />
      <GraficoMeses
        meses={dados}
        series={SERIES_MESES}
        mesAtual={mesAtual}
        rotulo="Saídas de cada mês comparadas com a renda"
      />
      <VerComoTabela>
        <table className="tabela">
          <thead>
            <tr>
              <th>Mês</th>
              <th className="numero">Renda</th>
              <th className="numero">Saídas</th>
              <th className="numero">Sobra</th>
            </tr>
          </thead>
          <tbody>
            {visiveis.map((m) => (
              <tr key={m.mes}>
                <td>{formatarMesEixo(m.mes)}</td>
                <td className="numero">
                  <Valor centavos={m.resumo.renda.consideradoCentavos} />
                </td>
                <td className="numero">
                  <Valor
                    centavos={m.resumo.renda.consideradoCentavos - m.resumo.restanteLivreCentavos}
                  />
                </td>
                <td className="numero">
                  <Valor centavos={m.resumo.restanteLivreCentavos} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </VerComoTabela>
    </Quadro>
  )
}

export function Resumo({
  mes,
  hoje,
  mesAtual,
  chave,
  aoAlterar,
  aoComecar,
  aoAbrirLancamentos
}: {
  mes: string
  hoje: string
  mesAtual: string
  chave: number
  aoAlterar: () => void
  aoComecar: () => void
  aoAbrirLancamentos: () => void
}) {
  const { dados, erro } = useDados(async () => {
    const [panorama, ocorrencias, categorias] = await Promise.all([
      chamar('panorama', mes),
      chamar('listarMes', mes),
      chamar('listarCategorias')
    ])
    return { mes, panorama, ocorrencias, categorias }
  }, `${mes}:${chave}`)
  const [registrando, setRegistrando] = useState<Ocorrencia | null>(null)

  const nomeCategoria = useMemo(() => {
    const nomes = new Map((dados?.categorias ?? []).map((c) => [c.id, c.nome]))
    return (id: number | null) => (id !== null && nomes.get(id)) || 'Sem categoria'
  }, [dados])

  if (erro) return <Aviso tipo="erro">{erro}</Aviso>
  if (!dados) return null

  // Ao trocar de mês, a tela anterior fica visível até os dados novos chegarem:
  // tudo abaixo usa o mês dos dados carregados, nunca o mês já selecionado.
  const { mes: mesDados, panorama, ocorrencias } = dados
  const atual = panorama.meses.find((m) => m.mes === mesDados)!

  if (ocorrencias.length === 0) {
    return (
      <div className="vazio">
        <h3>Nada planejado para {formatarMes(mesDados)}</h3>
        <p>
          Cadastre sua renda e seus compromissos. O que for recorrente ou parcelado aparece sozinho
          nos meses seguintes.
        </p>
        <button type="button" className="botao botao-primario" onClick={aoComecar}>
          Cadastrar renda e despesas fixas
        </button>
      </div>
    )
  }

  const insights = gerarInsights({
    mes: mesDados,
    hoje,
    ocorrencias,
    meses: panorama.meses,
    nomeCategoria
  })

  return (
    <div className="pilha">
      <Destaque r={atual.resumo} hoje={hoje} />
      <Indicadores atual={atual} media={mediaAnterior(panorama.meses, mesDados)} />
      <div className="duas-colunas">
        <Alertas insights={insights} />
        <Contas
          ocorrencias={ocorrencias}
          hoje={hoje}
          aoAbrirLista={aoAbrirLancamentos}
          aoRegistrar={setRegistrando}
        />
      </div>
      <ParaOndeVai r={atual.resumo} />
      <div className="duas-colunas">
        <PorCategoria atual={atual} nomeCategoria={nomeCategoria} />
        <Reservas r={atual.resumo} />
      </div>
      <Evolucao meses={panorama.meses} mes={mesDados} mesAtual={mesAtual} />

      {registrando && (
        <DialogoRealizado
          ocorrencia={registrando}
          aoFechar={() => setRegistrando(null)}
          aoSalvar={() => {
            setRegistrando(null)
            aoAlterar()
          }}
        />
      )}
    </div>
  )
}
