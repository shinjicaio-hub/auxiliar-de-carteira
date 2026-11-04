import { useMemo, useState } from 'react'
import { formatarData, formatarMes, formatarMesCurto } from '../../../shared/datas'
import { formatarReais } from '../../../shared/dinheiro'
import {
  ehReserva,
  REPETICOES,
  ROTULOS_FORMA,
  ROTULOS_REPETICAO,
  ROTULOS_TIPO,
  TIPOS,
  type Categoria,
  type Ocorrencia,
  type Repeticao,
  type Tipo
} from '../../../shared/tipos'
import { chamar, useDados } from '../api'
import { Aviso, Valor } from '../componentes/Basicos'
import {
  DialogoEncerrar,
  DialogoExcluir,
  DialogoRealizado
} from '../componentes/DialogosOcorrencia'
import { FormLancamento, type ValoresIniciais } from '../componentes/FormLancamento'

type Ordem = 'data' | 'nome' | 'categoria' | 'valor'

type Acao =
  | { tipo: 'novo'; iniciais?: ValoresIniciais }
  | { tipo: 'editar' | 'realizado' | 'excluir' | 'encerrar'; ocorrencia: Ocorrencia }

function Cabecalho({
  rotulo,
  campo,
  ordem,
  aoOrdenar,
  numero
}: {
  rotulo: string
  campo: Ordem
  ordem: Ordem
  aoOrdenar: (campo: Ordem) => void
  numero?: boolean
}) {
  return (
    <th className={numero ? 'numero' : undefined} aria-sort={ordem === campo ? 'ascending' : 'none'}>
      <button type="button" className="botao-ordem" onClick={() => aoOrdenar(campo)}>
        {rotulo}
        {ordem === campo ? ' ↓' : ''}
      </button>
    </th>
  )
}

export function Lancamentos({
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
    const [lista, categorias, resumo] = await Promise.all([
      chamar('listarMes', mes),
      chamar('listarCategorias'),
      chamar('resumoMes', mes)
    ])
    return { lista, categorias, resumo }
  }, `${mes}:${chave}`)

  const [busca, setBusca] = useState('')
  const [filtroTipo, setFiltroTipo] = useState<Tipo | ''>('')
  const [filtroCategoria, setFiltroCategoria] = useState('')
  const [filtroRepeticao, setFiltroRepeticao] = useState<Repeticao | ''>('')
  const [filtroFatura, setFiltroFatura] = useState('')
  const [ordem, setOrdem] = useState<Ordem>('data')
  const [acao, setAcao] = useState<Acao | null>(null)

  const lista = dados?.lista
  const categorias: Categoria[] = dados?.categorias ?? []
  const nomesCategoria = useMemo(
    () => new Map(categorias.map((c) => [c.id, c.nome])),
    [categorias]
  )
  const faturas = useMemo(
    () => [...new Set((lista ?? []).flatMap((o) => (o.fatura ? [o.fatura] : [])))].sort(),
    [lista]
  )

  const nomeCategoria = (o: Ocorrencia) =>
    o.categoriaId === null ? '' : (nomesCategoria.get(o.categoriaId) ?? '')

  const visiveis = useMemo(() => {
    const termo = busca.trim().toLocaleLowerCase('pt-BR')
    const filtrados = (lista ?? []).filter(
      (o) =>
        (!termo || o.nome.toLocaleLowerCase('pt-BR').includes(termo)) &&
        (!filtroTipo || o.tipo === filtroTipo) &&
        (!filtroCategoria || String(o.categoriaId) === filtroCategoria) &&
        (!filtroRepeticao || o.repeticao === filtroRepeticao) &&
        (!filtroFatura || o.fatura === filtroFatura)
    )
    const comparar: Record<Ordem, (a: Ocorrencia, b: Ocorrencia) => number> = {
      data: (a, b) => a.data.localeCompare(b.data),
      nome: (a, b) => a.nome.localeCompare(b.nome, 'pt-BR'),
      categoria: (a, b) => nomeCategoria(a).localeCompare(nomeCategoria(b), 'pt-BR'),
      valor: (a, b) => b.consideradoCentavos - a.consideradoCentavos
    }
    return [...filtrados].sort(comparar[ordem])
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lista, busca, filtroTipo, filtroCategoria, filtroRepeticao, filtroFatura, ordem, nomesCategoria])

  if (erro) return <Aviso tipo="erro">{erro}</Aviso>
  if (!dados || !lista) return null

  const usoPorReserva = new Map(dados.resumo.reservas.map((r) => [r.serieId, r]))
  const subtotalFatura = visiveis.reduce((soma, o) => soma + o.consideradoCentavos, 0)

  function limparFiltros() {
    setBusca('')
    setFiltroTipo('')
    setFiltroCategoria('')
    setFiltroRepeticao('')
    setFiltroFatura('')
  }

  function concluir() {
    setAcao(null)
    aoAlterar()
  }

  return (
    <div className="pilha">
      <div className="barra-ferramentas">
        <input
          className="busca"
          aria-label="Buscar por nome"
          placeholder="Buscar por nome"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
        />
        <select
          aria-label="Filtrar por tipo"
          value={filtroTipo}
          onChange={(e) => setFiltroTipo(e.target.value as Tipo | '')}
        >
          <option value="">Tipos</option>
          {TIPOS.map((t) => (
            <option key={t} value={t}>
              {ROTULOS_TIPO[t]}
            </option>
          ))}
        </select>
        <select
          aria-label="Filtrar por categoria"
          value={filtroCategoria}
          onChange={(e) => setFiltroCategoria(e.target.value)}
        >
          <option value="">Categorias</option>
          {categorias.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nome}
            </option>
          ))}
        </select>
        <select
          aria-label="Filtrar por repetição"
          value={filtroRepeticao}
          onChange={(e) => setFiltroRepeticao(e.target.value as Repeticao | '')}
        >
          <option value="">Repetição</option>
          {REPETICOES.map((r) => (
            <option key={r} value={r}>
              {ROTULOS_REPETICAO[r]}
            </option>
          ))}
        </select>
        {faturas.length > 0 && (
          <select
            aria-label="Filtrar por fatura"
            value={filtroFatura}
            onChange={(e) => setFiltroFatura(e.target.value)}
          >
            <option value="">Faturas</option>
            {faturas.map((f) => (
              <option key={f} value={f}>
                {f}
              </option>
            ))}
          </select>
        )}
        <button
          type="button"
          className="botao botao-primario empurrar-direita"
          onClick={() => setAcao({ tipo: 'novo' })}
        >
          Novo lançamento
        </button>
      </div>

      {lista.length === 0 ? (
        <div className="vazio">
          <h3>Nenhum lançamento em {formatarMes(mes)}</h3>
          <p>Comece cadastrando sua renda. Depois inclua compromissos, reservas e gastos.</p>
          <button
            type="button"
            className="botao botao-primario"
            onClick={() => setAcao({ tipo: 'novo', iniciais: { tipo: 'receita' } })}
          >
            Cadastrar receita
          </button>
        </div>
      ) : visiveis.length === 0 ? (
        <div className="vazio">
          <h3>Nenhum lançamento com esses filtros</h3>
          <button type="button" className="botao" onClick={limparFiltros}>
            Limpar filtros
          </button>
        </div>
      ) : (
        <div className="painel painel-tabela">
          <table className="tabela">
            <thead>
              <tr>
                <Cabecalho rotulo="Data" campo="data" ordem={ordem} aoOrdenar={setOrdem} />
                <Cabecalho rotulo="Nome" campo="nome" ordem={ordem} aoOrdenar={setOrdem} />
                <th>Tipo</th>
                <Cabecalho rotulo="Categoria" campo="categoria" ordem={ordem} aoOrdenar={setOrdem} />
                <th className="numero">Previsto</th>
                <Cabecalho rotulo="Realizado" campo="valor" ordem={ordem} aoOrdenar={setOrdem} numero />
                <th>Ações</th>
              </tr>
            </thead>
            <tbody>
              {visiveis.map((o) => {
                const reserva = ehReserva(o.tipo)
                const uso = usoPorReserva.get(o.serieId)
                return (
                  <tr key={`${o.serieId}-${o.mes}`}>
                    <td className="sem-quebra">{formatarData(o.data)}</td>
                    <td>
                      <div className="nome-item">{o.nome}</div>
                      <div className="etiquetas">
                        {o.repeticao === 'parcelado' && (
                          <span className="etiqueta">
                            Parcela {o.parcelaAtual}/{o.parcelasTotal}
                          </span>
                        )}
                        {o.repeticao === 'recorrente' && <span className="etiqueta">Recorrente</span>}
                        {o.repeticao === 'recorrente' && o.mesEncerramento && (
                          <span className="etiqueta">
                            Até {formatarMesCurto(o.mesEncerramento)}
                          </span>
                        )}
                        {o.editadaNoMes && <span className="etiqueta">Alterado neste mês</span>}
                        {o.demo && <span className="etiqueta etiqueta-demo">Demonstração</span>}
                      </div>
                      {o.totalCompraCentavos !== null && (
                        <div className="nota-celula">
                          Total da compra: {formatarReais(o.totalCompraCentavos)}
                        </div>
                      )}
                    </td>
                    <td>{ROTULOS_TIPO[o.tipo]}</td>
                    <td>
                      {nomeCategoria(o) || '—'}
                      {o.formaPagamento && (
                        <div className="nota-celula">{ROTULOS_FORMA[o.formaPagamento]}</div>
                      )}
                      {o.fatura && <div className="nota-celula">Fatura: {o.fatura}</div>}
                    </td>
                    <td className="numero">
                      <Valor centavos={o.previstoCentavos} />
                    </td>
                    <td className="numero">
                      {reserva ? (
                        <>
                          <Valor centavos={uso?.utilizadoCentavos ?? 0} />
                          <div className="nota-celula">
                            resta {formatarReais(uso?.restanteCentavos ?? 0)}
                          </div>
                        </>
                      ) : o.realizadoCentavos !== null ? (
                        <Valor centavos={o.realizadoCentavos} />
                      ) : (
                        <span className="pendente">Previsto</span>
                      )}
                    </td>
                    <td>
                      <div className="acoes-linha">
                        {reserva ? (
                          <button
                            type="button"
                            className="botao botao-pequeno"
                            onClick={() =>
                              setAcao({
                                tipo: 'novo',
                                iniciais: {
                                  tipo: o.tipo === 'lazer' ? 'gasto_livre' : 'aporte',
                                  reservaSerieId: o.serieId
                                }
                              })
                            }
                          >
                            Usar
                          </button>
                        ) : (
                          <button
                            type="button"
                            className="botao botao-pequeno"
                            onClick={() => setAcao({ tipo: 'realizado', ocorrencia: o })}
                          >
                            {o.realizadoCentavos !== null
                              ? 'Ajustar'
                              : o.tipo === 'receita'
                                ? 'Receber'
                                : 'Pagar'}
                          </button>
                        )}
                        <button
                          type="button"
                          className="botao botao-pequeno"
                          onClick={() => setAcao({ tipo: 'editar', ocorrencia: o })}
                        >
                          Editar
                        </button>
                        {o.repeticao !== 'unico' && (
                          <button
                            type="button"
                            className="botao botao-pequeno"
                            onClick={() => setAcao({ tipo: 'encerrar', ocorrencia: o })}
                          >
                            Encerrar
                          </button>
                        )}
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
          </table>
          {filtroFatura && (
            <p className="nota">
              Subtotal da fatura {filtroFatura}: <Valor centavos={subtotalFatura} forte />. É a soma
              dos itens acima, que já estão no orçamento.
            </p>
          )}
        </div>
      )}

      {acao?.tipo === 'novo' && (
        <FormLancamento
          mes={mes}
          hoje={hoje}
          categorias={categorias}
          faturas={faturas}
          iniciais={acao.iniciais}
          aoFechar={() => setAcao(null)}
          aoSalvar={concluir}
        />
      )}
      {acao?.tipo === 'editar' && (
        <FormLancamento
          mes={mes}
          hoje={hoje}
          categorias={categorias}
          faturas={faturas}
          ocorrencia={acao.ocorrencia}
          aoFechar={() => setAcao(null)}
          aoSalvar={concluir}
        />
      )}
      {acao?.tipo === 'realizado' && (
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
      {acao?.tipo === 'encerrar' && (
        <DialogoEncerrar
          ocorrencia={acao.ocorrencia}
          aoFechar={() => setAcao(null)}
          aoSalvar={concluir}
        />
      )}
    </div>
  )
}
